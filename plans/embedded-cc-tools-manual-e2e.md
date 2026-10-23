# Manual acceptance: CC and MCP tool permissions

App: http://127.0.0.1:4175/

Use a test specialist with a connected MCP server and a harmless read-only tool
(for example, list or search). Ask for an actual tool invocation and check the
tool-call result; an assistant's description of its available tools is not proof.
Use fresh chats and task runs after changing permissions.

## Essential checks

- [ ] **Specialist defaults in chat:** Set the selected MCP tool to Allow, save,
      and invoke it in a new chat. It succeeds. Change it to Ask and verify an
      approval appears. Change it to Deny and verify it cannot execute.
- [ ] **Autonomous inheritance:** Set the specialist tool to Ask and run a task
      without overrides. The tool succeeds without waiting for approval.
- [ ] **Task overrides:** Enable “Change available tools.” Deny a tool that the
      specialist allows; a new run cannot execute it. Allow a tool that the specialist
      denies; a new run can execute it, provided its MCP server is connected.
      The specialist's chat permissions remain unchanged. Task controls offer only
      Allow and Deny, and cannot connect or disconnect servers.
- [ ] **Template snapshot:** Save a template with CC and MCP overrides, reopen
      it, and create a task from it. Verify the selections were copied and enforced.
      Edit the template afterwards; the existing task retains its previous settings.
- [ ] **Return to defaults:** Disable “Change available tools,” save, and reopen
      the task/template. A new run inherits specialist defaults again.

## Additional regression checks

- [ ] **CC tools:** Verify task-eligible CC tools remain grouped and can be
      allowed/denied across groups. Chat-only tools do not execute in tasks, and
      task-only tools do not execute in chat.
- [ ] **Unavailable tools:** Save a rule, then make its server unavailable.
      Reopen the editor: the saved rule remains visible and removable, and saving
      unrelated changes does not discard it.
- [ ] **Run isolation:** While a run is active, change specialist defaults.
      The active run retains its permission snapshot; a new run gets the new defaults.
- [ ] **Persistence:** Reload the browser and verify specialist, task, and
      template selections remain saved. Confirm editing MCP permissions does not
      change existing custom-script or CC-tool selections.

## Notes

Opening the editor initializes discovery for the specialist's configured MCP
connections; opening chat first is unnecessary. Validation and execution catalog
reads remain passive. Task MCP overrides cover only tools from that specialist's
connected servers.

Automated coverage already passed: 38 built-app browser scenarios, 56 design
checks, unit/integration suites, typechecks, lint, and CLI build. The checks above
add acceptance against real providers and MCP servers.
