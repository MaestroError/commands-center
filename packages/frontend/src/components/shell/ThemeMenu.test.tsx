import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeMenu } from "./ThemeMenu";

import { useTheme } from "@/context/use-theme";

vi.mock("@/context/use-theme", () => ({ useTheme: vi.fn() }));

const setColorModePreference = vi.fn();

beforeEach(() => {
  setColorModePreference.mockReset();
  vi.mocked(useTheme).mockReturnValue({
    colorModePreference: "light",
    colorModePreferences: ["light", "dark", "system"],
    resolvedColorMode: "light",
    setColorModePreference,
    theme: "default",
  });
});

describe("ThemeMenu", () => {
  it("opens with all configured color modes and the current selection", () => {
    render(<ThemeMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Choose color mode, current: Light" }));

    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("applies a selected color mode and closes the menu", () => {
    render(<ThemeMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Choose color mode, current: Light" }));

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(setColorModePreference).toHaveBeenCalledWith("dark");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on outside interaction without changing the theme", () => {
    render(<ThemeMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Choose color mode, current: Light" }));

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(setColorModePreference).not.toHaveBeenCalled();
  });
});
