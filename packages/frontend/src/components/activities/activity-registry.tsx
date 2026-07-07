import {
  AlertTriangle,
  Bell,
  CalendarPlus,
  CheckCircle2,
  Eye,
  Info,
  KeyRound,
  ListPlus,
  MessageSquare,
  Play,
  ShieldQuestion,
  TerminalSquare,
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
  specialist_info: { icon: Info, label: "Info" },
  specialist_warning: { icon: AlertTriangle, label: "Warning" },
  task_proposal: { icon: ListPlus, label: "Task proposed" },
  task_template_proposal: { icon: CalendarPlus, label: "Template proposed" },
  run_template_proposal: { icon: Play, label: "Run template proposed" },
  run_command_proposal: { icon: TerminalSquare, label: "Command proposed" },
};

export function getActivityKindMeta(kind: ActivityKind): ActivityKindMeta {
  return REGISTRY[kind] ?? { icon: Bell, label: "Activity" };
}
