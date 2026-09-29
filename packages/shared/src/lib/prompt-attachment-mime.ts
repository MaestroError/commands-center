/**
 * OpenCode forwards a user file part to the model provider verbatim, with one
 * exception: a part whose mime is exactly `text/plain` is inlined as a
 * synthetic Read-tool result and stripped before the provider call. Every
 * provider bundled in OpenCode rejects file parts outside a small media
 * allowlist (`'file part media type text/markdown' functionality not
 * supported`), and the allowlists differ per provider — the OpenAI Responses
 * converter, for instance, takes only images and PDFs.
 *
 * So the rule is inverted from an extension denylist: a file part keeps its own
 * media type only when every provider is known to accept it, and everything
 * else travels as `text/plain`.
 */
export const PROMPT_TEXT_MIME_TYPE = "text/plain";

/** Media types accepted as raw file parts by every provider OpenCode bundles. */
const NATIVE_PROMPT_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const NATIVE_EXTENSION_MIME_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Audio and video have no media type every provider accepts, but they cannot be
 * inlined as text either — dropping them would remove a capability that does
 * work on the providers that support them (Gemini transcribing a recording, for
 * one). They are passed through unchanged, exactly as before, and a provider
 * that cannot take them says so.
 */
const PASSTHROUGH_MIME_PREFIXES = ["audio/", "video/"] as const;

export function isNativePromptAttachmentMimeType(mimeType: string): boolean {
  return NATIVE_PROMPT_MIME_TYPES.has(normalizeMimeType(mimeType));
}

/**
 * The media type a prompt file part should carry. Extensions win over the
 * caller-provided mime for the native media types (browsers and external MCP
 * clients both mislabel them routinely); anything we are not certain a provider
 * accepts becomes `text/plain`.
 */
export function resolvePromptAttachmentMimeType(
  filename: string | undefined,
  providedMimeType: string,
): string {
  const extension = filename?.split(".").at(-1)?.toLowerCase();
  const nativeByExtension = extension ? NATIVE_EXTENSION_MIME_TYPES[extension] : undefined;

  if (nativeByExtension) {
    return nativeByExtension;
  }

  const provided = normalizeMimeType(providedMimeType);

  if (
    NATIVE_PROMPT_MIME_TYPES.has(provided) ||
    PASSTHROUGH_MIME_PREFIXES.some((prefix) => provided.startsWith(prefix))
  ) {
    return provided;
  }

  return PROMPT_TEXT_MIME_TYPE;
}

/**
 * Whether a payload can be inlined as text. `text/plain` parts are decoded and
 * pasted into the prompt by OpenCode, so binary bytes would arrive at the model
 * as a wall of replacement characters — callers drop those instead of sending
 * them.
 */
export function isTextualPayload(bytes: Uint8Array): boolean {
  let index = 0;

  // Hand-rolled rather than `TextDecoder`, which this package cannot assume:
  // `@cc/shared` compiles against bare ES2024 so it runs in both the browser
  // and the server. Single pass, no decoded copy of the payload.
  while (index < bytes.length) {
    const lead = bytes[index]!;

    if (lead === 0x00) {
      return false;
    }

    if (lead < 0x80) {
      index += 1;
      continue;
    }

    let length: number;
    let codePoint: number;

    if (lead >= 0xc2 && lead <= 0xdf) {
      length = 2;
      codePoint = lead & 0x1f;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      length = 3;
      codePoint = lead & 0x0f;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      length = 4;
      codePoint = lead & 0x07;
    } else {
      // 0x80–0xc1 and 0xf5–0xff are never valid lead bytes.
      return false;
    }

    if (index + length > bytes.length) {
      return false;
    }

    for (let offset = 1; offset < length; offset += 1) {
      const continuation = bytes[index + offset]!;

      if ((continuation & 0xc0) !== 0x80) {
        return false;
      }

      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }

    // Overlong encodings, UTF-16 surrogates and out-of-range code points are
    // all signs of binary data rather than text.
    if (
      (length === 3 && codePoint < 0x800) ||
      (length === 4 && codePoint < 0x10000) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint > 0x10ffff
    ) {
      return false;
    }

    index += length;
  }

  return true;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}
