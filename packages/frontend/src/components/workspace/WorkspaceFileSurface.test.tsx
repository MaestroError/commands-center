import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceFileSurface, type WorkspaceFileSurfaceFile } from "./WorkspaceFileSurface";

vi.mock("./MonacoFileEditor", () => ({
  MonacoFileEditor: (props: { name: string; path: string }) => (
    <div data-testid="monaco-editor">
      {props.name}:{props.path}
    </div>
  ),
}));

function buildFile(overrides: Partial<WorkspaceFileSurfaceFile>): WorkspaceFileSurfaceFile {
  return { name: "f", path: "p", loading: false, dirty: false, ...overrides };
}

describe("WorkspaceFileSurface", () => {
  it("renders the empty state when there is no file", () => {
    render(<WorkspaceFileSurface />);
    expect(screen.getByText("No file open")).toBeInTheDocument();
  });

  it("renders a custom empty state override", () => {
    render(<WorkspaceFileSurface emptyState={<div>custom empty</div>} />);
    expect(screen.getByText("custom empty")).toBeInTheDocument();
  });

  it("renders the loading state", () => {
    render(<WorkspaceFileSurface file={buildFile({ loading: true })} />);
    expect(screen.getByText("Loading file...")).toBeInTheDocument();
  });

  it("renders the error state with a retry button", () => {
    const onReload = vi.fn();
    render(
      <WorkspaceFileSurface
        file={buildFile({ error: "read failed" })}
        onReloadRequested={onReload}
      />,
    );
    expect(screen.getByText("read failed")).toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onReload).toHaveBeenCalled();
  });

  it("returns nothing when the file kind is not yet known", () => {
    const { container } = render(<WorkspaceFileSurface file={buildFile({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Monaco editor for text files", () => {
    render(
      <WorkspaceFileSurface
        file={buildFile({ name: "a.ts", path: "src/a.ts", kind: "text", draft: "x" })}
      />,
    );
    expect(screen.getByTestId("monaco-editor")).toHaveTextContent("a.ts:src/a.ts");
  });

  it("renders an image preview for image binaries", () => {
    render(
      <WorkspaceFileSurface
        file={buildFile({
          name: "pic.png",
          kind: "binary",
          mimeType: "image/png",
          binaryContentBase64: "AAAA",
        })}
      />,
    );
    expect(screen.getByAltText("pic.png")).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });

  it("renders a video preview for video binaries and hides the header when requested", () => {
    const { container } = render(
      <WorkspaceFileSurface
        showPreviewHeader={false}
        file={buildFile({
          name: "clip.mp4",
          kind: "binary",
          mimeType: "video/mp4",
          binaryContentBase64: "BBBB",
        })}
      />,
    );
    const video = container.querySelector("video");
    expect(video).toHaveAttribute("src", "data:video/mp4;base64,BBBB");
    expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();
  });

  it("renders a fallback card for too-large files with size and type metadata", () => {
    render(
      <WorkspaceFileSurface
        file={buildFile({
          name: "big.bin",
          path: "big.bin",
          kind: "too-large",
          mimeType: "application/octet-stream",
          revision: { mtimeMs: 1, sizeBytes: 3 * 1024 * 1024 },
        })}
      />,
    );
    expect(screen.getByText("This file is larger than the 2 MB editor limit.")).toBeInTheDocument();
    expect(screen.getByText("3.00 MB")).toBeInTheDocument();
    expect(screen.getByText("application/octet-stream")).toBeInTheDocument();
  });

  it("renders a fallback card for unsupported binary types", () => {
    render(
      <WorkspaceFileSurface
        file={buildFile({
          name: "data.bin",
          kind: "binary",
          mimeType: "application/x-thing",
          binaryContentBase64: "CCCC",
          revision: { mtimeMs: 1, sizeBytes: 512 },
        })}
      />,
    );
    expect(screen.getByText("This file type is not editable in-app.")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();
  });

  it("renders a PDF preview iframe for pdf binary files", () => {
    render(
      <WorkspaceFileSurface
        file={{
          name: "doc.pdf",
          path: "docs/doc.pdf",
          loading: false,
          kind: "binary",
          mimeType: "application/pdf",
          binaryContentBase64: "JVBERi0xLjc=",
          revision: { mtimeMs: 1, sizeBytes: 8 },
          dirty: false,
        }}
      />,
    );

    const frame = screen.getByTitle("doc.pdf");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "data:application/pdf;base64,JVBERi0xLjc=");
  });
});
