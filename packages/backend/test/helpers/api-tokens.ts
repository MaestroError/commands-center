import {
  API_TOKEN_PRESETS,
  orderApiTokenCapabilityIds,
  type ApiTokenCapabilityGroup,
  type ApiTokenPermissions,
} from "@cc/shared/schemas";

/**
 * Build a token permission set from one or more preset groups — the common case
 * for tests that just need a token able to reach a group of endpoints. Mirrors
 * the pre-capability `scopes: [...]` convenience so call sites stay terse.
 */
export function permissionsForPresets(...groups: ApiTokenCapabilityGroup[]): ApiTokenPermissions {
  return {
    capabilities: orderApiTokenCapabilityIds(groups.flatMap((group) => API_TOKEN_PRESETS[group])),
    templates: [],
    documents: { global: false, globalFolderPaths: [], privateSpecialistIds: [] },
  };
}

/** Build a token permission set from explicit capability ids. */
export function permissionsForCapabilities(...capabilities: string[]): ApiTokenPermissions {
  return {
    capabilities: orderApiTokenCapabilityIds(capabilities),
    templates: [],
    documents: { global: false, globalFolderPaths: [], privateSpecialistIds: [] },
  };
}
