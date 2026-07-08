import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type * as ApiModule from "@/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_TOKEN_CAPABILITIES,
  API_TOKEN_PRESETS,
  type ApiTokenPermissions,
  type ApiTokenRecord,
} from "@cc/shared/schemas";

import { ApiPage } from "./ApiPage";
import { createApiToken, listApiTokens, revokeApiToken, updateApiToken } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return {
    ...actual,
    listApiTokens: vi.fn(),
    createApiToken: vi.fn(),
    updateApiToken: vi.fn(),
    revokeApiToken: vi.fn(),
  };
});

const ALL_CAPABILITY_IDS = API_TOKEN_CAPABILITIES.map((capability) => capability.id);

function permsFor(...groups: Array<"templates" | "tasks">): ApiTokenPermissions {
  const capabilities = [...new Set(groups.flatMap((group) => API_TOKEN_PRESETS[group]))];
  return {
    capabilities: ALL_CAPABILITY_IDS.filter((id) => capabilities.includes(id)),
    templates: [],
  };
}

function makeToken(overrides: Partial<ApiTokenRecord> = {}): ApiTokenRecord {
  return {
    id: "tok-1",
    name: "Release automation",
    tokenPrefix: "cc_abc",
    permissions: permsFor("templates"),
    createdAt: Date.parse("2026-01-01T00:00:00.000Z"),
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<ApiPage />, { wrapper });
}

beforeEach(() => {
  vi.mocked(listApiTokens).mockReset();
  vi.mocked(createApiToken).mockReset();
  vi.mocked(updateApiToken).mockReset();
  vi.mocked(revokeApiToken).mockReset();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("ApiPage", () => {
  it("shows the empty state when no tokens exist", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({ tokens: [] });
    renderPage();

    expect(await screen.findByText("No API tokens yet")).toBeInTheDocument();
  });

  it("renders active and revoked token cards", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({
      tokens: [
        makeToken({ id: "tok-1", name: "Active token", lastUsedAt: Date.now() }),
        makeToken({
          id: "tok-2",
          name: "Old token",
          permissions: permsFor("templates", "tasks"),
          revokedAt: Date.now(),
        }),
      ],
    });
    renderPage();

    expect(await screen.findByText("Active token")).toBeInTheDocument();
    expect(screen.getByText("Old token")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    // The fully-scoped revoked token shows both group badges.
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getAllByText("Task Templates").length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces a load error", async () => {
    vi.mocked(listApiTokens).mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText("API tokens could not be loaded.")).toBeInTheDocument();
  });

  it("validates the create form before submitting", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({ tokens: [] });
    renderPage();

    await screen.findByText("No API tokens yet");
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    // Submit with no name/permission selected -> inline validation. The submit
    // button is disabled in this state, so submit the form directly.
    const form = screen.getByPlaceholderText("Release automation").closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    expect(
      await screen.findByText("Enter a name and select at least one permission."),
    ).toBeInTheDocument();
    expect(createApiToken).not.toHaveBeenCalled();
  });

  it("creates a token and reveals it once", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({ tokens: [] });
    vi.mocked(createApiToken).mockResolvedValue({
      token: "cc_secret_value",
      record: makeToken({
        id: "tok-new",
        name: "CI token",
        permissions: permsFor("templates", "tasks"),
      }),
    });
    renderPage();

    await screen.findByText("No API tokens yet");
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    fireEvent.change(screen.getByPlaceholderText("Release automation"), {
      target: { value: "CI token" },
    });
    // Select every permission at once.
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    fireEvent.click(screen.getByTestId("token-submit"));

    expect(await screen.findByText("Copy this token now")).toBeInTheDocument();
    expect(screen.getByText("cc_secret_value")).toBeInTheDocument();
    expect(createApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "CI token",
        permissions: expect.objectContaining({
          capabilities: expect.arrayContaining(ALL_CAPABILITY_IDS),
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("cc_secret_value"),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("Copy this token now")).not.toBeInTheDocument());
  });

  it("edits a token's permissions in place", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({
      tokens: [makeToken({ id: "tok-1", name: "Editable" })],
    });
    vi.mocked(updateApiToken).mockResolvedValue(
      makeToken({ id: "tok-1", name: "Editable", permissions: permsFor("tasks") }),
    );
    renderPage();

    await screen.findByText("Editable");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // Enable one more capability then save.
    fireEvent.click(screen.getByTestId("permission-create_task"));
    fireEvent.click(screen.getByTestId("token-submit"));

    await waitFor(() =>
      expect(updateApiToken).toHaveBeenCalledWith(
        "tok-1",
        expect.objectContaining({
          permissions: expect.objectContaining({
            capabilities: expect.arrayContaining(["create_task"]),
          }),
        }),
      ),
    );
  });

  it("surfaces an error when token creation fails", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({ tokens: [] });
    vi.mocked(createApiToken).mockRejectedValue(new Error("name already in use"));
    renderPage();

    await screen.findByText("No API tokens yet");
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    fireEvent.change(screen.getByPlaceholderText("Release automation"), {
      target: { value: "Dup token" },
    });
    // Enable a single capability.
    fireEvent.click(screen.getByTestId("permission-list_task_templates"));
    fireEvent.click(screen.getByTestId("token-submit"));

    expect(await screen.findByText("name already in use")).toBeInTheDocument();
  });

  it("can cancel the create form", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({ tokens: [] });
    renderPage();

    await screen.findByText("No API tokens yet");
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(screen.getByPlaceholderText("Release automation")).toBeInTheDocument();

    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Release automation")).not.toBeInTheDocument(),
    );
  });

  it("revokes a token through the confirmation dialog", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({
      tokens: [makeToken({ id: "tok-1", name: "Doomed token" })],
    });
    vi.mocked(revokeApiToken).mockResolvedValue();
    renderPage();

    await screen.findByText("Doomed token");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    const dialog = await screen.findByText(/Revoke Doomed token\?/);
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(revokeApiToken).toHaveBeenCalledWith("tok-1"));
  });

  it("switches to the Endpoints tab", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({ tokens: [] });
    renderPage();

    await screen.findByText("No API tokens yet");
    fireEvent.click(screen.getByRole("tab", { name: "Endpoints" }));

    await waitFor(() => expect(screen.queryByText("No API tokens yet")).not.toBeInTheDocument());

    const copyButtons = await screen.findAllByRole("button", { name: "Copy" });
    fireEvent.click(copyButtons[0]!);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create a token" }));
    expect(await screen.findByText("No API tokens yet")).toBeInTheDocument();
  });

  it("dismisses the revoke dialog without revoking", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({
      tokens: [makeToken({ id: "tok-1", name: "Kept token" })],
    });
    renderPage();

    await screen.findByText("Kept token");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByText(/Revoke Kept token\?/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/Revoke Kept token\?/)).not.toBeInTheDocument());
    expect(revokeApiToken).not.toHaveBeenCalled();
  });

  it("shows an error when revoking fails", async () => {
    vi.mocked(listApiTokens).mockResolvedValue({
      tokens: [makeToken({ id: "tok-1", name: "Stuck token" })],
    });
    vi.mocked(revokeApiToken).mockRejectedValue(new Error("revoke failed"));
    renderPage();

    await screen.findByText("Stuck token");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByText(/Revoke Stuck token\?/);

    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    expect(await screen.findByText("revoke failed")).toBeInTheDocument();
  });
});
