import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { ManageSidebarSection } from "./ManageSidebarSection";

/**
 * Reads the live route via `useLocation` and forwards it as `pathname`, the
 * way `AppShell` does — so navigating within the test actually changes the
 * group's active state and exercises the auto-expand/collapse effect.
 */
function renderWithNavigation(initialEntries: string[] = ["/"], collapsed = false) {
  function Harness() {
    const location = useLocation();
    return (
      <>
        <ManageSidebarSection
          collapsed={collapsed}
          onNavigate={() => undefined}
          pathname={location.pathname}
        />
        <Link to="/files">Go to Files</Link>
        <Link to="/terminal">Go to Terminal</Link>
        <Link to="/tasks">Go to Tasks</Link>
        <div data-testid="location-probe">{location.pathname}</div>
      </>
    );
  }

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Harness />
    </MemoryRouter>,
  );
}

describe("ManageSidebarSection", () => {
  it("lists File Manager, Global Terminal, Custom Tools, Provider Connections, and API when expanded", async () => {
    renderWithNavigation(["/files"]);

    const section = await screen.findByTestId("manage-sidebar-section");
    expect(within(section).getByRole("link", { name: "File Manager" })).toHaveAttribute(
      "href",
      "/files",
    );
    expect(within(section).getByRole("link", { name: "Global Terminal" })).toHaveAttribute(
      "href",
      "/terminal",
    );
    expect(within(section).getByRole("link", { name: "Custom Tools" })).toHaveAttribute(
      "href",
      "/tools",
    );
    expect(within(section).getByRole("link", { name: "Provider Connections" })).toHaveAttribute(
      "href",
      "/providers",
    );
    expect(within(section).getByRole("link", { name: "API" })).toHaveAttribute(
      "href",
      "/developer-api",
    );
  });

  it("starts expanded when landing directly on a Manage page", async () => {
    renderWithNavigation(["/terminal"]);

    expect(await screen.findByRole("button", { name: "Collapse Manage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Global Terminal" })).toBeInTheDocument();
  });

  it("starts collapsed when landing on an unrelated page", async () => {
    renderWithNavigation(["/tasks"]);

    expect(await screen.findByRole("button", { name: "Expand Manage" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Global Terminal" })).not.toBeInTheDocument();
  });

  it("auto-collapses when navigating away to a non-Manage page", async () => {
    const user = userEvent.setup();
    renderWithNavigation(["/files"]);

    expect(await screen.findByRole("link", { name: "File Manager" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Go to Tasks" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Expand Manage" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "File Manager" })).not.toBeInTheDocument();
  });

  it("stays open when navigating between two Manage pages", async () => {
    const user = userEvent.setup();
    renderWithNavigation(["/files"]);

    expect(await screen.findByRole("button", { name: "Collapse Manage" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Go to Terminal" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent("/terminal");
    });
    expect(screen.getByRole("button", { name: "Collapse Manage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Global Terminal" })).toBeInTheDocument();
  });

  it("does not override a manual toggle while staying on a Manage page", async () => {
    const user = userEvent.setup();
    renderWithNavigation(["/files"]);

    expect(await screen.findByRole("link", { name: "File Manager" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Manage" }));

    expect(screen.queryByRole("link", { name: "File Manager" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Manage" })).toBeInTheDocument();
  });

  it("renders a single icon link to the first Manage route when the sidebar is collapsed", async () => {
    renderWithNavigation(["/files"], true);

    const link = await screen.findByRole("link", { name: "Manage" });
    expect(link).toHaveAttribute("href", "/files");
    expect(screen.queryByRole("link", { name: "Global Terminal" })).not.toBeInTheDocument();
  });
});
