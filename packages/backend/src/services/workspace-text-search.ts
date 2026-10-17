import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { rgPath } from "@vscode/ripgrep";
import { z } from "zod";
import { opencodeTextSearchMatchSchema, type OpencodeTextSearchMatch } from "@cc/shared/schemas";

import { BadRequestError } from "../lib/api-error.js";

const rowSchema = z.object({ type: z.string(), data: z.unknown() });
const MAX_RESULTS = 100;

export async function searchWorkspaceText(
  directory: string,
  pattern: string,
): Promise<OpencodeTextSearchMatch[]> {
  if (!pattern) return [];
  const child = spawn(
    rgPath,
    [
      "--json",
      "--no-config",
      "--hidden",
      "--glob",
      "!.git",
      "--glob",
      "!node_modules",
      "--glob",
      "!.cc",
      "--max-filesize",
      "1M",
      "--max-columns",
      "1000",
      "--regexp",
      pattern,
      ".",
    ],
    { cwd: directory, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  let limited = false;
  let timedOut = false;
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(0, 8192);
  });
  const completion = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  // Attach before consuming stdout so a spawn failure cannot become an unhandled rejection.
  void completion.catch(() => undefined);
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 10000);
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const matches: OpencodeTextSearchMatch[] = [];
  try {
    for await (const line of lines) {
      const row = rowSchema.parse(JSON.parse(line));
      if (row.type !== "match") continue;
      const match = opencodeTextSearchMatchSchema.parse(row.data);
      matches.push({ ...match, path: { text: match.path.text.replace(/^\.\//, "") } });
      if (matches.length === MAX_RESULTS) {
        limited = true;
        child.kill();
        break;
      }
    }
    const code = await completion;
    if (timedOut)
      throw new BadRequestError("Workspace search timed out. Narrow the search pattern.");
    if (!limited && code !== 0 && code !== 1) {
      if (stderr.includes("regex parse error"))
        throw new BadRequestError("Invalid search pattern.");
      throw new Error(`Workspace text search failed: ${stderr.trim() || String(code)}`);
    }
    return matches;
  } finally {
    clearTimeout(timer);
    lines.close();
    if (child.exitCode === null) child.kill();
  }
}
