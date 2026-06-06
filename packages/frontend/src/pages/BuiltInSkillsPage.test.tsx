import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceSkillUploadRenameError } from "@/lib/api";

import { BuiltInSkillsPage } from "./BuiltInSkillsPage";

import { useAgentCatalogQuery, useAgentMutations, useAgentsQuery } from "@/hooks/use-agents-query";
import { useWorkspaceSkillMutations } from "@/hooks/use-workspace-skills-query";
import { normalizeUploadableFiles, toFileManagerUploadEntries } from "@/lib/file-transfer";

import type { Agent, AgentCatalog, BuiltInSkill } from "@cc/shared/schemas";

vi.mock("@/hooks/use-agents-query", () => ({
  useAgentCatalogQuery: vi.fn(),
  useAgentsQuery: vi.fn(),
  useAgentMutations: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-skills-query", () => ({
  useWorkspaceSkillMutations: vi.fn(),
}));

vi.mock("@/lib/file-transfer", () => ({
  normalizeUploadableFiles: vi.fn(),
  toFileManagerUploadEntries: vi.fn(),
}));

vi.mock("@/components/layout/WorkspaceLayout", () => ({
  WorkspaceLayout: (props: {
    primary: React.ReactNode;
    contextPane?: {
      title: string;
      activeTabId?: string;
      defaultTabId?: string;
      onTabChange?: (tabId: string) => void;
      tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
    };
  }) => {
    const activeTabId =
      props.contextPane?.activeTabId ??
      props.contextPane?.defaultTabId ??
      props.contextPane?.tabs[0]?.id;
    const activeTab = props.contextPane?.tabs.find((tab) => tab.id === activeTabId);

    return (
      <div>
        <div data-testid="workspace-primary">{props.primary}</div>
        {props.contextPane ? (
          <div data-testid="workspace-context">
            <p>{props.contextPane.title}</p>
            <div>
              {props.contextPane.tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => props.contextPane?.onTabChange?.(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div>{activeTab?.content}</div>
          </div>
        ) : null}
      </div>
    );
  },
}));

const confirmSpy = vi.fn<(message?: string) => boolean>();

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const uploadMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const updateCategoryMutateAsync = vi.fn();

const builtInSkill: BuiltInSkill = {
  name: "Code Review",
  slug: "code-review",
  description: "Review implementation changes before release.",
  category: "engineering",
  metadata: {},
  detailsMarkdown: "Built-in details",
  files: ["SKILL.md"],
  version: "1.0.0",
};

const workspaceSkill: BuiltInSkill = {
  name: "Workspace Helper",
  slug: "workspace-helper",
  description:
    "A reusable workspace skill that documents conventions, local scripts, and delivery rules for this repository.",
  category: "operations",
  metadata: { owner: "cc" },
  detailsMarkdown: "Workspace details",
  files: ["SKILL.md", "notes.md"],
  compatibility: "cc>=0.1",
};

const catalog: AgentCatalog = {
  builtInSkills: [builtInSkill],
  workspaceSkills: [workspaceSkill],
  providerModels: [],
  mcpServers: [],
  appMcpServers: [],
  customTools: [],
};

const agent: Agent = {
  id: "agent-1",
  slug: "writer",
  name: "Writer",
  role: "Write docs",
  instructions: "Write clearly.",
  defaultModel: "openai/gpt-5",
  workspacePath: "/tmp/agents/writer",
  status: "active",
  capabilities: {
    builtInSkills: [],
    workspaceSkills: [workspaceSkill.slug],
    customTools: [],
    mcpServers: [],
    toolPermissions: [],
    appMcpServers: [],
    appToolPermissions: [],
  },
  createdAt: "2026-05-05T10:00:00.000Z",
  updatedAt: "2026-05-05T10:00:00.000Z",
};

beforeEach(() => {
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  uploadMutateAsync.mockReset();
  deleteMutateAsync.mockReset();
  updateCategoryMutateAsync.mockReset();
  confirmSpy.mockReset();

  vi.spyOn(window, "confirm").mockImplementation(confirmSpy);

  window.sessionStorage.clear();
  confirmSpy.mockReturnValue(true);

  vi.mocked(useAgentCatalogQuery).mockReturnValue({
    data: catalog,
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentsQuery).mockReturnValue({
    data: [agent],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentMutations).mockReturnValue({
    update: { mutateAsync: updateMutateAsync, isPending: false },
  } as never);

  vi.mocked(useWorkspaceSkillMutations).mockReturnValue({
    create: { mutateAsync: createMutateAsync, isPending: false },
    upload: { mutateAsync: uploadMutateAsync, isPending: false },
    delete: { mutateAsync: deleteMutateAsync, isPending: false },
    updateCategory: { mutateAsync: updateCategoryMutateAsync, isPending: false },
  } as never);

  vi.mocked(normalizeUploadableFiles).mockReturnValue([
    {
      file: new File(["skill"], "SKILL.md", { type: "text/markdown" }),
      relativePath: "wrong-name/SKILL.md",
    },
  ]);
  vi.mocked(toFileManagerUploadEntries).mockResolvedValue([
    {
      name: "SKILL.md",
      relativePath: "wrong-name/SKILL.md",
      contentBase64: "c2tpbGw=",
      sizeBytes: 5,
    },
  ]);
});

describe("BuiltInSkillsPage", () => {
  it("filters the skill list by search text and source", () => {
    renderPage();

    expect(screen.getByText("Code Review")).toBeInTheDocument();
    expect(screen.getByText("Workspace Helper")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search skills"), {
      target: { value: "workspace" },
    });

    expect(screen.queryByText("Code Review")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace Helper")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("All sources"), {
      target: { value: "built-in" },
    });

    expect(screen.getByText("No skills match this filter")).toBeInTheDocument();
  });

  it("selects a skill from the route search parameter", async () => {
    renderPage(["/skills?skill=workspace:workspace-helper"]);

    const context = screen.getByTestId("workspace-context");

    await waitFor(() => {
      expect(within(context).getByDisplayValue("operations")).toBeInTheDocument();
    });
  });

  it("keeps a manual skill selection after route-selected skills refetch", async () => {
    const view = renderPage(["/skills?skill=workspace:workspace-helper"]);
    const context = screen.getByTestId("workspace-context");

    await waitFor(() => {
      expect(within(context).getByDisplayValue("operations")).toBeInTheDocument();
    });

    clickSkillCard("Code Review");
    fireEvent.click(within(context).getByRole("button", { name: "Details" }));
    expect(within(context).getByText("Built-in details")).toBeInTheDocument();

    vi.mocked(useAgentCatalogQuery).mockReturnValue({
      data: {
        ...catalog,
        builtInSkills: [...catalog.builtInSkills],
        workspaceSkills: [...catalog.workspaceSkills],
      },
      isLoading: false,
      error: null,
    } as never);

    view.rerender(
      <MemoryRouter initialEntries={["/skills?skill=workspace:workspace-helper"]}>
        <BuiltInSkillsPage />
      </MemoryRouter>,
    );

    expect(
      within(screen.getByTestId("workspace-context")).getByText("Built-in details"),
    ).toBeInTheDocument();
  });

  it("creates a workspace skill and redirects to its folder", async () => {
    createMutateAsync.mockResolvedValue({ skill: workspaceSkill });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderPage();

    try {
      fireEvent.change(screen.getByPlaceholderText("Skill name"), {
        target: { value: "Release Notes" },
      });
      fireEvent.change(screen.getByPlaceholderText("Description"), {
        target: { value: "Generate release notes" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(createMutateAsync).toHaveBeenCalledWith({
          name: "Release Notes",
          category: undefined,
          description: "Generate release notes",
        });
      });

      expect(screen.getByPlaceholderText("Skill name")).toHaveValue("");
      expect(screen.getByPlaceholderText("Description")).toHaveValue("");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("assigns a built-in skill to the selected agent", async () => {
    updateMutateAsync.mockResolvedValue(agent);

    renderPage();
    selectAgent("Writer");

    fireEvent.click(screen.getByRole("button", { name: "Assign to agent" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: {
          capabilities: {
            ...agent.capabilities,
            builtInSkills: ["code-review"],
          },
        },
      });
    });
  });

  it("updates the workspace skill category", async () => {
    updateCategoryMutateAsync.mockResolvedValue(undefined);

    renderPage();
    clickSkillCard("Workspace Helper");

    const context = screen.getByTestId("workspace-context");
    const categoryInput = within(context).getByDisplayValue("operations");

    fireEvent.change(categoryInput, { target: { value: "playbooks" } });
    fireEvent.click(within(context).getByRole("button", { name: "Save category" }));

    await waitFor(() => {
      expect(updateCategoryMutateAsync).toHaveBeenCalledWith({
        slug: "workspace-helper",
        body: { category: "playbooks" },
      });
    });
  });

  it("removes a workspace skill from the selected agent", async () => {
    updateMutateAsync.mockResolvedValue(agent);

    renderPage();
    clickSkillCard("Workspace Helper");
    selectAgent("Writer");

    fireEvent.click(screen.getByRole("button", { name: "Remove from agent" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: {
          capabilities: {
            ...agent.capabilities,
            workspaceSkills: [],
          },
        },
      });
    });
  });

  it("renames uploaded skill paths after a rename conflict", async () => {
    uploadMutateAsync
      .mockRejectedValueOnce(
        new WorkspaceSkillUploadRenameError("rename required", "wrong-name", "workspace-helper"),
      )
      .mockResolvedValueOnce(undefined);

    const view = renderPage();
    const fileInput = view.container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    fireEvent.change(fileInput!, {
      target: { files: [new File(["skill"], "SKILL.md", { type: "text/markdown" })] },
    });

    expect(await screen.findByText("Rename uploaded skill folder")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rename and import" }));

    await waitFor(() => {
      expect(uploadMutateAsync).toHaveBeenNthCalledWith(1, {
        entries: [
          {
            name: "SKILL.md",
            relativePath: "wrong-name/SKILL.md",
            contentBase64: "c2tpbGw=",
            sizeBytes: 5,
          },
        ],
        overwrite: false,
      });

      expect(uploadMutateAsync).toHaveBeenNthCalledWith(2, {
        entries: [
          {
            name: "SKILL.md",
            relativePath: "workspace-helper/SKILL.md",
            contentBase64: "c2tpbGw=",
            sizeBytes: 5,
          },
        ],
        overwrite: false,
      });
    });
  });
});

function renderPage(initialEntries: string[] = ["/skills"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <BuiltInSkillsPage />
    </MemoryRouter>,
  );
}

function selectAgent(name: string) {
  const context = screen.getByTestId("workspace-context");
  fireEvent.change(within(context).getByRole("combobox"), {
    target: { value: name === "Writer" ? "agent-1" : "" },
  });
}

function clickSkillCard(name: string) {
  const title = screen.getByText(name);
  const button = title.closest("button");
  expect(button).toBeTruthy();
  fireEvent.click(button!);
}
