import { CopyIdButton } from "./CopyIdButton";

type Permission = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
};

type PermissionDockProps = {
  permission: Permission;
  pendingCount?: number;
  onReply: (requestId: string, reply: "once" | "always" | "reject") => void;
};

export function PermissionDock({ permission, pendingCount = 1, onReply }: PermissionDockProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-surface">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Permission Required</h3>
        {pendingCount > 1 ? (
          <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">
            {pendingCount - 1} more waiting
          </span>
        ) : null}
      </div>

      <p className="text-sm text-text-secondary mb-3">
        The agent is requesting permission to use{" "}
        <span className="inline-flex items-center gap-1 font-medium text-text-primary">
          <span>{permission.permission}</span>
          <CopyIdButton
            label={`permission ${permission.permission}`}
            value={permission.permission}
          />
        </span>
        .
      </p>

      {permission.patterns.length > 0 ? (
        <div className="mb-3">
          <p className="text-xs text-text-secondary mb-1">Patterns:</p>
          <div className="flex flex-wrap gap-1">
            {permission.patterns.map((pattern) => (
              <code
                key={pattern}
                className="text-xs bg-surface border border-border rounded-md px-1.5 py-0.5 text-text-primary"
              >
                {pattern}
              </code>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cc-button cc-button-danger"
          onClick={() => onReply(permission.id, "reject")}
        >
          Deny
        </button>
        <button
          type="button"
          className="cc-button cc-button-secondary"
          onClick={() => onReply(permission.id, "once")}
        >
          Allow Once
        </button>
        <button
          type="button"
          className="cc-button"
          onClick={() => onReply(permission.id, "always")}
        >
          Always Allow
        </button>
      </div>
    </div>
  );
}
