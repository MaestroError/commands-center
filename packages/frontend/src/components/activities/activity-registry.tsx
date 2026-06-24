import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Eye,
  KeyRound,
  MessageSquare,
  ShieldQuestion,
  type LucideIcon,
} from "lucide-react";

import type { ActivityKind } from "@cc/shared/schemas";

type ActivityKindMeta = {
  icon: LucideIcon;
  label: string;
};

const REGISTRY: Record<ActivityKind, ActivityKindMeta> = {
  secret_request: { icon: KeyRound, label: "Secret requested" },
  task_completed: { icon: CheckCircle2, label: "Task completed" },
  task_needs_review: { icon: Eye, label: "Needs review" },
  feedback_resolved: { icon: MessageSquare, label: "Feedback resolved" },
  subtask_needs_review: { icon: Eye, label: "Feedback needs review" },
  task_run_failed: { icon: AlertTriangle, label: "Run failed" },
  task_run_approval: { icon: ShieldQuestion, label: "Approval required" },
};

export function getActivityKindMeta(kind: ActivityKind): ActivityKindMeta {
  return REGISTRY[kind] ?? { icon: Bell, label: "Activity" };
}
