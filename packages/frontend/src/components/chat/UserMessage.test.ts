import { describe, it, expect } from "vitest";
import { parseUserMessage } from "./user-message-utils";

describe("parseUserMessage", () => {
  // ---------------------------------------------------------------------------
  // Skill extraction
  // ---------------------------------------------------------------------------

  describe("skill extraction", () => {
    it("extracts the skill slug from the prefix", () => {
      const { skill } = parseUserMessage('Use skill "summarize". summarize this');
      expect(skill).toBe("summarize");
    });

    it("removes the skill prefix from the remaining text", () => {
      const { text } = parseUserMessage('Use skill "summarize". do this');
      expect(text).toBe("do this");
    });

    it("handles skill prefix with no trailing text", () => {
      const { skill, text } = parseUserMessage('Use skill "compact".');
      expect(skill).toBe("compact");
      expect(text).toBe("");
    });

    it("preserves multi-word skill slugs", () => {
      const { skill } = parseUserMessage('Use skill "my-cool-skill". go');
      expect(skill).toBe("my-cool-skill");
    });

    it("returns null skill when prefix is absent", () => {
      const { skill } = parseUserMessage("just a plain message");
      expect(skill).toBeNull();
    });

    it("does not match partial prefix mid-text", () => {
      const { skill, text } = parseUserMessage('Some text Use skill "foo". other');
      expect(skill).toBeNull();
      expect(text).toBe('Some text Use skill "foo". other');
    });
  });

  // ---------------------------------------------------------------------------
  // File mention extraction
  // ---------------------------------------------------------------------------

  describe("file mention extraction", () => {
    it("extracts a single file reference", () => {
      const { files } = parseUserMessage("#src/index.ts what does this do?");
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("src/index.ts");
    });

    it("extracts multiple consecutive file references", () => {
      const { files } = parseUserMessage("#src/a.ts #src/b.ts compare these");
      expect(files).toHaveLength(2);
      expect(files[0]?.path).toBe("src/a.ts");
      expect(files[1]?.path).toBe("src/b.ts");
    });

    it("stops extracting file references when a non-# token is encountered", () => {
      const { files, text } = parseUserMessage("#file.ts explain then #other.ts");
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("file.ts");
      expect(text).toBe("explain then #other.ts");
    });

    it("returns empty files array when no # references are present", () => {
      const { files } = parseUserMessage("hello there");
      expect(files).toHaveLength(0);
    });

    it("extracts file references after a skill prefix", () => {
      const { skill, files, text } = parseUserMessage(
        'Use skill "explain". #README.md summarize it',
      );
      expect(skill).toBe("explain");
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("README.md");
      expect(text).toBe("summarize it");
    });
  });

  // ---------------------------------------------------------------------------
  // File display and isFolder
  // ---------------------------------------------------------------------------

  describe("file display names", () => {
    it("uses the basename as display for a file path", () => {
      const { files } = parseUserMessage("#src/components/Button.tsx");
      expect(files[0]?.display).toBe("Button.tsx");
      expect(files[0]?.isFolder).toBe(false);
    });

    it("uses the full path as display for a folder (trailing slash)", () => {
      const { files } = parseUserMessage("#src/components/");
      expect(files[0]?.display).toBe("src/components/");
      expect(files[0]?.isFolder).toBe(true);
    });

    it("treats a root filename with no slashes as a file", () => {
      const { files } = parseUserMessage("#README.md");
      expect(files[0]?.isFolder).toBe(false);
      expect(files[0]?.display).toBe("README.md");
    });

    it("uses the full path as display for a path with no slashes", () => {
      const { files } = parseUserMessage("#package.json");
      expect(files[0]?.display).toBe("package.json");
    });
  });

  // ---------------------------------------------------------------------------
  // Text remainder
  // ---------------------------------------------------------------------------

  describe("text remainder", () => {
    it("returns the full input when there is no skill or file prefix", () => {
      const { text } = parseUserMessage("plain message");
      expect(text).toBe("plain message");
    });

    it("trims leading/trailing whitespace from the remainder", () => {
      const { text } = parseUserMessage("#file.ts   spaced out   ");
      expect(text).toBe("spaced out");
    });

    it("returns empty string when only a skill prefix is present", () => {
      const { text } = parseUserMessage('Use skill "foo".');
      expect(text).toBe("");
    });

    it("returns empty string when only file references are present", () => {
      const { text } = parseUserMessage("#a.ts #b.ts");
      expect(text).toBe("");
    });

    it("returns empty string for an empty input", () => {
      const { skill, files, text } = parseUserMessage("");
      expect(skill).toBeNull();
      expect(files).toHaveLength(0);
      expect(text).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // Combined scenarios
  // ---------------------------------------------------------------------------

  describe("combined inputs", () => {
    it("correctly parses skill + multiple files + text together", () => {
      const { skill, files, text } = parseUserMessage(
        'Use skill "review". #src/api.ts #src/service.ts check for issues',
      );
      expect(skill).toBe("review");
      expect(files).toHaveLength(2);
      expect(files[0]?.path).toBe("src/api.ts");
      expect(files[1]?.path).toBe("src/service.ts");
      expect(text).toBe("check for issues");
    });

    it("handles multiple file mentions with no text", () => {
      const { files, text } = parseUserMessage("#a.ts #b/");
      expect(files).toHaveLength(2);
      expect(files[0]?.isFolder).toBe(false);
      expect(files[1]?.isFolder).toBe(true);
      expect(text).toBe("");
    });
  });
});
