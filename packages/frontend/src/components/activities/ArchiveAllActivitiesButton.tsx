import { useState } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { useArchiveAllActivitiesMutation } from "@/hooks/use-activities-query";
import { cn } from "@/lib/cn";

type ArchiveAllActivitiesButtonProps = {
  count: number;
  compact?: boolean;
};

export function ArchiveAllActivitiesButton({ count, compact }: ArchiveAllActivitiesButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const archiveAll = useArchiveAllActivitiesMutation();
  const description = archiveAll.isError ? (
    <p
      className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-danger"
      role="alert"
    >
      Could not mark all notifications as read. Their previous state has been restored.
    </p>
  ) : (
    "All pending notifications, including items needing attention, will move to Resolved. Nothing will be deleted."
  );

  if (count === 0) {
    return null;
  }

  const confirm = () => {
    archiveAll.mutate(undefined, { onSuccess: () => setConfirming(false) });
  };

  return (
    <>
      <button
        className={cn(
          compact
            ? "inline-flex min-h-11 items-center px-2 text-xs text-accent hover:underline"
            : buttonVariants({ variant: "secondary" }),
        )}
        onClick={() => {
          archiveAll.reset();
          setConfirming(true);
        }}
        type="button"
      >
        Mark all as read
      </button>
      {confirming ? (
        <ConfirmDialog
          confirmDisabled={archiveAll.isPending}
          confirmLabel={archiveAll.isPending ? "Marking…" : "Mark all as read"}
          description={description}
          onCancel={() => {
            if (!archiveAll.isPending) {
              archiveAll.reset();
              setConfirming(false);
            }
          }}
          onConfirm={confirm}
          title="Mark all notifications as read?"
        />
      ) : null}
    </>
  );
}
