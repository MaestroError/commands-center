// Split out of FileManagerPage.tsx (issue #99).

import { CopyIdButton } from "@/components/chat/CopyIdButton";
import type {
  FileManagerNode,
  FileManagerRootKind,
  FileManagerUploadResponse,
} from "@cc/shared/schemas";
import { RefreshCw, Upload } from "lucide-react";
import { ROOT_LABELS, formatLineCount, formatSize } from "./file-manager-helpers";
import { Button } from "@/components/ui/button";

export function SelectionDetails(props: {
  root: FileManagerRootKind;
  currentPath: string;
  currentAbsolutePath: string;
  currentSizeBytes?: number;
  currentLineCount?: number;
  selectedNode?: FileManagerNode;
}) {
  if (!props.selectedNode) {
    return (
      <div className="space-y-3 text-sm text-text-secondary">
        <p>Current location</p>
        <p className="rounded-lg border border-border bg-surface px-3 py-3 text-text-primary">
          {ROOT_LABELS[props.root]} / {props.currentPath === "." ? "" : props.currentPath}
        </p>
        <div>
          <p className="text-text-secondary">Path</p>
          <div className="mt-1">
            <DetailValue label="folder path" value={props.currentAbsolutePath} />
          </div>
        </div>
        <DetailMetric label="Size" value={formatSize(props.currentSizeBytes)} />
        {props.currentLineCount !== undefined ? (
          <DetailMetric label="Lines" value={formatLineCount(props.currentLineCount)} />
        ) : null}
        <p>Select a file to hand it off to the editor surface in the next sub-epic.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-text-secondary">Name</p>
        <p className="mt-1 font-medium text-text-primary">{props.selectedNode.name}</p>
      </div>
      <div>
        <p className="text-text-secondary">Type</p>
        <p className="mt-1 font-medium capitalize text-text-primary">{props.selectedNode.type}</p>
      </div>
      <div>
        <p className="text-text-secondary">Path</p>
        <div className="mt-1">
          <DetailValue
            label={`${props.selectedNode.type} path`}
            value={props.selectedNode.absolutePath}
          />
        </div>
      </div>
      <DetailMetric label="Size" value={formatSize(props.selectedNode.sizeBytes)} />
      {props.selectedNode.lineCount !== undefined ? (
        <DetailMetric label="Lines" value={formatLineCount(props.selectedNode.lineCount)} />
      ) : null}
      {props.selectedNode.isCritical ? (
        <div className="rounded-lg border border-warning-border bg-warning-surface px-3 py-3 text-warning-foreground">
          {props.selectedNode.criticalReason}
        </div>
      ) : null}
      {props.selectedNode.type === "file" ? (
        <p className="text-text-secondary">This file selection is ready for the editor surface.</p>
      ) : null}
    </div>
  );
}

export function UploadPanel(props: {
  busy: boolean;
  active: boolean;
  mode: "files" | "folder";
  message?: string;
  result?: FileManagerUploadResponse;
  onSelectFiles: () => void;
  onSelectFolder: () => void;
  rootProps: React.HTMLAttributes<HTMLDivElement>;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  testId: string;
}) {
  return (
    <div
      className={
        props.active
          ? "mt-4 rounded-xl border border-accent bg-accent/5 p-4"
          : "mt-4 rounded-xl border border-dashed border-border bg-surface-elevated/60 p-4"
      }
      data-testid={props.testId}
      {...props.rootProps}
    >
      <input {...props.inputProps} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-text-primary">Upload files or folders</p>
          <p className="mt-1 text-sm text-text-secondary">
            Drop files or folders here, or choose a picker. Folder uploads keep relative paths.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onSelectFiles} type="button">
            Files
          </Button>
          <Button variant="secondary" onClick={props.onSelectFolder} type="button">
            Folder
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-text-secondary">
        {props.busy ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span>
          {props.message ?? `Ready to upload ${props.mode === "folder" ? "a folder" : "files"}.`}
        </span>
      </div>
      {props.result && props.result.rejected.length > 0 ? (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-danger">
          {props.result.rejected.map((entry) => (
            <p key={`${entry.relativePath}:${entry.reason}`}>
              {entry.relativePath}: {entry.reason}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SelectionActions(props: {
  selectedNode?: FileManagerNode;
  busyAction?: string;
  onOpen: (node: FileManagerNode) => void;
  onDownload: (node: FileManagerNode) => void;
  onDownloadZip: (node: FileManagerNode) => void;
  onStartMove: (node: FileManagerNode) => void;
  onStartRename: (node: FileManagerNode) => void;
  onStartDelete: (node: FileManagerNode) => void;
}) {
  if (!props.selectedNode) {
    return (
      <p className="text-sm text-text-secondary">Select a file or folder to rename or delete it.</p>
    );
  }

  const actionBusy = props.busyAction?.endsWith(props.selectedNode.path) ?? false;

  return (
    <div className="flex flex-col gap-2">
      {props.selectedNode.type === "directory" ? (
        <>
          <Button
            variant="secondary"
            disabled={actionBusy}
            onClick={() => props.onOpen(props.selectedNode!)}
            type="button"
          >
            Open directory
          </Button>
          <Button
            variant="secondary"
            onClick={() => props.onDownloadZip(props.selectedNode!)}
            type="button"
          >
            Download as zip
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          onClick={() => props.onDownload(props.selectedNode!)}
          type="button"
        >
          Download file
        </Button>
      )}
      {props.selectedNode.isCritical ? null : (
        <>
          <Button
            variant="secondary"
            disabled={actionBusy}
            onClick={() => props.onStartMove(props.selectedNode!)}
            type="button"
          >
            Move {props.selectedNode.type}
          </Button>
          <Button
            variant="secondary"
            disabled={actionBusy}
            onClick={() => props.onStartRename(props.selectedNode!)}
            type="button"
          >
            Rename {props.selectedNode.type}
          </Button>
          <Button
            variant="secondary"
            disabled={actionBusy}
            onClick={() => props.onStartDelete(props.selectedNode!)}
            type="button"
          >
            Delete {props.selectedNode.type}
          </Button>
        </>
      )}
    </div>
  );
}

function DetailValue(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-all font-medium text-text-primary">{props.value}</p>
        <CopyIdButton
          className="shrink-0 rounded-md p-1.5"
          label={props.label}
          value={props.value}
        />
      </div>
    </div>
  );
}

function DetailMetric(props: { label: string; value: string }) {
  return (
    <div>
      <p className="text-text-secondary">{props.label}</p>
      <p className="mt-1 font-medium text-text-primary">{props.value}</p>
    </div>
  );
}
