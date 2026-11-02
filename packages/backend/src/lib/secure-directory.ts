import { lstat, mkdir, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export async function createSecureDirectory(
  directoryPath: string,
  rootPath: string,
  invalidMessage: string,
): Promise<string> {
  const segments = relative(rootPath, directoryPath).split(sep);
  if (
    segments.some(
      (segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"),
    )
  )
    throw new Error(invalidMessage);
  await mkdir(rootPath, { recursive: true });
  const realRoot = await realpath(rootPath);
  let current = rootPath;
  let expected = realRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    expected = resolve(expected, segment);
    await mkdir(current).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    });
    const directory = await lstat(current);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error(invalidMessage);
    const realCurrent = await realpath(current);
    if (realCurrent !== expected) throw new Error(invalidMessage);
  }
  return expected;
}
