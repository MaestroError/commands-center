import type { FileManagerUploadEntryInput } from "@cc/shared/schemas";

export type UploadableFile = {
  file: File;
  relativePath: string;
};

export function normalizeUploadableFiles(
  files: File[],
  mode: "files" | "folder",
): UploadableFile[] {
  return files.map((file) => ({
    file,
    relativePath: resolveUploadRelativePath(file, mode),
  }));
}

export async function extractDroppedUploadableFiles(
  dataTransfer: DataTransfer,
): Promise<UploadableFile[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const supportsEntries = items.some((item) => typeof item.webkitGetAsEntry === "function");

  if (!supportsEntries) {
    return normalizeUploadableFiles(Array.from(dataTransfer.files), "folder");
  }

  const files = await Promise.all(
    items
      .map((item) => getWebkitEntry(item))
      .filter((entry): entry is WebkitFileSystemEntry => entry !== null)
      .map((entry) => collectEntryFiles(entry, "")),
  );

  const flattened = files.flat();

  if (flattened.length > 0) {
    return flattened;
  }

  return normalizeUploadableFiles(Array.from(dataTransfer.files), "folder");
}

export async function toFileManagerUploadEntries(
  files: UploadableFile[],
): Promise<FileManagerUploadEntryInput[]> {
  return Promise.all(
    files.map(async ({ file, relativePath }) => ({
      name: file.name,
      relativePath,
      contentBase64: await readFileAsBase64(file),
      sizeBytes: file.size,
    })),
  );
}

function resolveUploadRelativePath(file: File, mode: "files" | "folder"): string {
  if (mode === "folder") {
    const candidate = "webkitRelativePath" in file ? file.webkitRelativePath : "";

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return file.name;
}

async function readFileAsBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function collectEntryFiles(
  entry: WebkitFileSystemEntry,
  parentPath: string,
): Promise<UploadableFile[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as WebkitFileSystemFileEntry);
    return [{ file, relativePath: parentPath ? `${parentPath}/${entry.name}` : entry.name }];
  }

  const directoryEntry = entry as WebkitFileSystemDirectoryEntry;
  const reader = directoryEntry.createReader();
  const childEntries = await readAllDirectoryEntries(reader);
  const nextParentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const files = await Promise.all(
    childEntries.map((child) => collectEntryFiles(child, nextParentPath)),
  );
  return files.flat();
}

function readFileEntry(entry: WebkitFileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readAllDirectoryEntries(
  reader: WebkitFileSystemDirectoryReader,
): Promise<WebkitFileSystemEntry[]> {
  const entries: WebkitFileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      return entries;
    }

    entries.push(...batch);
  }
}

function getWebkitEntry(item: DataTransferItem): WebkitFileSystemEntry | null {
  return (item as DataTransferItemWithEntry).webkitGetAsEntry?.() ?? null;
}

type WebkitFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type WebkitFileSystemFileEntry = WebkitFileSystemEntry & {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
};

type WebkitFileSystemDirectoryEntry = WebkitFileSystemEntry & {
  createReader: () => WebkitFileSystemDirectoryReader;
};

type WebkitFileSystemDirectoryReader = {
  readEntries: (
    successCallback: (entries: WebkitFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
};
