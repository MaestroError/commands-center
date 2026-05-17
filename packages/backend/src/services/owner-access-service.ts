import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";

import type { Logger } from "pino";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import {
  createAuthStateStore,
  type AuthStateStore,
  type ClaimCodeState,
  type OwnerAccessState,
  type OwnerSessionState,
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
const CLAIM_CODE_DURATION_MS = 30 * 60 * 1000;
const SESSION_ID_BYTES = 32;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const stateLocks = new Map<string, Promise<void>>();

type RateLimitBucket = "claimAttempts" | "reclaimAttempts" | "loginAttempts";

export type OwnerAccessStatus = "unclaimed" | "claimed";

export type RotateClaimCodeResult = {
  code: string;
  purpose: "claim" | "reclaim";
  warning: string;
};

export type OwnerBrowserAuthStatus =
  | "unclaimed"
  | "claimed-authenticated"
  | "claimed-unauthenticated";

export type OwnerSessionResult = {
  sessionId: string;
  expiresAt: string;
};

export type OwnerAccessService = {
  stateFile: string;
  initialize(): Promise<OwnerAccessState>;
  getState(): Promise<OwnerAccessState>;
  getStatus(): Promise<OwnerAccessStatus>;
  getBrowserAuthStatus(sessionId?: string): Promise<OwnerBrowserAuthStatus>;
  rotateClaimCode(): Promise<RotateClaimCodeResult>;
  claim(input: {
    claimCode: string;
    password: string;
    confirmPassword: string;
    ip?: string;
  }): Promise<OwnerAccessState>;
  login(input: {
    password: string;
    rememberBrowser?: boolean;
    userAgent?: string;
    ip?: string;
  }): Promise<OwnerSessionResult>;
  createSession(input?: {
    rememberBrowser?: boolean;
    userAgent?: string;
    ip?: string;
  }): Promise<OwnerSessionResult>;
  changePassword(input: {
    sessionId: string;
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
    ip?: string;
  }): Promise<OwnerAccessState>;
  validateSession(sessionId: string): Promise<boolean>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllSessions(): Promise<void>;
  revokeAllSessionsExcept(sessionId: string): Promise<void>;
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
      | "invalid_credentials"
      | "invalid_session"
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

  async function withStateLock<T>(operation: () => Promise<T>): Promise<T> {
    const previousLock = stateLocks.get(store.path) ?? Promise.resolve();
    let releaseLock = (): void => {};
    const nextLock = new Promise<void>((resolveLock) => {
      releaseLock = resolveLock;
    });
    stateLocks.set(store.path, nextLock);

    await previousLock;

    try {
      return await operation();
    } finally {
      releaseLock();
      if (stateLocks.get(store.path) === nextLock) {
        stateLocks.delete(store.path);
      }
    }
  }

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
        loginAttempts: [],
      },
      sessions: [],
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
    bucket: RateLimitBucket,
    ip = "unknown",
  ): OwnerAccessState {
    const currentTime = now();
    const currentAttempt = currentTime.toISOString();
    const windowStart = currentTime.getTime() - RATE_LIMIT_WINDOW_MS;
    const attempts = state.rateLimits[bucket];
    const existing = attempts.find((attempt) => attempt.key === ip);

    if (!existing) {
      return {
        ...state,
        rateLimits: {
          ...state.rateLimits,
          [bucket]: [...attempts, { key: ip, attempts: [currentAttempt] }],
        },
      };
    }

    const activeAttempts = existing.attempts.filter(
      (attemptedAt) => new Date(attemptedAt).getTime() >= windowStart,
    );

    if (activeAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
      throw new OwnerAccessError("rate_limited", "Too many owner access attempts.");
    }

    return {
      ...state,
      rateLimits: {
        ...state.rateLimits,
        [bucket]: attempts.map((attempt) =>
          attempt.key === ip
            ? { ...attempt, attempts: [...activeAttempts, currentAttempt] }
            : attempt,
        ),
      },
    };
  }

  async function createClaimState(previous?: ClaimCodeState): Promise<{
    code: string;
    state: ClaimCodeState;
  }> {
    const code = generateOwnerClaimCode();
    const timestamp = now();

    return {
      code,
      state: {
        hash: await hashOwnerSecret(code),
        createdAt: timestamp.toISOString(),
        expiresAt: new Date(timestamp.getTime() + CLAIM_CODE_DURATION_MS).toISOString(),
        rotatedAt: previous ? timestamp.toISOString() : undefined,
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

    if (
      claimCodeState.expiresAt &&
      new Date(claimCodeState.expiresAt).getTime() <= now().getTime()
    ) {
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

  function hashSessionId(sessionId: string): string {
    return createHash("sha256").update(sessionId).digest("base64url");
  }

  function createSessionState(input?: {
    rememberBrowser?: boolean;
    userAgent?: string;
    ip?: string;
  }): OwnerSessionResult & { session: OwnerSessionState } {
    const sessionId = randomBytes(SESSION_ID_BYTES).toString("base64url");
    const timestamp = now();
    const expiresAt = new Date(
      timestamp.getTime() +
        (input?.rememberBrowser ? REMEMBER_SESSION_DURATION_MS : SESSION_DURATION_MS),
    ).toISOString();

    return {
      sessionId,
      expiresAt,
      session: {
        idHash: hashSessionId(sessionId),
        createdAt: timestamp.toISOString(),
        lastUsedAt: timestamp.toISOString(),
        expiresAt,
        userAgent: input?.userAgent,
        ip: input?.ip,
      },
    };
  }

  function findActiveSession(
    state: OwnerAccessState,
    sessionId: string,
  ): OwnerSessionState | undefined {
    const sessionHash = hashSessionId(sessionId);
    const timestamp = now().getTime();

    return state.sessions.find(
      (session) =>
        session.idHash === sessionHash &&
        !session.revokedAt &&
        new Date(session.expiresAt).getTime() > timestamp,
    );
  }

  function assertClaimed(state: OwnerAccessState): void {
    if (!state.claimedAt || !state.ownerPassword) {
      throw new OwnerAccessError("workspace_unclaimed", "Workspace is not claimed.");
    }
  }

  function revokeSessions(
    state: OwnerAccessState,
    shouldRevoke: (session: OwnerSessionState) => boolean,
  ): OwnerAccessState {
    const timestamp = now().toISOString();

    return {
      ...state,
      sessions: state.sessions.map((session) =>
        shouldRevoke(session) && !session.revokedAt
          ? { ...session, revokedAt: timestamp }
          : session,
      ),
    };
  }

  return {
    stateFile: store.path,
    initialize: () => withStateLock(readOrCreateState),
    getState: () => withStateLock(readOrCreateState),
    async getStatus() {
      return withStateLock(async () => {
        const state = await readOrCreateState();
        return state.claimedAt && state.ownerPassword ? "claimed" : "unclaimed";
      });
    },
    async getBrowserAuthStatus(sessionId) {
      return withStateLock(async () => {
        const state = await readOrCreateState();

        if (!state.claimedAt || !state.ownerPassword) {
          return "unclaimed";
        }

        if (sessionId && findActiveSession(state, sessionId)) {
          return "claimed-authenticated";
        }

        return "claimed-unauthenticated";
      });
    },
    async rotateClaimCode() {
      return withStateLock(async () => {
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
      });
    },
    async claim(input) {
      return withStateLock(async () => {
        let state = await readOrCreateState();

        if (state.claimedAt || state.ownerPassword) {
          throw new OwnerAccessError("workspace_already_claimed", "Workspace is already claimed.");
        }

        state = enforceRateLimit(state, "claimAttempts", input.ip);
        state = { ...state, claimCode: recordClaimCodeAttempt(state.claimCode) };
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
      });
    },
    async login(input) {
      return withStateLock(async () => {
        let state = await readOrCreateState();
        assertClaimed(state);
        state = enforceRateLimit(state, "loginAttempts", input.ip);

        const passwordMatches = await verifyOwnerSecret(input.password, state.ownerPassword!);

        if (!passwordMatches) {
          await persist(state);
          options.logger?.warn({ authStateFile: store.path }, "owner login failed");
          throw new OwnerAccessError("invalid_credentials", "Invalid credentials.");
        }

        const result = createSessionState(input);
        await persist({
          ...state,
          sessions: [...state.sessions, result.session],
        });
        options.logger?.info({ authStateFile: store.path }, "owner login completed");

        return { sessionId: result.sessionId, expiresAt: result.expiresAt };
      });
    },
    async createSession(input) {
      return withStateLock(async () => {
        const state = await readOrCreateState();
        assertClaimed(state);
        const result = createSessionState(input);
        await persist({
          ...state,
          sessions: [...state.sessions, result.session],
        });

        return { sessionId: result.sessionId, expiresAt: result.expiresAt };
      });
    },
    async changePassword(input) {
      return withStateLock(async () => {
        const state = await readOrCreateState();
        assertClaimed(state);

        const session = findActiveSession(state, input.sessionId);
        if (!session) {
          throw new OwnerAccessError("invalid_session", "Owner session is invalid.");
        }

        const currentPasswordMatches = await verifyOwnerSecret(
          input.currentPassword,
          state.ownerPassword!,
        );

        if (!currentPasswordMatches) {
          options.logger?.warn({ authStateFile: store.path }, "owner password change failed");
          throw new OwnerAccessError("invalid_credentials", "Invalid credentials.");
        }

        const validation = validateOwnerPassword({
          password: input.newPassword,
          confirmPassword: input.confirmNewPassword,
          currentPassword: input.currentPassword,
        });

        if (!validation.valid) {
          options.logger?.warn({ authStateFile: store.path }, "owner password change failed");
          throw new OwnerAccessError(
            "password_validation_failed",
            "Owner password does not meet requirements.",
            validation.issues,
          );
        }

        const sessionHash = hashSessionId(input.sessionId);
        const nextState = await persist({
          ...state,
          ownerPassword: await hashOwnerSecret(input.newPassword),
          sessions: revokeSessions(state, (candidate) => candidate.idHash !== sessionHash).sessions,
        });
        options.logger?.info({ authStateFile: store.path }, "owner password changed");

        return nextState;
      });
    },
    async validateSession(sessionId) {
      return withStateLock(async () => {
        const state = await readOrCreateState();
        const session = findActiveSession(state, sessionId);
        return Boolean(session);
      });
    },
    async revokeSession(sessionId) {
      await withStateLock(async () => {
        const state = await readOrCreateState();
        const sessionHash = hashSessionId(sessionId);
        await persist(revokeSessions(state, (session) => session.idHash === sessionHash));
        options.logger?.info({ authStateFile: store.path }, "owner session revoked");
      });
    },
    async revokeAllSessions() {
      await withStateLock(async () => {
        const state = await readOrCreateState();
        await persist(revokeSessions(state, () => true));
        options.logger?.info({ authStateFile: store.path }, "all owner sessions revoked");
      });
    },
    async revokeAllSessionsExcept(sessionId) {
      await withStateLock(async () => {
        const state = await readOrCreateState();
        const sessionHash = hashSessionId(sessionId);
        await persist(revokeSessions(state, (session) => session.idHash !== sessionHash));
        options.logger?.info({ authStateFile: store.path }, "other owner sessions revoked");
      });
    },
    async completeReclaim(input) {
      return withStateLock(async () => {
        let state = await readOrCreateState();

        if (!state.claimedAt || !state.ownerPassword) {
          throw new OwnerAccessError("workspace_unclaimed", "Workspace is not claimed.");
        }

        state = enforceRateLimit(state, "reclaimAttempts", input.ip);
        state = { ...state, reclaimCode: recordClaimCodeAttempt(state.reclaimCode) };
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
          sessions: revokeSessions(state, () => true).sessions,
        });

        options.logger?.info({ authStateFile: store.path }, "workspace owner reclaim completed");
        return nextState;
      });
    },
  };
}
