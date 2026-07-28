import type Provider from "oidc-provider";
import type { FastifyRequest as FastifyRequestType } from "fastify";

import type { OAuthRecordStore } from "./sqlite-adapter.js";
import type { McpOAuthService } from "./mcp-oauth-service.js";

declare module "fastify" {
  interface FastifyInstance {
    oauthProvider: Provider;
    oauthRecordStore: OAuthRecordStore;
    mcpOAuthService: McpOAuthService;
    enforceOAuthInteractionRateLimit(request: FastifyRequestType): Promise<void>;
    resetOAuthRegistrationRateLimit(): void;
  }
}

export type OAuthRuntime = {
  provider: Provider;
  recordStore: OAuthRecordStore;
  service: McpOAuthService;
};
