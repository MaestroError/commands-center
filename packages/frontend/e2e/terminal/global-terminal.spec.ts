import { expect, test, type Page, type Route } from "../fixtures";

type TerminalSession = {
  id: string;
  backend: "opencode";
  cwd: string;
  createdAt: number;
};

test("renders the global terminal route", async ({ page }) => {
  await mockTerminalApi(page);

  await page.goto("/terminal");

  await expect(page.getByRole("heading", { name: "Global Terminal" })).toBeVisible();
  await expect(page.getByTestId("terminal-tabs-surface")).toBeVisible();
});

test("supports keyboard shortcuts for terminal session management", async ({ page }) => {
  await mockTerminalApi(page);
  await page.goto("/terminal");
  await installTerminalSocketMock(page);

  await page.getByTestId("new-terminal-btn").click();
  await expect(page.getByTestId("terminal-tab-term-1")).toBeVisible();

  await page.getByTestId("new-terminal-btn").click();
  await expect(page.getByTestId("terminal-tab-term-2")).toBeVisible();

  await dispatchTerminalShortcut(page, "Tab");
  await expect(page.getByTestId("terminal-tab-term-1")).toHaveAttribute("aria-selected", "true");

  await dispatchTerminalShortcut(page, "Tab", { shiftKey: true });
  await expect(page.getByTestId("terminal-tab-term-2")).toHaveAttribute("aria-selected", "true");

  await dispatchTerminalShortcut(page, "w");
  await expect(page.getByTestId("terminal-tab-term-2")).toHaveCount(0);
});

test("supports create, interaction, and close flow", async ({ page }) => {
  await mockTerminalApi(page);
  await page.goto("/terminal");
  await installTerminalSocketMock(page);

  await page.getByTestId("new-terminal-btn").click();
  await expect(page.getByTestId("terminal-instance-term-1")).toBeVisible();
  await expect(page.getByText("Welcome to term-1")).toBeVisible();

  await page.getByRole("textbox", { name: "Terminal input" }).click();
  await page.keyboard.type("echo hello world");
  await page.keyboard.press("Enter");
  await expect(page.getByText("echo hello world")).toBeVisible();

  await page.getByTestId("close-terminal-btn-term-1").click();
  await expect(page.getByText("No terminal sessions")).toBeVisible();
});

test("reconnects after transient attach interruption", async ({ page }) => {
  await mockTerminalApi(page);
  await page.goto("/terminal");
  await installTerminalSocketMock(page, { disconnectFirstConnection: true });

  await page.getByTestId("new-terminal-btn").click();
  await expect(page.getByText("[terminal connection lost, retrying]")).toBeVisible();
  await expect(page.getByText("[terminal reconnected]")).toBeVisible();

  await page.getByRole("textbox", { name: "Terminal input" }).click();
  await page.keyboard.type("status");
  await page.keyboard.press("Enter");
  await expect(page.getByText("status")).toBeVisible();
});

async function mockTerminalApi(page: Page): Promise<void> {
  const state = {
    sessions: [] as TerminalSession[],
    nextId: 1,
  };

  await page.addInitScript(() => {
    window.localStorage.clear();
  });

  await page.route("**/api/terminal", async (route: Route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill(jsonResponse({ sessions: state.sessions }));
      return;
    }

    if (method === "POST") {
      const next: TerminalSession = {
        id: `term-${state.nextId}`,
        backend: "opencode",
        cwd: `/workspace/term-${state.nextId}`,
        createdAt: Date.now() + state.nextId,
      };
      state.nextId += 1;
      state.sessions.push(next);
      await route.fulfill(jsonResponse(next, 201));
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/terminal/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const sessionId = url.pathname.split("/")[3];
    const session = state.sessions.find((entry) => entry.id === sessionId);

    if (!session) {
      await route.fulfill(jsonResponse({ error: { message: "not found" } }, 404));
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill(jsonResponse(session));
      return;
    }

    if (route.request().method() === "DELETE") {
      state.sessions = state.sessions.filter((entry) => entry.id !== sessionId);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (route.request().method() === "POST" && url.pathname.endsWith("/resize")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fallback();
  });
}

async function installTerminalSocketMock(
  page: Page,
  options: { disconnectFirstConnection?: boolean } = {},
) {
  await page.evaluate(({ disconnectFirstConnection }) => {
    class MockWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly CONNECTING = MockWebSocket.CONNECTING;
      readonly OPEN = MockWebSocket.OPEN;
      readonly CLOSING = MockWebSocket.CLOSING;
      readonly CLOSED = MockWebSocket.CLOSED;

      url: string;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        const sessionId = this.url.split("/").at(-2);
        const counts = ((
          window as Window & { __ccWsCounts?: Record<string, number> }
        ).__ccWsCounts ??= {});
        if (sessionId) {
          counts[sessionId] = (counts[sessionId] ?? 0) + 1;
        }

        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          const openEvent = new Event("open");
          this.onopen?.(openEvent);
          this.dispatchEvent(openEvent);

          if (!sessionId) {
            return;
          }

          this.emitMessage(`Welcome to ${sessionId}\r\n`);

          if (disconnectFirstConnection && counts[sessionId] === 1) {
            queueMicrotask(() => {
              this.closeFromServer(1006);
            });
          }
        });
      }

      send(data: string) {
        if (this.readyState !== MockWebSocket.OPEN) {
          return;
        }

        this.emitMessage(`${data}`);
      }

      close(code = 1000, reason = "") {
        if (this.readyState === MockWebSocket.CLOSING || this.readyState === MockWebSocket.CLOSED) {
          return;
        }

        this.readyState = MockWebSocket.CLOSING;
        queueMicrotask(() => {
          this.readyState = MockWebSocket.CLOSED;
          const closeEvent = new CloseEvent("close", { code, reason });
          this.onclose?.(closeEvent);
          this.dispatchEvent(closeEvent);
        });
      }

      closeFromServer(code: number) {
        if (this.readyState === MockWebSocket.CLOSED) {
          return;
        }

        this.readyState = MockWebSocket.CLOSED;
        const closeEvent = new CloseEvent("close", { code });
        this.onclose?.(closeEvent);
        this.dispatchEvent(closeEvent);
      }

      emitMessage(data: string) {
        const messageEvent = new MessageEvent("message", { data });
        this.onmessage?.(messageEvent);
        this.dispatchEvent(messageEvent);
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: MockWebSocket,
    });
  }, options);
}

async function dispatchTerminalShortcut(
  page: Page,
  key: string,
  options: { shiftKey?: boolean } = {},
) {
  await page.evaluate(
    ({ eventKey, shiftKey }) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: eventKey,
          metaKey: true,
          ctrlKey: true,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { eventKey: key, shiftKey: options.shiftKey ?? false },
  );
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
