import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

type TerminalWriteCallback = () => void;

const mockTerminalInstances: MockTerminal[] = [];
const mockFitAddonInstances: MockFitAddon[] = [];
const mockWebLinksAddonInstances: MockWebLinksAddon[] = [];
const mockSerializeAddonInstances: MockSerializeAddon[] = [];

class MockTerminal {
  cols = 80;
  rows = 24;
  textarea: HTMLTextAreaElement | null = null;
  buffer = {
    active: {
      getLine: vi.fn(),
    },
  };

  loadAddon = vi.fn((addon: unknown) => {
    if (
      addon &&
      typeof addon === "object" &&
      "activate" in addon &&
      typeof addon.activate === "function"
    ) {
      (addon as { activate: (terminal: MockTerminal) => void }).activate(this);
    }
  });
  open = vi.fn((element?: Element | DocumentFragment | null) => {
    const root = element instanceof HTMLElement ? element : null;
    if (!root) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = "xterm";
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", "Terminal input");
    shell.appendChild(textarea);
    root.appendChild(shell);
    this.textarea = textarea;
  });
  focus = vi.fn(() => {
    this.textarea?.focus();
  });
  write = vi.fn((data: string, callback?: TerminalWriteCallback) => {
    if (this.textarea) {
      const current = this.textarea.dataset["buffer"] ?? "";
      this.textarea.dataset["buffer"] = `${current}${data}`;
    }
    callback?.();
  });
  dispose = vi.fn();
  onData = vi.fn((callback: (data: string) => void) => {
    this._onData = callback;
    return { dispose: vi.fn() };
  });
  paste = vi.fn((text: string) => {
    this._onData?.(text);
  });
  getSelection = vi.fn(() => this.selection);

  selection = "";
  _onData?: (data: string) => void;
  options: { theme?: Record<string, string> };

  constructor(options: { theme?: Record<string, string> } = {}) {
    this.options = options;
    mockTerminalInstances.push(this);
  }
}

class MockFitAddon {
  fit = vi.fn();

  constructor() {
    mockFitAddonInstances.push(this);
  }
}

class MockWebLinksAddon {
  constructor(public handler?: (event: MouseEvent, uri: string) => void) {
    mockWebLinksAddonInstances.push(this);
  }

  activate = vi.fn();
  dispose = vi.fn();
}

class MockSerializeAddon {
  serialized = "";

  constructor() {
    mockSerializeAddonInstances.push(this);
  }

  activate = vi.fn();
  dispose = vi.fn();
  serialize = vi.fn(() => this.serialized);
}

vi.mock("@xterm/xterm", () => ({
  Terminal: MockTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: MockFitAddon,
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: MockWebLinksAddon,
}));

vi.mock("@xterm/addon-serialize", () => ({
  SerializeAddon: MockSerializeAddon,
}));

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

const storage = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    }),
  },
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: true,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: MockResizeObserver,
});

Object.defineProperty(window, "open", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

// jsdom lacks the Pointer Capture API that Radix menu/select primitives call
// during pointer interactions; provide inert implementations.
for (const method of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
  Object.defineProperty(Element.prototype, method, {
    configurable: true,
    writable: true,
    value: method === "hasPointerCapture" ? vi.fn(() => false) : vi.fn(),
  });
}

Object.assign(globalThis, {
  __ccTestXterm: {
    MockTerminal,
    MockFitAddon,
    MockWebLinksAddon,
    MockSerializeAddon,
    mockTerminalInstances,
    mockFitAddonInstances,
    mockWebLinksAddonInstances,
    mockSerializeAddonInstances,
    storage,
  },
});
