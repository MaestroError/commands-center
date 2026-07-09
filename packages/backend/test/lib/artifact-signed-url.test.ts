import { describe, expect, it } from "vitest";

import {
  buildArtifactSignedPath,
  verifyArtifactSignature,
} from "../../src/lib/artifact-signed-url";

const SECRET = "test-secret-key";

function parse(path: string): {
  artifactId: string;
  disposition: "display" | "download";
  exp: string;
  sig: string;
} {
  const url = new URL(path, "http://localhost");
  const parts = url.pathname.split("/");
  return {
    artifactId: decodeURIComponent(parts[5]!),
    disposition: parts[6] as "display" | "download",
    exp: url.searchParams.get("exp")!,
    sig: url.searchParams.get("sig")!,
  };
}

describe("artifact signed URLs", () => {
  it("builds a path that verifies with the same secret", () => {
    const expMs = Date.now() + 60_000;
    const path = buildArtifactSignedPath({
      artifactId: "art-1",
      disposition: "display",
      expMs,
      secretKey: SECRET,
    });
    const parsed = parse(path);

    expect(
      verifyArtifactSignature({
        artifactId: "art-1",
        disposition: "display",
        expRaw: parsed.exp,
        sig: parsed.sig,
        secretKey: SECRET,
      }),
    ).toEqual({ valid: true, expired: false });
  });

  it("is idempotent — same inputs produce the same URL", () => {
    const args = {
      artifactId: "art-1",
      disposition: "download" as const,
      expMs: 1000,
      secretKey: SECRET,
    };
    expect(buildArtifactSignedPath(args)).toBe(buildArtifactSignedPath(args));
  });

  it("rejects a tampered artifactId, disposition, or secret", () => {
    const expMs = Date.now() + 60_000;
    const parsed = parse(
      buildArtifactSignedPath({
        artifactId: "art-1",
        disposition: "display",
        expMs,
        secretKey: SECRET,
      }),
    );

    expect(
      verifyArtifactSignature({
        artifactId: "art-2",
        disposition: "display",
        expRaw: parsed.exp,
        sig: parsed.sig,
        secretKey: SECRET,
      }).valid,
    ).toBe(false);
    expect(
      verifyArtifactSignature({
        artifactId: "art-1",
        disposition: "download",
        expRaw: parsed.exp,
        sig: parsed.sig,
        secretKey: SECRET,
      }).valid,
    ).toBe(false);
    expect(
      verifyArtifactSignature({
        artifactId: "art-1",
        disposition: "display",
        expRaw: parsed.exp,
        sig: parsed.sig,
        secretKey: "other-secret",
      }).valid,
    ).toBe(false);
  });

  it("treats a non-numeric exp as expired", () => {
    expect(
      verifyArtifactSignature({
        artifactId: "a",
        disposition: "display",
        expRaw: "not-a-number",
        sig: "whatever",
        secretKey: SECRET,
      }).expired,
    ).toBe(true);
  });

  it("marks past expiry as expired, and exp=0 as never-expiring", () => {
    const past = parse(
      buildArtifactSignedPath({
        artifactId: "a",
        disposition: "display",
        expMs: 1,
        secretKey: SECRET,
      }),
    );
    expect(
      verifyArtifactSignature({
        artifactId: "a",
        disposition: "display",
        expRaw: past.exp,
        sig: past.sig,
        secretKey: SECRET,
      }),
    ).toEqual({ valid: true, expired: true });

    const forever = parse(
      buildArtifactSignedPath({
        artifactId: "a",
        disposition: "display",
        expMs: 0,
        secretKey: SECRET,
      }),
    );
    expect(
      verifyArtifactSignature({
        artifactId: "a",
        disposition: "display",
        expRaw: forever.exp,
        sig: forever.sig,
        secretKey: SECRET,
      }),
    ).toEqual({ valid: true, expired: false });
  });
});
