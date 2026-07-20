import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/", "**/node_modules/", "**/coverage/", ".claude/worktrees/", "examples/"],
  },

  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.ts",
            "playwright.config.ts",
            "packages/*/vitest.config.ts",
            "packages/*/drizzle.config.ts",
            "packages/*/build.ts",
            "scripts/*.ts",
            "scripts/*.mjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },

  {
    files: ["packages/frontend/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Design-system boundary (DS-0202): Radix is CC's behavior foundation but its
  // public API, styling, and theme integration are owned inside components/ui.
  // Application, common, and domain code must import CC-owned primitives from
  // @/components/ui/* instead of importing Radix directly. A justified exception
  // requires an adoption-matrix row before this rule is relaxed for a path.
  {
    files: ["packages/frontend/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["radix-ui", "radix-ui/*", "@radix-ui/*"],
              message:
                "Import Radix only inside src/components/ui/. Consume CC-owned primitives from @/components/ui/* elsewhere.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/frontend/src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },

  {
    files: [
      "eslint.config.ts",
      "playwright.config.ts",
      "**/vitest.config.ts",
      "**/drizzle.config.ts",
      "**/build.ts",
      "scripts/*.ts",
      "scripts/*.mjs",
    ],
    ...tseslint.configs.disableTypeChecked,
  },
);
