import { describe, expect, it } from "vitest";

import {
  buildTaskApiDocs,
  buildTemplateEndpointDocs,
  PUBLIC_API_TOKEN_PLACEHOLDER,
} from "../../src/lib/public-api-docs";

describe("buildTemplateEndpointDocs", () => {
  const docs = buildTemplateEndpointDocs({
    template: { id: "tmpl_123", title: "Weekly report", description: "Summarise the week." },
    baseUrl: "https://example.test/",
  });

  it("derives the versioned public API base URL and trims the origin slash", () => {
    expect(docs.apiBaseUrl).toBe("https://example.test/api/public/v1");
  });

  it("targets the template's real id in every snippet", () => {
    expect(docs.triggerCurl).toContain(
      "https://example.test/api/public/v1/task-templates/tmpl_123/trigger",
    );
    expect(docs.scheduleCurl).toContain("/task-templates/tmpl_123/trigger");
    expect(docs.triggerJs).toContain("/task-templates/tmpl_123/trigger");
    expect(docs.pollCurl).toContain("/task-runs/");
    expect(docs.agentInstructions).toContain("Weekly report");
    expect(docs.agentInstructions).toContain("Summarise the week.");
  });

  it("only ever uses the token placeholder, never a real token", () => {
    for (const snippet of [
      docs.triggerCurl,
      docs.triggerJs,
      docs.scheduleCurl,
      docs.pollCurl,
      docs.agentInstructions,
    ]) {
      expect(snippet).toContain(PUBLIC_API_TOKEN_PLACEHOLDER);
      expect(snippet).not.toMatch(/cc_[A-Za-z0-9_-]{10,}/);
    }
  });

  it("is deterministic for a given input", () => {
    const again = buildTemplateEndpointDocs({
      template: { id: "tmpl_123", title: "Weekly report", description: "Summarise the week." },
      baseUrl: "https://example.test/",
    });
    expect(again).toEqual(docs);
  });

  it("handles a missing description without throwing", () => {
    const minimal = buildTemplateEndpointDocs({
      template: { id: "tmpl_x", title: "No description" },
      baseUrl: "https://example.test",
    });
    expect(minimal.agentInstructions).toContain("_No description provided._");
  });
});

describe("buildTaskApiDocs", () => {
  const docs = buildTaskApiDocs("https://example.test/");

  it("derives the versioned base URL and targets the task endpoints", () => {
    expect(docs.apiBaseUrl).toBe("https://example.test/api/public/v1");
    expect(docs.agentsCurl).toContain("/api/public/v1/agents");
    expect(docs.createCurl).toContain("POST 'https://example.test/api/public/v1/tasks'");
    expect(docs.listByStatusCurl).toContain("/tasks?status=ready_to_check");
    expect(docs.listByTemplateCurl).toContain("templateId=<TEMPLATE_ID>&status=queued");
    expect(docs.getExpandCurl).toContain("?expand=runs,feedback");
    expect(docs.triggerCurl).toContain("/tasks/<TASK_ID>/trigger");
    expect(docs.scheduleCurl).toContain("/tasks/<TASK_ID>/schedule");
    expect(docs.runDetailCurl).toContain("/tasks/<TASK_ID>/runs/<RUN_ID>");
    expect(docs.feedbackCurl).toContain("/tasks/<TASK_ID>/feedback");
  });

  it("only uses the token placeholder, never a real token", () => {
    for (const snippet of Object.values(docs) as string[]) {
      if (snippet.startsWith("http")) {
        continue;
      }
      expect(snippet).toContain(PUBLIC_API_TOKEN_PLACEHOLDER);
      expect(snippet).not.toMatch(/cc_[A-Za-z0-9_-]{10,}/);
    }
  });

  it("is deterministic for a given base URL", () => {
    expect(buildTaskApiDocs("https://example.test/")).toEqual(docs);
  });
});
