import { createContext } from "react";

import type { OwnerAuthStatus, OwnerClaimInput, OwnerLoginInput } from "@cc/shared/schemas";

export type OwnerAuthContextValue = {
  status: OwnerAuthStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  claim: (input: OwnerClaimInput) => Promise<void>;
  login: (input: OwnerLoginInput) => Promise<void>;
  logout: () => Promise<void>;
};

export const OwnerAuthContext = createContext<OwnerAuthContextValue | null>(null);
