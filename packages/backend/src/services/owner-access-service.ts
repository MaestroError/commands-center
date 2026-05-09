import { resolve } from "node:path";

import type { Logger } from "pino";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import {
  createAuthStateStore,
  type AuthStateStore,
  type ClaimCodeState,
  type OwnerAccessState,
} from "../lib/auth-state-store.js";
import { generateOwnerClaimCode } from "../lib/owner-claim-code.js";
import {
  hashOwnerSecret,
  validateOwnerPassword,
  verifyOwnerSecret,
} from "../lib/owner-password.js";

const OWNER_ACCESS_FILE = "owner-access.json";
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

export type OwnerAccessStatus = "unclaimed" | "claimed";

export type RotateClaimCodeResult = {
  code: string;
  purpose: "claim" | "reclaim";
  warning: string;
};

export type OwnerAccessService = {
  stateFile: string;
  initialize(): Promise<OwnerAccessState>;
  getState(): Promise<OwnerAccessState>;
  getStatus(): Promise<OwnerAccessStatus>;
  rotateClaimCode(): Promise<RotateClaimCodeResult>;
  claim(input: {
    claimCode: string;
    password: string;
    confirmPassword: string;
    ip?: string;
  }): Promise<OwnerAccessState>;
  completeReclaim(input: {
    claimCode: string;
    password: string;
    confirmPassword: string;
    ip?: string;
  }): Promise<OwnerAccessState>;
};

export class OwnerAccessError extends Error {
  constructor(
    readonly code:
      | "invalid_claim_code"
      | "password_validation_failed"
      | "workspace_already_claimed"
      | "workspace_unclaimed"
      | "rate_limited",
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "OwnerAccessError";
  }
}

export function createOwnerAccessService(options: {
  config: RuntimeConfig;
  logger?: Pick<Logger, "info" | "warn">;
  store?: AuthStateStore;
  now?: () => Date;
}): OwnerAccessService {
  const stateFile = resolve(options.config.paths.subdirectories.auth, OWNER_ACCESS_FILE);
  const store = options.store ?? createAuthStateStore(stateFile);
  const now = options.now ?? (() => new Date());

  async function readOrCreateState(): Promise<OwnerAccessState> {
    const existing = await store.read();

    if (existing) {
      return existing;
    }

    const timestamp = now().toISOString();
    const state: OwnerAccessState = {
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      rateLimits: {
        claimAttempts: [],
        reclaimAttempts: [],
      },
    };

    await store.write(state);
    options.logger?.info({ authStateFile: store.path }, "owner access state initialized");
    return state;
  }

  async function persist(state: OwnerAccessState): Promise<OwnerAccessState> {
    const nextState = {
      ...state,
      updatedAt: now().toISOString(),
    } satisfies OwnerAccessState;
    await store.write(nextState);
    return nextState;
  }

  function enforceRateLimit(
    state: OwnerAccessState,
    bucket: "claimAttempts" | "reclaimAttempts",
    ip = "unknown",
  ): void {
    const currentTime = now();
    const windowStart = currentTime.getTime() - RATE_LIMIT_WINDOW_MS;
    const attempts = state.rateLimits[bucket];
    const existing = attempts.find((attempt) => attempt.key === ip);

    if (!existing) {
      attempts.push({ key: ip, attempts: [currentTime.toISOString()] });
      return;
    }

    existing.attempts = existing.attempts.filter(
      (attemptedAt) => new Date(attemptedAt).getTime() >= windowStart,
    );

    if (existing.attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
      throw new OwnerAccessError("rate_limited", "Too many owner access attempts.");
    }

    existing.attempts.push(currentTime.toISOString());
  }

  async function createClaimState(previous?: ClaimCodeState): Promise<{
    code: string;
    state: ClaimCodeState;
  }> {
    const code = generateOwnerClaimCode();
    const timestamp = now().toISOString();

    return {
      code,
      state: {
        hash: await hashOwnerSecret(code),
        createdAt: timestamp,
        rotatedAt: previous ? timestamp : undefined,
        attemptCount: 0,
      },
    };
  }

  async function assertClaimCodeValid(
    code: string,
    claimCodeState: ClaimCodeState | undefined,
  ): Promise<void> {
    if (!claimCodeState || claimCodeState.invalidatedAt) {
      throw new OwnerAccessError("invalid_claim_code", "Claim code is invalid.");
    }

    const matches = await verifyOwnerSecret(code, claimCodeState.hash);

    if (!matches) {
      throw new OwnerAccessError("invalid_claim_code", "Claim code is invalid.");
    }
  }

  function recordClaimCodeAttempt(
    claimCodeState: ClaimCodeState | undefined,
  ): ClaimCodeState | undefined {
    if (!claimCodeState) {
      return undefined;
    }

    return {
      ...claimCodeState,
      attemptCount: claimCodeState.attemptCount + 1,
      lastAttemptAt: now().toISOString(),
    };
  }

  async function buildOwnerPassword(options: {
    password: string;
    confirmPassword: string;
    claimCode: string;
    currentPassword?: string;
  }) {
    const validation = validateOwnerPassword(options);

    if (!validation.valid) {
      throw new OwnerAccessError(
        "password_validation_failed",
        "Owner password does not meet requirements.",
        validation.issues,
      );
    }

    return hashOwnerSecret(options.password);
  }

  return {
    stateFile: store.path,
    initialize: readOrCreateState,
    getState: readOrCreateState,
    async getStatus() {
      const state = await readOrCreateState();
      return state.claimedAt && state.ownerPassword ? "claimed" : "unclaimed";
    },
    async rotateClaimCode() {
      const state = await readOrCreateState();
      const claimed = state.claimedAt && state.ownerPassword;
      const purpose = claimed ? "reclaim" : "claim";
      const previous = claimed ? state.reclaimCode : state.claimCode;
      const { code, state: claimState } = await createClaimState(previous);
      const nextState = claimed
        ? { ...state, reclaimCode: claimState }
        : { ...state, claimCode: claimState };

      await persist(nextState);
      options.logger?.warn(
        { purpose, authStateFile: store.path },
        "owner claim code rotated; plaintext code is only shown to the local operator",
      );

      return {
        code,
        purpose,
        warning:
          "Anyone who can read this claim code has temporary owner recovery power for this workspace.",
      };
    },
    async claim(input) {
      const state = await readOrCreateState();

      if (state.claimedAt || state.ownerPassword) {
        throw new OwnerAccessError("workspace_already_claimed", "Workspace is already claimed.");
      }

      enforceRateLimit(state, "claimAttempts", input.ip);
      state.claimCode = recordClaimCodeAttempt(state.claimCode);
      let ownerPassword: Awaited<ReturnType<typeof buildOwnerPassword>>;

      try {
        await assertClaimCodeValid(input.claimCode, state.claimCode);
        ownerPassword = await buildOwnerPassword({
          password: input.password,
          confirmPassword: input.confirmPassword,
          claimCode: input.claimCode,
        });
      } catch (error) {
        await persist(state);
        throw error;
      }

      const timestamp = now().toISOString();
      const nextState = await persist({
        ...state,
        claimedAt: timestamp,
        ownerPassword,
        claimCode: state.claimCode ? { ...state.claimCode, invalidatedAt: timestamp } : undefined,
        reclaimCode: undefined,
      });

      options.logger?.info({ authStateFile: store.path }, "workspace owner claim completed");
      return nextState;
    },
    async completeReclaim(input) {
      const state = await readOrCreateState();

      if (!state.claimedAt || !state.ownerPassword) {
        throw new OwnerAccessError("workspace_unclaimed", "Workspace is not claimed.");
      }

      enforceRateLimit(state, "reclaimAttempts", input.ip);
      state.reclaimCode = recordClaimCodeAttempt(state.reclaimCode);
      let ownerPassword: Awaited<ReturnType<typeof buildOwnerPassword>>;

      try {
        await assertClaimCodeValid(input.claimCode, state.reclaimCode);
        ownerPassword = await buildOwnerPassword({
          password: input.password,
          confirmPassword: input.confirmPassword,
          claimCode: input.claimCode,
        });
      } catch (error) {
        await persist(state);
        throw error;
      }

      const timestamp = now().toISOString();
      const nextState = await persist({
        ...state,
        ownerPassword,
        reclaimCode: state.reclaimCode
          ? { ...state.reclaimCode, invalidatedAt: timestamp }
          : undefined,
      });

      options.logger?.info({ authStateFile: store.path }, "workspace owner reclaim completed");
      return nextState;
    },
  };
}
