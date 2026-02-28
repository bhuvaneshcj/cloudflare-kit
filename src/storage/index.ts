/**
 * Storage Module
 *
 * Provides createStorage() for R2 object storage operations.
 */

import type { R2Bucket } from "@cloudflare/workers-types";

export interface StorageOptions {
    binding: R2Bucket;
}

export interface UploadResult {
    success: boolean;
    key?: string;
    size?: number;
    etag?: string;
    url?: string;
    error?: string;
}

export interface DownloadResult {
    success: boolean;
    data?: ReadableStream;
    contentType?: string;
    size?: number;
    error?: string;
}

/**
 * Create a storage service for R2
 *
 * @example
 * ```typescript
 * const storage = createStorage({
 *   binding: env.STORAGE
 * });
 *
 * // Upload a file
 * const result = await storage.upload('documents/report.pdf', fileStream, {
 *   contentType: 'application/pdf'
 * });
 *
 * // Download a file
 * const file = await storage.download('documents/report.pdf');
 * if (file.success) {
 *   return new Response(file.data);
 * }
 *
 * // Delete a file
 * await storage.delete('documents/report.pdf');
 *
 * // Check if file exists
 * const exists = await storage.exists('documents/report.pdf');
 *
 * // List files
 * const files = await storage.list('documents/');
 * ```
 */
export function createStorage(options: StorageOptions) {
    const bucket = options.binding;

    return {
        /**
         * Upload a file to storage
         */
        async upload(
            key: string,
            data: ReadableStream | ArrayBuffer | string | Blob,
            metadata?: {
                contentType?: string;
                customMetadata?: Record<string, string>;
            },
        ): Promise<UploadResult> {
            try {
                const object = await bucket.put(key, data, {
                    httpMetadata: metadata?.contentType ? { contentType: metadata.contentType } : undefined,
                    customMetadata: metadata?.customMetadata,
                });

                return {
                    success: true,
                    key: object.key,
                    size: object.size,
                    etag: object.etag,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Upload failed",
                };
            }
        },

        /**
         * Download a file from storage
         */
        async download(key: string): Promise<DownloadResult> {
            try {
                const object = await bucket.get(key);

                if (!object) {
                    return { success: false, error: "File not found" };
                }

                return {
                    success: true,
                    data: object.body,
                    contentType: object.httpMetadata?.contentType,
                    size: object.size,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Download failed",
                };
            }
        },

        /**
         * Get file metadata without downloading
         */
        async getMetadata(key: string): Promise<{
            success: boolean;
            size?: number;
            etag?: string;
            contentType?: string;
            uploaded?: Date;
            customMetadata?: Record<string, string>;
            error?: string;
        }> {
            try {
                const object = await bucket.head(key);

                if (!object) {
                    return { success: false, error: "File not found" };
                }

                return {
                    success: true,
                    size: object.size,
                    etag: object.etag,
                    contentType: object.httpMetadata?.contentType,
                    uploaded: object.uploaded,
                    customMetadata: object.customMetadata,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Failed to get metadata",
                };
            }
        },

        /**
         * Delete a file from storage
         */
        async delete(key: string): Promise<{ success: boolean; error?: string }> {
            try {
                await bucket.delete(key);
                return { success: true };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Delete failed",
                };
            }
        },

        /**
         * Delete multiple files
         */
        async deleteMultiple(keys: string[]): Promise<{ success: boolean; error?: string }> {
            try {
                await bucket.delete(keys);
                return { success: true };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Delete failed",
                };
            }
        },

        /**
         * Check if a file exists
         */
        async exists(key: string): Promise<boolean> {
            try {
                const object = await bucket.head(key);
                return object !== null;
            } catch {
                return false;
            }
        },

        /**
         * List files in storage
         */
        async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
            success: boolean;
            files: Array<{
                key: string;
                size: number;
                etag: string;
                uploaded: Date;
            }>;
            cursor?: string;
            error?: string;
        }> {
            try {
                const result = await bucket.list({
                    prefix: options?.prefix,
                    limit: options?.limit,
                    cursor: options?.cursor,
                });

                return {
                    success: true,
                    files: result.objects.map((obj) => ({
                        key: obj.key,
                        size: obj.size,
                        etag: obj.etag,
                        uploaded: obj.uploaded,
                    })),
                    cursor: result.truncated ? result.cursor : undefined,
                };
            } catch (error) {
                return {
                    success: false,
                    files: [],
                    error: error instanceof Error ? error.message : "List failed",
                };
            }
        },

        /**
         * Get a signed URL for temporary access (if using R2 with public access)
         */
        async getPublicUrl(key: string): Promise<string> {
            // Note: This assumes the bucket is configured for public access
            // For private buckets, you'd need to implement signed URLs differently
            return `https://storage.example.com/${key}`;
        },

        /**
         * Get the raw R2 binding for advanced usage
         */
        getBinding(): R2Bucket {
            return bucket;
        },
    };
}

export type StorageService = ReturnType<typeof createStorage>;
export type { R2Bucket };
