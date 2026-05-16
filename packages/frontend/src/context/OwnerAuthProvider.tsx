import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { OwnerAuthStatus, OwnerClaimInput, OwnerLoginInput } from "@cc/shared/schemas";

import { claimWorkspace, getAuthStatus, loginOwner, logoutOwner } from "@/lib/api";

import { OwnerAuthContext } from "./owner-auth-context";

export function OwnerAuthProvider(props: { children: ReactNode }) {
  const [status, setStatus] = useState<OwnerAuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await getAuthStatus();
      setStatus(result.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load owner access status.");
      setStatus("claimed-unauthenticated");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus(): Promise<void> {
      setError(null);
      try {
        const result = await getAuthStatus();
        if (!cancelled) {
          setStatus(result.status);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load owner access status.");
          setStatus("claimed-unauthenticated");
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      status,
      loading: status === null,
      error,
      refresh,
      claim: async (input: OwnerClaimInput) => {
        setError(null);
        const result = await claimWorkspace(input);
        setStatus(result.status);
      },
      login: async (input: OwnerLoginInput) => {
        setError(null);
        const result = await loginOwner(input);
        setStatus(result.status);
      },
      logout: async () => {
        setError(null);
        const result = await logoutOwner();
        setStatus(result.status);
      },
    }),
    [error, refresh, status],
  );

  return <OwnerAuthContext.Provider value={value}>{props.children}</OwnerAuthContext.Provider>;
}
