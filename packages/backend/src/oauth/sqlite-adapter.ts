import { and, asc, count, eq, gt, isNull, lte, or } from "drizzle-orm";
import { errors, type Adapter, type AdapterFactory, type AdapterPayload } from "oidc-provider";

import type { AppDb } from "../db/client.js";
import { oauth_records } from "../db/schema/index.js";

const DEFAULT_CLIENT_LIMIT = 500;
const DEFAULT_CLEANUP_LIMIT = 100;

export class OAuthClientLimitError extends errors.InvalidClientMetadata {
  constructor() {
    super("The OAuth client registration limit has been reached");
    this.name = "OAuthClientLimitError";
  }
}

export type OAuthRecordStore = ReturnType<typeof createOAuthRecordStore>;

export function createOAuthRecordStore(options: {
  db: AppDb;
  clientLimit?: number;
  getCurrentDate?: () => Date;
}) {
  const clientLimit = options.clientLimit ?? DEFAULT_CLIENT_LIMIT;
  const getCurrentDate = options.getCurrentDate ?? (() => new Date());

  function createAdapter(model: string): Adapter {
    return {
      upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
        return runSynchronously(() => {
          const timestamp = getCurrentDate();
          const expiresAt = Number.isFinite(expiresIn)
            ? new Date(timestamp.getTime() + expiresIn * 1_000)
            : null;
          const consumedAt =
            typeof payload.consumed === "number" ? new Date(payload.consumed * 1_000) : null;

          options.db.transaction((tx) => {
            if (model === "Client") {
              const existing = tx
                .select({ id: oauth_records.id })
                .from(oauth_records)
                .where(and(eq(oauth_records.model, model), eq(oauth_records.id, id)))
                .get();

              if (!existing) {
                const registeredClients =
                  tx
                    .select({ value: count() })
                    .from(oauth_records)
                    .where(eq(oauth_records.model, model))
                    .get()?.value ?? 0;

                if (registeredClients >= clientLimit) {
                  throw new OAuthClientLimitError();
                }
              }
            }

            tx.insert(oauth_records)
              .values({
                model,
                id,
                payload_json: JSON.stringify(payload),
                grant_id: typeof payload.grantId === "string" ? payload.grantId : null,
                user_code: typeof payload.userCode === "string" ? payload.userCode : null,
                uid: typeof payload.uid === "string" ? payload.uid : null,
                consumed_at: consumedAt,
                expires_at: expiresAt,
                created_at: timestamp,
                updated_at: timestamp,
              })
              .onConflictDoUpdate({
                target: [oauth_records.model, oauth_records.id],
                set: {
                  payload_json: JSON.stringify(payload),
                  grant_id: typeof payload.grantId === "string" ? payload.grantId : null,
                  user_code: typeof payload.userCode === "string" ? payload.userCode : null,
                  uid: typeof payload.uid === "string" ? payload.uid : null,
                  consumed_at: consumedAt,
                  expires_at: expiresAt,
                  updated_at: timestamp,
                },
              })
              .run();
          });
        });
      },

      find(id: string): Promise<AdapterPayload | undefined> {
        return runSynchronously(() => findRecord(model, eq(oauth_records.id, id)));
      },

      findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
        return runSynchronously(() => findRecord(model, eq(oauth_records.user_code, userCode)));
      },

      findByUid(uid: string): Promise<AdapterPayload | undefined> {
        return runSynchronously(() => findRecord(model, eq(oauth_records.uid, uid)));
      },

      consume(id: string): Promise<void> {
        return runSynchronously(() => {
          const timestamp = getCurrentDate();
          options.db
            .update(oauth_records)
            .set({ consumed_at: timestamp, updated_at: timestamp })
            .where(
              and(
                eq(oauth_records.model, model),
                eq(oauth_records.id, id),
                isNull(oauth_records.consumed_at),
              ),
            )
            .run();
        });
      },

      destroy(id: string): Promise<void> {
        return runSynchronously(() => {
          options.db
            .delete(oauth_records)
            .where(and(eq(oauth_records.model, model), eq(oauth_records.id, id)))
            .run();
        });
      },

      revokeByGrantId(grantId: string): Promise<void> {
        return runSynchronously(() => {
          options.db
            .delete(oauth_records)
            .where(and(eq(oauth_records.model, model), eq(oauth_records.grant_id, grantId)))
            .run();
        });
      },
    };
  }

  function findRecord(model: string, predicate: ReturnType<typeof eq>): AdapterPayload | undefined {
    const timestamp = getCurrentDate();
    const row = options.db
      .select()
      .from(oauth_records)
      .where(
        and(
          eq(oauth_records.model, model),
          predicate,
          or(isNull(oauth_records.expires_at), gt(oauth_records.expires_at, timestamp)),
        ),
      )
      .get();

    if (!row) {
      return undefined;
    }

    const payload = parsePayload(row.payload_json);

    return row.consumed_at
      ? { ...payload, consumed: Math.floor(row.consumed_at.getTime() / 1_000) }
      : payload;
  }

  return {
    adapterFactory: ((model: string) => createAdapter(model)) satisfies AdapterFactory,

    cleanupExpired(limit = DEFAULT_CLEANUP_LIMIT): number {
      const boundedLimit = Math.max(1, Math.floor(limit));
      const expired = options.db
        .select({ model: oauth_records.model, id: oauth_records.id })
        .from(oauth_records)
        .where(lte(oauth_records.expires_at, getCurrentDate()))
        .orderBy(asc(oauth_records.expires_at))
        .limit(boundedLimit)
        .all();

      options.db.transaction((tx) => {
        for (const record of expired) {
          tx.delete(oauth_records)
            .where(and(eq(oauth_records.model, record.model), eq(oauth_records.id, record.id)))
            .run();
        }
      });

      return expired.length;
    },

    countClients(): number {
      return (
        options.db
          .select({ value: count() })
          .from(oauth_records)
          .where(eq(oauth_records.model, "Client"))
          .get()?.value ?? 0
      );
    },

    clear(): void {
      options.db.delete(oauth_records).run();
    },
  };
}

function parsePayload(payloadJson: string): AdapterPayload {
  const value: unknown = JSON.parse(payloadJson);

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored OAuth provider payload is invalid.");
  }

  return value as AdapterPayload;
}

function runSynchronously<T>(operation: () => T): Promise<T> {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(
      error instanceof Error
        ? error
        : new Error("OAuth storage operation failed.", { cause: error }),
    );
  }
}
