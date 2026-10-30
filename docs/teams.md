# Teams and task-run replies

A task's assigned specialist owns its goal. It can delegate bounded assignments to
specialists you permit, review their results, request revisions, and assemble the
final response. There is no separate Team entity to configure.

## Configure and run

1. Open the owner specialist's create/edit page. Under **Permitted collaborators**,
   select the specialists it may delegate to and save.
2. Ensure the owner can use the Teams tools in **cc_default**. Existing tool
   permission controls still apply.
3. Create a normal task for that owner, describing the outcome and constraints.
   The specialist decides whether delegation helps; selecting collaborators does
   not force delegation on every task.
4. Open the task's **Feedback** panel to inspect the execution, assignments,
   expected outputs, worker sessions, results, artifacts, and owner acceptance.

Workers use their own instructions, model, workspace, and permissions. A parent
task's permission overrides are not copied to its workers. Selecting a collaborator
therefore explicitly authorizes delegation to that specialist's capabilities.
Removing a collaborator blocks assignments that have not started; cancel active
assignments separately if they must stop.

Workers receive the assignment brief and explicitly selected artifact inputs.
They do not receive the owner's private conversation or entire workspace. Shared
files are snapshotted, with artifact identity and producer provenance retained;
CC does not create public share links for a handoff. The owner reviews returned
results and calls `accept_team_assignment`, or requests a revision in the same
worker session. A failed assignment requires explicit owner resolution too.

An owner that ends its turn with unresolved assignments enters **Waiting** and
releases its specialist slot. Results queue a continuation in the same owner
session. Only the owner produces the final goal result. **Cancel goal** cancels
pending continuations and attempts to stop active workers. Late results do not
revive a cancelled goal.

## Reply while work is running

Open a run in chat or use its task-panel **Reply** control. **Queue reply** accepts
input while that run is executing or its specialist is busy on another task.
The reply waits for a safe turn boundary and then resumes that exact run's session.
Multiple replies are answered separately, in order, alongside other queued jobs.

Pending messages appear in both places, including source, destination run, state,
and waiting reason. Refreshing the browser does not lose the queue. Undelivered
operator replies can be cancelled without stopping the run. Use **Stop** or the
run cancellation action to stop execution itself.

Attachments and model selections are preserved. Task sessions retain task tool
permissions even after opening in chat. Direct shell/command execution cannot
bypass the task queue; ordinary standalone chats retain their existing behavior.

## Delivery and recovery

- **Queued:** persisted locally; not yet submitted to the SDK.
- **Delivering:** CC has reserved the specialist and is submitting the prompt.
- **Sending:** the SDK accepted it; CC is waiting for the answer.
- **Answered / failed / cancelled:** the recorded outcome of that message.
- **Blocked:** the session is unavailable, or delivery cannot be confirmed.

Restart recovery checks accepted messages before resuming monitoring. If SDK
acceptance cannot be established, CC blocks instead of blindly repeating a prompt
that might already have caused an external action. Inspect the session; if a
submission began and remains uncertain, cancel the run before explicitly retrying.
The specialist remains reserved in that situation. A message blocked before
submission can be cancelled directly from its queue.

## Current boundaries

- At most 20 assignments per goal execution and three revisions per assignment.
- Workers cannot delegate recursively. Owners can delegate another assignment
  after inspecting a prerequisite result; there is no dependency-graph editor.
- Input handoffs are limited to 20 MB per message. Larger outputs remain visible
  as artifact references, with a handoff error if they cannot be attached.
- Queue recovery covers restarts on the same installation. Copying a workspace
  preserves collaborator configuration; active sessions and runtime history are
  not a cross-installation recovery guarantee.
- Runtime artifact copies use each specialist's `.team-inputs/` directory. The
  default workspace `.gitignore` excludes these for newly initialized workspaces;
  existing `.gitignore` files are never rewritten.
- The queue applies to task-run sessions, including those opened in chat. It is
  not an application-wide queue for standalone chats.
