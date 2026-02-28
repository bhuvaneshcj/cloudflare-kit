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
    FileNotFoundError,
    MultipartUploadError,
    SignedUrlError,
} from "./errors";

export { parseContentType, validateFile, formatBytes, shouldUseMultipart, calculatePartSize } from "./validation";

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

                // Read stream and upload parts
                const reader = stream.getReader();
                let partNumber = 1;
                let uploadedBytes = 0;

                while (partNumber <= partCount) {
                    // Collect data for this part
                    const chunk = new Uint8Array(partSize);
                    let chunkOffset = 0;

                    while (chunkOffset < partSize) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const toCopy = Math.min(value.length, partSize - chunkOffset);
                        chunk.set(value.subarray(0, toCopy), chunkOffset);
                        chunkOffset += toCopy;
                        uploadedBytes += toCopy;

                        // If we have more data in this chunk, we need to handle it
                        if (toCopy < value.length) {
                            // This shouldn't happen with proper part sizing
                            // but handle it just in case
                            break;
                        }
                    }

                    if (chunkOffset === 0) break; // No more data

                    // Upload part
                    const partData = chunk.subarray(0, chunkOffset);
                    const uploadedPart = await multipartUpload.uploadPart(partNumber, partData);

                    parts.push({
                        partNumber,
                        etag: uploadedPart.etag,
                    });

                    // Report progress
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
            const expiration = options?.expiration ?? signedUrlConfig.defaultExpiration;
            const maxExpiration = signedUrlConfig.maxExpiration;

            if (expiration > maxExpiration) {
                throw new SignedUrlError(key, `Expiration cannot exceed ${maxExpiration} seconds`);
            }

            const expiresAt = new Date(Date.now() + expiration * 1000);

            // Create a signed token
            const tokenData = {
                key,
                expiresAt: expiresAt.toISOString(),
                maxSize: options?.maxSize,
                allowedMimeTypes: options?.allowedMimeTypes,
                nonce: crypto.randomUUID(),
            };

            // Sign the token (in production, use a proper signing key)
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(tokenData));
            const signature = await crypto.subtle.digest("SHA-256", data);
            const signatureHex = Array.from(new Uint8Array(signature))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");

            // Return signed URL info
            // In production, this would be a URL to your upload endpoint
            return {
                url: `/api/upload?token=${signatureHex}`,
                key,
                expiresAt,
                fields: {
                    key,
                    ...options,
                },
                headers: {
                    "X-Upload-Token": signatureHex,
                    "X-Upload-Expires": expiresAt.toISOString(),
                },
            };
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
                throw new DownloadFailedError(key, error instanceof Error ? error.message : "Delete failed");
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
                throw new DownloadFailedError(
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
