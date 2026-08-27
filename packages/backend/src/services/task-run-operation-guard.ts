export type TaskRunOperationGuard = ReturnType<typeof createTaskRunOperationGuard>;

export function createTaskRunOperationGuard() {
  const tails = new Map<string, Promise<void>>();
  const cancellationRequests = new Set<string>();

  return {
    requestCancellation(runId: string): void {
      cancellationRequests.add(runId);
    },

    clearCancellationRequest(runId: string): void {
      cancellationRequests.delete(runId);
    },

    isCancellationRequested(runId: string): boolean {
      return cancellationRequests.has(runId);
    },

    async runExclusive<T>(runId: string, operation: () => Promise<T>): Promise<T> {
      const previous = tails.get(runId) ?? Promise.resolve();
      const current = previous.catch(() => {}).then(operation);
      const tail = current.then(
        () => undefined,
        () => undefined,
      );
      tails.set(runId, tail);

      try {
        return await current;
      } finally {
        if (tails.get(runId) === tail) {
          tails.delete(runId);
        }
      }
    },
  };
}
