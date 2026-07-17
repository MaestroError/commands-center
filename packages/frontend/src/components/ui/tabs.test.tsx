import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
  it("forwards controlled selection", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Tabs value="files" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    await user.click(screen.getByRole("tab", { name: "Search" }));
    expect(onValueChange).toHaveBeenCalledWith("search");
  });
});
