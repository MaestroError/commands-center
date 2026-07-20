import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SessionMediaItem } from "@cc/shared/schemas";

import { ImageLightbox } from "./ImageLightbox";

const item: SessionMediaItem = {
  id: "media-1",
  messageId: "message-1",
  url: "data:image/png;base64,aW1hZ2U=",
  filename: "diagram.png",
  mime: "image/png",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("ImageLightbox", () => {
  it("renders the current image metadata", () => {
    render(<ImageLightbox item={item} onClose={vi.fn()} onDownload={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Image preview" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "diagram.png" })).toHaveAttribute(
      "src",
      "data:image/png;base64,aW1hZ2U=",
    );
  });

  it("downloads the current image", async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<ImageLightbox item={item} onClose={vi.fn()} onDownload={onDownload} />);

    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(onDownload).toHaveBeenCalledWith(item);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageLightbox item={item} onClose={onClose} onDownload={vi.fn()} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on overlay click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageLightbox item={item} onClose={onClose} onDownload={vi.fn()} />);

    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
