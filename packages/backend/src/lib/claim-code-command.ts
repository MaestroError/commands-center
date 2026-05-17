import { createInterface } from "node:readline/promises";

import type { RuntimeConfig } from "./runtime-config.js";
import { isActiveClaimCode } from "./owner-claim-code.js";
import type { OwnerAccessService } from "../services/owner-access-service.js";

export type ClaimCodeOutputFormat = "text" | "json";

export type ClaimCodeCommandOptions = {
  config: RuntimeConfig;
  ownerAccessService: Pick<OwnerAccessService, "getState" | "rotateClaimCode">;
  yes: boolean;
  format: ClaimCodeOutputFormat;
  includeWorkspace?: boolean;
};

export async function runClaimCodeCommand(options: ClaimCodeCommandOptions): Promise<string[]> {
  const state = await options.ownerAccessService.getState();
  const claimed = state.claimedAt !== undefined && state.ownerPassword !== undefined;
  const existingCode = claimed ? state.reclaimCode : state.claimCode;

  if (isActiveClaimCode(existingCode)) {
    const purpose = claimed ? "reclaim" : "claim";
    const confirmed = options.yes || (await confirmClaimCodeRotation(purpose));

    if (!confirmed) {
      return ["Claim-code generation cancelled."];
    }
  }

  const result = await options.ownerAccessService.rotateClaimCode();

  if (options.format === "json") {
    return [JSON.stringify(result)];
  }

  const lines = [
    ...(options.includeWorkspace ? [`Workspace: ${options.config.paths.workspaceDir}`] : []),
    `${result.purpose.toUpperCase()} code: ${result.code}`,
    result.warning,
  ];

  if (claimed) {
    lines.push("The current owner password remains valid until reclaim completes.");
  }

  return lines;
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
