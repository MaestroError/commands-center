import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { usageTotalsSchema, type UsageTotals } from "@cc/shared/schemas";

vi.mock("@/lib/api", () => ({ getConversationUsage: vi.fn() }));

import { getConversationUsage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { useConversationUsageQuery } from "./use-conversation-usage-query";

const INITIAL_USAGE = usageTotalsSchema.parse({ totalTokens: 100 });
const UPDATED_USAGE = usageTotalsSchema.parse({ totalTokens: 200 });
const clients: QueryClient[] = [];

afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.resetAllMocks();
});

function setup(retry: number | false = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry, retryDelay: 0 } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(({ id, busy }) => useConversationUsageQuery(id, busy), {
    initialProps: { id: "c1", busy: false },
    wrapper,
  });
  return { client, ...hook };
}

it("retries synchronization after a failed post-turn request", async () => {
  vi.mocked(getConversationUsage)
    .mockResolvedValueOnce(INITIAL_USAGE)
    .mockRejectedValueOnce(new Error("OpenCode temporarily unavailable"))
    .mockResolvedValueOnce(UPDATED_USAGE);
  const hook = setup(1);
  await waitFor(() => expect(hook.result.current.data).toEqual(INITIAL_USAGE));

  hook.rerender({ id: "c1", busy: true });
  hook.rerender({ id: "c1", busy: false });

  await waitFor(() => expect(hook.result.current.data).toEqual(UPDATED_USAGE));
  expect(vi.mocked(getConversationUsage).mock.calls).toEqual([
    ["c1", { sync: false }],
    ["c1", { sync: true }],
    ["c1", { sync: true }],
  ]);
});

it("clears the synchronization requirement after a successful request", async () => {
  vi.mocked(getConversationUsage).mockResolvedValue(INITIAL_USAGE);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.data).toEqual(INITIAL_USAGE));
  hook.rerender({ id: "c1", busy: true });
  hook.rerender({ id: "c1", busy: false });
  await waitFor(() => expect(hook.client.isFetching()).toBe(0));

  await act(() => hook.result.current.refetch());

  expect(getConversationUsage).toHaveBeenLastCalledWith("c1", { sync: false });
});

it("does not treat navigation away from a busy conversation as a completed turn", async () => {
  vi.mocked(getConversationUsage).mockResolvedValue(INITIAL_USAGE);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.data).toEqual(INITIAL_USAGE));
  hook.rerender({ id: "c1", busy: true });

  hook.rerender({ id: "c2", busy: false });
  await waitFor(() => expect(hook.client.isFetching()).toBe(0));

  expect(getConversationUsage).toHaveBeenLastCalledWith("c2", { sync: false });
});

it("retains a failed synchronization for its original conversation after navigation", async () => {
  vi.mocked(getConversationUsage)
    .mockResolvedValueOnce(INITIAL_USAGE)
    .mockRejectedValueOnce(new Error("OpenCode temporarily unavailable"))
    .mockResolvedValue(INITIAL_USAGE);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.data).toEqual(INITIAL_USAGE));
  hook.rerender({ id: "c1", busy: true });
  hook.rerender({ id: "c1", busy: false });
  await waitFor(() =>
    expect(hook.client.getQueryState(queryKeys.conversationUsage("c1"))?.status).toBe("error"),
  );

  hook.rerender({ id: "c2", busy: false });
  await waitFor(() => expect(hook.client.isFetching()).toBe(0));
  expect(getConversationUsage).toHaveBeenLastCalledWith("c2", { sync: false });
  hook.rerender({ id: "c1", busy: false });
  await waitFor(() => expect(hook.client.isFetching()).toBe(0));

  expect(getConversationUsage).toHaveBeenLastCalledWith("c1", { sync: true });
});

it("does not let an older request clear a newer turn's pending synchronization", async () => {
  let resolveFirstSync!: (usage: UsageTotals) => void;
  const firstSync = new Promise<UsageTotals>((resolve) => {
    resolveFirstSync = resolve;
  });
  vi.mocked(getConversationUsage)
    .mockResolvedValueOnce(INITIAL_USAGE)
    .mockReturnValueOnce(firstSync)
    .mockRejectedValueOnce(new Error("Second turn synchronization failed"))
    .mockResolvedValue(UPDATED_USAGE);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.data).toEqual(INITIAL_USAGE));
  hook.rerender({ id: "c1", busy: true });
  hook.rerender({ id: "c1", busy: false });
  await waitFor(() => expect(getConversationUsage).toHaveBeenCalledTimes(2));

  hook.rerender({ id: "c1", busy: true });
  hook.rerender({ id: "c1", busy: false });
  await waitFor(() =>
    expect(hook.client.getQueryState(queryKeys.conversationUsage("c1"))?.status).toBe("error"),
  );
  await act(async () => {
    resolveFirstSync(INITIAL_USAGE);
    await firstSync;
  });
  await act(() => hook.result.current.refetch());

  expect(getConversationUsage).toHaveBeenLastCalledWith("c1", { sync: true });
});
