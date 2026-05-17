import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createOwnerAccessService,
  OwnerAccessError,
} from "../../src/services/owner-access-service";
import type { AuthStateStore, OwnerAccessState } from "../../src/lib/auth-state-store";
import { hashOwnerSecret, verifyOwnerSecret } from "../../src/lib/owner-password";
import { createTestDatabase } from "../helpers/db";

const STRONG_PASSWORD = "CorrectHorseBatteryStaple42!";
const NEXT_STRONG_PASSWORD = "CorrectHorseBatteryStaple43!";

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

  it("rejects expired claim codes", async () => {
    const testDb = await createTestDatabase();
    const currentTime = new Date("2026-01-01T00:00:00.000Z");
    const service = createOwnerAccessService({
      config: testDb.config,
      now: () => currentTime,
    });

    try {
      const claim = await service.rotateClaimCode();
      currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 31);

      await expect(
        service.claim({
          claimCode: claim.code,
          password: STRONG_PASSWORD,
          confirmPassword: STRONG_PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "invalid_claim_code" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects rotated claim codes", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const rotated = await service.rotateClaimCode();
      await service.rotateClaimCode();

      await expect(
        service.claim({
          claimCode: rotated.code,
          password: STRONG_PASSWORD,
          confirmPassword: STRONG_PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "invalid_claim_code" });
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

  it("logs in with the owner password and stores only a hashed session id", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD, ip: "203.0.113.11" });
      const state = await service.getState();
      const content = await readFile(service.stateFile, "utf8");

      expect(session.sessionId).toHaveLength(43);
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0]?.idHash).toBeDefined();
      expect(content).not.toContain(session.sessionId);
      await expect(service.validateSession(session.sessionId)).resolves.toBe(true);
      await expect(service.getBrowserAuthStatus(session.sessionId)).resolves.toBe(
        "claimed-authenticated",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("records successful login attempts for rate limiting", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      await service.login({ password: STRONG_PASSWORD, ip: "203.0.113.21" });
      const state = await service.getState();

      expect(state.rateLimits.loginAttempts).toEqual([
        {
          key: "203.0.113.21",
          attempts: [expect.any(String)],
        },
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("validates sessions without rewriting auth state", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD });
      const before = await readFile(service.stateFile, "utf8");

      await expect(service.validateSession(session.sessionId)).resolves.toBe(true);

      await expect(readFile(service.stateFile, "utf8")).resolves.toBe(before);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects invalid login with generic credentials error", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });

      await expect(service.login({ password: "wrong-password" })).rejects.toMatchObject({
        code: "invalid_credentials",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rate-limits repeated invalid login attempts", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });

      for (let attempt = 0; attempt < 10; attempt++) {
        await expect(
          service.login({ password: `wrong-password-${attempt.toString()}`, ip: "203.0.113.20" }),
        ).rejects.toMatchObject({ code: "invalid_credentials" });
      }

      await expect(
        service.login({ password: "wrong-password-final", ip: "203.0.113.20" }),
      ).rejects.toMatchObject({ code: "rate_limited" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("expires finite browser sessions", async () => {
    const testDb = await createTestDatabase();
    const currentTime = new Date("2026-01-01T00:00:00.000Z");
    const service = createOwnerAccessService({
      config: testDb.config,
      now: () => currentTime,
    });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD });
      currentTime.setUTCDate(currentTime.getUTCDate() + 8);

      await expect(service.validateSession(session.sessionId)).resolves.toBe(false);
      await expect(service.getBrowserAuthStatus(session.sessionId)).resolves.toBe(
        "claimed-unauthenticated",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("revokes individual sessions and all sessions except the current one", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const first = await service.login({ password: STRONG_PASSWORD });
      const second = await service.login({ password: STRONG_PASSWORD });
      const third = await service.login({ password: STRONG_PASSWORD });

      await service.revokeSession(first.sessionId);
      await expect(service.validateSession(first.sessionId)).resolves.toBe(false);
      await service.revokeAllSessionsExcept(second.sessionId);
      await expect(service.validateSession(second.sessionId)).resolves.toBe(true);
      await expect(service.validateSession(third.sessionId)).resolves.toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("changes the owner password and revokes other sessions", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const current = await service.login({ password: STRONG_PASSWORD });
      const other = await service.login({ password: STRONG_PASSWORD });
      const changed = await service.changePassword({
        sessionId: current.sessionId,
        currentPassword: STRONG_PASSWORD,
        newPassword: NEXT_STRONG_PASSWORD,
        confirmNewPassword: NEXT_STRONG_PASSWORD,
      });

      await expect(verifyOwnerSecret(NEXT_STRONG_PASSWORD, changed.ownerPassword!)).resolves.toBe(
        true,
      );
      await expect(verifyOwnerSecret(STRONG_PASSWORD, changed.ownerPassword!)).resolves.toBe(false);
      await expect(service.validateSession(current.sessionId)).resolves.toBe(true);
      await expect(service.validateSession(other.sessionId)).resolves.toBe(false);
      await expect(service.login({ password: NEXT_STRONG_PASSWORD })).resolves.toBeDefined();
      await expect(service.login({ password: STRONG_PASSWORD })).rejects.toMatchObject({
        code: "invalid_credentials",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects password changes with invalid current password", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD });

      await expect(
        service.changePassword({
          sessionId: session.sessionId,
          currentPassword: "wrong-password",
          newPassword: NEXT_STRONG_PASSWORD,
          confirmNewPassword: NEXT_STRONG_PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "invalid_credentials" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects weak password changes", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD });

      await expect(
        service.changePassword({
          sessionId: session.sessionId,
          currentPassword: STRONG_PASSWORD,
          newPassword: "password1234",
          confirmNewPassword: "password1234",
        }),
      ).rejects.toMatchObject({ code: "password_validation_failed" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects mismatched password change confirmation", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD });

      await expect(
        service.changePassword({
          sessionId: session.sessionId,
          currentPassword: STRONG_PASSWORD,
          newPassword: NEXT_STRONG_PASSWORD,
          confirmNewPassword: "DifferentPassword42",
        }),
      ).rejects.toMatchObject({ code: "password_validation_failed" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects reused password changes", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD });

      await expect(
        service.changePassword({
          sessionId: session.sessionId,
          currentPassword: STRONG_PASSWORD,
          newPassword: STRONG_PASSWORD,
          confirmNewPassword: STRONG_PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "password_validation_failed" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("reclaim revokes existing sessions", async () => {
    const testDb = await createTestDatabase();
    const service = createOwnerAccessService({ config: testDb.config });

    try {
      const claim = await service.rotateClaimCode();
      await service.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await service.login({ password: STRONG_PASSWORD });
      const reclaim = await service.rotateClaimCode();
      await service.completeReclaim({
        claimCode: reclaim.code,
        password: NEXT_STRONG_PASSWORD,
        confirmPassword: NEXT_STRONG_PASSWORD,
      });

      await expect(service.validateSession(session.sessionId)).resolves.toBe(false);
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

  it("preserves all concurrent session updates across service instances", async () => {
    const testDb = await createTestDatabase();
    const timestamp = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const store = createContendedMemoryStore({
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      claimedAt: timestamp,
      ownerPassword: await hashOwnerSecret(STRONG_PASSWORD),
      sessions: [],
      rateLimits: {
        claimAttempts: [],
        reclaimAttempts: [],
        loginAttempts: [],
      },
    });
    const primaryService = createOwnerAccessService({ config: testDb.config, store });
    const secondaryService = createOwnerAccessService({ config: testDb.config, store });
    const sessionInputs = Array.from({ length: 8 }, (_, index) => ({
      userAgent: `browser-${index.toString()}`,
    }));

    try {
      const sessions = await Promise.all(
        sessionInputs.map((input, index) =>
          (index % 2 === 0 ? primaryService : secondaryService).createSession(input),
        ),
      );
      const state = await primaryService.getState();

      expect(state.sessions).toHaveLength(sessionInputs.length);
      expect(state.sessions.map((session) => session.userAgent).sort()).toEqual(
        sessionInputs.map((input) => input.userAgent).sort(),
      );
      await Promise.all(
        sessions.map((session) =>
          expect(primaryService.validateSession(session.sessionId)).resolves.toBe(true),
        ),
      );
    } finally {
      await testDb.cleanup();
    }
  });
});

function createContendedMemoryStore(initialState: OwnerAccessState): AuthStateStore {
  let state = cloneState(initialState);

  return {
    path: "memory-owner-access.json",
    async read() {
      await Promise.resolve();
      return cloneState(state);
    },
    async write(nextState) {
      await Promise.resolve();
      state = cloneState(nextState);
    },
  };
}

function cloneState(state: OwnerAccessState): OwnerAccessState {
  return JSON.parse(JSON.stringify(state)) as OwnerAccessState;
}
