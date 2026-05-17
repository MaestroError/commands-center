import { loadDefaultEnvFile } from "../packages/backend/src/lib/env-file.js";
import { loadRuntimeConfig } from "../packages/backend/src/lib/runtime-config.js";
import { runClaimCodeCommand } from "../packages/backend/src/lib/claim-code-command.js";
import { createOwnerAccessService } from "../packages/backend/src/services/owner-access-service.js";

loadDefaultEnvFile();
const config = loadRuntimeConfig({ cwd: process.cwd(), env: process.env });
const service = createOwnerAccessService({ config });

for (const line of await runClaimCodeCommand({
  config,
  ownerAccessService: service,
  yes: hasYesFlag(process.argv.slice(2)),
  format: "text",
  includeWorkspace: true,
})) {
  console.log(line);
}

function hasYesFlag(args: string[]): boolean {
  return args.includes("--yes") || args.includes("-y");
}
