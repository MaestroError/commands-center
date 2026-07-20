import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("opens with all configured color modes and the current selection", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    await user.click(screen.getByRole("button", { name: "Choose color mode, current: Light" }));

    const items = await screen.findAllByRole("menuitemradio");
    expect(items).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("applies a selected color mode and closes the menu", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);
    await user.click(screen.getByRole("button", { name: "Choose color mode, current: Light" }));

    await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }));

    expect(setColorModePreference).toHaveBeenCalledWith("dark");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("closes on Escape without changing the theme", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);
    await user.click(screen.getByRole("button", { name: "Choose color mode, current: Light" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(setColorModePreference).not.toHaveBeenCalled();
  });

  it("navigates and selects with the keyboard", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    const trigger = screen.getByRole("button", { name: "Choose color mode, current: Light" });
    trigger.focus();
    // Enter opens the menu and moves focus to the first item; ArrowDown advances.
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(setColorModePreference).toHaveBeenCalledTimes(1);
    expect(setColorModePreference).toHaveBeenCalledWith("dark");
  });

  it("supports typeahead selection", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    screen.getByRole("button", { name: "Choose color mode, current: Light" }).focus();
    await user.keyboard("{Enter}s{Enter}");

    expect(setColorModePreference).toHaveBeenCalledWith("system");
  });

  it("closes on outside interaction and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ThemeMenu />
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Choose color mode, current: Light" });
    await user.click(trigger);
    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });
});
