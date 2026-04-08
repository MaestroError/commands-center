import { useCallback, useEffect, useRef, useState } from "react";

import type { ProviderOauthAuthorization, ProviderStatus } from "@cc/shared/schemas";

import {
  completeProviderOauth,
  disconnectProvider,
  listProviders,
  startProviderOauth,
  submitProviderApiKey,
} from "@/lib/api";

export function useProviderConnections() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProviderId, setBusyProviderId] = useState<string>();
  const [error, setError] = useState<string>();
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const next = await listProviders();

      if (mountedRef.current) {
        setProviders(next);
      }
    } catch (nextError) {
      if (mountedRef.current) {
        setError(readError(nextError));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();

    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const run = useCallback(
    async <T>(providerId: string, action: () => Promise<T>): Promise<T> => {
      setBusyProviderId(providerId);
      setError(undefined);

      try {
        const result = await action();
        await refresh();
        return result;
      } catch (nextError) {
        const message = readError(nextError);
        setError(message);
        throw new Error(message);
      } finally {
        if (mountedRef.current) {
          setBusyProviderId(undefined);
        }
      }
    },
    [refresh],
  );

  return {
    providers,
    loading,
    busyProviderId,
    error,
    refresh,
    connectApiKey: (providerId: string, apiKey: string) =>
      run(providerId, () => submitProviderApiKey(providerId, apiKey)),
    startOauth: (providerId: string, method: number, inputs?: Record<string, string>) =>
      run(providerId, () => startProviderOauth(providerId, method, inputs)),
    completeOauth: (providerId: string, method: number, code?: string) =>
      run(providerId, () => completeProviderOauth(providerId, method, code)),
    disconnect: (providerId: string) => run(providerId, () => disconnectProvider(providerId)),
  } satisfies {
    providers: ProviderStatus[];
    loading: boolean;
    busyProviderId?: string;
    error?: string;
    refresh: () => Promise<void>;
    connectApiKey: (providerId: string, apiKey: string) => Promise<boolean>;
    startOauth: (
      providerId: string,
      method: number,
      inputs?: Record<string, string>,
    ) => Promise<ProviderOauthAuthorization>;
    completeOauth: (providerId: string, method: number, code?: string) => Promise<boolean>;
    disconnect: (providerId: string) => Promise<boolean>;
  };
}

function readError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong while loading provider connections.";
}
