import { useState } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useArchiveAllActivitiesMutation } from "@/hooks/use-activities-query";

type ArchiveAllActivitiesButtonProps = {
  count: number;
  compact?: boolean;
};

export function ArchiveAllActivitiesButton({ count, compact }: ArchiveAllActivitiesButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const archiveAll = useArchiveAllActivitiesMutation();

  if (count === 0) {
    return null;
  }

  const confirm = () => {
    archiveAll.mutate(undefined, { onSuccess: () => setConfirming(false) });
  };

  return (
    <>
      <button
        className={
          compact ? "text-xs text-accent hover:underline" : "cc-button cc-button-secondary"
        }
        onClick={() => setConfirming(true)}
        type="button"
      >
        Mark all as read
      </button>
      {confirming ? (
        <ConfirmDialog
          confirmDisabled={archiveAll.isPending}
          confirmLabel={archiveAll.isPending ? "Marking…" : "Mark all as read"}
          description="All pending notifications, including items needing attention, will move to Resolved. Nothing will be deleted."
          onCancel={() => {
            if (!archiveAll.isPending) {
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
