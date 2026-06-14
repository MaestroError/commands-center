import { describe, expect, it } from "vitest";

import {
  parseSpecialistAvatar,
  readInitials,
  resolveIconComponent,
} from "./specialist-avatar-utils";

describe("specialist-avatar-utils", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["single", "SI"],
    ["  ", "A"],
    ["commands center", "CC"],
  ])("reads initials for %s", (name, expected) => {
    expect(readInitials(name)).toBe(expected);
  });

  it.each([
    ["icon:terminal", { type: "icon", value: "terminal" }],
    ["icon:File Text", { type: "icon", value: "filetext" }],
    ["emoji: 🚀 ", { type: "emoji", value: "🚀" }],
    ["https://example.com/avatar.png", { type: "image", src: "https://example.com/avatar.png" }],
    ["http://example.com/avatar.png", { type: "image", src: "http://example.com/avatar.png" }],
    ["/avatar.png", { type: "image", src: "/avatar.png" }],
    ["./avatar.png", { type: "image", src: "./avatar.png" }],
    ["../avatar.png", { type: "image", src: "../avatar.png" }],
    ["file:///tmp/avatar.png", { type: "image", src: "file:///tmp/avatar.png" }],
    ["data:image/png;base64,abc", { type: "image", src: "data:image/png;base64,abc" }],
    ["🧠", { type: "emoji", value: "🧠" }],
  ] as const)("parses %s", (iconPath, expected) => {
    expect(parseSpecialistAvatar("Ada Lovelace", iconPath)).toEqual(expected);
  });

  it.each(["", "   ", "icon:not-real", "emoji:   ", "plain text"])(
    "falls back to initials for %s",
    (iconPath) => {
      expect(parseSpecialistAvatar("Ada Lovelace", iconPath)).toEqual({
        type: "initials",
        value: "AL",
      });
    },
  );

  it("normalizes icon names before resolving lucide components", () => {
    expect(resolveIconComponent("File Text")).toBe(resolveIconComponent("filetext"));
    expect(resolveIconComponent("does-not-exist")).toBeUndefined();
  });
});
