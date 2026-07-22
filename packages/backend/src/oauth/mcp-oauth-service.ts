import type { IncomingMessage, ServerResponse } from "node:http";

import type Provider from "oidc-provider";

import type { ApiTokenRecord } from "@cc/shared/schemas";

import type { ApiTokenService } from "../services/api-token-service.js";

const MCP_SCOPE = "mcp";

export type McpOAuthService = ReturnType<typeof createMcpOAuthService>;

export function createMcpOAuthService(options: {
  provider: Provider;
  apiTokenService: ApiTokenService;
  resource: string;
}) {
  return {
    async approveInteraction(
      request: IncomingMessage,
      response: ServerResponse,
      interactionUid: string,
      rawApiToken: string,
    ): Promise<string | null> {
      const apiToken = options.apiTokenService.validateToken(rawApiToken);

      if (!apiToken) {
        return null;
      }

      const details = await options.provider.interactionDetails(request, response);
      const clientId = readString(details.params["client_id"]);
      const requestedResource = readString(details.params["resource"]);
      const requestedScopes = new Set(readString(details.params["scope"])?.split(" ") ?? []);

      if (
        details.uid !== interactionUid ||
        !clientId ||
        requestedResource !== options.resource ||
        !requestedScopes.has(MCP_SCOPE)
      ) {
        return null;
      }

      const grant = new options.provider.Grant({
        accountId: apiToken.id,
        clientId,
      });
      grant.addOIDCScope(MCP_SCOPE);
      grant.addResourceScope(options.resource, MCP_SCOPE);
      const grantId = await grant.save();

      return options.provider.interactionResult(
        request,
        response,
        {
          login: {
            accountId: apiToken.id,
            remember: false,
          },
          consent: { grantId },
        },
        { mergeWithLastSubmission: false },
      );
    },

    async denyInteraction(
      request: IncomingMessage,
      response: ServerResponse,
      interactionUid: string,
    ): Promise<string | null> {
      const details = await options.provider.interactionDetails(request, response);

      if (details.uid !== interactionUid) {
        return null;
      }

      return options.provider.interactionResult(
        request,
        response,
        { error: "access_denied", error_description: "Authorization was denied." },
        { mergeWithLastSubmission: false },
      );
    },

    async resolveAccessToken(rawAccessToken: string): Promise<ApiTokenRecord | null> {
      const accessToken = await options.provider.AccessToken.find(rawAccessToken);

      if (
        !accessToken ||
        accessToken.scope?.split(" ").includes(MCP_SCOPE) !== true ||
        !hasExactAudience(accessToken.aud, options.resource)
      ) {
        return null;
      }

      return options.apiTokenService.resolveActiveTokenById(accessToken.accountId);
    },

    async revokeGrantForToken(rawToken: string): Promise<boolean> {
      const accessToken = await options.provider.AccessToken.find(rawToken);
      const refreshToken = accessToken
        ? undefined
        : await options.provider.RefreshToken.find(rawToken);
      const grantId = accessToken?.grantId ?? refreshToken?.grantId;

      if (!grantId) {
        return false;
      }

      await Promise.all([
        options.provider.AccessToken.revokeByGrantId(grantId),
        options.provider.RefreshToken.revokeByGrantId(grantId),
        options.provider.AuthorizationCode.revokeByGrantId(grantId),
        options.provider.Grant.adapter.destroy(grantId),
      ]);
      return true;
    },
  };
}

function hasExactAudience(audience: string | string[] | undefined, resource: string): boolean {
  if (!audience) {
    return false;
  }

  return typeof audience === "string"
    ? audience === resource
    : audience.length === 1 && audience[0] === resource;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
