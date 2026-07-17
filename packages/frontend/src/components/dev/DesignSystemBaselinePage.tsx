import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Markdown } from "@/components/chat/Markdown";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { Switch } from "@/components/common/Switch";
import { LazyMilkdownEditor } from "@/components/documents/LazyMilkdownEditor";

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

type BaselineSurface = "application" | "dialog" | "markdown" | "milkdown" | "semantic";

export function DesignSystemBaselinePage() {
  const [searchParams] = useSearchParams();
  const surface = readSurface(searchParams.get("surface"));

  if (surface === "dialog") {
    return <DialogBaseline />;
  }

  if (surface === "markdown") {
    return <MarkdownBaseline />;
  }

  if (surface === "milkdown") {
    return <MilkdownBaseline readonly={searchParams.get("readonly") === "true"} />;
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
            <button className="cc-button cc-button-secondary" type="button">
              Secondary action
            </button>
            <button className="cc-button" type="button">
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              Primary action
            </button>
          </>
        }
        description="A deterministic record of the current application styles. It is evidence for migration, not a future component API."
        eyebrow="Phase 0 baseline"
        title="Current CC application surface"
      />

      <section className="cc-panel grid gap-5 p-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Actions and states</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Existing button, tab, badge, and switch treatments shown together.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="cc-button" type="button">
            Primary
          </button>
          <button className="cc-button cc-button-secondary" type="button">
            Secondary
          </button>
          <button className="cc-button cc-button-danger" type="button">
            Destructive
          </button>
          <button className="cc-button" disabled type="button">
            Disabled
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="cc-tab cc-tab-active" type="button">
            Active tab
          </button>
          <button className="cc-tab" type="button">
            Inactive tab
          </button>
          <span className="cc-badge cc-badge-connected">Connected</span>
          <span className="cc-badge cc-badge-muted">Draft</span>
          <label className="inline-flex items-center gap-2 text-sm text-text-primary">
            <Switch
              aria-label="Baseline switch"
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
            Inputs are intentionally static so visual snapshots remain deterministic.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Text input
            <input
              className="cc-input"
              placeholder="Placeholder text"
              value="Current value"
              readOnly
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Select
            <select className="cc-input" defaultValue="default">
              <option value="default">Default option</option>
              <option value="alternate">Alternate option</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-text-primary md:col-span-2">
            Text area
            <textarea
              className="cc-input min-h-28"
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
        <button className="cc-button mt-5" type="button">
          Create first item
        </button>
      </section>
    </div>
  );
}

function DialogBaseline() {
  return (
    <div className="grid gap-4" data-testid="dialog-baseline">
      <PageHeader
        description="The underlying page is retained so overlay opacity and elevation are visible."
        eyebrow="Phase 0 baseline"
        title="Current CC dialog surface"
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
        eyebrow="Phase 0 baseline"
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
      </div>
    </section>
  );
}

function readSurface(value: string | null): BaselineSurface {
  if (value === "dialog" || value === "markdown" || value === "milkdown" || value === "semantic") {
    return value;
  }

  return "application";
}
