# Custom Tools Acceptance Criteria

- Selecting the custom tools entry in navigation opens the custom tools screen.
- The custom tools screen shows all configured global custom tools when one or more custom tools exist.
- If no global custom tools exist, the custom tools screen shows an empty state and provides an action to create a custom tool.
- The custom tools screen allows the user to create a starter custom tool by entering a name and generating the required starter files in the workspace.
- After creating a starter custom tool, the user can open that tool in the file manager to edit its files.
- The custom tools screen allows the user to search and inspect global custom tools.
- The custom tools screen shows which agents currently have copies of a global tool.
- The custom tools screen communicates whether agent copies are matching, outdated, modified, or unknown relative to the global tool.
- The custom tools screen allows the user to copy a global custom tool into one or more agents.
- If copying a global tool into an agent would overwrite an existing tool with the same name or slug, the user is warned and must confirm before proceeding.
- The custom tools screen allows the user to inspect agent-local tools for a selected agent.
- The custom tools screen allows the user to copy or move an agent-local tool into the global library.
- If importing an agent-local tool into the global library would overwrite an existing global tool with the same name or slug, the user is warned and must confirm before proceeding.
- Global custom tools are stored in the workspace so they remain portable.
- A global custom tool shown on the custom tools screen is available for assignment from the create or edit agent screen.
