# Step-by-step question dock

Branch: `fix/question-dock-step-by-step`

## Problem

`packages/frontend/src/components/chat/QuestionDock.tsx` renders every question
of an `AskUserQuestion` request stacked in one card: header, question text,
option pills, and a 2-row textarea per question, then a single Submit/Dismiss
row at the bottom.

The dock is a sibling of `MessageTimeline` inside the chat column
(`packages/frontend/src/pages/WorkspaceChatPage.tsx:421-433`), so its height is
subtracted from the transcript. With four questions — the real case in the
screenshot — the card is several viewport-heights tall on a phone: the
transcript is squeezed to a few lines, the Submit button is far below the fold
with no indication it exists, and the user has to scroll the whole page to find
out how many questions remain. Option `description` is only a `title` tooltip,
which is unreachable on touch.

## Approach

Turn the dock into a single-question stepper used on **both** mobile and
desktop: one question visible at a time, `Prev` / `Next` navigation, `Submit`
on the last step. Answer state stays exactly as it is today (`string[][]` +
per-question custom text, both indexed by question), so nothing changes for
`replyQuestion` or the backend — only which question is currently painted.

The card then has a bounded, predictable height regardless of how many
questions the agent asks, which is the actual fix.

## Implementation

1. **Step state.** Add `const [step, setStep] = useState(0)` to `QuestionDock`.
   Render only `question.questions[step]`. Keep `answers` / `customText` as
   full-length arrays keyed by the real question index — `toggleOption`,
   `changeCustom`, and `buildAnswers` keep their current index-based
   signatures and stay untouched.

2. **Header row.** Replace the bare per-question `header` line with a step
   header: the question's `header` (uppercase, as today) on the left and
   `Question {step+1} of {n}` on the right, plus a thin progress bar
   (`n` segments, filled through `step`). Marked `aria-live="polite"` so screen
   readers announce step changes. When `n === 1`, omit the counter, the
   progress bar, and the Prev/Next controls entirely — a single question keeps
   today's layout.

3. **Footer row.**
   - `Prev` — `variant="secondary"`, disabled on step 0.
   - `Next` — primary, shown while `step < n - 1`.
   - `Submit` — primary, shown only on the last step.
   - `Dismiss` — `variant="secondary"`, always present, still calls
     `onReject`.
     On mobile the row wraps: Prev/Next on one line, Submit/Dismiss below,
     using `flex-wrap` rather than a breakpoint branch. All buttons already meet
     the 44px touch target via the existing `Button` primitive.

4. **Free navigation, no forced answers.** `Next` never validates — the agent's
   questions are frequently optional and `buildAnswers` already tolerates empty
   entries. Users can page back and forth and revise; selections persist
   because the state arrays are never reindexed.

5. **Option descriptions inline.** With one question per screen there is room:
   render `opt.description` as a second line inside the option button
   (`text-xs`, secondary text, dimmed when selected) instead of relying on
   `title`. The `title` tooltip is dropped — it now duplicates visible text.
   This requires switching the option row from `flex-wrap` pills to a vertical
   stack on narrow widths (`flex-col sm:flex-row sm:flex-wrap`) so the two-line
   labels don't collapse. The two lines live in an inner `flex-col` span rather
   than on the button, so the `cc-tab` pill keeps its own centered flex row and
   its radius — no new CSS and no design-system exception. Add `aria-pressed`
   so selection state is exposed, not just painted.

6. **Height guard.** Give the card `max-h-[60vh]` and put the question body in
   a `flex-1 overflow-y-auto` region so a single question with many long
   options still can't swallow the transcript. The footer sits outside that
   region as a non-scrolling row — simpler and more robust than a `sticky`
   footer inside a padded scroll container, where the padding gutters would
   let content show through.

7. **Reset on a new request.** Add `key={conv.pendingQuestion.id}` to the
   `<QuestionDock>` usage in `WorkspaceChatPage.tsx`. Today the state
   initializers only run on mount and the component happens to unmount between
   requests; with a `step` field in play that assumption is worth pinning down
   rather than relying on.

8. **Keyboard.** `Cmd/Ctrl+Enter` in the textarea advances (or submits on the
   last step). Plain `Enter` stays a newline. On step change, move focus to the
   step heading (`tabIndex={-1}`) so keyboard and screen-reader users land on
   the new question instead of at the top of the page.

## Tests

`packages/frontend/src/components/chat/QuestionDock.test.tsx` assumes every
question is on screen at once and will fail as written — that is expected, and
the rewrite is part of the change, not fallout:

- "renders all question texts" becomes "renders one question at a time" —
  question 2 is absent until `Next` is clicked.
- The multi-select and custom-answer cases click `Next` before touching the
  second question; `getAllByPlaceholderText` collapses to `getByPlaceholderText`.
- The single-select-replacement and dismiss cases are unaffected.
- New: `Prev` restores a previous step with its selection intact; `Submit` is
  absent until the last step; a one-question request renders no stepper chrome;
  the final `onReply` payload shape is unchanged
  (`[["Option B"], ["Alpha", "Beta"]]`).

`WorkspaceChatPage.test.tsx` mocks `QuestionDock`, so it needs no change.

## Success criteria

- The dock's height no longer scales with the number of questions; a 4-question
  request fits a 375px-wide viewport without the transcript collapsing.
- Every answer reachable before the change is still reachable, and the
  `onReply(requestId, string[][])` payload is byte-identical for the same
  choices.
- Option descriptions are readable without hover.
- `pnpm lint`, `pnpm typecheck`, `pnpm design-system:audit`, and the frontend
  unit tests pass.

## Out of scope

- `QuestionTool.tsx` (the answered-question transcript renderer) — unchanged.
- Backend schemas, `use-conversation.ts`, and the reply/reject API.
- `PermissionDock`, which has a fixed small height and is not affected.
