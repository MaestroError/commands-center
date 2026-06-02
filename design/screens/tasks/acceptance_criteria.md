# Tasks Acceptance Criteria

- Selecting the tasks entry in navigation or the tasks quick action from dashboard opens the tasks screen.
- The tasks screen shows configured tasks when one or more tasks exist.
- If no tasks exist, the tasks screen shows an empty state and provides an action to create a task.
- The tasks screen allows the user to create a task with a title, target agent, and prompt.
- The tasks screen allows the user to edit an existing task and shows its saved title, target agent, prompt, status, and scheduling state.
- If the user attempts to save a task without a title, target agent, or prompt, the screen prevents submission and shows a validation error for each missing required field.
- When the user saves a valid task, the system persists the task.
- The tasks screen allows the user to enable or disable scheduled behavior, and the updated state is shown when the task or template is reopened.
- The tasks screen allows the user to archive a task. Archived tasks are hidden from the active board but remain available in archive views.
- The tasks screen provides a way to view archived tasks and restore them to active status.
- The tasks screen allows the user to delete a task permanently. Selecting the delete action prompts the user with a confirmation dialog before proceeding.
- When the user confirms deletion, the system removes the task and it is no longer shown.
- When a maximum number of tasks is configured and that limit has been reached, the screen prevents creation of an additional active task and shows that the task limit has been reached.
- When no maximum number of tasks is configured, the tasks screen does not block creation based on task count.
- The tasks screen shows run history when execution history exists.
- When run history exists, each run entry shows the task identity, execution status, execution time, and the final enriched prompt that the system sent to the agent.
- Each task run is recorded as a separate history entry.
- When no run history exists for a task, the screen shows an empty history state.
