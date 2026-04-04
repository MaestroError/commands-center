# Agents Acceptance Criteria

- Selecting the agents entry in navigation opens the agents screen.
- The agents screen shows all available agents in a grid layout with 2–3 agents per row on desktop-sized viewports.
- Each agent shown on the agents screen displays the agent's icon or image when one exists, the agent's name, the agent's role, and actions to open direct chat, edit the agent, and delete the agent.
- The agents screen provides an action to open the create agent screen, and selecting that action navigates to the create state of the create or edit agent screen.
- When the user enters text in the search input, the agents screen filters the visible agents to those whose name or role matches the entered text.
- If one or more agents match the current search, only matching agents are shown.
- If no agents match the current search, the screen shows an empty search-results state.
- If no agents exist, the screen shows an empty state and provides an action to open the create agent screen.
- Selecting an agent's chat action opens that agent's direct chat screen.
- Selecting an agent's edit action navigates to the edit state of the create or edit agent screen for that agent.
- Selecting an agent's delete action prompts the user with a confirmation dialog before proceeding.
- When the user confirms deletion, the system removes the agent and its workspace data, and the agents screen no longer shows that agent.
