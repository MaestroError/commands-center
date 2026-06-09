import {
  FileText,
  FilePen,
  FilePlus,
  FolderOpen,
  Globe,
  Search,
  Sparkles,
  Terminal,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  read: FileText,
  view: FileText,
  cat: FileText,
  list: FolderOpen,
  ls: FolderOpen,
  glob: Search,
  grep: Search,
  search: Search,
  find: Search,
  write: FilePlus,
  create: FilePlus,
  edit: FilePen,
  patch: FilePen,
  bash: Terminal,
  shell: Terminal,
  exec: Terminal,
  fetch: Globe,
  webfetch: Globe,
  websearch: Globe,
  webhook: Webhook,
  task: Sparkles,
  agent: Sparkles,
};

function lookup(name: string): LucideIcon {
  const key = name.toLowerCase();
  if (ICONS[key]) return ICONS[key];
  for (const [needle, icon] of Object.entries(ICONS)) {
    if (key.includes(needle)) return icon;
  }
  return Wrench;
}

export function getToolIcon(name: string): React.ReactNode {
  const Icon = lookup(name);
  return <Icon aria-hidden="true" className="h-3.5 w-3.5" />;
}
