import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";

export async function createEmbeddedOAuthProvider(): Promise<{
  origin: string;
  exchanges: string[];
  close(): Promise<void>;
}> {
  let origin = "";
  const exchanges: string[] = [];
  const clients = new Map<string, string[]>();
  const codes = new Map<string, { redirect: string; challenge: string; client: string }>();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const url = new URL(request.url ?? "/", origin);
      const json = (body: unknown, status = 200) => {
        response
          .writeHead(status, { "content-type": "application/json" })
          .end(JSON.stringify(body));
      };
      if (url.pathname === "/.well-known/oauth-protected-resource") {
        json({ resource: `${origin}/mcp`, authorization_servers: [origin] });
      } else if (url.pathname === "/.well-known/oauth-authorization-server") {
        json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          authorization_response_iss_parameter_supported: true,
        });
      } else if (url.pathname === "/register") {
        const metadata = JSON.parse(Buffer.concat(chunks).toString()) as {
          redirect_uris: string[];
        };
        const client_id = randomUUID();
        clients.set(client_id, metadata.redirect_uris);
        json({ ...metadata, client_id }, 201);
      } else if (url.pathname === "/authorize") {
        const redirect = url.searchParams.get("redirect_uri") ?? "";
        const client = url.searchParams.get("client_id") ?? "";
        const challenge = url.searchParams.get("code_challenge") ?? "";
        if (!clients.get(client)?.includes(redirect) || !challenge) {
          json({ error: "invalid_request" }, 400);
          return;
        }
        const code = randomUUID();
        codes.set(code, { redirect, challenge, client });
        const callback = new URL(redirect);
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", url.searchParams.get("state") ?? "");
        callback.searchParams.set("iss", origin);
        response.writeHead(302, { location: callback.toString() }).end();
      } else if (url.pathname === "/token") {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        const code = form.get("code") ?? "";
        const authorization = codes.get(code);
        const challenge = createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (
          !authorization ||
          authorization.redirect !== form.get("redirect_uri") ||
          authorization.challenge !== challenge ||
          authorization.client !== form.get("client_id")
        ) {
          json({ error: "invalid_grant" }, 400);
          return;
        }
        codes.delete(code);
        exchanges.push(authorization.redirect);
        json({
          access_token: "test-access",
          refresh_token: "test-refresh",
          token_type: "Bearer",
          expires_in: 3600,
        });
      } else if (url.pathname === "/mcp") {
        if (request.headers.authorization !== "Bearer test-access") {
          response.setHeader(
            "www-authenticate",
            `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          );
          json({ error: "unauthorized" }, 401);
          return;
        }
        if (request.method !== "POST") {
          response.writeHead(405).end();
          return;
        }
        const rpc = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number; method: string };
        if (rpc.id === undefined) {
          response.writeHead(202).end();
          return;
        }
        const result =
          rpc.method === "initialize"
            ? {
                protocolVersion: "2025-03-26",
                capabilities: { tools: {} },
                serverInfo: { name: "oauth-test", version: "1" },
              }
            : rpc.method === "tools/call"
              ? { content: [{ type: "text", text: "OAuth MCP greeting" }] }
              : {
                  tools: [
                    {
                      name: "greet",
                      description: "Test greeting",
                      inputSchema: { type: "object", properties: {} },
                    },
                  ],
                };
        json({ jsonrpc: "2.0", id: rpc.id, result });
      } else json({ error: "not_found" }, 404);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing OAuth fixture port");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    exchanges,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
