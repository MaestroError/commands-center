import { useProvidersQuery } from "../../hooks/use-providers-query";

interface ModelSelectorProps {
  value: string | null;
  onChange: (modelId: string) => void;
  defaultModel?: string;
}

interface ModelOption {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  connected: boolean;
}

const selectClass =
  "h-8 min-w-0 flex-1 max-w-xs rounded-lg border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary outline-none cursor-pointer transition hover:border-accent focus:border-accent";

export function ModelSelector({ value, onChange, defaultModel }: ModelSelectorProps) {
  const { data: providers, isLoading } = useProvidersQuery();

  const models: ModelOption[] = (providers ?? []).flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      name: model.name,
      providerId: provider.provider.id,
      providerName: provider.provider.name,
      connected: provider.connected,
    })),
  );

  const connectedModels = models.filter((m) => m.connected);
  const uniqueKey = (m: ModelOption) => `${m.providerId}/${m.id}`;
  const selectedModel =
    value ?? defaultModel ?? (connectedModels[0] ? uniqueKey(connectedModels[0]) : "");

  if (isLoading) {
    return (
      <select className={`${selectClass} opacity-50`} disabled>
        <option>Loading...</option>
      </select>
    );
  }

  if (connectedModels.length === 0) {
    return (
      <select className={`${selectClass} opacity-50`} disabled>
        <option>No models available</option>
      </select>
    );
  }

  return (
    <select
      value={selectedModel}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
      title="Select model"
    >
      {connectedModels.map((model) => (
        <option key={uniqueKey(model)} value={uniqueKey(model)}>
          {model.providerName} / {model.name}
        </option>
      ))}
    </select>
  );
}
