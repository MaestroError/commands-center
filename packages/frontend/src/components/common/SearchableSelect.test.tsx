import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchableSelect } from "./SearchableSelect";

const options = [
  { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "openai/gpt-4.1", label: "GPT-4.1" },
];

describe("SearchableSelect", () => {
  it("shows the selected option's label and lists all options on focus", () => {
    render(<SearchableSelect value="openai/gpt-4.1" onChange={vi.fn()} options={options} />);

    const input = screen.getByDisplayValue("GPT-4.1");
    fireEvent.focus(input);

    expect(screen.getByRole("option", { name: "Claude Opus 4.8" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GPT-4.1" })).toBeInTheDocument();
  });

  it("filters options by keyword (label or id)", () => {
    render(<SearchableSelect value="" onChange={vi.fn()} options={options} placeholder="Search" />);

    const input = screen.getByPlaceholderText("Search");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "opus" } });

    expect(screen.getByRole("option", { name: "Claude Opus 4.8" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "GPT-4.1" })).not.toBeInTheDocument();

    // id match
    fireEvent.change(input, { target: { value: "openai" } });
    expect(screen.getByRole("option", { name: "GPT-4.1" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Claude Opus 4.8" })).not.toBeInTheDocument();
  });

  it("calls onChange with the option id when picked", () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect value="" onChange={onChange} options={options} placeholder="Search" />,
    );

    fireEvent.focus(screen.getByPlaceholderText("Search"));
    fireEvent.click(screen.getByRole("option", { name: "Claude Sonnet 4.6" }));

    expect(onChange).toHaveBeenCalledWith("anthropic/claude-sonnet-4-6");
  });

  it("shows a no-matches message when nothing matches", () => {
    render(<SearchableSelect value="" onChange={vi.fn()} options={options} placeholder="Search" />);

    fireEvent.focus(screen.getByPlaceholderText("Search"));
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "zzz" } });

    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("opens with ArrowDown and commits the highlighted option with Enter", () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect value="" onChange={onChange} options={options} placeholder="Search" />,
    );

    const input = screen.getByPlaceholderText("Search");
    // First ArrowDown opens the list without moving the highlight.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Claude Opus 4.8" })).toBeInTheDocument();

    // Move down to the second option, then back up, then commit the first.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("anthropic/claude-opus-4-8");
  });

  it("closes the list when Escape is pressed", () => {
    render(<SearchableSelect value="" onChange={vi.fn()} options={options} placeholder="Search" />);

    const input = screen.getByPlaceholderText("Search");
    fireEvent.focus(input);
    expect(screen.getByRole("option", { name: "GPT-4.1" })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("option", { name: "GPT-4.1" })).not.toBeInTheDocument();
  });

  it("ignores keyboard input when disabled", () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        value=""
        onChange={onChange}
        options={options}
        placeholder="Search"
        disabled
      />,
    );

    const input = screen.getByPlaceholderText("Search");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("closes and clears the query when focus leaves the component", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SearchableSelect value="" onChange={vi.fn()} options={options} placeholder="Search" />
        <button type="button">Next field</button>
      </>,
    );

    const input = screen.getByPlaceholderText("Search");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "opus" } });
    await user.tab();

    await waitFor(() => expect(screen.queryByRole("option")).not.toBeInTheDocument());
    expect(input).toHaveValue("");
  });

  it("exposes named combobox and listbox relationships", () => {
    render(
      <SearchableSelect ariaLabel="Default model" value="" onChange={vi.fn()} options={options} />,
    );

    const input = screen.getByRole("combobox", { name: "Default model" });
    fireEvent.focus(input);

    const listbox = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("reflects controlled value and option changes without stale query text", () => {
    const { rerender } = render(
      <SearchableSelect value="openai/gpt-4.1" onChange={vi.fn()} options={options} />,
    );

    const input = screen.getByDisplayValue("GPT-4.1");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "opus" } });

    rerender(
      <SearchableSelect
        value="anthropic/claude-sonnet-4-6"
        onChange={vi.fn()}
        options={options.slice(1)}
      />,
    );
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveValue("Claude Sonnet 4.6");
  });

  it("dismisses on outside interaction", async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={vi.fn()} options={options} placeholder="Search" />);

    fireEvent.focus(screen.getByPlaceholderText("Search"));
    await user.click(document.body);

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("preserves an additive class name", () => {
    render(<SearchableSelect className="w-full" value="" onChange={vi.fn()} options={options} />);

    expect(screen.getByRole("combobox")).toHaveClass("cc-input", "w-full");
  });
});
