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
  onReply: (requestId: string, reply: "once" | "always" | "reject") => void;
};

export function PermissionDock({ permission, onReply }: PermissionDockProps) {
  return (
    <div className="border border-border rounded-2xl p-4 bg-surface">
      <h3 className="text-sm font-semibold text-text-primary mb-2">Permission Required</h3>

      <p className="text-sm text-text-secondary mb-3">
        The agent is requesting permission to use{" "}
        <span className="font-medium text-text-primary">{permission.permission}</span>.
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
          className="cc-button-danger"
          onClick={() => onReply(permission.id, "reject")}
        >
          Deny
        </button>
        <button
          type="button"
          className="cc-button-secondary"
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
