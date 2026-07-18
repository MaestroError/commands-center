import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Files, Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Markdown } from "@/components/chat/Markdown";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PasswordInput } from "@/components/common/PasswordInput";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { Switch } from "@/components/common/Switch";
import { TabBar } from "@/components/common/TabBar";
import { DocumentCreateDialog } from "@/components/documents/DocumentCreateDialog";
import { DocumentFolderDialog } from "@/components/documents/DocumentFolderDialog";
import { LazyMilkdownEditor } from "@/components/documents/LazyMilkdownEditor";
import { MonacoFileEditor } from "@/components/workspace/MonacoFileEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

const MARKDOWN_FIXTURE = `# Reader heading

This paragraph includes **strong text**, *emphasis*, [an external link](https://example.com), and an inline \`pnpm typecheck\` command.

## Lists and nesting

- First unordered item
- Second item with a deliberately_long_unbreakable_token_that_must_not_expand_the_content_beyond_the_viewport
  - Nested unordered item
  - Another nested item

1. First ordered item
2. Second ordered item
   1. Nested ordered item

> A blockquote provides enough content to verify its accent border, text color, and wrapping behavior in both color modes.

\`\`\`ts
type ThemeContract = {
  theme: "default";
  mode: "light" | "dark" | "system";
};
\`\`\`

| Surface | Ownership | Protected |
| --- | --- | --- |
| Chat Markdown | Existing CC styles | Yes |
| Milkdown | Editor bridge | Yes |

---

![A tiny deterministic baseline image](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iNzIiIHZpZXdCb3g9IjAgMCAyNDAgNzIiPjxyZWN0IHdpZHRoPSIyNDAiIGhlaWdodD0iNzIiIHJ4PSI4IiBmaWxsPSIjMjU2M2ViIi8+PHRleHQgeD0iMTIwIiB5PSI0MiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IndoaXRlIj5DQyBiYXNlbGluZTwvdGV4dD48L3N2Zz4=)
`;

const MILKDOWN_FIXTURE = `# Milkdown document

This editor fixture protects the current document-authoring surface while the application design system changes around it.

## Coverage

- Headings and paragraphs
- **Strong** and *emphasized* content
- Inline \`code\` and a [link](https://example.com)

> Existing Milkdown behavior remains independently owned.

\`\`\`ts
const protectedSurface = "milkdown";
\`\`\`

![A deterministic Milkdown image](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iNzIiIHZpZXdCb3g9IjAgMCAyNDAgNzIiPjxyZWN0IHdpZHRoPSIyNDAiIGhlaWdodD0iNzIiIHJ4PSI4IiBmaWxsPSIjMjU2M2ViIi8+PHRleHQgeD0iMTIwIiB5PSI0MiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IndoaXRlIj5DQyBiYXNlbGluZTwvdGV4dD48L3N2Zz4=)

| Area | Decision |
| --- | --- |
| Editor chrome | Protect |
| Serialization | Protect |
`;

type BaselineSurface =
  | "application"
  | "common"
  | "dialog"
  | "markdown"
  | "milkdown"
  | "monaco"
  | "primitives"
  | "semantic";

export function DesignSystemBaselinePage() {
  const [searchParams] = useSearchParams();
  const surface = readSurface(searchParams.get("surface"));

  if (surface === "dialog") {
    return <DialogBaseline />;
  }

  if (surface === "common") {
    return <CommonBaseline />;
  }

  if (surface === "primitives") {
    return <PrimitivesBaseline />;
  }

  if (surface === "markdown") {
    return <MarkdownBaseline />;
  }

  if (surface === "milkdown") {
    return <MilkdownBaseline readonly={searchParams.get("readonly") === "true"} />;
  }

  if (surface === "monaco") {
    return <MonacoBaseline />;
  }

  if (surface === "semantic") {
    return <SemanticHtmlBaseline />;
  }

  return <ApplicationBaseline />;
}

function ApplicationBaseline() {
  const [switchChecked, setSwitchChecked] = useState(true);

  return (
    <div className="grid gap-4" data-testid="application-baseline">
      <PageHeader
        actions={
          <>
            <Button variant="secondary" type="button">
              Secondary action
            </Button>
            <Button type="button">
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              Primary action
            </Button>
          </>
        }
        description="The supported CC application roles, controls, and semantic states in one deterministic development fixture."
        eyebrow="Design system gallery"
        title="CC application surface"
      />

      <section className="cc-panel grid gap-5 p-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Actions and states</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Existing button, tab, badge, and switch treatments shown together.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button">Primary</Button>
          <Button variant="secondary" type="button">
            Secondary
          </Button>
          <Button variant="danger" type="button">
            Destructive
          </Button>
          <Button disabled type="button">
            Disabled
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="cc-tab cc-tab-active" type="button">
            Active tab
          </button>
          <button className="cc-tab" type="button">
            Inactive tab
          </button>
          <Badge variant="success">Connected</Badge>
          <Badge>Draft</Badge>
          <Badge variant="warning">Needs auth</Badge>
          <Badge variant="danger">Failed</Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" type="button">
                More information
              </Button>
            </TooltipTrigger>
            <TooltipContent>Supplementary context works on hover and focus.</TooltipContent>
          </Tooltip>
          <label className="inline-flex items-center gap-2 text-sm text-text-primary">
            <Switch
              aria-label="Gallery switch"
              checked={switchChecked}
              onChange={setSwitchChecked}
            />
            Enabled
          </label>
        </div>
      </section>

      <section className="cc-panel grid gap-5 p-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Form controls</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Inputs are intentionally static so automated appearance assertions remain deterministic.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Text input
            <Input placeholder="Placeholder text" value="Current value" readOnly />
          </label>
          <div className="grid gap-2 text-sm font-medium text-text-primary">
            <span>Select</span>
            <Select defaultValue="default">
              <SelectTrigger aria-label="Select example">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default option</SelectItem>
                <SelectItem value="alternate">Alternate option</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="grid gap-2 text-sm font-medium text-text-primary md:col-span-2">
            Text area
            <Textarea
              className="min-h-28"
              defaultValue="A longer field verifies typography, border, surface, and focus treatment."
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="cc-success flex items-start gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div>
            <p className="font-semibold">Successful operation</p>
            <p className="mt-1">The current success treatment uses semantic theme tokens.</p>
          </div>
        </div>
        <div className="cc-alert flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="font-semibold">Action could not complete</p>
            <p className="mt-1">The current alert treatment is captured before token repair.</p>
          </div>
        </div>
      </section>

      <section className="cc-empty-state">
        <CircleHelp aria-hidden="true" className="mx-auto h-8 w-8 text-text-secondary" />
        <h2 className="mt-3 text-base font-semibold text-text-primary">Nothing configured yet</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-text-secondary">
          Empty states need a consistent structure, action hierarchy, and theme-controlled
          appearance.
        </p>
        <Button className="mt-5" type="button">
          Create first item
        </Button>
      </section>
    </div>
  );
}

const COMMON_SELECT_OPTIONS = [
  { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "openai/gpt-4.1", label: "GPT-4.1" },
];

type CommonOverlay = "confirm" | "document" | "folder" | null;

function CommonBaseline() {
  const [activeTabId, setActiveTabId] = useState("overview");
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState("openai/gpt-4.1");
  const [overlay, setOverlay] = useState<CommonOverlay>(null);

  return (
    <div className="grid gap-4" data-testid="common-baseline">
      <PageHeader
        actions={
          <>
            <Button variant="secondary" onClick={() => setOverlay("folder")}>
              New folder
            </Button>
            <Button onClick={() => setOverlay("document")}>New document</Button>
          </>
        }
        description="Public common-component APIs composed from CC-owned primitives, with deterministic state for interaction and visual verification."
        eyebrow="Common compositions"
        title="Common application patterns"
      />

      <section className="cc-panel grid gap-5 p-6" data-testid="common-controls">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Controls</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Password, switch, tabs, and searchable selection keep their established public APIs.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Workspace token
            <PasswordInput aria-label="Workspace token" defaultValue="cc-secret-value" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Disabled token
            <PasswordInput aria-label="Disabled token" defaultValue="disabled-secret" disabled />
          </label>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Default model
            <SearchableSelect
              ariaLabel="Default model"
              className="w-full"
              onChange={setModel}
              options={COMMON_SELECT_OPTIONS}
              value={model}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Disabled model
            <SearchableSelect
              ariaLabel="Disabled model"
              className="w-full"
              disabled
              onChange={() => undefined}
              options={COMMON_SELECT_OPTIONS}
              value="anthropic/claude-opus-4-8"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <label className="inline-flex items-center gap-2 text-sm text-text-primary">
            <Switch aria-label="Enable tools" checked={enabled} onChange={setEnabled} />
            Enable tools
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <Switch
              aria-label="Locked setting"
              checked={false}
              disabled
              onChange={() => undefined}
            />
            Locked setting
          </label>
        </div>

        <div className="min-w-0">
          <TabBar
            activeTabId={activeTabId}
            onTabChange={setActiveTabId}
            tabs={[
              {
                id: "overview",
                label: "Overview",
                icon: <Files className="h-4 w-4" />,
                panelId: "common-overview-panel",
                triggerId: "common-overview-tab",
              },
              {
                id: "search",
                label: "Search",
                icon: <Search className="h-4 w-4" />,
                panelId: "common-search-panel",
                triggerId: "common-search-tab",
              },
              {
                id: "activity",
                label: "Activity",
                panelId: "common-activity-panel",
                triggerId: "common-activity-tab",
              },
            ]}
            testIdPrefix="common-tab"
          />
          <div
            aria-labelledby={`common-${activeTabId}-tab`}
            className="min-h-20 p-4 text-sm text-text-secondary"
            id={`common-${activeTabId}-panel`}
            role="tabpanel"
          >
            {activeTabId === "overview"
              ? "Overview panel content"
              : activeTabId === "search"
                ? "Search panel content"
                : "Activity panel content"}
          </div>
        </div>
      </section>

      <section className="grid gap-4" data-testid="common-page-states">
        <ErrorState
          action={<Button variant="secondary">Retry</Button>}
          description="The request failed while preserving the current page context."
          title="Could not load specialists"
        />
        <EmptyState
          action={<Button>Create specialist</Button>}
          description="Create the first specialist to start a persistent direct conversation."
          title="No specialists yet"
        />
        <LoadingState />
      </section>

      <section className="cc-panel flex flex-wrap gap-2 p-6" data-testid="common-dialog-triggers">
        <Button variant="danger" onClick={() => setOverlay("confirm")}>
          Delete specialist
        </Button>
        <Button variant="secondary" onClick={() => setOverlay("document")}>
          Open document dialog
        </Button>
        <Button variant="secondary" onClick={() => setOverlay("folder")}>
          Open folder dialog
        </Button>
      </section>

      {overlay === "confirm" ? (
        <ConfirmDialog
          confirmLabel="Delete specialist"
          confirmVariant="danger"
          description="This removes the specialist configuration from the active workspace."
          onCancel={() => setOverlay(null)}
          onConfirm={() => setOverlay(null)}
          title="Delete this specialist?"
        />
      ) : null}
      {overlay === "document" ? (
        <DocumentCreateDialog
          defaultFolder="design"
          onClose={() => setOverlay(null)}
          ownerSlug="baseline-specialist"
          scope="private"
        />
      ) : null}
      {overlay === "folder" ? (
        <DocumentFolderDialog
          defaultParent="design"
          onClose={() => setOverlay(null)}
          ownerSlug="baseline-specialist"
          scope="private"
        />
      ) : null}
    </div>
  );
}

function DialogBaseline() {
  return (
    <div className="grid gap-4" data-testid="dialog-baseline">
      <PageHeader
        description="The underlying page is retained so overlay opacity and elevation are visible."
        eyebrow="Dialog contract"
        title="CC dialog surface"
      />
      <section className="cc-panel p-6 text-sm text-text-secondary">
        This panel sits behind the modal overlay.
      </section>
      <ConfirmDialog
        confirmLabel="Delete item"
        confirmVariant="danger"
        description="This irreversible action demonstrates the existing destructive confirmation pattern, overlay, spacing, and responsive placement."
        onCancel={() => undefined}
        onConfirm={() => undefined}
        title="Delete this item?"
      />
    </div>
  );
}

function MarkdownBaseline() {
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-testid="markdown-baseline">
      <section className="cc-panel min-w-0 p-6">
        <p className="cc-eyebrow">Reader variant</p>
        <Markdown className="mt-5" content={MARKDOWN_FIXTURE} />
      </section>
      <section className="cc-panel min-w-0 p-6">
        <p className="cc-eyebrow">Chat variant</p>
        <Markdown className="cc-md--chat mt-5" content={MARKDOWN_FIXTURE} />
      </section>
    </div>
  );
}

function MilkdownBaseline(props: { readonly: boolean }) {
  const [serializedMarkdown, setSerializedMarkdown] = useState(MILKDOWN_FIXTURE);

  return (
    <div className="grid gap-4" data-testid="milkdown-baseline">
      <PageHeader
        description="The real lazy-loaded editor protects visual appearance, editability, and Markdown serialization."
        eyebrow="Protected content"
        title={props.readonly ? "Milkdown read-only surface" : "Milkdown editing surface"}
      />
      <section className="cc-panel min-w-0 overflow-hidden p-3 sm:p-6">
        <LazyMilkdownEditor
          initialContent={MILKDOWN_FIXTURE}
          onChange={setSerializedMarkdown}
          readonly={props.readonly}
        />
      </section>
      <output className="sr-only" data-testid="milkdown-output">
        {serializedMarkdown}
      </output>
    </div>
  );
}

function MonacoBaseline() {
  const [draft, setDraft] = useState(
    `// CC Monaco fixture\ntype ThemeMode = "light" | "dark";\nconst mode: ThemeMode = "light";\nconst attempts = 5;\nconsole.log({ mode, attempts });`,
  );

  return (
    <div className="cc-panel h-[34rem] overflow-hidden" data-testid="monaco-baseline">
      <MonacoFileEditor
        baseline={draft}
        busy={false}
        dirty
        draft={draft}
        isWritable
        name="theme-fixture.ts"
        onDiscardConflict={() => undefined}
        onDraftChange={setDraft}
        onReloadRequested={() => undefined}
        onSaveRequested={() => undefined}
        path="/fixtures/theme-fixture.ts"
      />
    </div>
  );
}

function SemanticHtmlBaseline() {
  return (
    <section className="cc-panel p-6" data-testid="semantic-baseline">
      <div data-testid="unclassed-html">
        <h1>Unclassed heading level one</h1>
        <h2>Unclassed heading level two</h2>
        <h3>Unclassed heading level three</h3>
        <h4>Unclassed heading level four</h4>
        <h5>Unclassed heading level five</h5>
        <h6>Unclassed heading level six</h6>
        <p>
          A plain paragraph with <strong>strong importance</strong>, <em>emphasis</em>,
          <small> small print</small>, <mark>highlighting</mark>, <del>deleted text</del>, and
          <ins> inserted text</ins>.
        </p>
        <p>
          This is an <a href="https://example.com">unclassed external link</a> followed by inline{" "}
          <code>code()</code>, a <kbd>keyboard shortcut</kbd>, and <samp>sample output</samp>.
        </p>
        <ul>
          <li>First unordered item</li>
          <li>
            Second unordered item
            <ul>
              <li>Nested unordered item</li>
            </ul>
          </li>
        </ul>
        <ol>
          <li>First ordered item</li>
          <li>Second ordered item</li>
        </ol>
        <blockquote>
          A plain blockquote should eventually feel native to CC without requiring a class.
        </blockquote>
        <pre>
          <code>{`const surface = "semantic-html";\nconsole.log(surface);`}</code>
        </pre>
        <table>
          <caption>Plain semantic table</caption>
          <thead>
            <tr>
              <th scope="col">Element</th>
              <th scope="col">Current owner</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Paragraph</td>
              <td>Browser reset</td>
            </tr>
            <tr>
              <td>Table</td>
              <td>Browser reset</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Theme impact must be measured before global styling.</td>
            </tr>
          </tfoot>
        </table>
        <hr />
        <p>
          Final paragraph after the horizontal rule with a
          deliberately_long_unbreakable_token_that_exposes_the_current_overflow_behavior.
        </p>
        <section
          className="mt-8 rounded-lg border border-border bg-surface-elevated p-4"
          data-testid="semantic-cascade-control"
        >
          <h2 className="text-base font-semibold text-text-primary">Cascade control</h2>
          <p className="mt-2 text-danger">
            This explicit utility color must override generic semantic defaults.
          </p>
          <a className="mt-2 inline-flex text-danger" href="#semantic-cascade-control">
            Explicitly styled control link
          </a>
        </section>
      </div>
    </section>
  );
}

const LONG_TOKEN =
  "an_intentionally_long_unbreakable_token_that_must_not_expand_the_dialog_beyond_a_narrow_viewport";

function PrimitivesBaseline() {
  const [controlledOpen, setControlledOpen] = useState(false);
  const [menuValue, setMenuValue] = useState("system");
  const [checkboxState, setCheckboxState] = useState<boolean | "indeterminate">("indeterminate");

  return (
    <div className="grid gap-4" data-testid="primitives-baseline">
      <PageHeader
        description="Typed CC primitives rendered through the same public APIs used by production consumers."
        eyebrow="UI primitives"
        title="Typed UI primitives"
      />

      <section className="cc-panel grid gap-4 p-6" data-testid="primitive-buttons">
        <h2 className="text-lg font-semibold text-text-primary">Button variants</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled primary</Button>
          <Button variant="secondary" disabled>
            Disabled secondary
          </Button>
        </div>
      </section>

      <section className="cc-panel grid gap-4 p-6">
        <h2 className="text-lg font-semibold text-text-primary">Dialog</h2>
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename document</DialogTitle>
                <DialogDescription>
                  Ordinary dialogs close on Escape and on an outside click.
                </DialogDescription>
              </DialogHeader>
              <p className="mt-3 text-sm text-text-secondary" data-testid="dialog-stress">
                Long content verifies wrapping and narrow containment: {LONG_TOKEN}.
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>Save document</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="secondary" onClick={() => setControlledOpen(true)}>
            Open controlled dialog
          </Button>
          <Dialog open={controlledOpen} onOpenChange={setControlledOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Controlled dialog</DialogTitle>
                <DialogDescription>Open state is owned by the fixture.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Close</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="cc-panel grid gap-4 p-6">
        <h2 className="text-lg font-semibold text-text-primary">AlertDialog</h2>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="danger">Open destructive alert</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
                <AlertDialogDescription>
                  Destructive alerts keep initial focus on the safe action and never dismiss the
                  danger action through Escape or an outside click. {LONG_TOKEN}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="secondary">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button variant="danger">Delete workspace</Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary">Open ordinary alert</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave this page?</AlertDialogTitle>
                <AlertDialogDescription>Your changes are already saved.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="secondary">Stay</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button>Leave</Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="danger">Open disabled alert</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  The confirmation action is disabled until preconditions are met.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="secondary">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button variant="danger" disabled>
                    Delete permanently
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      <section className="cc-panel grid gap-4 p-6">
        <h2 className="text-lg font-semibold text-text-primary">Dropdown menu</h2>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Open menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>Delete (disabled)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Radio menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup onValueChange={setMenuValue} value={menuValue}>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <section className="cc-panel grid gap-4 p-6">
        <h2 className="text-lg font-semibold text-text-primary">Checkbox</h2>
        <div className="flex flex-wrap gap-5 text-sm text-text-primary">
          <label className="flex items-center gap-2">
            <Checkbox /> Unchecked
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked /> Checked
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={checkboxState}
              onCheckedChange={(checked) => setCheckboxState(checked)}
            />
            Permission group
          </label>
          <label className="flex items-center gap-2 text-text-disabled">
            <Checkbox disabled /> Disabled
          </label>
        </div>
      </section>
    </div>
  );
}

function readSurface(value: string | null): BaselineSurface {
  if (
    value === "dialog" ||
    value === "common" ||
    value === "markdown" ||
    value === "milkdown" ||
    value === "monaco" ||
    value === "primitives" ||
    value === "semantic"
  ) {
    return value;
  }

  return "application";
}
