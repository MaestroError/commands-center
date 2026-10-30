import { createServer } from "node:http";
import { z } from "zod";

export async function createLocalModelProvider() {
  const requests: string[] = [];
  let held = false;
  const pending = new Set<() => void>();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      requests.push(body);
      const input = z
        .object({
          messages: z.array(z.object({ role: z.string(), content: z.unknown().optional() })),
        })
        .parse(JSON.parse(body));
      const lastUser = input.messages.findLastIndex((message) => message.role === "user");
      const content = input.messages[lastUser]?.content;
      const userText =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .map(
                  (part: unknown) =>
                    z.object({ text: z.string().optional() }).passthrough().parse(part).text ?? "",
                )
                .join("\n")
            : "";
      const assignmentId = userText.includes("CC team result")
        ? userText.match(/"assignmentId":"([^"]+)"/)?.[1]
        : undefined;
      const target = assignmentId
        ? "cc_default_accept_team_assignment"
        : userText.match(/CALL:([A-Za-z0-9_-]+)/)?.[1];
      const encodedArgs = userText.match(/ARGS:([A-Za-z0-9+/=]+)/)?.[1];
      const toolArguments = assignmentId
        ? JSON.stringify({ assignmentId })
        : encodedArgs
          ? Buffer.from(encodedArgs, "base64").toString()
          : "{}";
      const toolResult = input.messages
        .slice(lastUser + 1)
        .findLast((message) => message.role === "tool");
      if (target && !toolResult) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({
            id: "local-tool-call",
            object: "chat.completion.chunk",
            created: 1,
            model: "test",
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call-local",
                      type: "function",
                      function: { name: target, arguments: toolArguments },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          })}\n\ndata: [DONE]\n\n`,
        );
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      const send = (content: string, finish: boolean): void => {
        response.write(
          `data: ${JSON.stringify({
            id: "local-e2e",
            object: "chat.completion.chunk",
            created: 1,
            model: "test",
            choices: [{ index: 0, delta: { content }, finish_reason: finish ? "stop" : null }],
          })}\n\n`,
        );
        if (finish) response.end("data: [DONE]\n\n");
      };
      const respond = (): void => {
        if (response.destroyed) return;
        send("Local v2 ", false);
        const timer = setTimeout(
          () =>
            send(
              toolResult ? `tool result: ${JSON.stringify(toolResult.content)}` : "response.",
              true,
            ),
          300,
        );
        response.on("close", () => clearTimeout(timer));
      };
      if (held) pending.add(respond);
      else respond();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing model provider port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    hold(): void {
      held = true;
    },
    release(): void {
      held = false;
      for (const respond of pending) respond();
      pending.clear();
    },
    async close(): Promise<void> {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
