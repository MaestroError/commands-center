import { describe, expect, it } from "vitest";

import { readThemeCssValue, toHexColor } from "./theme-css-values";

describe("theme CSS values", () => {
  it("reads a resolved semantic variable from the appearance root", () => {
    document.documentElement.style.setProperty("--phase-five-test", "#2563eb");

    expect(readThemeCssValue("--phase-five-test")).toBe("#2563eb");
  });

  it("converts rgba values to Monaco-compatible eight-digit hex", () => {
    expect(toHexColor("rgba(37, 99, 235, 0.16)")).toBe("#2563eb29");
  });
});
