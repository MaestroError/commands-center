import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const MIN_PASSWORD_LENGTH = 10;

const COMMON_WEAK_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "123456789012",
  "qwerty123456",
  "commandscenter",
  "adminpassword",
  "letmein12345",
]);

export type ScryptHashMetadata = {
  algorithm: "scrypt";
  version: 1;
  salt: string;
  hash: string;
  keyLength: number;
  cost: number;
  blockSize: number;
  parallelization: number;
};

export type PasswordValidationResult = { valid: true } | { valid: false; issues: string[] };

export function validateOwnerPassword(options: {
  password: string;
  confirmPassword?: string;
  claimCode?: string;
  currentPassword?: string;
}): PasswordValidationResult {
  const issues: string[] = [];
  const normalizedPassword = options.password.trim().toLowerCase();

  if (options.password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`Password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`);
  }

  if (COMMON_WEAK_PASSWORDS.has(normalizedPassword)) {
    issues.push("Password is too common.");
  }

  if (options.confirmPassword !== undefined && options.password !== options.confirmPassword) {
    issues.push("Password confirmation must match.");
  }

  if (options.claimCode && options.password === options.claimCode) {
    issues.push("Password must not match the claim code.");
  }

  if (options.currentPassword !== undefined && options.password === options.currentPassword) {
    issues.push("New password must be different from the current password.");
  }

  return issues.length === 0 ? { valid: true } : { valid: false, issues };
}

export async function hashOwnerSecret(secret: string): Promise<ScryptHashMetadata> {
  const salt = randomBytes(16).toString("base64url");
  const hash = await deriveScryptKey(secret, salt, SCRYPT_KEY_LENGTH);

  return {
    algorithm: "scrypt",
    version: 1,
    salt,
    hash: hash.toString("base64url"),
    keyLength: SCRYPT_KEY_LENGTH,
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  };
}

export async function verifyOwnerSecret(
  secret: string,
  metadata: ScryptHashMetadata,
): Promise<boolean> {
  const hash = await deriveScryptKey(secret, metadata.salt, metadata.keyLength, {
    cost: metadata.cost,
    blockSize: metadata.blockSize,
    parallelization: metadata.parallelization,
  });
  const expectedHash = Buffer.from(metadata.hash, "base64url");

  if (hash.byteLength !== expectedHash.byteLength) {
    return false;
  }

  return timingSafeEqual(hash, expectedHash);
}

function deriveScryptKey(
  secret: string,
  salt: string,
  keyLength: number,
  options?: { cost: number; blockSize: number; parallelization: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      secret,
      salt,
      keyLength,
      {
        N: options?.cost ?? SCRYPT_COST,
        r: options?.blockSize ?? SCRYPT_BLOCK_SIZE,
        p: options?.parallelization ?? SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}
