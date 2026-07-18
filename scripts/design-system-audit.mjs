import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FRONTEND_SOURCE_ROOT = "packages/frontend/src";
const DESIGN_SYSTEM_DOCS_ROOT = "docs/design-system";
const DOCUMENTATION_LINK = "docs/design-system/README.md";

const INLINE_SVG_EXCEPTIONS = new Map([
  ["packages/frontend/src/components/common/AppLogo.tsx", "EX-001"],
  ["packages/frontend/src/pages/integrations/integration-icons.tsx", "EX-002"],
  ["packages/frontend/src/components/documents/MilkdownDocumentEditor.tsx", "EX-003"],
]);

const RETAINED_COMPATIBILITY_COUNTS = new Map([
  ["cc-alert", 5],
  ["cc-badge", 9],
  ["cc-badge-connected", 3],
  ["cc-badge-muted", 4],
  ["cc-button", 243],
  ["cc-button-danger", 14],
  ["cc-button-icon", 1],
  ["cc-button-secondary", 151],
  ["cc-empty-state", 2],
  ["cc-eyebrow", 11],
  ["cc-input", 94],
  ["cc-logo-background", 1],
  ["cc-logo-icon", 2],
  ["cc-md", 1],
  ["cc-md--chat", 4],
  ["cc-nav-item-active", 4],
  ["cc-panel", 85],
  ["cc-password-toggle", 1],
  ["cc-success", 3],
  ["cc-tab", 6],
  ["cc-tab-active", 3],
]);

const REMOVED_COMPATIBILITY_CLASSES = new Set(["cc-button-primary", "cc-nav-item"]);
const REQUIRED_BRIDGE_PATHS = [
  "packages/frontend/src/styles/globals.css",
  "packages/frontend/src/components/terminal/xterm-theme.ts",
  "packages/frontend/src/components/workspace/monaco-theme.ts",
];
const RESOLVED_MODE_CONSUMERS = new Set([
  "packages/frontend/src/components/terminal/TerminalInstance.tsx",
  "packages/frontend/src/components/workspace/MonacoFileEditor.tsx",
]);

const RAW_TAILWIND_PALETTE_PATTERN =
  /(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const FIXED_COLOR_PATTERN = /(?<!&)#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi;
const COMPATIBILITY_TOKEN_PATTERN = /(?<![a-z\d-])cc-[a-z\d-]+(?![a-z\d-])/gi;

export async function collectAuditSources(repositoryRoot) {
  const sources = new Map();
  await collectDirectory(repositoryRoot, FRONTEND_SOURCE_ROOT, sources);
  await collectDirectory(repositoryRoot, DESIGN_SYSTEM_DOCS_ROOT, sources);
  return sources;
}

export function auditSources(inputSources) {
  const sources = normalizeSources(inputSources);
  const violations = [];
  const productionSources = [...sources].filter(([file]) => isProductionSource(file));

  auditRequiredPaths(sources, violations);
  auditInlineSvg(productionSources, violations);
  auditRawThemeRoles(productionSources, violations);
  auditCustomDialogs(productionSources, violations);
  auditCompatibility(productionSources, violations);
  auditBridgeBoundaries(productionSources, sources, violations);
  auditExceptionCounts(sources, violations);
  auditDocumentationLinks(sources, violations);
  auditDocumentationImports(sources, violations);

  violations.sort((left, right) =>
    `${left.rule}:${left.file}:${left.match}`.localeCompare(
      `${right.rule}:${right.file}:${right.match}`,
    ),
  );

  return {
    counts: {
      compatibilityClasses: Object.fromEntries(countCompatibilityTokens(productionSources)),
      customDialogPaths: countMatchingFiles(
        productionSources,
        /aria-modal=["']true["']|role=["']dialog["']/,
      ),
      inlineSvgPaths: countMatchingFiles(productionSources, /<svg\b/),
    },
    violations,
  };
}

export function formatViolation(violation) {
  return [
    `[${violation.rule}] ${violation.file}: ${violation.match}`,
    `Approved alternative: ${violation.alternative}`,
    `Documentation: ${DOCUMENTATION_LINK}`,
  ].join("\n");
}

async function collectDirectory(repositoryRoot, relativeDirectory, sources) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  try {
    const directoryStat = await stat(absoluteDirectory);
    if (!directoryStat.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = normalizePath(path.join(relativeDirectory, entry.name));
    if (entry.isDirectory()) {
      await collectDirectory(repositoryRoot, relativePath, sources);
    } else if (/\.(?:css|md|ts|tsx)$/.test(entry.name)) {
      sources.set(relativePath, await readFile(path.join(repositoryRoot, relativePath), "utf8"));
    }
  }
}

function normalizeSources(inputSources) {
  return new Map([...inputSources].map(([file, source]) => [normalizePath(file), source]));
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function isProductionSource(file) {
  return (
    file.startsWith(`${FRONTEND_SOURCE_ROOT}/`) &&
    /\.(?:css|ts|tsx)$/.test(file) &&
    !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file) &&
    !file.endsWith("/test-setup.ts")
  );
}

function addViolation(violations, rule, file, match, alternative) {
  violations.push({ alternative, file, match, rule });
}

function auditRequiredPaths(sources, violations) {
  for (const file of REQUIRED_BRIDGE_PATHS) {
    if (!sources.has(file)) {
      addViolation(
        violations,
        "DS000",
        file,
        "required design-system owner is missing",
        "Restore the approved owner or update the enforcement contract with migration evidence.",
      );
    }
  }
}

function auditInlineSvg(productionSources, violations) {
  for (const [file, source] of productionSources) {
    if (!/<svg\b/.test(source) || INLINE_SVG_EXCEPTIONS.has(file)) {
      continue;
    }
    addViolation(
      violations,
      "DS001",
      file,
      "unapproved inline SVG",
      "Use lucide-react or register an exact-path EX-NNN exception with focused verification.",
    );
  }
}

function auditRawThemeRoles(productionSources, violations) {
  const fixedColorPaths = new Set([
    "packages/frontend/src/styles/globals.css",
    "packages/frontend/src/components/common/AppLogo.tsx",
    "packages/frontend/src/components/documents/MilkdownDocumentEditor.tsx",
    "packages/frontend/src/components/terminal/xterm-theme.ts",
    "packages/frontend/src/pages/integrations/integration-icons.tsx",
  ]);

  for (const [file, source] of productionSources) {
    const rawUtilities = source.match(RAW_TAILWIND_PALETTE_PATTERN) ?? [];
    for (const match of rawUtilities) {
      addViolation(
        violations,
        "DS002",
        file,
        match,
        "Use a CC semantic Tailwind role such as bg-surface, text-danger, or border-border.",
      );
    }

    if (fixedColorPaths.has(file)) {
      continue;
    }
    for (const match of source.match(FIXED_COLOR_PATTERN) ?? []) {
      addViolation(
        violations,
        "DS002",
        file,
        match,
        "Use a CC semantic token or register a bounded exact-path EX-NNN exception.",
      );
    }
  }
}

function auditCustomDialogs(productionSources, violations) {
  const pattern = /aria-modal=["']true["']|role=["']dialog["']/;
  for (const [file, source] of productionSources) {
    if (!pattern.test(source) || file.includes("/components/ui/")) {
      continue;
    }
    addViolation(
      violations,
      "DS003",
      file,
      "new custom dialog signature",
      "Use @/components/ui/dialog, AlertDialog, or document an audit-first domain exception.",
    );
  }
}

function auditCompatibility(productionSources, violations) {
  const counts = countCompatibilityTokens(productionSources);
  for (const className of REMOVED_COMPATIBILITY_CLASSES) {
    const count = counts.get(className) ?? 0;
    if (count > 0) {
      addViolation(
        violations,
        "DS004",
        FRONTEND_SOURCE_ROOT,
        `${className} appears ${count.toString()} time(s) after retirement`,
        "Use Tailwind semantic utilities or the matching CC-owned component API.",
      );
    }
  }

  for (const [className, maximum] of RETAINED_COMPATIBILITY_COUNTS) {
    const count = counts.get(className) ?? 0;
    if (count > maximum) {
      addViolation(
        violations,
        "DS004",
        FRONTEND_SOURCE_ROOT,
        `${className} count ${count.toString()} exceeds ${maximum.toString()}`,
        "Use the matching CC-owned component or semantic Tailwind utilities; do not add compatibility consumers.",
      );
    }
  }

  const globals =
    productionSources.find(([file]) => file.endsWith("/styles/globals.css"))?.[1] ?? "";
  for (const className of REMOVED_COMPATIBILITY_CLASSES) {
    if (new RegExp(`\\.${escapeRegExp(className)}(?![a-z\\d-])`).test(globals)) {
      addViolation(
        violations,
        "DS004",
        "packages/frontend/src/styles/globals.css",
        `${className} definition was reintroduced`,
        "Use the supported semantic token/component contract.",
      );
    }
  }
}

function auditBridgeBoundaries(productionSources, sources, violations) {
  for (const [file, source] of productionSources) {
    for (const pattern of [/theme=["']vs-dark["']/, /frame-dark\.css/]) {
      const match = source.match(pattern)?.[0];
      if (match) {
        addViolation(
          violations,
          "DS005",
          file,
          match,
          "Consume the approved Monaco, xterm, or scoped Milkdown bridge.",
        );
      }
    }

    if (
      file.startsWith("packages/frontend/src/components/") &&
      source.includes("resolvedColorMode") &&
      !RESOLVED_MODE_CONSUMERS.has(file)
    ) {
      addViolation(
        violations,
        "DS005",
        file,
        "unapproved resolvedColorMode bridge consumer",
        "Keep appearance effects in MonacoFileEditor or TerminalInstance and their approved adapters.",
      );
    }
  }

  for (const file of [
    "packages/frontend/src/components/terminal/xterm-theme.ts",
    "packages/frontend/src/components/workspace/monaco-theme.ts",
  ]) {
    const source = sources.get(file) ?? "";
    const match = source.match(
      /matchMedia|data-color-mode|data-theme|localStorage|sessionStorage/,
    )?.[0];
    if (match) {
      addViolation(
        violations,
        "DS005",
        file,
        match,
        "Receive resolved appearance from the mounted owner; adapters must not read persistence, media, or DOM state.",
      );
    }
  }
}

function auditExceptionCounts(sources, violations) {
  const xtermFile = "packages/frontend/src/components/terminal/xterm-theme.ts";
  const monacoFile = "packages/frontend/src/components/workspace/monaco-theme.ts";
  const globalsFile = "packages/frontend/src/styles/globals.css";
  assertCount(
    violations,
    xtermFile,
    sources.get(xtermFile)?.match(/#[\da-f]{6}\b/gi)?.length ?? 0,
    32,
    "EX-004 ANSI colors",
  );
  assertCount(
    violations,
    monacoFile,
    sources.get(monacoFile)?.match(/foreground:\s*["'][\da-f]{6}["']/gi)?.length ?? 0,
    10,
    "EX-005 Monaco syntax colors",
  );

  const globals = sources.get(globalsFile) ?? "";
  const allCrepeVariables = globals.match(/--crepe-[a-z\d-]+/gi) ?? [];
  const scopedBlock =
    globals.match(/\.milkdown-editor-wrapper\s+\.milkdown\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ??
    "";
  const scopedCrepeVariables = scopedBlock.match(/--crepe-[a-z\d-]+/gi) ?? [];
  if (allCrepeVariables.length !== 22 || scopedCrepeVariables.length !== 22) {
    addViolation(
      violations,
      "DS006",
      globalsFile,
      `Crepe variables total/scoped ${allCrepeVariables.length.toString()}/${scopedCrepeVariables.length.toString()} expected 22/22`,
      "Keep the approved Crepe bridge fully scoped below .milkdown-editor-wrapper .milkdown.",
    );
  }
}

function assertCount(violations, file, actual, expected, label) {
  if (actual !== expected) {
    addViolation(
      violations,
      "DS006",
      file,
      `${label} count ${actual.toString()} expected ${expected.toString()}`,
      "Update the bounded EX-NNN register and focused tests before changing this controlled palette.",
    );
  }
}

function auditDocumentationLinks(sources, violations) {
  for (const [file, source] of sources) {
    if (!file.startsWith(`${DESIGN_SYSTEM_DOCS_ROOT}/`) || !file.endsWith(".md")) {
      continue;
    }
    for (const match of source.matchAll(/\[[^\]]+\]\((?<target>[^)]+)\)/g)) {
      const target = match.groups?.target.trim() ?? "";
      if (!target || target.startsWith("#") || /^[a-z]+:/i.test(target)) {
        continue;
      }
      const targetPath = normalizePath(path.join(path.dirname(file), target.split("#")[0]));
      if (!sources.has(targetPath)) {
        addViolation(
          violations,
          "DS007",
          file,
          `broken relative link ${target}`,
          "Link to an existing canonical design-system document using a valid relative path.",
        );
      }
    }
  }
}

function auditDocumentationImports(sources, violations) {
  for (const [file, source] of sources) {
    if (!file.startsWith(`${DESIGN_SYSTEM_DOCS_ROOT}/`) || !file.endsWith(".md")) {
      continue;
    }
    for (const match of source.matchAll(/from\s+["']@\/(?<module>[^"']+)["']/g)) {
      const modulePath = match.groups?.module ?? "";
      const sourcePath = `${FRONTEND_SOURCE_ROOT}/${modulePath}`;
      if (!sources.has(`${sourcePath}.ts`) && !sources.has(`${sourcePath}.tsx`)) {
        addViolation(
          violations,
          "DS008",
          file,
          `missing example import @/${modulePath}`,
          "Use an exported module that exists in the live frontend source tree.",
        );
      }
    }
  }
}

function countCompatibilityTokens(productionSources) {
  const counts = new Map();
  for (const [file, source] of productionSources) {
    if (file.endsWith(".css")) {
      continue;
    }
    for (const match of source.match(COMPATIBILITY_TOKEN_PATTERN) ?? []) {
      counts.set(match, (counts.get(match) ?? 0) + 1);
    }
  }
  return counts;
}

function countMatchingFiles(sources, pattern) {
  return sources.filter(([, source]) => pattern.test(source)).length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const repositoryRoot = process.cwd();
  const result = auditSources(await collectAuditSources(repositoryRoot));
  if (result.violations.length > 0) {
    console.error(result.violations.map(formatViolation).join("\n\n"));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Design-system audit passed: ${result.counts.inlineSvgPaths.toString()} inline-SVG exception paths, ${result.counts.customDialogPaths.toString()} retained custom-dialog paths, compatibility counts within baseline.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
