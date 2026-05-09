import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createOwnerAccessService,
  OwnerAccessError,
} from "../../src/services/owner-access-service";
import { verifyOwnerSecret } from "../../src/lib/owner-password";
import { createTestDatabase } from "../helpers/db";

const STRONG_PASSWORD = "CorrectHorseBatteryStaple42";
const NEXT_STRONG_PASSWORD = "CorrectHorseBatteryStaple43";

describe("owner-access-service", () => {
  it("initializes portable auth state under the workspace auth directory", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const state = await service.initialize();

      expect(state.version).toBe(1);
      expect(state.claimedAt).toBeUndefined();
      expect(service.stateFile).toBe(
        resolve(testDb.config.paths.subdirectories.auth, "owner-access.json"),
      );
      await expect(stat(service.stateFile)).resolves.toBeDefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("rotates claim codes and stores only hashed claim metadata", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const first = await service.rotateClaimCode();
      const second = await service.rotateClaimCode();
      const persisted = await service.getState();
      const content = await readFile(service.stateFile, "utf8");

      expect(first.purpose).toBe("claim");
      expect(second.purpose).toBe("claim");
      expect(second.code).not.toBe(first.code);
      expect(persisted.claimCode?.hash.algorithm).toBe("scrypt");
      expect(persisted.claimCode?.rotatedAt).toBeDefined();
      expect(content).not.toContain(first.code);
      expect(content).not.toContain(second.code);
    } finally {
      await testDb.cleanup();
    }
  });

  it("claims a fresh workspace and invalidates the active claim code", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      const state = await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });

      expect(state.claimedAt).toBeDefined();
      expect(state.ownerPassword?.algorithm).toBe("scrypt");
      expect(state.claimCode?.invalidatedAt).toBeDefined();
      await expect(service.getStatus()).resolves.toBe("claimed");
      await expect(verifyOwnerSecret(STRONG_PASSWORD, state.ownerPassword!)).resolves.toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects weak passwords without claiming the workspace", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      const rejected = service.claim({
        claimCode: claim.code,
        password: "password1234",
        confirmPassword: "password1234",
      });

      await expect(rejected).rejects.toMatchObject({
        code: "password_validation_failed",
      });
      const persisted = await service.getState();

      await expect(service.getStatus()).resolves.toBe("unclaimed");
      expect(persisted.claimCode?.attemptCount).toBe(1);
      expect(persisted.claimCode?.lastAttemptAt).toBeDefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects passwords matching the claim code", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      const rejected = service.claim({
        claimCode: claim.code,
        password: claim.code,
        confirmPassword: claim.code,
      });

      await expect(rejected).rejects.toMatchObject({
        code: "password_validation_failed",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("creates reclaim codes for claimed workspaces without removing the existing password", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      const claimed = await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const reclaim = await service.rotateClaimCode();
      const afterRotation = await service.getState();

      expect(reclaim.purpose).toBe("reclaim");
      expect(afterRotation.ownerPassword).toEqual(claimed.ownerPassword);
      expect(afterRotation.reclaimCode?.hash.algorithm).toBe("scrypt");
      await expect(verifyOwnerSecret(STRONG_PASSWORD, afterRotation.ownerPassword!)).resolves.toBe(
        true,
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("completes reclaim and invalidates the reclaim code", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const reclaim = await service.rotateClaimCode();
      const reclaimed = await service.completeReclaim({
        claimCode: reclaim.code,
        password: NEXT_STRONG_PASSWORD,
        confirmPassword: NEXT_STRONG_PASSWORD,
      });

      expect(reclaimed.reclaimCode?.invalidatedAt).toBeDefined();
      await expect(verifyOwnerSecret(NEXT_STRONG_PASSWORD, reclaimed.ownerPassword!)).resolves.toBe(
        true,
      );
      await expect(verifyOwnerSecret(STRONG_PASSWORD, reclaimed.ownerPassword!)).resolves.toBe(
        false,
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("rate-limits repeated invalid claim attempts", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      await service.rotateClaimCode();

      for (let attempt = 0; attempt < 10; attempt++) {
        await expect(
          service.claim({
            claimCode: `wrong-${attempt.toString()}`,
            password: STRONG_PASSWORD,
            confirmPassword: STRONG_PASSWORD,
            ip: "203.0.113.10",
          }),
        ).rejects.toBeInstanceOf(OwnerAccessError);
      }

      await expect(
        service.claim({
          claimCode: "wrong-final",
          password: STRONG_PASSWORD,
          confirmPassword: STRONG_PASSWORD,
          ip: "203.0.113.10",
        }),
      ).rejects.toMatchObject({ code: "rate_limited" });
    } finally {
      await testDb.cleanup();
    }
  });
});
