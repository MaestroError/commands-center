let pending = Promise.resolve();

export async function withSpecialistMcpMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = pending;
  let release = () => {};
  pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}
