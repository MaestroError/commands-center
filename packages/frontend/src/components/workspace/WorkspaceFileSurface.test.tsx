import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceFileSurface } from "./WorkspaceFileSurface";

describe("WorkspaceFileSurface", () => {
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
