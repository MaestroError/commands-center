import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AttachmentBar } from "./AttachmentBar";

function makeAttachment(
  overrides: Partial<Parameters<typeof AttachmentBar>[0]["attachments"][number]> = {},
) {
  return {
    id: "attachment-1",
    type: "file" as const,
    filename: "document.pdf",
    mimeType: "application/pdf",
    dataUrl: "data:application/pdf;base64,abc123",
    ...overrides,
  };
}

describe("AttachmentBar", () => {
  it("returns null for an empty attachments array", () => {
    const { container } = render(<AttachmentBar attachments={[]} onRemove={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders an image thumbnail for image mime types", () => {
    render(
      <AttachmentBar
        attachments={[
          makeAttachment({
            filename: "photo.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,xyz",
          }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "photo.png" })).toBeInTheDocument();
  });

  it("renders the file icon container for non-image mime types", () => {
    const { container } = render(
      <AttachmentBar attachments={[makeAttachment()]} onRemove={vi.fn()} />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("document.pdf")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("calls onRemove with the correct index", () => {
    const onRemove = vi.fn();
    render(
      <AttachmentBar
        attachments={[
          makeAttachment({ id: "attachment-1", filename: "first.pdf" }),
          makeAttachment({ id: "attachment-2", filename: "second.pdf" }),
        ]}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getAllByTitle("Remove attachment")[1]!);

    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
