import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelSelector } from "./ModelSelector";

type ProviderEntry = {
  provider: { id: string; name: string };
  connected: boolean;
  models: Array<{ id: string; name: string }>;
};

type ProvidersQueryResult = {
  data?: ProviderEntry[];
  isLoading: boolean;
};

const useProvidersQuery = vi.fn<() => ProvidersQueryResult>();

vi.mock("../../hooks/use-providers-query", () => ({
  useProvidersQuery: (): ProvidersQueryResult => useProvidersQuery(),
}));

describe("ModelSelector", () => {
  beforeEach(() => {
    useProvidersQuery.mockReset();
  });

  it("renders a loading select while providers are loading", () => {
    useProvidersQuery.mockReturnValue({ isLoading: true, data: undefined });

    render(<ModelSelector onChange={vi.fn()} value={null} />);

    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders an empty state when no connected models are available", () => {
    useProvidersQuery.mockReturnValue({
      isLoading: false,
      data: [
        {
          provider: { id: "openai", name: "OpenAI" },
          connected: false,
          models: [{ id: "gpt-5", name: "GPT-5" }],
        },
      ],
    });

    render(<ModelSelector onChange={vi.fn()} value={null} />);

    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText("No models available")).toBeInTheDocument();
  });

  it("renders connected models and propagates changes", () => {
    const onChange = vi.fn();
    useProvidersQuery.mockReturnValue({
      isLoading: false,
      data: [
        {
          provider: { id: "openai", name: "OpenAI" },
          connected: true,
          models: [{ id: "gpt-5", name: "GPT-5" }],
        },
        {
          provider: { id: "anthropic", name: "Anthropic" },
          connected: true,
          models: [{ id: "claude-3", name: "Claude 3" }],
        },
      ],
    });

    render(
      <ModelSelector defaultModel="openai/gpt-5" onChange={onChange} value="anthropic/claude-3" />,
    );

    const select = screen.getByRole("combobox", { name: "Select model" });

    expect(select).toHaveValue("anthropic/claude-3");
    expect(screen.getByRole("option", { name: "OpenAI / GPT-5" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Anthropic / Claude 3" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "openai/gpt-5" } });

    expect(onChange).toHaveBeenCalledWith("openai/gpt-5");
  });
});
