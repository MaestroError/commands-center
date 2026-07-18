import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const monacoHarness = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
}));
const themeHarness = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));

vi.mock("@monaco-editor/react", () => ({
  default: (props: Record<string, unknown>) => {
    monacoHarness.props.push(props);
    const value = typeof props["value"] === "string" ? props["value"] : "";
    return <textarea aria-label="Monaco fixture" value={value} readOnly />;
  },
}));

vi.mock("@/context/use-theme", () => ({
  useTheme: () => ({ resolvedColorMode: themeHarness.mode }),
}));

import { MonacoFileEditor } from "./MonacoFileEditor";

describe("MonacoFileEditor", () => {
  beforeEach(() => {
    monacoHarness.props.length = 0;
    themeHarness.mode = "light";
    setThemeCssValues("light");
  });

  it("registers and selects the CC Monaco theme before mount", async () => {
    render(<MonacoFixture />);

    await waitFor(() => {
      expect(monacoHarness.props.at(-1)?.["theme"]).toBe("cc-default-light");
    });

    const monaco = createMonacoMock();
    const beforeMount = monacoHarness.props.at(-1)?.["beforeMount"] as
      | ((value: typeof monaco) => void)
      | undefined;
    beforeMount?.(monaco);

    expect(monaco.editor.defineTheme).toHaveBeenCalledWith(
      "cc-default-light",
      expect.objectContaining({ base: "vs" }),
    );
  });

  it("updates Monaco through its theme API without remounting the editor", async () => {
    const view = render(<MonacoFixture />);
    await waitFor(() => expect(monacoHarness.props.at(-1)).toBeDefined());

    const monaco = createMonacoMock();
    const beforeMount = monacoHarness.props.at(-1)?.["beforeMount"] as
      | ((value: typeof monaco) => void)
      | undefined;
    beforeMount?.(monaco);

    themeHarness.mode = "dark";
    setThemeCssValues("dark");
    view.rerender(<MonacoFixture />);

    await waitFor(() => {
      expect(monaco.editor.setTheme).toHaveBeenCalledWith("cc-default-dark");
    });
    expect(view.getByRole("textbox", { name: "Monaco fixture" })).toHaveValue("const value = 1;");
  });
});

function MonacoFixture() {
  return (
    <MonacoFileEditor
      baseline="const value = 1;"
      busy={false}
      dirty={false}
      draft="const value = 1;"
      isWritable
      name="fixture.ts"
      onDiscardConflict={vi.fn()}
      onDraftChange={vi.fn()}
      onReloadRequested={vi.fn()}
      onSaveRequested={vi.fn()}
      path="/fixture.ts"
    />
  );
}

function createMonacoMock() {
  return {
    editor: {
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
    },
  };
}

function setThemeCssValues(mode: "light" | "dark") {
  const values =
    mode === "light"
      ? {
          "--surface": "#ffffff",
          "--text-primary": "#0f172a",
          "--accent": "#2563eb",
          "--selection": "rgba(37, 99, 235, 0.16)",
        }
      : {
          "--surface": "#0f172a",
          "--text-primary": "#e2e8f0",
          "--accent": "#38bdf8",
          "--selection": "rgba(56, 189, 248, 0.18)",
        };
  const shared = {
    "--surface-elevated": mode === "light" ? "#f8fafc" : "#111c33",
    "--text-muted": "#64748b",
    "--text-secondary": "#64748b",
    "--border": "rgba(15, 23, 42, 0.1)",
    "--border-strong": "rgba(15, 23, 42, 0.2)",
    "--focus-ring": "rgba(37, 99, 235, 0.3)",
    "--danger": "#be123c",
    "--warning": "#b45309",
  };

  for (const [name, value] of Object.entries({ ...values, ...shared })) {
    document.documentElement.style.setProperty(name, value);
  }
}
