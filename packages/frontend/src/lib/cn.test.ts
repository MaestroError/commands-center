import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names and drops falsey ones", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional object and array inputs", () => {
    expect(cn("base", { active: true, hidden: false }, ["x", "y"])).toBe("base active x y");
  });

  it("resolves conflicting Tailwind utilities so the last one wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("bg-accent", "bg-danger")).toBe("bg-danger");
  });

  it("keeps non-conflicting utilities together", () => {
    expect(cn("px-4 py-2", "text-sm")).toBe("px-4 py-2 text-sm");
  });

  it("lets a caller override an earlier utility of the same group", () => {
    // The consumer-supplied className must be able to win over a default.
    expect(cn("rounded-full px-4", "px-6")).toBe("rounded-full px-6");
  });
});
