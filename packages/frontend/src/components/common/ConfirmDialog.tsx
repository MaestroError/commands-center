import type { ReactNode } from "react";

export function ConfirmDialog(props: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
      onClick={props.onCancel}
    >
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="cc-panel w-full max-w-lg p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-xl font-semibold text-text-primary" id="confirm-dialog-title">
          {props.title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-text-secondary">{props.description}</div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            className={
              props.confirmVariant === "danger" ? "cc-button cc-button-danger" : "cc-button"
            }
            onClick={props.onConfirm}
            type="button"
          >
            {props.confirmLabel}
          </button>
          {props.secondaryLabel && props.onSecondary ? (
            <button
              className="cc-button cc-button-secondary"
              onClick={props.onSecondary}
              type="button"
            >
              {props.secondaryLabel}
            </button>
          ) : null}
          <button className="cc-button cc-button-secondary" onClick={props.onCancel} type="button">
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
