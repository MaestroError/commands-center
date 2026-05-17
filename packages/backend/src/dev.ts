import { loadDefaultEnvFile } from "./lib/env-file.js";
import { startServerRuntime } from "./lib/start-server-runtime.js";

loadDefaultEnvFile();
await startServerRuntime();
