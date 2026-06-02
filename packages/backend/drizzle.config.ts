import { join } from "node:path";

import { defineConfig } from "drizzle-kit";

// Honour CC_DATA_DIR so drizzle-kit targets the same DB the app uses when the
// developer overrides the data directory (e.g. via ~/cc-dev/.cc/.env).
const dataDir = process.env["CC_DATA_DIR"] ?? ".cc/data";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: join(dataDir, "cc.db"),
  },
});
