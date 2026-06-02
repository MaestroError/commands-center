import { createHash, randomBytes } from "node:crypto";

import { asc, and, eq, isNull } from "drizzle-orm";

import {
  apiTokenScopeSchema,
  createApiTokenInputSchema,
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
      scopes: ApiTokenScope[],
    ): {
      token: string;
      record: ApiTokenRecord;
    } {
      const parsed = createApiTokenInputSchema.parse({ name, scopes });
      const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString("base64url")}`;
      const tokenHash = hashToken(token);
      const timestamp = now();
      const row = options.db
        .insert(api_tokens)
        .values({
          id: createId(),
          name: parsed.name,
          token_hash: tokenHash,
          token_prefix: token.slice(0, TOKEN_DISPLAY_PREFIX_LENGTH),
          scopes_json: JSON.stringify(validateInputScopes(parsed.scopes)),
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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Strict validation for user input: rejects unknown scopes (throws ZodError) and
// requires at least one scope. Used only on the write path (createToken).
function validateInputScopes(scopes: ApiTokenScope[]): ApiTokenScope[] {
  const parsedScopes = scopes.map((scope) => apiTokenScopeSchema.parse(scope));
  const uniqueScopes = new Set(parsedScopes);

  if (uniqueScopes.size === 0) {
    throw new BadRequestError("At least one token scope is required.");
  }

  return ORDERED_SCOPES.filter((scope) => uniqueScopes.has(scope));
}

// Lenient deserialisation for DB rows: silently ignores unknown scope strings
// (forward-compatible with future scopes, safe for rollbacks). Used on all read paths.
function deserialiseScopes(raw: unknown[]): ApiTokenScope[] {
  const known = new Set(ORDERED_SCOPES as readonly string[]);
  const unique = new Set(
    raw.filter((s): s is ApiTokenScope => typeof s === "string" && known.has(s)),
  );
  return ORDERED_SCOPES.filter((scope) => unique.has(scope));
}

function mapApiToken(row: typeof api_tokens.$inferSelect): ApiTokenRecord {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    scopes: deserialiseScopes(JSON.parse(row.scopes_json) as unknown[]),
    createdAt: row.created_at.getTime(),
    lastUsedAt: row.last_used_at?.getTime() ?? null,
    revokedAt: row.revoked_at?.getTime() ?? null,
  };
}
