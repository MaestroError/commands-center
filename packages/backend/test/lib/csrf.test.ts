import { describe, expect, it } from "vitest";

import { CSRF_COOKIE_NAME, isCsrfTokenValid } from "../../src/lib/csrf";

describe("isCsrfTokenValid", () => {
  it("accepts matching CSRF cookie and header tokens", () => {
    expect(
      isCsrfTokenValid({
        cookieHeader: `${CSRF_COOKIE_NAME}=csrf-token`,
        headerValue: "csrf-token",
      }),
    ).toBe(true);
  });

  it("rejects different equal-length CSRF tokens", () => {
    expect(
      isCsrfTokenValid({
        cookieHeader: `${CSRF_COOKIE_NAME}=csrf-token-a`,
        headerValue: "csrf-token-b",
      }),
    ).toBe(false);
  });

  it("rejects different-length CSRF tokens", () => {
    expect(
      isCsrfTokenValid({
        cookieHeader: `${CSRF_COOKIE_NAME}=csrf-token`,
        headerValue: "csrf-token-with-extra-data",
      }),
    ).toBe(false);
  });
});
