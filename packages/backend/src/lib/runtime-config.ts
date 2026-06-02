import os from "node:os";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_WORKSPACE_DIR = ".cc/workspace";
const DEFAULT_DATA_DIR = ".cc/data";
const DEFAULT_OPENCODE_TIMEOUT_MS = 30_000;
const DEFAULT_OPENCODE_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_OPENCODE_SHUTDOWN_TIMEOUT_MS = 15_000;
const DEFAULT_OPENCODE_HEALTH_POLL_MS = 2_000;
const DEFAULT_OPENCODE_HOST = "127.0.0.1";
const DEFAULT_OPENCODE_PORT = 4100;
const DEFAULT_OPENCODE_MAX_RESTARTS = 3;
const DEFAULT_OPENCODE_RESTART_WINDOW_MS = 60_000;
const DEFAULT_MCP_AUTH_TIMEOUT_MS = 90_000;
const DEFAULT_DRAIN_TIMEOUT_MS = 15_000;
const DEFAULT_UPDATE_INTERVAL_MS = 21_600_000;
const DEFAULT_UPDATE_REGISTRY_URL = "https://registry.npmjs.org/commandscenter/latest";
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_SECRET_KEY = "development-secret-key-change-me";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const positiveInteger = (name: string, defaultValue: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") {
        return defaultValue;
      }

      const parsedValue = Number.parseInt(value, 10);

      if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be a positive integer`,
        });

        return z.NEVER;
      }

      return parsedValue;
    });

const booleanString = (defaultValue: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") {
        return defaultValue;
      }

      if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
        return true;
      }

      if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
        return false;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must be a boolean string",
      });

      return z.NEVER;
    });

const optionalLimit = (name: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") {
        return undefined;
      }

      const parsedValue = Number.parseInt(value, 10);

      if (!Number.isInteger(parsedValue) || parsedValue < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be a non-negative integer`,
        });

        return z.NEVER;
      }

      return parsedValue === 0 ? undefined : parsedValue;
    });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
  CC_PORT: positiveInteger("CC_PORT", DEFAULT_PORT),
  CC_HOST: z.string().trim().optional().default(DEFAULT_HOST),
  CC_WORKSPACE_DIR: z.string().trim().optional(),
  CC_DATA_DIR: z.string().trim().optional(),
  CC_OPENCODE_TIMEOUT_MS: positiveInteger("CC_OPENCODE_TIMEOUT_MS", DEFAULT_OPENCODE_TIMEOUT_MS),
  CC_OPENCODE_STARTUP_TIMEOUT_MS: positiveInteger(
    "CC_OPENCODE_STARTUP_TIMEOUT_MS",
    DEFAULT_OPENCODE_STARTUP_TIMEOUT_MS,
  ),
  CC_OPENCODE_SHUTDOWN_TIMEOUT_MS: positiveInteger(
    "CC_OPENCODE_SHUTDOWN_TIMEOUT_MS",
    DEFAULT_OPENCODE_SHUTDOWN_TIMEOUT_MS,
  ),
  CC_OPENCODE_HEALTH_POLL_MS: positiveInteger(
    "CC_OPENCODE_HEALTH_POLL_MS",
    DEFAULT_OPENCODE_HEALTH_POLL_MS,
  ),
  CC_OPENCODE_HOST: z.string().trim().optional().default(DEFAULT_OPENCODE_HOST),
  CC_OPENCODE_PORT: positiveInteger("CC_OPENCODE_PORT", DEFAULT_OPENCODE_PORT),
  CC_OPENCODE_MAX_RESTARTS: positiveInteger(
    "CC_OPENCODE_MAX_RESTARTS",
    DEFAULT_OPENCODE_MAX_RESTARTS,
  ),
  CC_OPENCODE_RESTART_WINDOW_MS: positiveInteger(
    "CC_OPENCODE_RESTART_WINDOW_MS",
    DEFAULT_OPENCODE_RESTART_WINDOW_MS,
  ),
  CC_MCP_AUTH_TIMEOUT_MS: positiveInteger("CC_MCP_AUTH_TIMEOUT_MS", DEFAULT_MCP_AUTH_TIMEOUT_MS),
  CC_DRAIN_TIMEOUT_MS: positiveInteger("CC_DRAIN_TIMEOUT_MS", DEFAULT_DRAIN_TIMEOUT_MS),
  CC_UPDATE_CHECK: booleanString(true),
  CC_UPDATE_INTERVAL_MS: positiveInteger("CC_UPDATE_INTERVAL_MS", DEFAULT_UPDATE_INTERVAL_MS),
  CC_AUTO_UPDATE: booleanString(false),
  CC_UPDATE_REGISTRY_URL: z.string().url().optional().default(DEFAULT_UPDATE_REGISTRY_URL),
  CC_DOCKER: booleanString(false),
  CC_LOG_LEVEL: logLevelSchema.optional().default(DEFAULT_LOG_LEVEL),
  CC_PUBLIC_ORIGIN: z.string().url().optional(),
  CC_ALLOWED_ORIGINS: z.string().trim().optional(),
  CC_OPENCODE_PATH: z.string().trim().optional(),
  CC_SECRET_KEY: z.string().trim().optional().default(DEFAULT_SECRET_KEY),
  CC_MAX_TASKS: optionalLimit("CC_MAX_TASKS"),
});

export type RuntimeEnvironment = NodeJS.ProcessEnv;

export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  server: {
    host: string;
    port: number;
  };
  paths: {
    cwd: string;
    dataDir: string;
    workspaceDir: string;
    subdirectories: {
      agents: string;
      auth: string;
      mcp: string;
      preferences: string;
      sessions: string;
      skills: string;
      tools: string;
      taskContextAttachments: string;
      tmp: string;
    };
  };
  database: {
    sqlitePath: string;
  };
  timeouts: {
    opencodeRequestMs: number;
    opencodeStartupMs: number;
    opencodeShutdownMs: number;
    opencodeHealthPollMs: number;
    opencodeRestartWindowMs: number;
    mcpAuthMs: number;
    drainMs: number;
  };
  opencode: {
    host: string;
    port: number;
    maxRestarts: number;
    baseUrl: string;
  };
  updates: {
    enabled: boolean;
    intervalMs: number;
    autoUpdate: boolean;
    registryUrl: string;
    docker: boolean;
    historyFile: string;
  };
  logLevel: z.infer<typeof logLevelSchema>;
  security: {
    publicOrigin?: string;
    allowedOrigins: string[];
  };
  opencodePath?: string;
  secretKey: string;
  tasks: {
    maxTasks?: number;
  };
  firstRun: {
    envFileCreated: boolean;
    envFilePath?: string;
  };
};

export type RuntimeConfigOverrides = {
  host?: string;
  port?: number;
};

export function loadRuntimeConfig(options?: {
  cwd?: string;
  env?: RuntimeEnvironment;
  overrides?: RuntimeConfigOverrides;
}): RuntimeConfig {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? env["INIT_CWD"] ?? os.homedir();
  const parsedEnv = envSchema.safeParse(env);

  if (!parsedEnv.success) {
    const details = parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid runtime configuration: ${details}`);
  }

  const workspaceDir = parsedEnv.data.CC_WORKSPACE_DIR
    ? isAbsolute(parsedEnv.data.CC_WORKSPACE_DIR)
      ? parsedEnv.data.CC_WORKSPACE_DIR
      : resolve(cwd, parsedEnv.data.CC_WORKSPACE_DIR)
    : resolve(cwd, DEFAULT_WORKSPACE_DIR);
  const dataDir = parsedEnv.data.CC_DATA_DIR
    ? isAbsolute(parsedEnv.data.CC_DATA_DIR)
      ? parsedEnv.data.CC_DATA_DIR
      : resolve(cwd, parsedEnv.data.CC_DATA_DIR)
    : resolve(cwd, DEFAULT_DATA_DIR);

  return {
    nodeEnv: parsedEnv.data.NODE_ENV,
    server: {
      host: options?.overrides?.host ?? parsedEnv.data.CC_HOST,
      port: options?.overrides?.port ?? parsedEnv.data.CC_PORT,
    },
    paths: {
      cwd,
      dataDir,
      workspaceDir,
      subdirectories: {
        agents: resolve(workspaceDir, "agents"),
        auth: resolve(workspaceDir, "auth"),
        mcp: resolve(workspaceDir, "mcp"),
        preferences: resolve(workspaceDir, "preferences"),
        sessions: resolve(workspaceDir, "sessions"),
        skills: resolve(workspaceDir, "skills"),
        taskContextAttachments: resolve(workspaceDir, "task-context-attachments"),
        tools: resolve(workspaceDir, "custom-tools"),
        tmp: resolve(workspaceDir, "tmp"),
      },
    },
    database: {
      sqlitePath: resolve(dataDir, "cc.db"),
    },
    timeouts: {
      opencodeRequestMs: parsedEnv.data.CC_OPENCODE_TIMEOUT_MS,
      opencodeStartupMs: parsedEnv.data.CC_OPENCODE_STARTUP_TIMEOUT_MS,
      opencodeShutdownMs: parsedEnv.data.CC_OPENCODE_SHUTDOWN_TIMEOUT_MS,
      opencodeHealthPollMs: parsedEnv.data.CC_OPENCODE_HEALTH_POLL_MS,
      opencodeRestartWindowMs: parsedEnv.data.CC_OPENCODE_RESTART_WINDOW_MS,
      mcpAuthMs: parsedEnv.data.CC_MCP_AUTH_TIMEOUT_MS,
      drainMs: parsedEnv.data.CC_DRAIN_TIMEOUT_MS,
    },
    opencode: {
      host: parsedEnv.data.CC_OPENCODE_HOST,
      port: parsedEnv.data.CC_OPENCODE_PORT,
      maxRestarts: parsedEnv.data.CC_OPENCODE_MAX_RESTARTS,
      baseUrl: `http://${parsedEnv.data.CC_OPENCODE_HOST}:${String(parsedEnv.data.CC_OPENCODE_PORT)}`,
    },
    updates: {
      enabled: parsedEnv.data.CC_UPDATE_CHECK,
      intervalMs: parsedEnv.data.CC_UPDATE_INTERVAL_MS,
      autoUpdate: parsedEnv.data.CC_AUTO_UPDATE,
      registryUrl: parsedEnv.data.CC_UPDATE_REGISTRY_URL,
      docker: parsedEnv.data.CC_DOCKER,
      historyFile: resolve(workspaceDir, "update-history.json"),
    },
    logLevel: parsedEnv.data.CC_LOG_LEVEL,
    security: {
      publicOrigin: parsedEnv.data.CC_PUBLIC_ORIGIN,
      allowedOrigins: parseAllowedOrigins(parsedEnv.data.CC_ALLOWED_ORIGINS),
    },
    opencodePath: parsedEnv.data.CC_OPENCODE_PATH || undefined,
    secretKey: parsedEnv.data.CC_SECRET_KEY,
    tasks: {
      maxTasks: parsedEnv.data.CC_MAX_TASKS,
    },
    firstRun: {
      envFileCreated: isTruthy(env["CC_FIRST_RUN_ENV_FILE_CREATED"]),
      envFilePath: env["CC_FIRST_RUN_ENV_FILE_PATH"]?.trim() || undefined,
    },
  };
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getStartupLogContext(config: RuntimeConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    server: config.server,
    opencode: config.opencode,
    paths: {
      dataDir: config.paths.dataDir,
      workspaceDir: config.paths.workspaceDir,
    },
    database: {
      sqlitePath: config.database.sqlitePath,
    },
    timeouts: config.timeouts,
    updates: {
      enabled: config.updates.enabled,
      intervalMs: config.updates.intervalMs,
      autoUpdate: config.updates.autoUpdate,
      registryUrl: config.updates.registryUrl,
      docker: config.updates.docker,
    },
    logLevel: config.logLevel,
    opencodePathConfigured: config.opencodePath !== undefined,
    secretKeyConfigured: config.secretKey.trim().length > 0,
    tasks: config.tasks,
    firstRun: {
      envFileCreated: config.firstRun.envFileCreated,
      envFilePath: config.firstRun.envFilePath,
    },
  };
}

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
