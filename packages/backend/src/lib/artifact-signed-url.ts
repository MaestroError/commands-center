import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless, idempotent signed URLs for artifact delivery. A URL is a pure
// function of (artifactId, disposition, exp) HMAC-signed with the server secret,
// so it can be regenerated identically across repeated result polls with zero DB
// writes. `exp` is epoch-ms; `exp === 0` means no expiry.

export type ArtifactDisposition = "display" | "download";

function computeSignature(
  secretKey: string,
  artifactId: string,
  disposition: ArtifactDisposition,
  exp: string,
): string {
  return createHmac("sha256", secretKey)
    .update(`v1:${artifactId}:${disposition}:${exp}`)
    .digest("base64url");
}

export function buildArtifactSignedPath(options: {
  artifactId: string;
  disposition: ArtifactDisposition;
  expMs: number;
  secretKey: string;
}): string {
  const exp = String(options.expMs);
  const sig = computeSignature(options.secretKey, options.artifactId, options.disposition, exp);
  const params = new URLSearchParams({ exp, sig });
  return `/api/public/v1/artifacts/${encodeURIComponent(options.artifactId)}/${
    options.disposition
  }?${params.toString()}`;
}

export function buildArtifactSignedUrl(options: {
  artifactId: string;
  disposition: ArtifactDisposition;
  expMs: number;
  secretKey: string;
  baseUrl: string;
}): string {
  return new URL(buildArtifactSignedPath(options), options.baseUrl).toString();
}

export function verifyArtifactSignature(options: {
  artifactId: string;
  disposition: ArtifactDisposition;
  expRaw: string;
  sig: string;
  secretKey: string;
}): { valid: boolean; expired: boolean } {
  const expected = computeSignature(
    options.secretKey,
    options.artifactId,
    options.disposition,
    options.expRaw,
  );
  const provided = Buffer.from(options.sig);
  const expectedBuffer = Buffer.from(expected);
  const valid =
    provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);

  const expMs = Number(options.expRaw);
  const expired = expMs !== 0 && (!Number.isFinite(expMs) || Date.now() > expMs);

  return { valid, expired };
}
