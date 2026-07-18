import { expect, test, type Page, type Route } from "../fixtures";

type TerminalSession = {
  id: string;
  backend: "opencode";
  cwd: string;
  createdAt: number;
};

const ANSI_FIXTURE = [
  "CC terminal theme fixture",
  "Default foreground and background",
  "\u001b[30m black \u001b[31m red \u001b[32m green \u001b[33m yellow \u001b[34m blue \u001b[35m magenta \u001b[36m cyan \u001b[37m white \u001b[0m",
  "\u001b[90m bright black \u001b[91m bright red \u001b[92m bright green \u001b[93m bright yellow \u001b[94m bright blue \u001b[95m bright magenta \u001b[96m bright cyan \u001b[97m bright white \u001b[0m",
  "https://commands.center/terminal-theme",
].join("\r\n");

const ANSI_COLORS = {
  Light: [
    "rgb(15, 23, 42)",
    "rgb(159, 18, 57)",
    "rgb(20, 83, 45)",
    "rgb(120, 53, 15)",
    "rgb(23, 37, 84)",
    "rgb(112, 26, 117)",
    "rgb(22, 78, 99)",
    "rgb(82, 98, 122)",
    "rgb(89, 105, 127)",
    "rgb(190, 18, 60)",
    "rgb(22, 101, 52)",
    "rgb(146, 64, 14)",
    "rgb(30, 64, 175)",
    "rgb(134, 25, 143)",
    "rgb(21, 94, 117)",
    "rgb(51, 65, 85)",
  ],
  Dark: [
    "rgb(107, 123, 145)",
    "rgb(244, 71, 71)",
    "rgb(96, 139, 78)",
    "rgb(220, 220, 170)",
    "rgb(86, 156, 214)",
    "rgb(197, 134, 192)",
    "rgb(78, 201, 176)",
    "rgb(212, 212, 212)",
    "rgb(148, 163, 184)",
    "rgb(255, 107, 107)",
    "rgb(140, 194, 101)",
    "rgb(245, 245, 165)",
    "rgb(125, 183, 255)",
    "rgb(215, 166, 209)",
    "rgb(127, 231, 213)",
    "rgb(255, 255, 255)",
  ],
} as const;

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

for (const mode of ["Light", "Dark"] as const) {
  test(`renders the complete ${mode.toLowerCase()} ANSI palette`, async ({ page }) => {
    await mockTerminalApi(page);
    await page.goto("/terminal");
    await selectColorMode(page, mode);
    await installTerminalSocketMock(page, { initialOutput: ANSI_FIXTURE });
    await page.getByTestId("new-terminal-btn").click();

    const terminal = page.getByTestId("terminal-instance-term-1");
    await expect(terminal).toBeVisible();
    await expect(page.getByText("CC terminal theme fixture")).toBeVisible();
    const renderedColors = await terminal
      .locator(".xterm-rows span")
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color));
    for (const color of ANSI_COLORS[mode]) {
      expect(renderedColors).toContain(color);
    }
  });
}

test("updates a mounted terminal theme without reconnecting", async ({ page }) => {
  await mockTerminalApi(page);
  await page.goto("/terminal");
  await installTerminalSocketMock(page);
  await page.getByTestId("new-terminal-btn").click();

  const viewport = page.locator(".xterm-viewport");
  await expect(viewport).toBeVisible();
  await selectColorMode(page, "Light");
  await expect
    .poll(() => viewport.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(226, 232, 240)");

  await selectColorMode(page, "Dark");
  await expect
    .poll(() => viewport.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(2, 6, 23)");

  expect(
    await page.evaluate(
      () => (window as Window & { __ccWsCounts?: Record<string, number> }).__ccWsCounts?.["term-1"],
    ),
  ).toBe(1);
});

test("follows system appearance changes without reconnecting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mockTerminalApi(page);
  await page.goto("/terminal");
  await installTerminalSocketMock(page);
  await page.getByTestId("new-terminal-btn").click();

  const viewport = page.locator(".xterm-viewport");
  await expect
    .poll(() => viewport.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(226, 232, 240)");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => viewport.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(2, 6, 23)");
  expect(
    await page.evaluate(
      () => (window as Window & { __ccWsCounts?: Record<string, number> }).__ccWsCounts?.["term-1"],
    ),
  ).toBe(1);
});

async function selectColorMode(page: Page, label: "Light" | "Dark"): Promise<void> {
  await page.getByRole("button", { name: /Choose color mode, current:/ }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

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
  options: { disconnectFirstConnection?: boolean; initialOutput?: string } = {},
) {
  await page.evaluate(({ disconnectFirstConnection, initialOutput }) => {
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

          this.emitMessage(initialOutput ?? `Welcome to ${sessionId}\r\n`);

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
