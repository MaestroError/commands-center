export type EngineState = "stopped" | "starting" | "healthy" | "unhealthy" | "stopping";

export type EngineStatus = {
  state: EngineState;
  healthy: boolean;
  url: string;
  workspaceDir: string;
  version?: string;
  pid?: number;
  binaryPath?: string;
  binarySource?: "dependency" | "override";
  startedAt?: string;
  lastHealthCheckAt?: string;
  lastHealthyAt?: string;
  lastExitCode?: number;
  lastExitSignal?: NodeJS.Signals;
  lastError?: string;
  restartCount: number;
  maxRestarts: number;
};

export type OpenCodeOrchestrator = {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(reason: string): Promise<void>;
  refreshHealth(): Promise<boolean>;
  getStatus(): EngineStatus;
};
