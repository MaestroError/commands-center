import { describe, expect, it } from "vitest";

import { makeTabKey, parseTabsParam } from "@/hooks/use-editor-tabs";

import { buildFileManagerHref } from "./file-manager-href";

describe("buildFileManagerHref", () => {
  it("builds a workspace file href from a non-files route", () => {
    const href = buildFileManagerHref({
      path: "agents/planner/README.md",
      currentPathname: "/settings",
      currentSearch: "?ignored=true",
    });
    const params = new URLSearchParams(href.replace("/files?", ""));

    expect(href.startsWith("/files?")).toBe(true);
    expect(params.get("root")).toBe("workspace");
    expect(params.get("path")).toBe("agents/planner");
    expect(params.get("select")).toBe("agents/planner/README.md");
    expect(params.get("ignored")).toBeNull();
  });

  it("adds an editor tab and active key when opening in the editor", () => {
    const href = buildFileManagerHref({
      path: "agents/planner/README.md",
      currentPathname: "/files",
      currentSearch: "?view=list",
      openInEditor: true,
    });
    const params = new URLSearchParams(href.replace("/files?", ""));
    const tabs = parseTabsParam(params.get("tabs"));
    const activeKey = makeTabKey("workspace", "agents/planner/README.md");

    expect(params.get("view")).toBe("list");
    expect(params.get("active")).toBe(activeKey);
    expect(tabs).toEqual([
      expect.objectContaining({
        key: activeKey,
        root: "workspace",
        path: "agents/planner/README.md",
        name: "README.md",
      }),
    ]);
  });

  it("does not duplicate an already open editor tab", () => {
    const key = makeTabKey("workspace", "agents/planner/README.md");
    const existingTabs = "workspace:agents%2Fplanner%2FREADME.md";
    const href = buildFileManagerHref({
      path: "agents/planner/README.md",
      currentPathname: "/files",
      currentSearch: `?tabs=${existingTabs}`,
      openInEditor: true,
    });
    const params = new URLSearchParams(href.replace("/files?", ""));
    const tabs = parseTabsParam(params.get("tabs"));

    expect(tabs).toHaveLength(1);
    expect(params.get("active")).toBe(key);
  });

  it("uses the current directory placeholder for root-level files", () => {
    const href = buildFileManagerHref({
      path: "README.md",
      currentPathname: "/files",
    });
    const params = new URLSearchParams(href.replace("/files?", ""));

    expect(params.get("path")).toBe(".");
    expect(params.get("select")).toBe("README.md");
  });

  it("falls back to the raw path when the basename has no non-empty segments", () => {
    const href = buildFileManagerHref({
      path: "/",
      currentPathname: "/files",
      openInEditor: true,
    });
    const params = new URLSearchParams(href.replace("/files?", ""));
    const tabs = parseTabsParam(params.get("tabs"));

    expect(params.get("select")).toBe("/");
    expect(tabs[0]?.name).toBe("/");
  });
});
