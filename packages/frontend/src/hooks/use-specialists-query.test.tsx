import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  archiveSpecialist: vi.fn(),
  createSpecialist: vi.fn(),
  getSpecialistBySlug: vi.fn(),
  getSpecialistCatalog: vi.fn(),
  listSpecialists: vi.fn(),
  updateSpecialist: vi.fn(),
}));

import {
  archiveSpecialist,
  createSpecialist,
  getSpecialistBySlug,
  getSpecialistCatalog,
  listSpecialists,
  updateSpecialist,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Specialist } from "@cc/shared/schemas";

import {
  useSpecialistCatalogQuery,
  useSpecialistMutations,
  useSpecialistQuery,
  useSpecialistsQuery,
} from "./use-specialists-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function buildSpecialist(overrides: Partial<Specialist> = {}): Specialist {
  return { id: "agent-1", slug: "helper", name: "Helper", ...overrides } as Specialist;
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("use-specialists-query reads", () => {
  it("lists specialists", async () => {
    vi.mocked(listSpecialists).mockResolvedValue([buildSpecialist()]);
    const { result } = renderHook(() => useSpecialistsQuery(), {
      wrapper: createWrapper(newClient()),
    });
    await waitFor(() => expect(result.current.data).toEqual([buildSpecialist()]));
  });

  it("fetches a specialist by slug when a slug is provided", async () => {
    vi.mocked(getSpecialistBySlug).mockResolvedValue(buildSpecialist());
    const { result } = renderHook(() => useSpecialistQuery("helper"), {
      wrapper: createWrapper(newClient()),
    });
    await waitFor(() => expect(result.current.data).toEqual(buildSpecialist()));
    expect(getSpecialistBySlug).toHaveBeenCalledWith("helper");
  });

  it("is disabled when no slug is provided", () => {
    const { result } = renderHook(() => useSpecialistQuery(undefined), {
      wrapper: createWrapper(newClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(getSpecialistBySlug).not.toHaveBeenCalled();
  });

  it("loads the specialist catalog", async () => {
    vi.mocked(getSpecialistCatalog).mockResolvedValue({ builtInSkills: [] } as never);
    const { result } = renderHook(() => useSpecialistCatalogQuery(), {
      wrapper: createWrapper(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useSpecialistMutations", () => {
  it("creates a specialist and seeds the cache", async () => {
    const created = buildSpecialist({ id: "agent-2", slug: "writer" });
    vi.mocked(createSpecialist).mockResolvedValue(created);
    const client = newClient();
    client.setQueryData(queryKeys.specialists, [buildSpecialist()]);

    const { result } = renderHook(() => useSpecialistMutations(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.create.mutateAsync({} as never);
    });

    expect(client.getQueryData(queryKeys.specialists)).toEqual([created, buildSpecialist()]);
    expect(client.getQueryData(queryKeys.specialistBySlug("writer"))).toEqual(created);
  });

  it("updates a specialist in the cached list", async () => {
    const updated = buildSpecialist({ name: "Renamed" });
    vi.mocked(updateSpecialist).mockResolvedValue(updated);
    const client = newClient();
    client.setQueryData(queryKeys.specialists, [buildSpecialist()]);

    const { result } = renderHook(() => useSpecialistMutations(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.update.mutateAsync({ id: "agent-1", input: {} as never });
    });

    expect(client.getQueryData(queryKeys.specialists)).toEqual([updated]);
    expect(updateSpecialist).toHaveBeenCalledWith("agent-1", {});
  });

  it("archives a specialist by removing it from the cached list", async () => {
    const archived = buildSpecialist();
    vi.mocked(archiveSpecialist).mockResolvedValue(archived);
    const client = newClient();
    client.setQueryData(queryKeys.specialists, [archived, buildSpecialist({ id: "agent-9" })]);

    const { result } = renderHook(() => useSpecialistMutations(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.archive.mutateAsync("agent-1");
    });

    expect(client.getQueryData(queryKeys.specialists)).toEqual([
      buildSpecialist({ id: "agent-9" }),
    ]);
  });
});
