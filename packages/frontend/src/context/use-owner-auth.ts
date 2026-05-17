import { useContext } from "react";

import { OwnerAuthContext } from "./owner-auth-context";

export function useOwnerAuth() {
  const context = useContext(OwnerAuthContext);

  if (!context) {
    throw new Error("useOwnerAuth must be used within OwnerAuthProvider.");
  }

  return context;
}
