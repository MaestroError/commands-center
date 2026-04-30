---
name: custom-tool-authoring
description: Author portable OpenCode custom tools that fit CommandsCenter's workspace contract.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# custom-tool-authoring

Use this skill when creating or updating custom OpenCode tools for CommandsCenter.

## Behavior

- Treat the global tool library as `.cc/workspace/custom-tools/<slug>/`.
- Keep one tool entry file per tool directory using `tool.ts`.
- Maintain `cc-tool.json` with the tool name, slug, description, entry file, and fingerprint.
- Prefer unique tool names that do not collide with built-in OpenCode tools.
- When a tool should be reusable across agents, place it in the global library.
- When a tool only belongs to one agent, place it in that agent workspace under `.opencode/tools/`.
- Remember that agent tools are copied snapshots and do not sync automatically with the global library.

## Output style

- Prefer practical file-by-file instructions.
- Mention whether the change should go to the global library or a single agent workspace.
- Call out when a copied agent tool has diverged and should be copied or moved back to global.
