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
    ).toEqual({
      valid: false,
      issues: ["Password must be at least 10 characters."],
    });
  });

  it("rejects owner passwords without uppercase letters", () => {
    expect(
      validateOwnerPassword({
        password: "abcdef1!23",
        confirmPassword: "abcdef1!23",
      }),
    ).toEqual({
      valid: false,
      issues: ["Password must include at least one uppercase letter."],
    });
  });

  it("rejects owner passwords without lowercase letters", () => {
    expect(
      validateOwnerPassword({
        password: "ABCDEF1!23",
        confirmPassword: "ABCDEF1!23",
      }),
    ).toEqual({
      valid: false,
      issues: ["Password must include at least one lowercase letter."],
    });
  });

  it("rejects owner passwords without numbers", () => {
    expect(
      validateOwnerPassword({
        password: "Abcdefgh!?",
        confirmPassword: "Abcdefgh!?",
      }),
    ).toEqual({
      valid: false,
      issues: ["Password must include at least one number."],
    });
  });

  it("rejects owner passwords without symbols", () => {
    expect(
      validateOwnerPassword({
        password: "Abcdef1234",
        confirmPassword: "Abcdef1234",
      }),
    ).toEqual({
      valid: false,
      issues: ["Password must include at least one symbol."],
    });
  });

  it("rejects lowercase-only owner passwords", () => {
    expect(
      validateOwnerPassword({
        password: "abcdefghij",
        confirmPassword: "abcdefghij",
      }),
    ).toEqual({
      valid: false,
      issues: [
        "Password must include at least one uppercase letter.",
        "Password must include at least one number.",
        "Password must include at least one symbol.",
      ],
    });
  });
});
