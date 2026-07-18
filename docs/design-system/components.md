# Components and Interaction Ownership

## Native HTML first

Use a native element when it already supplies the required semantics and
behavior: `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`, `<details>`,
and semantic document elements. Preserve accessible names, keyboard behavior,
focus visibility, disabled state, and a minimum 44px touch target where the
control is a primary mobile action.

## CC-owned primitives

Shadcn/UI is the copy-owned source convention. Radix supplies behavior for the
approved interaction primitives. CC owns their exported API and semantic
Tailwind appearance in `packages/frontend/src/components/ui/`.

Available primitive modules are: `alert`, `alert-dialog`, `button`, `checkbox`,
`command`, `dialog`, `dropdown-menu`, `input`, `popover`, `surface`, `switch`,
and `tabs`. Domain code imports these modules through `@/components/ui/*` and
must not import Radix directly.

```tsx
import { Button } from "@/components/ui/button";

export function SaveAction() {
  return <Button>Save</Button>;
}
```

```tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RenameDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Rename</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Rename document</DialogTitle>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Common compositions

Use the existing common component when its product contract matches:

- `ConfirmDialog` for confirmation and destructive confirmation.
- `PageHeader`, `LoadingState`, `ErrorState`, and `EmptyState` for page framing.
- `PasswordInput`, `SearchableSelect`, `Switch`, and `TabBar` for repeated
  application interactions.
- `DocumentCreateDialog` and `DocumentFolderDialog` for their document flows.

Do not extract a new common component for a single consumer. Do not recreate
focus traps, roving focus, outside dismissal, modal portals, or menu keyboard
behavior when an approved primitive already owns it.

## Behavior-rich domain UI

Some existing chat, search, workspace, and file-manager surfaces contain
interaction or lifecycle behavior that is not a generic primitive. Audit them
before migration. A shared visual resemblance alone is not permission to move
them into `components/ui` or add another Radix primitive.

## Icons

Use `lucide-react`. Inline SVG requires an approved exception with an exact
path and verification owner. Product artwork, provider artwork, third-party
serialized formats, ANSI, and syntax palettes follow the
[exception workflow](exceptions.md).

## Tests

Test the public behavior: role/name, keyboard order, focus return and trapping,
Escape/outside interaction, selected/disabled state, and narrow containment.
Use deterministic appearance assertions for theme roles; committed screenshot
baselines require explicit approval and a pinned CI baseline environment.
