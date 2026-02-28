/**
 * Storage Validation
 *
 * File validation utilities for uploads.
 */

import { FileValidationOptions, FileMetadata } from "./types";
import { StorageValidationError, FileTooLargeError, InvalidMimeTypeError, InvalidFileExtensionError } from "./errors";

/**
 * Parse content type from request
 */
export function parseContentType(request: Request): string {
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    // Remove charset and boundary info
    return contentType.split(";")[0].trim();
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    return lastDot === -1 ? "" : filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Parse file metadata from request
 */
export async function parseFileMetadata(request: Request, key?: string): Promise<FileMetadata> {
    const contentType = parseContentType(request);
    const contentLength = request.headers.get("content-length");
    const contentDisposition = request.headers.get("content-disposition");

    // Extract filename from Content-Disposition or use provided key
    let filename = key || "unknown";
    if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) {
            filename = match[1].replace(/['"]/g, "");
        }
    }

    return {
        name: filename,
        size: contentLength ? parseInt(contentLength, 10) : 0,
        type: contentType,
        extension: getFileExtension(filename),
        lastModified: Date.now(),
    };
}

/**
 * Validate file size without buffering
 */
export function validateFileSize(size: number, maxSize: number): void {
    if (size > maxSize) {
        throw new FileTooLargeError(
            `File size ${formatBytes(size)} exceeds maximum ${formatBytes(maxSize)}`,
            maxSize,
            size,
        );
    }
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType: string, allowedTypes: string[]): void {
    // Allow wildcards like "image/*"
    const isAllowed = allowedTypes.some((allowed) => {
        if (allowed.endsWith("/*")) {
            const prefix = allowed.slice(0, -1);
            return mimeType.startsWith(prefix);
        }
        return mimeType === allowed;
    });

    if (!isAllowed) {
        throw new InvalidMimeTypeError(mimeType, allowedTypes);
    }
}

/**
 * Validate file extension
 */
export function validateFileExtension(extension: string, allowedExtensions: string[]): void {
    const normalizedExt = extension.toLowerCase().replace(/^\./, "");
    const normalizedAllowed = allowedExtensions.map((e) => e.toLowerCase().replace(/^\./, ""));

    if (!normalizedAllowed.includes(normalizedExt)) {
        throw new InvalidFileExtensionError(extension, allowedExtensions);
    }
}

/**
 * Comprehensive file validation
 */
export async function validateFile(metadata: FileMetadata, options: FileValidationOptions): Promise<void> {
    // Validate size
    if (options.maxSize !== undefined) {
        validateFileSize(metadata.size, options.maxSize);
    }

    // Validate MIME type
    if (options.allowedTypes?.length) {
        validateMimeType(metadata.type, options.allowedTypes);
    }

    // Validate extension
    if (options.allowedExtensions?.length) {
        validateFileExtension(metadata.extension, options.allowedExtensions);
    }

    // Custom validation
    if (options.customValidator) {
        const result = await options.customValidator(metadata);
        if (!result) {
            throw new StorageValidationError("custom", metadata, "Custom validation failed");
        }
    }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Parse max file size from string (e.g., "100MB", "1GB")
 */
export function parseSize(size: string): number {
    const units: Record<string, number> = {
        B: 1,
        KB: 1024,
        MB: 1024 * 1024,
        GB: 1024 * 1024 * 1024,
        TB: 1024 * 1024 * 1024 * 1024,
    };

    const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
    if (!match) {
        throw new StorageValidationError("size", size, `Invalid size format: ${size}. Use format like "100MB", "1GB"`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return Math.floor(value * units[unit]);
}

/**
 * Check if streaming is safe for the given size
 * (Workers have memory limits)
 */
export function shouldUseMultipart(
    size: number,
    threshold: number = 100 * 1024 * 1024, // 100MB default
): boolean {
    return size > threshold;
}

/**
 * Calculate optimal part size for multipart upload
 */
export function calculatePartSize(
    totalSize: number,
    options?: {
        minPartSize?: number; // Default: 5MB
        maxPartSize?: number; // Default: 5GB
        maxParts?: number; // Default: 10000
    },
): { partSize: number; partCount: number } {
    const minPartSize = options?.minPartSize || 5 * 1024 * 1024; // 5MB
    const maxPartSize = options?.maxPartSize || 5 * 1024 * 1024 * 1024; // 5GB
    const maxParts = options?.maxParts || 10000;

    // Start with minimum part size
    let partSize = minPartSize;
    let partCount = Math.ceil(totalSize / partSize);

    // If too many parts, increase part size
    if (partCount > maxParts) {
        partSize = Math.ceil(totalSize / maxParts);
        partCount = Math.ceil(totalSize / partSize);
    }

    // Ensure part size doesn't exceed maximum
    if (partSize > maxPartSize) {
        throw new StorageValidationError(
            "size",
            totalSize,
            `File too large. Maximum supported size is ${formatBytes(maxPartSize * maxParts)}`,
        );
    }

    return { partSize, partCount };
}
