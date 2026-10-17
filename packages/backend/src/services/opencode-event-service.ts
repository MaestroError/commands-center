type ChatEvent = {
  type: string;
  properties: Record<string, unknown>;
};

export type SubscribeOptions = {
  directory: string;
  sessionID: string;
  signal: AbortSignal;
  onReady?: () => void;
  onEvent: (event: ChatEvent) => void;
  onTitleUpdate?: (title: string) => void;
};

export type OpenCodeEventService = {
  subscribe(options: SubscribeOptions): void;
};
