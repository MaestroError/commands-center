import { describe, expect, it, vi } from "vitest";

import {
  extractDroppedUploadableFiles,
  normalizeUploadableFiles,
  toFileManagerUploadEntries,
} from "./file-transfer";

describe("file-transfer", () => {
  it("normalizes uploadable files for direct file uploads", () => {
    const file = new File(["hello"], "readme.md", { type: "text/markdown" });

    expect(normalizeUploadableFiles([file], "files")).toEqual([
      {
        file,
        relativePath: "readme.md",
      },
    ]);
  });

  it("preserves folder relative paths when available", () => {
    const file = new File(["hello"], "readme.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: "docs/readme.md",
    });

    expect(normalizeUploadableFiles([file], "folder")).toEqual([
      {
        file,
        relativePath: "docs/readme.md",
      },
    ]);
  });

  it("falls back to dataTransfer.files when webkit entries are not supported", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: "folder/notes.txt",
    });

    const dataTransfer = {
      items: [{ kind: "file" }],
      files: [file],
    } as unknown as DataTransfer;

    await expect(extractDroppedUploadableFiles(dataTransfer)).resolves.toEqual([
      {
        file,
        relativePath: "folder/notes.txt",
      },
    ]);
  });

  it("collects files from nested webkit directory entries", async () => {
    const nestedFile = new File(["hello"], "index.ts", { type: "text/plain" });
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      name: "index.ts",
      file: (resolve: (file: File) => void) => resolve(nestedFile),
    };
    let readCount = 0;
    const directoryEntry = {
      isFile: false,
      isDirectory: true,
      name: "src",
      createReader: () => ({
        readEntries: (resolve: (entries: unknown[]) => void) => {
          readCount += 1;
          resolve(readCount === 1 ? [fileEntry] : []);
        },
      }),
    };

    const dataTransfer = {
      items: [
        {
          webkitGetAsEntry: () => directoryEntry,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    await expect(extractDroppedUploadableFiles(dataTransfer)).resolves.toEqual([
      {
        file: nestedFile,
        relativePath: "src/index.ts",
      },
    ]);
  });

  it("converts uploadable files into file manager entries", async () => {
    const file = new File([Uint8Array.from([65, 66])], "binary.txt", { type: "text/plain" });
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      value: vi.fn().mockResolvedValue(Uint8Array.from([65, 66]).buffer),
    });

    await expect(
      toFileManagerUploadEntries([{ file, relativePath: "folder/binary.txt" }]),
    ).resolves.toEqual([
      {
        name: "binary.txt",
        relativePath: "folder/binary.txt",
        contentBase64: "QUI=",
        sizeBytes: 2,
      },
    ]);
  });
});
