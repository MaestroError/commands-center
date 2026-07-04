// Barrel re-export. Domain modules live in ./api/*; this preserves the
// `@/lib/api` import surface after the god-file split (issue #99).
export * from "./api/client";
export * from "./api/auth";
export * from "./api/system";
export * from "./api/settings";
export * from "./api/integrations";
export * from "./api/specialists";
export * from "./api/documents";
export * from "./api/tasks";
export * from "./api/files";
export * from "./api/conversations";
export * from "./api/terminal";
