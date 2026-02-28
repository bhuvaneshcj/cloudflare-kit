/**
 * Storage Errors
 *
 * Enterprise-grade error handling for storage operations.
 */

import { CloudflareKitError } from "../errors";

/**
 * Error thrown when file exceeds maximum allowed size
 */
export class FileTooLargeError extends CloudflareKitError {
    readonly maxSize: number;
    readonly actualSize: number;

    constructor(message: string, maxSize: number, actualSize: number) {
        super(message || `File size ${actualSize} bytes exceeds maximum ${maxSize} bytes`, "FILE_TOO_LARGE", 413, true);
        this.maxSize = maxSize;
        this.actualSize = actualSize;
    }

    override toJSON(): Record<string, unknown> {
        return {
            error: {
                code: this.code,
                message: this.message,
                statusCode: this.statusCode,
                maxSize: this.maxSize,
                actualSize: this.actualSize,
            },
        };
    }
}

/**
 * Error thrown when file MIME type is not allowed
 */
export class InvalidMimeTypeError extends CloudflareKitError {
    readonly mimeType: string;
    readonly allowedTypes: string[];

    constructor(mimeType: string, allowedTypes: string[]) {
        super(
            `MIME type '${mimeType}' is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
            "INVALID_MIME_TYPE",
            415,
            true,
        );
        this.mimeType = mimeType;
        this.allowedTypes = allowedTypes;
    }

    override toJSON(): Record<string, unknown> {
        return {
            error: {
                code: this.code,
                message: this.message,
                statusCode: this.statusCode,
                mimeType: this.mimeType,
                allowedTypes: this.allowedTypes,
            },
        };
    }
}

/**
 * Error thrown when file extension is not allowed
 */
export class InvalidFileExtensionError extends CloudflareKitError {
    readonly extension: string;
    readonly allowedExtensions: string[];

    constructor(extension: string, allowedExtensions: string[]) {
        super(
            `File extension '.${extension}' is not allowed. Allowed extensions: ${allowedExtensions.join(", ")}`,
            "INVALID_FILE_EXTENSION",
            415,
            true,
        );
        this.extension = extension;
        this.allowedExtensions = allowedExtensions;
    }
}

/**
 * Error thrown when upload fails
 */
export class UploadFailedError extends CloudflareKitError {
    readonly key?: string;
    readonly partNumber?: number;
    readonly originalError?: Error;

    constructor(
        message: string,
        options?: {
            key?: string;
            partNumber?: number;
            originalError?: Error;
        },
    ) {
        super(message || "Upload failed", "UPLOAD_FAILED", 500, false);
        this.key = options?.key;
        this.partNumber = options?.partNumber;
        this.originalError = options?.originalError;
    }
}

/**
 * Error thrown when download fails
 */
export class DownloadFailedError extends CloudflareKitError {
    readonly key: string;
    readonly originalError?: Error;

    constructor(key: string, message?: string, originalError?: Error) {
        super(message || `Failed to download '${key}'`, "DOWNLOAD_FAILED", 500, false);
        this.key = key;
        this.originalError = originalError;
    }
}

/**
 * Error thrown when file is not found
 */
export class FileNotFoundError extends CloudflareKitError {
    readonly key: string;

    constructor(key: string) {
        super(`File '${key}' not found`, "FILE_NOT_FOUND", 404, true);
        this.key = key;
    }
}

/**
 * Error thrown when multipart upload fails
 */
export class MultipartUploadError extends CloudflareKitError {
    readonly uploadId?: string;
    readonly partNumber?: number;

    constructor(
        message: string,
        options?: {
            uploadId?: string;
            partNumber?: number;
        },
    ) {
        super(message, "MULTIPART_UPLOAD_ERROR", 500, false);
        this.uploadId = options?.uploadId;
        this.partNumber = options?.partNumber;
    }
}

/**
 * Error thrown when signed URL generation fails
 */
export class SignedUrlError extends CloudflareKitError {
    readonly key: string;

    constructor(key: string, message?: string) {
        super(message || `Failed to generate signed URL for '${key}'`, "SIGNED_URL_ERROR", 500, false);
        this.key = key;
    }
}

/**
 * Error thrown when validation fails
 */
export class StorageValidationError extends CloudflareKitError {
    readonly field: string;
    readonly value: unknown;

    constructor(field: string, value: unknown, message: string) {
        super(`Validation failed for '${field}': ${message}`, "STORAGE_VALIDATION_ERROR", 400, true);
        this.field = field;
        this.value = value;
    }
}
