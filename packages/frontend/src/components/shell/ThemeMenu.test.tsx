import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeMenu } from "./ThemeMenu";

import { useTheme } from "@/context/use-theme";

vi.mock("@/context/use-theme", () => ({ useTheme: vi.fn() }));

const setTheme = vi.fn();

beforeEach(() => {
  setTheme.mockReset();
  vi.mocked(useTheme).mockReturnValue({
    theme: "light",
    themes: ["light", "dark", "modern"],
    setTheme,
  });
});

describe("ThemeMenu", () => {
  it("opens with all configured themes and the current selection", () => {
    render(<ThemeMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));

    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("applies a selected theme and closes the menu", () => {
    render(<ThemeMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));

    fireEvent.click(screen.getByRole("menuitemradio", { name: "dark" }));

    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on outside interaction without changing the theme", () => {
    render(<ThemeMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(setTheme).not.toHaveBeenCalled();
  });
});
