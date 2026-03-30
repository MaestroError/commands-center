# Custom Tools Acceptance Criteria

- Selecting the custom tools entry in navigation opens the custom tools screen.
- The custom tools screen shows all configured custom tools when one or more custom tools exist.
- If no custom tools exist, the custom tools screen shows an empty state and provides an action to create a custom tool.
- The custom tools screen allows the user to create a custom tool with a name, description, HTTP request configuration, and optional extra instructions.
- The custom tools screen allows the user to edit an existing custom tool and shows its saved name, description, HTTP request configuration, and extra instructions when extra instructions exist.
- If the user attempts to save a custom tool without a name, description, or HTTP request configuration, the screen prevents submission and shows a validation error for each missing required field.
- When the user saves a valid custom tool, the system persists that custom tool in the workspace.
- When the user saves valid changes to an existing custom tool, the system persists the updated definition and the saved values are shown when the tool is reopened for editing.
- The custom tools screen stores custom tools as global definitions rather than inside a single agent configuration.
- A custom tool saved on the custom tools screen is available for selection from the create or edit agent screen.
