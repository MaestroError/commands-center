# Create / Edit Agent Acceptance Criteria

- Selecting the create agent action from the agents screen navigates to the create state of the create or edit agent screen.
- Selecting an agent's edit action from the agents screen navigates to the edit state of the create or edit agent screen for that agent.
- The create state shows empty inputs for name, role, and instructions, shows the icon field as optional, shows a default model selector, and shows controls for custom tool, built-in skill, Composio integration, and MCP server access.
- The edit state loads and shows the selected agent's saved name, role, instructions, icon value when one exists, default model, and custom tool, built-in skill, Composio integration, and MCP server access configuration.
- The screen uses the same field set and save behavior in both create and edit states, with differences limited to whether values are initially empty or prefilled.
- If the user attempts to save without a name, role, instructions, or default model, the screen prevents submission and shows a validation error for each missing required field.
- If one or more provider models are available, the default model selector shows those available models and allows one model to be selected.
- If no provider models are available, the screen shows that no model can be selected and prevents saving a create or edit change until a model becomes available.
- The screen lists globally available custom tools, built-in skills, Composio integrations, and globally available MCP servers so the user can configure the agent's access using the permission options supported by the app.
- If no global custom tools, built-in skills, Composio integrations, or MCP servers are configured, the screen shows an empty state for those sections and still allows the agent to be saved without any tool or integration access.
- When a built-in skill is assigned to an agent, the system copies that skill into the agent's workspace folder so it becomes part of the agent's portable workspace.
- When a Composio integration is assigned to an agent, the agent gains access to the tools provided by that Composio integration according to any tool-level permission behavior supported by the app.
- When the user saves a valid create form, the system creates the agent, persists its configuration inside the workspace, and navigates to the edit state for the newly created agent.
- When the user saves valid changes in edit state, the system persists the updated configuration inside the workspace and the saved values are shown when the agent is reopened for editing.
