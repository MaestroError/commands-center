import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";

vi.mock("@/hooks/use-secrets-query", () => ({
  useSecretsQuery: vi.fn(),
  useSecretMutations: vi.fn(),
}));

const setMutateAsync = vi.fn();
const removeMutateAsync = vi.fn();

beforeEach(() => {
  setMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  vi.mocked(useSecretsQuery).mockReturnValue({
    data: [
      { key: "CC_MCP_GITHUB_TOKEN", isSet: false, updatedAt: "2026-04-24T10:00:00.000Z" },
      { key: "CC_MCP_LINEAR_TOKEN", isSet: true, updatedAt: "2026-04-24T10:00:00.000Z" },
    ],
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useSecretMutations).mockReturnValue({
    set: { mutateAsync: setMutateAsync, isPending: false },
    remove: { mutateAsync: removeMutateAsync, isPending: false },
  } as never);
});

describe("SettingsPage", () => {
  it("renders searchable secrets", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("tab", { name: "Secrets" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("CC_MCP_GITHUB_TOKEN")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search secrets"), { target: { value: "linear" } });

    expect(screen.queryByDisplayValue("CC_MCP_GITHUB_TOKEN")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("CC_MCP_LINEAR_TOKEN")).toBeInTheDocument();
  });

  it("updates and deletes secrets", async () => {
    setMutateAsync.mockResolvedValue(undefined);
    removeMutateAsync.mockResolvedValue(undefined);

    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("Value for CC_MCP_GITHUB_TOKEN"), {
      target: { value: "new-secret" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Update" })[0]!);

    await waitFor(() => {
      expect(setMutateAsync).toHaveBeenCalledWith({
        key: "CC_MCP_GITHUB_TOKEN",
        value: "new-secret",
      });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);

    await waitFor(() => {
      expect(removeMutateAsync).toHaveBeenCalledWith({ key: "CC_MCP_GITHUB_TOKEN" });
    });
  });
});
