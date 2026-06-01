import { makeTabKey, parseTabsParam, serializeTabsParam } from "@/hooks/use-editor-tabs";

type BuildFileManagerHrefOptions = {
  path: string;
  root?: "workspace" | "all-agents" | "host-filesystem";
  currentPathname?: string;
  currentSearch?: string;
  openInEditor?: boolean;
};

export function buildFileManagerHref(options: BuildFileManagerHrefOptions): string {
  const params = new URLSearchParams(
    options.currentPathname === "/files" ? (options.currentSearch ?? "") : "",
  );

  const root = options.root ?? "workspace";
  params.set("root", root);
  params.set("path", dirname(options.path));
  params.set("select", options.path);

  if (options.openInEditor) {
    const existingTabs = parseTabsParam(params.get("tabs"));
    const key = makeTabKey(root, options.path);
    const nextTabs = existingTabs.some((tab) => tab.key === key)
      ? existingTabs
      : [
          ...existingTabs,
          {
            key,
            root,
            path: options.path,
            name: basename(options.path),
            loading: false,
            dirty: false,
          },
        ];

    params.set("tabs", serializeTabsParam(nextTabs));
    params.set("active", key);
  }

  return `/files?${params.toString()}`;
}

function dirname(path: string): string {
  const segments = path.split("/");
  segments.pop();
  return segments.length === 0 ? "." : segments.join("/");
}

function basename(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}
