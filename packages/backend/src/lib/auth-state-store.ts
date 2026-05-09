import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

const scryptHashMetadataSchema = z.object({
  algorithm: z.literal("scrypt"),
  version: z.literal(1),
  salt: z.string().min(1),
  hash: z.string().min(1),
  keyLength: z.number().int().positive(),
  cost: z.number().int().positive(),
  blockSize: z.number().int().positive(),
  parallelization: z.number().int().positive(),
});

const claimCodeStateSchema = z.object({
  hash: scryptHashMetadataSchema,
  createdAt: z.string().datetime(),
  rotatedAt: z.string().datetime().optional(),
  invalidatedAt: z.string().datetime().optional(),
  attemptCount: z.number().int().nonnegative().default(0),
  lastAttemptAt: z.string().datetime().optional(),
});

const rateLimitAttemptSchema = z.object({
  key: z.string().min(1),
  attempts: z.array(z.string().datetime()),
});

export const ownerAccessStateSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  claimedAt: z.string().datetime().optional(),
  ownerPassword: scryptHashMetadataSchema.optional(),
  claimCode: claimCodeStateSchema.optional(),
  reclaimCode: claimCodeStateSchema.optional(),
  rateLimits: z
    .object({
      claimAttempts: z.array(rateLimitAttemptSchema),
      reclaimAttempts: z.array(rateLimitAttemptSchema),
    })
    .default({ claimAttempts: [], reclaimAttempts: [] }),
});

export type OwnerAccessState = z.infer<typeof ownerAccessStateSchema>;
export type ClaimCodeState = z.infer<typeof claimCodeStateSchema>;

export type AuthStateStore = {
  path: string;
  read(): Promise<OwnerAccessState | undefined>;
  write(state: OwnerAccessState): Promise<void>;
};

export function createAuthStateStore(path: string): AuthStateStore {
  return {
    path,
    async read() {
      const exists = await fileExists(path);

      if (!exists) {
        return undefined;
      }

      const content = await readFile(path, "utf8");
      return ownerAccessStateSchema.parse(JSON.parse(content) as unknown);
    },
    async write(state) {
      await mkdir(dirname(path), { recursive: true });
      const temporaryPath = `${path}.${process.pid.toString()}.${Date.now().toString()}.tmp`;
      const content = `${JSON.stringify(ownerAccessStateSchema.parse(state), null, 2)}\n`;

      await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, path);
      await chmod(path, 0o600);
    },
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
