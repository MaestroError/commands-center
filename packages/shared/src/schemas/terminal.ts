import { z } from "zod";

export const terminalBackendTypeSchema = z.literal("opencode");

export const terminalCreateInputSchema = z.object({
  backend: terminalBackendTypeSchema.optional(),
  cwd: z.string().optional(),
  shell: z.string().optional(),
});

export const terminalSessionSchema = z.object({
  id: z.string(),
  backend: terminalBackendTypeSchema,
  cwd: z.string(),
  createdAt: z.number(),
});

export const terminalListResponseSchema = z.object({
  sessions: z.array(terminalSessionSchema),
});

export const terminalResizeInputSchema = z.object({
  cols: z.number().int().min(1).max(200),
  rows: z.number().int().min(1).max(100),
});

export const terminalCreateResponseSchema = terminalSessionSchema;

export const terminalSessionResponseSchema = terminalSessionSchema;

export type TerminalBackendType = z.infer<typeof terminalBackendTypeSchema>;
export type TerminalCreateInput = z.infer<typeof terminalCreateInputSchema>;
export type TerminalSession = z.infer<typeof terminalSessionSchema>;
export type TerminalListResponse = z.infer<typeof terminalListResponseSchema>;
export type TerminalResizeInput = z.infer<typeof terminalResizeInputSchema>;
export type TerminalCreateResponse = z.infer<typeof terminalCreateResponseSchema>;
export type TerminalSessionResponse = z.infer<typeof terminalSessionResponseSchema>;

export interface TerminalBackend {
  readonly type: TerminalBackendType;
  create(options: { cwd?: string; shell?: string }): Promise<TerminalSession>;
  attach(sessionId: string): Promise<TerminalSessionHandle>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  close(sessionId: string): Promise<void>;
  list(): Promise<TerminalSession[]>;
  isAvailable(): boolean;
}

export interface TerminalSessionHandle {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (code: number) => void) => void;
  close: () => void;
}
