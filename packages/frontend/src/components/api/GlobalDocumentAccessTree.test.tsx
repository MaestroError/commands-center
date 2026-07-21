import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentTreeNode, DocumentTreeResponse } from "@cc/shared/schemas";

import { GlobalDocumentAccessTree } from "./GlobalDocumentAccessTree";
import { getDocumentTree } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getDocumentTree: vi.fn() }));

function directory(relativePath: string, children: DocumentTreeNode[] = []): DocumentTreeNode {
  return {
    scope: "global",
    ownerSlug: null,
    ownerSpecialistId: null,
    name: relativePath.split("/").at(-1)!,
    relativePath,
    type: "directory",
    title: null,
    children,
  };
}

function document(relativePath: string): DocumentTreeNode {
  return {
    scope: "global",
    ownerSlug: null,
    ownerSpecialistId: null,
    name: relativePath.split("/").at(-1)!,
    relativePath,
    type: "file",
    title: null,
  };
}

function nestedDirectories(names: string[]): DocumentTreeNode {
  const paths = names.map((_, index) => names.slice(0, index + 1).join("/"));
  return paths.reduceRight<DocumentTreeNode>(
    (child, path, index) => directory(path, index === paths.length - 1 ? [] : [child]),
    directory(paths.at(-1)!),
  );
}

function Harness(props: { initialFullAccess?: boolean; initialPaths?: string[] }) {
  const [fullAccess, setFullAccess] = useState(props.initialFullAccess ?? false);
  const [selectedFolderPaths, setSelectedFolderPaths] = useState(
    () => new Set(props.initialPaths ?? []),
  );

  return (
    <>
      <GlobalDocumentAccessTree
        fullAccess={fullAccess}
        selectedFolderPaths={selectedFolderPaths}
        onFullAccessChange={setFullAccess}
        onSelectedFolderPathsChange={setSelectedFolderPaths}
      />
      <output data-testid="selected-folder-paths">
        {[...selectedFolderPaths].sort().join(",")}
      </output>
    </>
  );
}

function renderTree(
  tree: DocumentTreeResponse["tree"],
  props: { initialFullAccess?: boolean; initialPaths?: string[] } = {},
): void {
  vi.mocked(getDocumentTree).mockResolvedValue({ tree, privateTrees: [] });
  renderHarness(props);
}

function renderHarness(props: { initialFullAccess?: boolean; initialPaths?: string[] } = {}): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<Harness {...props} />, { wrapper });
}

beforeEach(() => {
  vi.mocked(getDocumentTree).mockReset();
});

describe("GlobalDocumentAccessTree", () => {
  it("shows a loading state while the global tree is requested", () => {
    vi.mocked(getDocumentTree).mockReturnValue(new Promise<DocumentTreeResponse>(() => undefined));

    renderHarness();

    expect(screen.getByTestId("token-documents-tree-loading")).toBeVisible();
  });

  it("shows an inline error when the global tree request fails", async () => {
    vi.mocked(getDocumentTree).mockRejectedValue(new Error("tree failed"));

    renderHarness();

    expect(await screen.findByTestId("token-documents-tree-error")).toBeVisible();
  });

  it("shows the global root as indeterminate for folder-limited access", async () => {
    renderTree([directory("clients")], { initialPaths: ["clients"] });

    expect(await screen.findByTestId("token-documents-global")).toHaveAttribute(
      "data-state",
      "indeterminate",
    );
  });

  it("replaces descendant grants when an ancestor is selected", async () => {
    renderTree([directory("clients", [directory("clients/acme")])], {
      initialPaths: ["clients/acme"],
    });

    fireEvent.click(await screen.findByTestId("token-documents-folder-clients"));

    expect(screen.getByTestId("selected-folder-paths")).toHaveTextContent(/^clients$/);
  });

  it("disables folders inherited from a selected ancestor", async () => {
    renderTree([directory("clients", [directory("clients/acme")])], {
      initialPaths: ["clients"],
    });

    expect(await screen.findByTestId("token-documents-folder-clients/acme")).toBeDisabled();
  });

  it("shows files as non-interactive context", async () => {
    renderTree([directory("clients", [document("clients/readme.md")])]);

    fireEvent.click(await screen.findByRole("button", { name: "Expand clients" }));

    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(
      screen.queryByTestId("token-documents-folder-clients/readme.md"),
    ).not.toBeInTheDocument();
  });

  it("stops rendering folders after the fifth level", async () => {
    renderTree([nestedDirectories(["one", "two", "three", "four", "five", "six"])]);

    for (const name of ["one", "two", "three", "four"]) {
      fireEvent.click(await screen.findByRole("button", { name: `Expand ${name}` }));
    }

    expect(
      await screen.findByTestId("token-documents-folder-one/two/three/four/five"),
    ).toBeVisible();
    expect(screen.queryByTestId("token-documents-folder-one/two/three/four/five/six")).toBeNull();
    expect(screen.getByTestId("token-documents-depth-limit-one/two/three/four/five")).toBeVisible();
  });

  it("marks all folders as inherited for full global access", async () => {
    renderTree([directory("clients")], { initialFullAccess: true });

    expect(await screen.findByTestId("token-documents-folder-clients")).toBeDisabled();
  });
});
