import { createHash, randomBytes } from "node:crypto";

import { asc, and, eq, isNull } from "drizzle-orm";

import {
  apiTokenPermissionsSchema,
  API_TOKEN_PRESETS,
  isApiTokenCapabilityId,
  orderApiTokenCapabilityIds,
  type ApiTokenPermissions,
  type ApiTokenRecord,
  type ApiTokenScope,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { createId, now } from "../db/ids.js";
import { api_tokens } from "../db/schema/index.js";
import { BadRequestError } from "../lib/api-error.js";

const TOKEN_PREFIX = "cc_";
const TOKEN_RANDOM_BYTES = 32;
const TOKEN_DISPLAY_PREFIX_LENGTH = 12;
const ORDERED_SCOPES = ["templates", "tasks"] as const;

export type ApiTokenService = ReturnType<typeof createApiTokenService>;

export function createApiTokenService(options: { db: AppDb }) {
  return {
    createToken(
      name: string,
      permissions: ApiTokenPermissions,
    ): {
      token: string;
      record: ApiTokenRecord;
    } {
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        throw new BadRequestError("Token name is required.");
      }

      const validated = validateInputPermissions(permissions);
      const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString("base64url")}`;
      const tokenHash = hashToken(token);
      const timestamp = now();
      const row = options.db
        .insert(api_tokens)
        .values({
          id: createId(),
          name: trimmedName,
          token_hash: tokenHash,
          token_prefix: token.slice(0, TOKEN_DISPLAY_PREFIX_LENGTH),
          // Fail-closed on rollback: a pre-capability build reads no scopes and
          // denies access rather than crashing or broadening privileges.
          scopes_json: "[]",
          permissions_json: JSON.stringify(validated),
          created_at: timestamp,
          last_used_at: null,
          revoked_at: null,
        })
        .returning()
        .get();

      if (!row) {
        throw new Error("Failed to create API token.");
      }

      return { token, record: mapApiToken(row) };
    },

    // In-place permission edit. The secret is preserved and never re-revealed.
    updateToken(
      id: string,
      input: { name?: string; permissions: ApiTokenPermissions },
    ): ApiTokenRecord | null {
      const validated = validateInputPermissions(input.permissions);
      const trimmedName = input.name?.trim();

      if (trimmedName !== undefined && trimmedName.length === 0) {
        throw new BadRequestError("Token name is required.");
      }

      const row = options.db
        .update(api_tokens)
        .set({
          ...(trimmedName !== undefined ? { name: trimmedName } : {}),
          scopes_json: "[]",
          permissions_json: JSON.stringify(validated),
        })
        .where(and(eq(api_tokens.id, id), isNull(api_tokens.revoked_at)))
        .returning()
        .get();

      return row ? mapApiToken(row) : null;
    },

    listTokens(): ApiTokenRecord[] {
      const rows = options.db.select().from(api_tokens).orderBy(asc(api_tokens.created_at)).all();

      return rows.map(mapApiToken);
    },

    revokeToken(id: string): boolean {
      const row = options.db
        .update(api_tokens)
        .set({ revoked_at: now() })
        .where(and(eq(api_tokens.id, id), isNull(api_tokens.revoked_at)))
        .returning({ id: api_tokens.id })
        .get();

      return row !== undefined;
    },

    validateToken(rawToken: string): ApiTokenRecord | null {
      const token = rawToken.trim();

      if (!token.startsWith(TOKEN_PREFIX)) {
        return null;
      }

      const row = options.db
        .select()
        .from(api_tokens)
        .where(eq(api_tokens.token_hash, hashToken(token)))
        .get();

      if (!row || row.revoked_at !== null) {
        return null;
      }

      const timestamp = now();
      const updated = options.db
        .update(api_tokens)
        .set({ last_used_at: timestamp })
        .where(and(eq(api_tokens.id, row.id), isNull(api_tokens.revoked_at)))
        .returning()
        .get();

      // If the UPDATE found no row, the token was concurrently revoked between the
      // SELECT and the UPDATE — treat it as invalid.
      if (!updated) {
        return null;
      }

      return mapApiToken(updated);
    },
  };
}

/** Whether the token grants a specific capability id. */
export function tokenHasCapability(record: ApiTokenRecord, capabilityId: string): boolean {
  return record.permissions.capabilities.includes(capabilityId);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Strict validation for user input: rejects unknown capability ids, dedupes, and
// requires at least one capability or template. Templates are not validated
// against a static catalog here (they are template ids, checked in Phase 3).
function validateInputPermissions(permissions: ApiTokenPermissions): ApiTokenPermissions {
  const parsed = apiTokenPermissionsSchema.parse(permissions);

  for (const capabilityId of parsed.capabilities) {
    if (!isApiTokenCapabilityId(capabilityId)) {
      throw new BadRequestError(`Unknown token capability '${capabilityId}'.`);
    }
  }

  const capabilities = orderApiTokenCapabilityIds(parsed.capabilities);
  const templates = [...new Set(parsed.templates)];

  if (capabilities.length === 0 && templates.length === 0) {
    throw new BadRequestError("At least one token permission is required.");
  }

  return { capabilities, templates };
}

// Lenient deserialisation for legacy DB rows: silently ignores unknown scope
// strings (forward-compatible, safe for rollbacks).
function deserialiseScopes(raw: unknown[]): ApiTokenScope[] {
  const known = new Set(ORDERED_SCOPES as readonly string[]);
  const unique = new Set(
    raw.filter((s): s is ApiTokenScope => typeof s === "string" && known.has(s)),
  );
  return ORDERED_SCOPES.filter((scope) => unique.has(scope));
}

// Resolve a token's effective permissions. New tokens read permissions_json
// (dropping any unknown capability ids for forward-compat); pre-capability tokens
// are mapped from their legacy scopes via the preset id-lists. The `tasks` preset
// includes `list_task_templates`, preserving the old `either` list access.
function resolvePermissions(row: typeof api_tokens.$inferSelect): ApiTokenPermissions {
  if (row.permissions_json !== null) {
    const parsed = apiTokenPermissionsSchema.parse(JSON.parse(row.permissions_json));
    return {
      capabilities: orderApiTokenCapabilityIds(parsed.capabilities),
      templates: [...new Set(parsed.templates)],
    };
  }

  const scopes = deserialiseScopes(JSON.parse(row.scopes_json) as unknown[]);
  const capabilityIds = scopes.flatMap((scope) => API_TOKEN_PRESETS[scope]);

  return {
    capabilities: orderApiTokenCapabilityIds(capabilityIds),
    templates: [],
  };
}

function mapApiToken(row: typeof api_tokens.$inferSelect): ApiTokenRecord {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    permissions: resolvePermissions(row),
    createdAt: row.created_at.getTime(),
    lastUsedAt: row.last_used_at?.getTime() ?? null,
    revokedAt: row.revoked_at?.getTime() ?? null,
  };
}
