import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ChevronRight, File, Folder, FolderOpen } from "lucide-react";

import type { DocumentFolderEntry, DocumentScope } from "@cc/shared/schemas";

import { LoadingState } from "@/components/common/PageStates";
import {
  buildDocumentFileManagerHref,
  buildDocumentFolderHref,
  buildDocumentHref,
} from "@/lib/document-href";
import { getDocumentFolder } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type DocumentFolderViewProps = {
  scope: DocumentScope;
  ownerSlug: string | null;
  path: string;
};

export function DocumentFolderView(props: DocumentFolderViewProps) {
  const { scope, ownerSlug, path } = props;

  const folderQuery = useQuery({
    queryKey: queryKeys.documentFolder(scope, ownerSlug, path),
    queryFn: () => getDocumentFolder({ scope, ownerSlug, path }),
  });

  const rootLabel = scope === "private" && ownerSlug ? ownerSlug : "Documents";
  const segments = path ? path.split("/") : [];

  return (
    <div className="flex h-full flex-col" data-testid="document-folder-view">
      <div className="shrink-0 border-b border-border p-4">
        <Breadcrumb rootLabel={rootLabel} scope={scope} ownerSlug={ownerSlug} segments={segments} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {folderQuery.isLoading ? (
          <LoadingState />
        ) : folderQuery.isError ? (
          <p className="p-4 text-sm text-danger">
            {folderQuery.error instanceof Error
              ? folderQuery.error.message
              : "Failed to load folder."}
          </p>
        ) : (folderQuery.data?.entries.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-text-secondary">This folder is empty.</p>
        ) : (
          <ul className="grid gap-0.5">
            {folderQuery.data?.entries.map((entry) => (
              <li key={entry.relativePath}>
                <DocumentFolderRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Breadcrumb(props: {
  rootLabel: string;
  scope: DocumentScope;
  ownerSlug: string | null;
  segments: string[];
}) {
  const { rootLabel, scope, ownerSlug, segments } = props;

  return (
    <nav
      aria-label="Folder breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
    >
      <BreadcrumbCrumb
        label={rootLabel}
        href={buildDocumentFolderHref("", { scope, ownerSlug })}
        isLast={segments.length === 0}
      />
      {segments.map((segment, index) => {
        const crumbPath = segments.slice(0, index + 1).join("/");
        return (
          <Fragment key={crumbPath}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <BreadcrumbCrumb
              label={segment}
              href={buildDocumentFolderHref(crumbPath, { scope, ownerSlug })}
              isLast={index === segments.length - 1}
            />
          </Fragment>
        );
      })}
    </nav>
  );
}

function BreadcrumbCrumb(props: { label: string; href: string; isLast: boolean }) {
  if (props.isLast) {
    return <span className="min-w-0 truncate font-semibold text-text-primary">{props.label}</span>;
  }
  return (
    <Link className="min-w-0 truncate text-text-secondary hover:text-text-primary" to={props.href}>
      {props.label}
    </Link>
  );
}

function DocumentFolderRow(props: { entry: DocumentFolderEntry }) {
  const { entry } = props;
  const revealHref = buildDocumentFileManagerHref({
    scope: entry.scope,
    ownerSlug: entry.ownerSlug,
    relativePath: entry.relativePath,
    type: entry.type,
  });

  const icon =
    entry.type === "directory" ? (
      <Folder className="h-4 w-4 shrink-0 text-text-secondary" />
    ) : entry.isDocument ? (
      <BookOpenText className="h-4 w-4 shrink-0 text-text-secondary" />
    ) : (
      <File className="h-4 w-4 shrink-0 text-text-muted" />
    );

  const label = <span className="min-w-0 flex-1 truncate">{entry.name}</span>;

  let primary: ReactNode;
  if (entry.type === "directory") {
    primary = (
      <Link
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
        to={buildDocumentFolderHref(entry.relativePath, {
          scope: entry.scope,
          ownerSlug: entry.ownerSlug,
        })}
      >
        {icon}
        {label}
      </Link>
    );
  } else if (entry.isDocument) {
    primary = (
      <Link
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
        to={buildDocumentHref(entry.relativePath, {
          scope: entry.scope,
          ownerSlug: entry.ownerSlug,
        })}
      >
        {icon}
        {label}
      </Link>
    );
  } else {
    primary = (
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm text-text-muted">
        {icon}
        {label}
      </div>
    );
  }

  return (
    <div className="group flex min-w-0 items-center gap-1 rounded-lg">
      {primary}
      <Link
        aria-label={`Show ${entry.name} in File Manager`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary opacity-0 transition hover:bg-surface-elevated hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
        title="Show in File Manager"
        to={revealHref}
      >
        <FolderOpen className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
