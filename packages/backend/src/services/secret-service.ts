import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createId, now } from "../db/ids.js";
import { secrets } from "../db/schema/index.js";
import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { WorkspaceReconciler } from "../lib/workspace-reconciler.js";

import type { SecretMeta } from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";

const CIPHER_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

// ---------------------------------------------------------------------------
// Secrets manifest file schema
// ---------------------------------------------------------------------------

const secretsManifestSchema = z.object({
  version: z.literal(1),
  keys: z.array(
    z.object({
      key: z.string(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
  ),
});

function manifestFilePath(config: RuntimeConfig): string {
  return resolve(config.paths.subdirectories.configuration, "secrets.json");
}

async function writeSecretsManifest(
  config: RuntimeConfig,
  rows: Array<{ key: string; created_at: Date; updated_at: Date }>,
): Promise<void> {
  await writeConfigFileAtomic(manifestFilePath(config), {
    version: 1,
    keys: rows.map((row) => ({
      key: row.key,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type SecretService = ReturnType<typeof createSecretService>;

export function createSecretService(options: { db: AppDb; config: RuntimeConfig }) {
  return {
    async list(): Promise<SecretMeta[]> {
      const rows = await options.db.select().from(secrets).orderBy(asc(secrets.key));

      return rows.map((row) => ({
        key: row.key,
        isSet: readSecretState(options.config.secretKey, row.encrypted_value) === "set",
        stale: readSecretState(options.config.secretKey, row.encrypted_value) === "stale",
        updatedAt: row.updated_at.toISOString(),
      }));
    },

    async ensure(keys: string[]): Promise<void> {
      const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
      if (uniqueKeys.length === 0) {
        return;
      }

      const existing = await options.db
        .select({ key: secrets.key })
        .from(secrets)
        .where(inArray(secrets.key, uniqueKeys));
      const existingKeys = new Set(existing.map((row) => row.key));
      const timestamp = now();
      const missingKeys = uniqueKeys.filter((key) => !existingKeys.has(key));

      if (missingKeys.length > 0) {
        await options.db.insert(secrets).values(
          missingKeys.map((key) => ({
            id: createId(),
            key,
            encrypted_value: null,
            created_at: timestamp,
            updated_at: timestamp,
          })),
        );
      }

      const allRows = await options.db.select().from(secrets).orderBy(asc(secrets.key));
      await writeSecretsManifest(options.config, allRows);
    },

    async set(key: string, plainValue: string): Promise<boolean> {
      const normalizedKey = key.trim();
      const existing = await findByKey(options.db, normalizedKey);

      if (
        existing &&
        decryptOrUndefined(options.config.secretKey, existing.encrypted_value) === plainValue
      ) {
        return false;
      }

      const encryptedValue = encrypt(options.config.secretKey, plainValue);

      if (existing) {
        await options.db
          .update(secrets)
          .set({ encrypted_value: encryptedValue, updated_at: now() })
          .where(eq(secrets.id, existing.id));
      } else {
        const timestamp = now();
        await options.db.insert(secrets).values({
          id: createId(),
          key: normalizedKey,
          encrypted_value: encryptedValue,
          created_at: timestamp,
          updated_at: timestamp,
        });
      }

      const allRows = await options.db.select().from(secrets).orderBy(asc(secrets.key));
      await writeSecretsManifest(options.config, allRows);

      return true;
    },

    async delete(key: string): Promise<void> {
      await options.db.delete(secrets).where(eq(secrets.key, key.trim()));

      const allRows = await options.db.select().from(secrets).orderBy(asc(secrets.key));
      await writeSecretsManifest(options.config, allRows);
    },

    async buildEnvMap(): Promise<Record<string, string>> {
      const rows = await options.db.select().from(secrets);

      return Object.fromEntries(
        rows.flatMap((row) => {
          const plainValue = decryptOrUndefined(options.config.secretKey, row.encrypted_value);

          return plainValue === undefined ? [] : [[row.key, plainValue]];
        }),
      );
    },

    async listMissing(keys: string[]): Promise<string[]> {
      const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
      if (uniqueKeys.length === 0) {
        return [];
      }

      const rows = await options.db
        .select({ key: secrets.key, encrypted_value: secrets.encrypted_value })
        .from(secrets)
        .where(inArray(secrets.key, uniqueKeys));
      const byKey = new Map(
        rows.map((row) => [
          row.key,
          decryptOrUndefined(options.config.secretKey, row.encrypted_value),
        ]),
      );

      return uniqueKeys.filter((key) => {
        const plainValue = byKey.get(key);
        return plainValue === undefined;
      });
    },

    async getLatestSetUpdate(keys: string[]): Promise<Date | undefined> {
      const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
      if (uniqueKeys.length === 0) {
        return undefined;
      }

      const rows = await options.db
        .select({
          encrypted_value: secrets.encrypted_value,
          updated_at: secrets.updated_at,
        })
        .from(secrets)
        .where(inArray(secrets.key, uniqueKeys));

      return rows.reduce<Date | undefined>((latest, row) => {
        if (decryptOrUndefined(options.config.secretKey, row.encrypted_value) === undefined) {
          return latest;
        }

        return latest === undefined || row.updated_at > latest ? row.updated_at : latest;
      }, undefined);
    },
  };
}

// ---------------------------------------------------------------------------
// Secrets manifest — boot reconciler
// ---------------------------------------------------------------------------

export const secretsManifestReconciler: WorkspaceReconciler = {
  name: "secrets-manifest",

  async reconcile({ config, db, logger }) {
    const data = await readConfigFile(manifestFilePath(config), secretsManifestSchema, logger);
    if (!data || data.keys.length === 0) return;

    // Seed DB rows for known keys (null encrypted_value = "missing, re-enter").
    // Values are never recoverable from the manifest — by design.
    const allKeys = data.keys.map((k) => k.key);
    const existing = await db
      .select({ key: secrets.key })
      .from(secrets)
      .where(inArray(secrets.key, allKeys));
    const existingKeys = new Set(existing.map((r) => r.key));

    const timestamp = now();
    const missing = data.keys.filter((k) => !existingKeys.has(k.key));
    if (missing.length > 0) {
      await db.insert(secrets).values(
        missing.map((k) => ({
          id: createId(),
          key: k.key,
          encrypted_value: null,
          created_at: timestamp,
          updated_at: timestamp,
        })),
      );
    }
  },
};

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

async function findByKey(db: AppDb, key: string) {
  const [row] = await db.select().from(secrets).where(eq(secrets.key, key)).limit(1);
  return row;
}

function encrypt(secretKey: string, plainValue: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(CIPHER_ALGORITHM, deriveKey(secretKey), iv);
  const encrypted = Buffer.concat([cipher.update(plainValue, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ":",
  );
}

function decrypt(secretKey: string, encryptedValue: string): string {
  const parts = encryptedValue.split(":");

  if (parts.length !== 3) {
    throw new Error("Stored secret payload is invalid.");
  }

  const [ivPart, authTagPart, valuePart = ""] = parts;

  if (!ivPart || !authTagPart) {
    throw new Error("Stored secret payload is invalid.");
  }

  const decipher = createDecipheriv(
    CIPHER_ALGORITHM,
    deriveKey(secretKey),
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagPart, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(valuePart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function decryptOrUndefined(secretKey: string, encryptedValue: string | null): string | undefined {
  if (encryptedValue === null) {
    return undefined;
  }

  try {
    return decrypt(secretKey, encryptedValue);
  } catch {
    return undefined;
  }
}

function readSecretState(
  secretKey: string,
  encryptedValue: string | null,
): "missing" | "set" | "stale" {
  if (encryptedValue === null) {
    return "missing";
  }

  return decryptOrUndefined(secretKey, encryptedValue) === undefined ? "stale" : "set";
}

function deriveKey(secretKey: string): Buffer {
  return createHash("sha256").update(secretKey).digest();
}
