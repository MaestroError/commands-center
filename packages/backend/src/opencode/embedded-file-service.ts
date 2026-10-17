import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { createFileManagerService } from "../services/file-manager-service.js";
import { searchWorkspaceText } from "../services/workspace-text-search.js";
import type { OpenCodeService } from "../services/opencode-service.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";

export function createEmbeddedFileService(options: {
  host: EmbeddedOpenCodeHost;
  config: RuntimeConfig;
}): Pick<OpenCodeService, "findText" | "findFiles" | "readFile" | "getFileStatus"> {
  const { host } = options;
  const files = createFileManagerService({ config: options.config });
  return {
    findText: searchWorkspaceText,
    async findFiles(directory, query) {
      const result = await host.file.find({
        location: { directory },
        query: query.query,
        type: query.type ?? (query.dirs === "false" ? "file" : undefined),
        limit: query.limit,
      });
      const paths: string[] = [];
      for (const entry of result.data) {
        if (
          entry.path.split(/[\\/]/).some((part) => ["node_modules", ".cc", ".git"].includes(part))
        )
          continue;
        try {
          if (await contained(directory, entry.path)) paths.push(entry.path);
        } catch (error) {
          if (!(error instanceof NotFoundError)) throw error;
        }
      }
      return paths;
    },
    async readFile(directory, path) {
      if (!(await contained(directory, path)))
        throw new BadRequestError("File is outside the specialist workspace.");
      const file = await files.readFileContent({ kind: "workspace", basePath: directory }, path);
      if (file.kind === "too-large") throw new BadRequestError("File is too large to preview.");
      await host.model.list({ location: { directory } });
      const diff = await host.vcs.diff({ location: { directory }, mode: "working" });
      const location = await host.location.get({ location: { directory } });
      const normalized = relative(location.project.directory, resolve(directory, path))
        .split(sep)
        .join("/");
      return {
        type: file.kind,
        content: file.content,
        encoding: file.encoding,
        mimeType: file.mimeType,
        diff: diff.data.find((entry) => entry.file === normalized)?.patch,
      };
    },
    async getFileStatus(directory) {
      await host.model.list({ location: { directory } });
      const result = await host.vcs.status({ location: { directory } });
      const location = await host.location.get({ location: { directory } });
      return result.data
        .map((entry) => ({
          path: relative(directory, resolve(location.project.directory, entry.file))
            .split(sep)
            .join("/"),
          added: entry.additions,
          removed: entry.deletions,
          status: entry.status,
        }))
        .filter((entry) => !isAbsolute(entry.path) && !entry.path.split("/").includes(".."));
    },
  };
}

async function contained(directory: string, path: string): Promise<boolean> {
  try {
    const [root, file] = await Promise.all([
      realpath(directory),
      realpath(resolve(directory, path)),
    ]);
    const child = relative(root, file);
    return !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      throw new NotFoundError("File not found.");
    throw error;
  }
}
