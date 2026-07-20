/**
 * Storage Module
 *
 * Enterprise-grade R2 object storage with streaming uploads,
 * multipart support, and signed URLs.
 *
 * @example
 * ```typescript
 * const storage = createStorage({
 *   binding: env.STORAGE,
 *   maxFileSize: 100 * 1024 * 1024, // 100MB
 *   allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
 * });
 *
 * // Streaming upload (recommended for files < 100MB)
 * await storage.uploadStream('file.pdf', request.body);
 *
 * // Multipart upload (recommended for files > 100MB)
 * await storage.uploadMultipart('large.zip', stream, fileSize);
 *
 * // Upload from request (auto-detects strategy)
 * await storage.uploadFromRequest(request, 'file.pdf');
 *
 * // Create signed URL
 * const signedUrl = await storage.createSignedUploadUrl('file.pdf', {
 *   expiration: 3600
 * });
 * ```
 */

import type { R2Bucket, R2MultipartUpload } from "@cloudflare/workers-types";
import type {
    StorageConfig,
    StorageService,
    UploadOptions,
    UploadResult,
    DownloadOptions,
    DownloadResult,
    ListOptions,
    ListResult,
    StorageObject,
    SignedUploadUrl,
    FileMetadata,
} from "./types";
import {
    FileTooLargeError,
    InvalidMimeTypeError,
    UploadFailedError,
    DownloadFailedError,
    DeleteFailedError,
    FileNotFoundError,
    MultipartUploadError,
    SignedUrlError,
} from "./errors";
import { parseContentType, validateFile, shouldUseMultipart, calculatePartSize, formatBytes } from "./validation";

// Re-export types and errors
export type {
    StorageConfig,
    StorageService,
    UploadOptions,
    UploadResult,
    DownloadOptions,
    DownloadResult,
    ListOptions,
    ListResult,
    StorageObject,
    SignedUploadUrl,
    SignedUploadPayload,
    FileMetadata,
    FileValidationOptions,
    UploadProgress,
    MultipartUploadSession,
} from "./types";

export {
    FileTooLargeError,
    InvalidMimeTypeError,
    UploadFailedError,
    DownloadFailedError,
    DeleteFailedError,
    FileNotFoundError,
    MultipartUploadError,
    SignedUrlError,
} from "./errors";

export { parseContentType, validateFile, formatBytes, shouldUseMultipart, calculatePartSize } from "./validation";

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToBytes(str: string): Uint8Array {
    const padding = "=".repeat((4 - (str.length % 4)) % 4);
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function hmacSign(secret: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return bytesToBase64Url(new Uint8Array(signature));
}

async function hmacVerify(secret: string, message: string, signature: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
    );
    const sigBytes = base64UrlToBytes(signature);
    return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(message));
}

/**
 * Standalone verify helper (same algorithm as createStorage().verifySignedUploadToken)
 */
export async function verifySignedUploadToken(
    token: string,
    secret: string,
): Promise<import("./types").SignedUploadPayload | null> {
    return verifySignedUploadTokenWithSecret(token, secret);
}

async function verifySignedUploadTokenWithSecret(
    token: string,
    secret: string,
): Promise<import("./types").SignedUploadPayload | null> {
    try {
        const [payloadPart, signature] = token.split(".");
        if (!payloadPart || !signature) return null;

        const valid = await hmacVerify(secret, payloadPart, signature);
        if (!valid) return null;

        const json = new TextDecoder().decode(base64UrlToBytes(payloadPart));
        const payload = JSON.parse(json) as import("./types").SignedUploadPayload;

        if (!payload.expiresAt || new Date(payload.expiresAt).getTime() < Date.now()) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

/**
 * Storage options (backward compatibility alias for StorageConfig)
 * @deprecated Use StorageConfig instead
 */
export type StorageOptions = StorageConfig;

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    uploadStrategy: "auto" as const,
    multipart: {
        partSize: 5 * 1024 * 1024, // 5MB
        maxParts: 10000,
    },
    signedUrls: {
        defaultExpiration: 3600, // 1 hour
        maxExpiration: 86400, // 24 hours
    },
};

/**
 * Create an enterprise-grade storage service
 */
export function createStorage(config: StorageConfig): StorageService {
    const bucket = config.binding;
    const maxFileSize = config.maxFileSize ?? DEFAULT_CONFIG.maxFileSize;
    const allowedMimeTypes = config.allowedMimeTypes;
    const uploadStrategy = config.uploadStrategy ?? DEFAULT_CONFIG.uploadStrategy;
    const multipartConfig = { ...DEFAULT_CONFIG.multipart, ...config.multipart };
    const signedUrlConfig = { ...DEFAULT_CONFIG.signedUrls, ...config.signedUrls };
    const signingSecret = config.signedUrls?.secret ?? config.signingSecret;

    /**
     * Validate file before upload
     */
    async function validateBeforeUpload(metadata: FileMetadata, options?: UploadOptions): Promise<void> {
        const validationOptions = {
            maxSize: options?.validation?.maxSize ?? maxFileSize,
            allowedTypes: options?.validation?.allowedTypes ?? allowedMimeTypes,
            allowedExtensions: options?.validation?.allowedExtensions,
            customValidator: options?.validation?.customValidator,
        };

        await validateFile(metadata, validationOptions);
    }

    return {
        /**
         * Upload via streaming (memory-efficient)
         * Recommended for files < 100MB
         */
        async uploadStream(
            key: string,
            stream: ReadableStream<Uint8Array>,
            options?: UploadOptions,
        ): Promise<UploadResult> {
            try {
                // For streams, we can't validate size beforehand
                // Validation happens at the edge/R2 level
                if (allowedMimeTypes && options?.contentType) {
                    const isAllowed = allowedMimeTypes.some((type) => {
                        if (type.endsWith("/*")) {
                            return options.contentType!.startsWith(type.slice(0, -1));
                        }
                        return options.contentType === type;
                    });
                    if (!isAllowed) {
                        throw new InvalidMimeTypeError(options.contentType, allowedMimeTypes);
                    }
                }

                const object = await bucket.put(key, stream, {
                    httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
                    customMetadata: options?.customMetadata,
                });

                return {
                    success: true,
                    key: object.key,
                    size: object.size,
                    etag: object.etag,
                    versionId: object.version,
                    metadata: options?.customMetadata,
                };
            } catch (error) {
                if (error instanceof InvalidMimeTypeError) {
                    throw error;
                }
                throw new UploadFailedError(error instanceof Error ? error.message : "Stream upload failed", {
                    key,
                    originalError: error instanceof Error ? error : undefined,
                });
            }
        },

        /**
         * Upload via multipart (for large files)
         * Recommended for files > 100MB
         */
        async uploadMultipart(
            key: string,
            stream: ReadableStream<Uint8Array>,
            totalSize: number,
            options?: UploadOptions,
        ): Promise<UploadResult> {
            // Validate before starting
            if (totalSize > maxFileSize) {
                throw new FileTooLargeError(
                    `File size ${formatBytes(totalSize)} exceeds maximum ${formatBytes(maxFileSize)}`,
                    maxFileSize,
                    totalSize,
                );
            }

            const metadata: FileMetadata = {
                name: key,
                size: totalSize,
                type: options?.contentType || "application/octet-stream",
                extension: key.split(".").pop() || "",
                lastModified: Date.now(),
            };

            await validateBeforeUpload(metadata, options);

            // Calculate part size
            const { partSize, partCount } = calculatePartSize(totalSize, {
                minPartSize: multipartConfig.partSize,
                maxParts: multipartConfig.maxParts,
            });

            let multipartUpload: R2MultipartUpload | null = null;
            const parts: Array<{ partNumber: number; etag: string }> = [];

            try {
                // Create multipart upload
                multipartUpload = await bucket.createMultipartUpload(key, {
                    httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
                    customMetadata: options?.customMetadata,
                });

                // Read stream and upload parts (carry leftover bytes across part boundaries)
                const reader = stream.getReader();
                let partNumber = 1;
                let uploadedBytes = 0;
                let leftover: Uint8Array | null = null;

                while (partNumber <= partCount) {
                    const chunk = new Uint8Array(partSize);
                    let chunkOffset = 0;

                    if (leftover && leftover.length > 0) {
                        const toCopy = Math.min(leftover.length, partSize);
                        chunk.set(leftover.subarray(0, toCopy), 0);
                        chunkOffset = toCopy;
                        uploadedBytes += toCopy;
                        leftover = leftover.length > toCopy ? leftover.subarray(toCopy) : null;
                    }

                    while (chunkOffset < partSize) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const toCopy = Math.min(value.length, partSize - chunkOffset);
                        chunk.set(value.subarray(0, toCopy), chunkOffset);
                        chunkOffset += toCopy;
                        uploadedBytes += toCopy;

                        if (toCopy < value.length) {
                            leftover = value.subarray(toCopy);
                            break;
                        }
                    }

                    if (chunkOffset === 0) break;

                    const partData = chunk.subarray(0, chunkOffset);
                    const uploadedPart = await multipartUpload.uploadPart(partNumber, partData);

                    parts.push({
                        partNumber,
                        etag: uploadedPart.etag,
                    });

                    if (options?.onProgress) {
                        options.onProgress({
                            partNumber,
                            totalParts: partCount,
                            uploadedBytes,
                            totalBytes: totalSize,
                            percentage: Math.round((uploadedBytes / totalSize) * 100),
                        });
                    }

                    partNumber++;
                }

                await reader.releaseLock();

                // Complete multipart upload
                const object = await multipartUpload.complete(parts);

                return {
                    success: true,
                    key: object.key,
                    size: object.size,
                    etag: object.etag,
                    versionId: object.version,
                    metadata: options?.customMetadata,
                };
            } catch (error) {
                // Abort multipart upload on failure
                if (multipartUpload) {
                    try {
                        await multipartUpload.abort();
                    } catch {
                        // Ignore abort errors
                    }
                }

                throw new MultipartUploadError(error instanceof Error ? error.message : "Multipart upload failed", {
                    uploadId: multipartUpload?.uploadId,
                    partNumber: parts.length + 1,
                });
            }
        },

        /**
         * Upload from a Request object
         * Automatically chooses streaming or multipart based on size
         */
        async uploadFromRequest(request: Request, key?: string, options?: UploadOptions): Promise<UploadResult> {
            const contentLength = request.headers.get("content-length");
            const size = contentLength ? parseInt(contentLength, 10) : 0;
            const finalKey = key || crypto.randomUUID();
            const contentType = parseContentType(request);

            // Determine strategy
            const strategy =
                options?.strategy ||
                (uploadStrategy === "auto"
                    ? shouldUseMultipart(size, maxFileSize * 0.8)
                        ? "multipart"
                        : "stream"
                    : uploadStrategy);

            if (strategy === "multipart" && size > 0) {
                if (!request.body) {
                    throw new UploadFailedError("Request body is empty");
                }
                return this.uploadMultipart(finalKey, request.body, size, {
                    ...options,
                    contentType: options?.contentType || contentType,
                });
            } else {
                if (!request.body) {
                    throw new UploadFailedError("Request body is empty");
                }
                return this.uploadStream(finalKey, request.body, {
                    ...options,
                    contentType: options?.contentType || contentType,
                });
            }
        },

        /**
         * Create a signed upload URL
         * Note: R2 doesn't natively support signed URLs like S3,
         * so this creates a token-based approach
         */
        async createSignedUploadUrl(
            key: string,
            options?: {
                expiration?: number;
                maxSize?: number;
                allowedMimeTypes?: string[];
            },
        ): Promise<SignedUploadUrl> {
            if (!signingSecret || signingSecret.length < 16) {
                throw new SignedUrlError(
                    key,
                    "signingSecret (or signedUrls.secret) of at least 16 characters is required for signed uploads",
                );
            }

            const expiration = options?.expiration ?? signedUrlConfig.defaultExpiration;
            const maxExpiration = signedUrlConfig.maxExpiration;

            if (expiration > maxExpiration) {
                throw new SignedUrlError(key, `Expiration cannot exceed ${maxExpiration} seconds`);
            }

            const expiresAt = new Date(Date.now() + expiration * 1000);

            const tokenData = {
                key,
                expiresAt: expiresAt.toISOString(),
                maxSize: options?.maxSize,
                allowedMimeTypes: options?.allowedMimeTypes,
                nonce: crypto.randomUUID(),
            };

            const payloadPart = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(tokenData)));
            const signature = await hmacSign(signingSecret, payloadPart);
            const token = `${payloadPart}.${signature}`;

            return {
                url: `/api/upload?token=${encodeURIComponent(token)}`,
                key,
                expiresAt,
                token,
                fields: {
                    key,
                    ...options,
                },
                headers: {
                    "X-Upload-Token": token,
                    "X-Upload-Expires": expiresAt.toISOString(),
                },
            };
        },

        async verifySignedUploadToken(token: string) {
            if (!signingSecret) {
                throw new SignedUrlError("*", "signingSecret is required to verify signed upload tokens");
            }
            return verifySignedUploadTokenWithSecret(token, signingSecret);
        },

        /**
         * Download a file
         */
        async download(key: string, options?: DownloadOptions): Promise<DownloadResult> {
            try {
                const object = await bucket.get(key, {
                    range: options?.range,
                });

                if (!object) {
                    throw new FileNotFoundError(key);
                }

                return {
                    success: true,
                    key,
                    data: object.body,
                    contentType: object.httpMetadata?.contentType,
                    contentLength: object.size,
                    etag: object.etag,
                    lastModified: object.uploaded,
                    metadata: object.customMetadata,
                    range: options?.range
                        ? {
                              start: options.range.offset,
                              end: options.range.offset + options.range.length - 1,
                              total: object.size,
                          }
                        : undefined,
                };
            } catch (error) {
                if (error instanceof FileNotFoundError) {
                    throw error;
                }
                throw new DownloadFailedError(
                    key,
                    error instanceof Error ? error.message : undefined,
                    error instanceof Error ? error : undefined,
                );
            }
        },

        /**
         * Get file metadata without downloading
         */
        async getMetadata(key: string): Promise<StorageObject | null> {
            try {
                const object = await bucket.head(key);

                if (!object) {
                    return null;
                }

                return {
                    key: object.key,
                    size: object.size,
                    etag: object.etag,
                    lastModified: object.uploaded,
                    contentType: object.httpMetadata?.contentType,
                    metadata: object.customMetadata,
                };
            } catch {
                return null;
            }
        },

        /**
         * Check if a file exists
         */
        async exists(key: string): Promise<boolean> {
            const metadata = await this.getMetadata(key);
            return metadata !== null;
        },

        /**
         * Delete a file
         */
        async delete(key: string): Promise<{ success: boolean }> {
            try {
                await bucket.delete(key);
                return { success: true };
            } catch (error) {
                throw new DeleteFailedError(key, error instanceof Error ? error.message : "Delete failed");
            }
        },

        /**
         * Delete multiple files
         */
        async deleteMany(keys: string[]): Promise<{
            success: boolean;
            deleted: number;
        }> {
            try {
                await bucket.delete(keys);
                return { success: true, deleted: keys.length };
            } catch (error) {
                throw new DeleteFailedError(
                    keys.join(", "),
                    error instanceof Error ? error.message : "Batch delete failed",
                );
            }
        },

        /**
         * List files
         */
        async list(options?: ListOptions): Promise<ListResult> {
            const objects = await bucket.list({
                prefix: options?.prefix,
                limit: options?.limit,
                cursor: options?.cursor,
            });

            return {
                objects: objects.objects.map((obj) => ({
                    key: obj.key,
                    size: obj.size,
                    etag: obj.etag,
                    lastModified: obj.uploaded,
                    contentType: obj.httpMetadata?.contentType,
                    metadata: options?.includeMetadata ? obj.customMetadata : undefined,
                })),
                truncated: objects.truncated,
                cursor: objects.truncated ? (objects as { cursor: string }).cursor : undefined,
                delimitedPrefixes: objects.delimitedPrefixes,
            };
        },

        /**
         * Copy a file
         */
        async copy(
            sourceKey: string,
            destinationKey: string,
            options?: { metadata?: Record<string, string> },
        ): Promise<UploadResult> {
            try {
                const source = await bucket.get(sourceKey);
                if (!source) {
                    throw new FileNotFoundError(sourceKey);
                }

                const object = await bucket.put(destinationKey, source.body, {
                    httpMetadata: source.httpMetadata,
                    customMetadata: options?.metadata || source.customMetadata,
                });

                return {
                    success: true,
                    key: object.key,
                    size: object.size,
                    etag: object.etag,
                    versionId: object.version,
                };
            } catch (error) {
                if (error instanceof FileNotFoundError) {
                    throw error;
                }
                throw new UploadFailedError(`Failed to copy ${sourceKey} to ${destinationKey}`, {
                    key: destinationKey,
                    originalError: error instanceof Error ? error : undefined,
                });
            }
        },

        /**
         * Move/rename a file
         */
        async move(sourceKey: string, destinationKey: string): Promise<UploadResult> {
            const result = await this.copy(sourceKey, destinationKey);
            if (result.success) {
                await this.delete(sourceKey);
            }
            return result;
        },

        /**
         * Abort a multipart upload
         */
        async abortMultipartUpload(uploadId: string, key: string): Promise<void> {
            const multipartUpload = bucket.resumeMultipartUpload(key, uploadId);
            await multipartUpload.abort();
        },
    };
}

/**
 * Legacy storage export for backward compatibility
 * @deprecated Use createStorage() instead
 */
export function createStorageLegacy(options: { binding: R2Bucket }) {
    return createStorage({ binding: options.binding });
}
