/**
 * Storage Types
 *
 * Enterprise-grade storage with streaming, multipart, and signed URL support.
 */

import type { R2Bucket } from "@cloudflare/workers-types";

/**
 * Storage configuration options
 */
export interface StorageConfig {
    binding: R2Bucket;

    /**
     * Maximum file size in bytes (default: 100MB)
     * For larger files, use multipart upload
     */
    maxFileSize?: number;

    /**
     * Allowed MIME types (default: all)
     * @example ['image/jpeg', 'image/png', 'application/pdf']
     */
    allowedMimeTypes?: string[];

    /**
     * Default upload strategy
     * - 'stream': Direct streaming (recommended for files <100MB)
     * - 'multipart': Multipart upload (recommended for files >100MB)
     * - 'auto': Automatically choose based on file size
     * @default 'auto'
     */
    uploadStrategy?: "stream" | "multipart" | "auto";

    /**
     * Multipart upload configuration
     */
    multipart?: {
        /**
         * Part size in bytes (default: 5MB, min: 5MB, max: 5GB)
         */
        partSize?: number;

        /**
         * Maximum number of parts (default: 10000)
         */
        maxParts?: number;
    };

    /**
     * Signed URL configuration
     */
    signedUrls?: {
        /**
         * Default expiration time in seconds (default: 3600 = 1 hour)
         */
        defaultExpiration?: number;

        /**
         * Maximum expiration time in seconds (default: 86400 = 24 hours)
         */
        maxExpiration?: number;
    };
}

/**
 * File validation options
 */
export interface FileValidationOptions {
    /**
     * Maximum file size in bytes
     */
    maxSize?: number;

    /**
     * Allowed MIME types
     */
    allowedTypes?: string[];

    /**
     * Allowed file extensions (without dot)
     * @example ['jpg', 'png', 'pdf']
     */
    allowedExtensions?: string[];

    /**
     * Custom validation function
     */
    customValidator?: (metadata: FileMetadata) => boolean | Promise<boolean>;
}

/**
 * File metadata
 */
export interface FileMetadata {
    name: string;
    size: number;
    type: string;
    extension: string;
    lastModified?: number;
}

/**
 * Upload options
 */
export interface UploadOptions {
    /**
     * Content type of the file
     */
    contentType?: string;

    /**
     * Custom metadata to store with the object
     */
    customMetadata?: Record<string, string>;

    /**
     * Storage class (if supported by provider)
     */
    storageClass?: "Standard" | "InfrequentAccess" | "Archive";

    /**
     * Override default validation for this upload
     */
    validation?: FileValidationOptions;

    /**
     * Upload strategy override
     */
    strategy?: "stream" | "multipart";

    /**
     * Callback for upload progress (multipart only)
     */
    onProgress?: (progress: UploadProgress) => void;
}

/**
 * Upload progress information
 */
export interface UploadProgress {
    /**
     * Part number being uploaded
     */
    partNumber: number;

    /**
     * Total number of parts
     */
    totalParts: number;

    /**
     * Bytes uploaded so far
     */
    uploadedBytes: number;

    /**
     * Total bytes to upload
     */
    totalBytes: number;

    /**
     * Upload percentage (0-100)
     */
    percentage: number;
}

/**
 * Upload result
 */
export interface UploadResult {
    success: boolean;
    key: string;
    size: number;
    etag: string;
    versionId?: string;
    url?: string;
    metadata?: Record<string, string>;
}

/**
 * Multipart upload session
 */
export interface MultipartUploadSession {
    /**
     * Unique upload ID
     */
    uploadId: string;

    /**
     * Object key
     */
    key: string;

    /**
     * Number of parts
     */
    partCount: number;

    /**
     * Part size in bytes
     */
    partSize: number;

    /**
     * ETags for each part (to be filled during upload)
     */
    parts: Array<{ partNumber: number; etag: string }>;
}

/**
 * Signed upload URL result
 */
export interface SignedUploadUrl {
    /**
     * The URL to upload to
     */
    url: string;

    /**
     * The object key
     */
    key: string;

    /**
     * Expiration timestamp
     */
    expiresAt: Date;

    /**
     * Fields to include in the upload (for POST uploads)
     */
    fields?: Record<string, string | number | string[]>;

    /**
     * Headers to include (for PUT uploads)
     */
    headers?: Record<string, string>;
}

/**
 * Download options
 */
export interface DownloadOptions {
    /**
     * Byte range to download (for partial content)
     * @example { offset: 0, length: 1024 }
     */
    range?: R2Range;

    /**
     * If true, return a signed URL instead of streaming
     */
    signedUrl?: boolean;

    /**
     * Signed URL expiration in seconds
     */
    signedUrlExpiration?: number;
}

/**
 * Download result
 */
export interface DownloadResult {
    success: boolean;
    key: string;
    data?: ReadableStream<Uint8Array>;
    contentType?: string;
    contentLength?: number;
    etag?: string;
    lastModified?: Date;
    metadata?: Record<string, string>;
    range?: { start: number; end: number; total: number };
    signedUrl?: string;
}

/**
 * List options
 */
export interface ListOptions {
    /**
     * Prefix filter
     */
    prefix?: string;

    /**
     * Maximum number of results
     * @default 1000
     */
    limit?: number;

    /**
     * Pagination cursor
     */
    cursor?: string;

    /**
     * Include metadata in results
     */
    includeMetadata?: boolean;
}

/**
 * Storage object info
 */
export interface StorageObject {
    key: string;
    size: number;
    etag: string;
    lastModified: Date;
    contentType?: string;
    metadata?: Record<string, string>;
}

/**
 * List result
 */
export interface ListResult {
    objects: StorageObject[];
    truncated: boolean;
    cursor?: string;
    delimitedPrefixes?: string[];
}

/**
 * R2 Range type from workers-types
 */
interface R2Range {
    offset: number;
    length: number;
}

/**
 * Storage service interface
 */
export interface StorageService {
    /**
     * Upload a file via streaming (recommended for files <100MB)
     */
    uploadStream(key: string, stream: ReadableStream<Uint8Array>, options?: UploadOptions): Promise<UploadResult>;

    /**
     * Upload a file via multipart (recommended for files >100MB)
     */
    uploadMultipart(
        key: string,
        stream: ReadableStream<Uint8Array>,
        totalSize: number,
        options?: UploadOptions,
    ): Promise<UploadResult>;

    /**
     * Upload from a Request object (handles streaming automatically)
     */
    uploadFromRequest(request: Request, key?: string, options?: UploadOptions): Promise<UploadResult>;

    /**
     * Create a signed upload URL
     */
    createSignedUploadUrl(
        key: string,
        options?: {
            expiration?: number;
            maxSize?: number;
            allowedMimeTypes?: string[];
        },
    ): Promise<SignedUploadUrl>;

    /**
     * Download a file
     */
    download(key: string, options?: DownloadOptions): Promise<DownloadResult>;

    /**
     * Get file metadata without downloading
     */
    getMetadata(key: string): Promise<StorageObject | null>;

    /**
     * Check if a file exists
     */
    exists(key: string): Promise<boolean>;

    /**
     * Delete a file
     */
    delete(key: string): Promise<{ success: boolean }>;

    /**
     * Delete multiple files
     */
    deleteMany(keys: string[]): Promise<{ success: boolean; deleted: number }>;

    /**
     * List files
     */
    list(options?: ListOptions): Promise<ListResult>;

    /**
     * Copy a file
     */
    copy(
        sourceKey: string,
        destinationKey: string,
        options?: { metadata?: Record<string, string> },
    ): Promise<UploadResult>;

    /**
     * Move/rename a file
     */
    move(sourceKey: string, destinationKey: string): Promise<UploadResult>;

    /**
     * Abort a multipart upload
     */
    abortMultipartUpload(uploadId: string, key: string): Promise<void>;
}
