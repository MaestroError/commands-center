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
  tone: "accent" | "danger" | "success" | "warning";
};

const REGISTRY: Record<ActivityKind, ActivityKindMeta> = {
  secret_request: { icon: KeyRound, label: "Secret requested", tone: "warning" },
  task_completed: { icon: CheckCircle2, label: "Completed", tone: "success" },
  task_needs_review: { icon: Eye, label: "Needs review", tone: "warning" },
  feedback_resolved: { icon: MessageSquare, label: "Feedback resolved", tone: "success" },
  subtask_needs_review: { icon: Eye, label: "Feedback needs review", tone: "warning" },
  task_run_failed: { icon: AlertTriangle, label: "Run failed", tone: "danger" },
  task_run_approval: { icon: ShieldQuestion, label: "Approval required", tone: "warning" },
  specialist_info: { icon: Info, label: "Info", tone: "accent" },
  specialist_warning: { icon: AlertTriangle, label: "Warning", tone: "danger" },
  task_proposal: { icon: ListPlus, label: "Task proposed", tone: "accent" },
  task_template_proposal: {
    icon: CalendarPlus,
    label: "Template proposed",
    tone: "accent",
  },
  run_template_proposal: { icon: Play, label: "Run template proposed", tone: "accent" },
  run_command_proposal: { icon: TerminalSquare, label: "Command proposed", tone: "accent" },
};

export function getActivityKindMeta(kind: ActivityKind): ActivityKindMeta {
  return REGISTRY[kind] ?? { icon: Bell, label: "Activity", tone: "accent" };
}
