import { createInterface } from "node:readline/promises";

import { loadDefaultEnvFile } from "../packages/backend/src/lib/env-file.js";
import { loadRuntimeConfig } from "../packages/backend/src/lib/runtime-config.js";
import { createOwnerAccessService } from "../packages/backend/src/services/owner-access-service.js";

loadDefaultEnvFile();
const config = loadRuntimeConfig({ cwd: process.cwd(), env: process.env });
const service = createOwnerAccessService({ config });
const state = await service.getState();
const claimed = state.claimedAt !== undefined && state.ownerPassword !== undefined;
const existingCode = claimed ? state.reclaimCode : state.claimCode;

if (isActiveClaimCode(existingCode)) {
  const purpose = claimed ? "reclaim" : "claim";
  const confirmed = hasYesFlag(process.argv.slice(2)) || (await confirmClaimCodeRotation(purpose));

  if (!confirmed) {
    console.log("Claim-code generation cancelled.");
    process.exit(0);
  }
}

const result = await service.rotateClaimCode();

console.log(`Workspace: ${config.paths.workspaceDir}`);
console.log(`${result.purpose.toUpperCase()} code: ${result.code}`);
console.log(result.warning);

if (claimed) {
  console.log("The current owner password remains valid until reclaim completes.");
}

function hasYesFlag(args: string[]): boolean {
  return args.includes("--yes") || args.includes("-y");
}

function isActiveClaimCode(
  code: { invalidatedAt?: string; expiresAt?: string } | undefined,
): boolean {
  if (!code || code.invalidatedAt) {
    return false;
  }

  if (code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) {
    return false;
  }

  return true;
}

async function confirmClaimCodeRotation(purpose: "claim" | "reclaim"): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = await rl.question(
      `An active ${purpose} code already exists. Generating a new code removes the old code, and you will have to use the new code to claim this workspace. Continue? [y/N] `,
    );
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}
