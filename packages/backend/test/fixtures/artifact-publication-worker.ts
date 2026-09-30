import { createDatabaseClient } from "../../src/db/client.js";
import { loadRuntimeConfig } from "../../src/lib/runtime-config.js";
import { acquireArtifactPublicationLock } from "../../src/services/artifact-publication-lock.js";
import { createArtifactService } from "../../src/services/artifact-service.js";

const [mode, path, ...ids] = process.argv.slice(2);
if (!path) throw new Error("Missing fixture path.");

if (mode === "lock") {
  await acquireArtifactPublicationLock(path);
  process.send?.("ready");
  process.on("message", () => {});
} else {
  const config = loadRuntimeConfig({ cwd: path, env: { NODE_ENV: "test" } });
  const client = createDatabaseClient(config);
  const service = createArtifactService({ db: client.db, config });
  process.send?.("ready");
  process.once("message", () => {
    void Promise.all(ids.map((id) => service.publishArtifact(id)))
      .then(() => {
        client.close();
        process.disconnect();
      })
      .catch((error: unknown) => {
        console.error(error);
        client.close();
        process.exit(1);
      });
  });
}
