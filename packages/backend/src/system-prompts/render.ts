import type { Logger } from "pino";

import type { SystemPromptRenderContext } from "./types.js";
import { resolveVariable } from "./variables.js";

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;

/**
 * Replace `{{ VAR }}` placeholders in `body`. Whitespace inside the braces is
 * tolerated (`{{VAR}}`, `{{ VAR }}`). Only variables listed in `allowedVars`
 * are substituted; any other placeholder (a typo, or a variable the prompt did
 * not declare) is left intact so it stays visible to the author rather than
 * silently vanishing. Pure function — no IO.
 */
export function renderTemplate(
  body: string,
  ctx: SystemPromptRenderContext,
  allowedVars: string[],
  logger?: Logger,
): string {
  const allowed = new Set(allowedVars);

  return body.replace(PLACEHOLDER_PATTERN, (match, rawName: string) => {
    const name = rawName;

    if (!allowed.has(name)) {
      logger?.debug(
        { variable: name },
        "system prompt placeholder not declared by prompt; left as-is",
      );
      return match;
    }

    const value = resolveVariable(name, ctx);
    if (value === undefined) {
      logger?.debug(
        { variable: name },
        "system prompt placeholder has no catalog resolver; left as-is",
      );
      return match;
    }

    return value;
  });
}
