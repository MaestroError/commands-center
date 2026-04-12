import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function resolveBuiltInSkillsRoot(): string {
  const override = process.env["CC_BUILTIN_SKILLS_DIR"]?.trim();

  if (override) {
    return resolve(override);
  }

  const candidates = [
    resolve(here, "../../resources/builtinSkills"),
    resolve(here, "../resources/builtinSkills"),
    resolve(here, "resources/builtinSkills"),
  ];

  const match = candidates.find((candidate) => existsSync(candidate));

  return match ?? candidates[0]!;
}
