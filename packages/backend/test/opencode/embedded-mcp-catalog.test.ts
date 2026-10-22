import { describe, expect, it } from "vitest";
import {
  discoverEmbeddedMcpCatalog,
  readEmbeddedMcpCatalog,
} from "../../src/opencode/embedded-mcp-catalog.js";

type Host = Parameters<typeof readEmbeddedMcpCatalog>[0];
function fixture(status: "connected" | "pending" = "connected"): Host {
  return {
    readTools: () =>
      Promise.resolve([
        {
          id: "a_b_lookup",
          namespace: "a_b",
          name: "lookup",
          description: "Find an item",
          permission: "a_b_lookup",
        },
      ]),
    mcp: {
      list: () =>
        Promise.resolve({
          location: { directory: "/specialist" },
          data: [
            { name: "a", status: { status: "connected" as const } },
            { name: "a_b", status: { status } },
          ],
        }),
    } as Host["mcp"],
  };
}

describe("passive MCP catalog", () => {
  it("initializes the editor catalog before reading tools", async () => {
    const host = fixture();
    const read = host.readTools;
    let initialized = false;
    host.readTools = (directory) => (initialized ? read(directory) : Promise.resolve(undefined));
    const catalog = await discoverEmbeddedMcpCatalog(
      {
        ...host,
        listTools: async (directory) => {
          expect(directory).toBe("/specialist");
          initialized = true;
          return (await read(directory))!;
        },
      },
      "/specialist",
    );
    expect(catalog[1]?.tools[0]?.name).toBe("lookup");
  });
  it("does not initialize a location just to discover permissions", async () => {
    const host = fixture();
    host.readTools = () => Promise.resolve(undefined);
    host.mcp.list = () => {
      throw new Error("Must not initialize MCP location");
    };
    expect(await readEmbeddedMcpCatalog(host, "/specialist")).toEqual([]);
  });
  it("uses namespace ownership instead of overlapping server prefixes", async () => {
    const catalog = await readEmbeddedMcpCatalog(fixture(), "/specialist");
    expect(catalog[0]).toEqual({ server: "a", available: true, tools: [] });
    expect(catalog[1]?.tools).toEqual([
      { id: "a_b_lookup", name: "lookup", description: "Find an item" },
    ]);
  });
  it("keeps pending servers unavailable without connecting them", async () => {
    expect((await readEmbeddedMcpCatalog(fixture("pending"), "/specialist"))[1]).toEqual({
      server: "a_b",
      available: false,
      tools: [],
    });
  });
  it("rejects ambiguous normalized server namespaces", async () => {
    const host = fixture();
    host.mcp.list = () =>
      Promise.resolve({
        location: { directory: "/specialist" },
        data: [
          { name: "a.b", status: { status: "connected" } },
          { name: "a_b", status: { status: "connected" } },
        ],
      });
    expect(
      (await readEmbeddedMcpCatalog(host, "/specialist")).every((server) => !server.available),
    ).toBe(true);
  });
});
