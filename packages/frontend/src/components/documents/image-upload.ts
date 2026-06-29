/**
 * Image upload handling for the Documents Milkdown editor.
 *
 * Uploaded images are embedded directly into the markdown as base64 `data:`
 * URIs so documents stay self-contained and portable (the markdown file is the
 * single source of truth — no external asset files to serve or clean up).
 *
 * Because the whole document is capped on save, individual images are limited
 * to keep the markdown a reasonable size.
 */

/** Max size for a single embedded image. Base64 inflates bytes by ~33%. */
export const MAX_EMBEDDED_IMAGE_BYTES = 2 * 1024 * 1024;

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Builds a Crepe `onUpload` handler that embeds the file as a base64 data URI.
 * Rejects files larger than `maxBytes` with a user-facing message.
 */
export function createBase64UploadHandler(maxBytes: number = MAX_EMBEDDED_IMAGE_BYTES) {
  return async (file: File): Promise<string> => {
    if (file.size > maxBytes) {
      const limitMb = Math.round(maxBytes / (1024 * 1024));
      throw new Error(
        `Image is too large to embed (max ${String(limitMb)} MB). Paste a link instead.`,
      );
    }
    return readFileAsDataUrl(file);
  };
}
