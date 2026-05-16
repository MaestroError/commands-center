import { describe, expect, it } from "vitest";

import { validateOwnerPassword } from "../../src/lib/owner-password";

describe("validateOwnerPassword", () => {
  it("accepts ten character owner passwords", () => {
    expect(
      validateOwnerPassword({
        password: "Abcdef1!23",
        confirmPassword: "Abcdef1!23",
      }),
    ).toEqual({ valid: true });
  });

  it("rejects owner passwords shorter than ten characters", () => {
    expect(
      validateOwnerPassword({
        password: "Abcdef1!2",
        confirmPassword: "Abcdef1!2",
      }),
    ).toEqual({ valid: false, issues: ["Password must be at least 10 characters."] });
  });
});
