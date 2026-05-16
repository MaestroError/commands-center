import { loadDefaultEnvFile } from "../packages/backend/src/lib/env-file.js";
import { loadRuntimeConfig } from "../packages/backend/src/lib/runtime-config.js";
import { createOwnerAccessService } from "../packages/backend/src/services/owner-access-service.js";

loadDefaultEnvFile();
const config = loadRuntimeConfig({ cwd: process.cwd(), env: process.env });
const service = createOwnerAccessService({ config });
const result = await service.rotateClaimCode();

console.log(`Workspace: ${config.paths.workspaceDir}`);
console.log(`${result.purpose.toUpperCase()} code: ${result.code}`);
console.log(result.warning);
