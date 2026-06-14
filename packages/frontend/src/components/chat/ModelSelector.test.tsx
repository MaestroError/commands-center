import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const twoConnectedProviders: ProviderEntry[] = [
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
];

describe("ModelSelector", () => {
  beforeEach(() => {
    useProvidersQuery.mockReset();
    localStorage.clear();
  });

  it("renders a loading pill while providers are loading", () => {
    useProvidersQuery.mockReturnValue({ isLoading: true, data: undefined });

    render(<ModelSelector onChange={vi.fn()} value={null} />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
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

    expect(screen.getByText("No models available")).toBeInTheDocument();
  });

  it("shows the selected model on the pill and opens a popover to change it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    useProvidersQuery.mockReturnValue({ isLoading: false, data: twoConnectedProviders });

    render(
      <ModelSelector defaultModel="openai/gpt-5" onChange={onChange} value="anthropic/claude-3" />,
    );

    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(trigger).toHaveTextContent("Claude 3");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "OpenAI / GPT-5" }));

    expect(onChange).toHaveBeenCalledWith("openai/gpt-5");
  });

  it("records the chosen model in localStorage and surfaces it as a suggestion", async () => {
    const user = userEvent.setup();
    useProvidersQuery.mockReturnValue({ isLoading: false, data: twoConnectedProviders });

    const { rerender } = render(
      <ModelSelector defaultModel="openai/gpt-5" onChange={vi.fn()} value="openai/gpt-5" />,
    );

    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(screen.getByRole("option", { name: "Anthropic / Claude 3" }));

    expect(JSON.parse(localStorage.getItem("cc-recent-models") ?? "[]")).toEqual([
      "anthropic/claude-3",
    ]);

    rerender(
      <ModelSelector defaultModel="openai/gpt-5" onChange={vi.fn()} value="anthropic/claude-3" />,
    );
    await user.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getByText("Suggested")).toBeInTheDocument();
  });

  it("drops recent suggestions that are no longer available", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "cc-recent-models",
      JSON.stringify(["anthropic/claude-3", "removed/old-model"]),
    );
    useProvidersQuery.mockReturnValue({ isLoading: false, data: twoConnectedProviders });

    render(<ModelSelector defaultModel="openai/gpt-5" onChange={vi.fn()} value="openai/gpt-5" />);

    await user.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getByText("Suggested")).toBeInTheDocument();
    // Still-available recent model appears once (only in Suggested).
    expect(screen.getAllByRole("option", { name: "Anthropic / Claude 3" })).toHaveLength(1);
    expect(screen.queryByText(/old-model/)).not.toBeInTheDocument();
  });

  it("offers an specialist-default entry and clears the override when chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    useProvidersQuery.mockReturnValue({ isLoading: false, data: twoConnectedProviders });

    render(
      <ModelSelector
        allowSpecialistDefault
        defaultModel="openai/gpt-5"
        onChange={onChange}
        value={null}
      />,
    );

    // With no override, the pill shows the specialist-default label.
    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(trigger).toHaveTextContent("Specialist's default");

    // Picking a concrete model reports it.
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Anthropic / Claude 3" }));
    expect(onChange).toHaveBeenCalledWith("anthropic/claude-3");
  });

  it("clears back to the specialist default via the specialist-default entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    useProvidersQuery.mockReturnValue({ isLoading: false, data: twoConnectedProviders });

    render(
      <ModelSelector
        allowSpecialistDefault
        defaultModel="openai/gpt-5"
        onChange={onChange}
        value="anthropic/claude-3"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(trigger).toHaveTextContent("Claude 3");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: /Specialist's default/ }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("filters the model list by name", async () => {
    const user = userEvent.setup();
    useProvidersQuery.mockReturnValue({ isLoading: false, data: twoConnectedProviders });

    render(<ModelSelector defaultModel="openai/gpt-5" onChange={vi.fn()} value="openai/gpt-5" />);

    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.type(screen.getByRole("textbox", { name: "Filter models" }), "claude");

    expect(screen.getByRole("option", { name: "Anthropic / Claude 3" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "OpenAI / GPT-5" })).not.toBeInTheDocument();
  });
});
