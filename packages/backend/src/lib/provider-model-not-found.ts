export const PROVIDER_MODEL_NOT_FOUND_ERROR_NAME = "ProviderModelNotFoundError";

const RECOVERY_GUIDANCE =
  "Re-save the specialist's model configuration or restart the OpenCode instance, then try again.";

type ProviderModelNotFoundDetails = {
  attemptedModel?: string;
  modelID?: string;
  originalMessage: string;
  providerID?: string;
};

type ProviderModelNotFoundErrorInfo = {
  details: ProviderModelNotFoundDetails;
  message: string;
};

export function readProviderModelNotFoundError(
  error: unknown,
  attemptedModel?: string,
): ProviderModelNotFoundErrorInfo | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const data = isRecord(error["data"]) ? error["data"] : undefined;
  const name = readString(error, "name") ?? (data ? readString(data, "name") : undefined);
  const message = readString(error, "message") ?? (data ? readString(data, "message") : undefined);
  const originalMessage = (data ? readString(data, "originalMessage") : undefined) ?? message;

  if (
    !message ||
    (name !== PROVIDER_MODEL_NOT_FOUND_ERROR_NAME &&
      !message.includes(PROVIDER_MODEL_NOT_FOUND_ERROR_NAME))
  ) {
    return undefined;
  }

  const dataProviderID = data
    ? (readString(data, "providerID") ?? readString(data, "providerId"))
    : undefined;
  const dataModelID = data
    ? (readString(data, "modelID") ?? readString(data, "modelId"))
    : undefined;
  const resolvedAttemptedModel =
    attemptedModel ??
    (data ? readString(data, "attemptedModel") : undefined) ??
    readAttemptedModel(message) ??
    (dataProviderID && dataModelID ? `${dataProviderID}/${dataModelID}` : undefined);
  const parsedModel = splitModel(resolvedAttemptedModel);
  const providerID = dataProviderID ?? parsedModel.providerID;
  const modelID = dataModelID ?? parsedModel.modelID;

  return {
    message: resolvedAttemptedModel
      ? `Model not found: ${resolvedAttemptedModel}. ${RECOVERY_GUIDANCE}`
      : `Provider model not found. ${RECOVERY_GUIDANCE}`,
    details: {
      ...(resolvedAttemptedModel ? { attemptedModel: resolvedAttemptedModel } : {}),
      ...(modelID ? { modelID } : {}),
      originalMessage: originalMessage ?? message,
      ...(providerID ? { providerID } : {}),
    },
  };
}

function readAttemptedModel(message: string): string | undefined {
  const match = /model not found:\s*([^\s]+?)(?=\.?\s+(?:Did you mean:|at\s)|$)/i.exec(message);
  return match?.[1]?.replace(/[.,;:!?]+$/, "");
}

function splitModel(attemptedModel: string | undefined): {
  modelID?: string;
  providerID?: string;
} {
  if (!attemptedModel) {
    return {};
  }

  const slash = attemptedModel.indexOf("/");
  if (slash <= 0 || slash === attemptedModel.length - 1) {
    return { modelID: attemptedModel };
  }

  return {
    providerID: attemptedModel.slice(0, slash),
    modelID: attemptedModel.slice(slash + 1),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}
