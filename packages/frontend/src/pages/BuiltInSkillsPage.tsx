import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useAgentCatalogQuery } from "@/hooks/use-agents-query";

const EMPTY_SKILLS: NonNullable<ReturnType<typeof useAgentCatalogQuery>["data"]>["builtInSkills"] =
  [];

export function BuiltInSkillsPage() {
  const catalogQuery = useAgentCatalogQuery();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const deferredSearch = useDeferredValue(search);
  const skills = catalogQuery.data?.builtInSkills ?? EMPTY_SKILLS;
  const categories = useMemo(
    () => [
      "all",
      ...Array.from(new Set(skills.map((skill) => skill.category))).sort((a, b) =>
        a.localeCompare(b),
      ),
    ],
    [skills],
  );
  const filteredSkills = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return skills.filter((skill) => {
      const matchesCategory = category === "all" || skill.category === category;
      const matchesSearch =
        query.length === 0 ||
        `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [category, deferredSearch, skills]);

  useEffect(() => {
    if (!filteredSkills.some((skill) => skill.slug === selectedSlug)) {
      setSelectedSlug(filteredSkills[0]?.slug);
    }
  }, [filteredSkills, selectedSlug]);

  const selectedSkill =
    filteredSkills.find((skill) => skill.slug === selectedSlug) ?? filteredSkills[0];

  return (
    <div className="grid gap-4">
      <PageHeader
        description="Browse the curated skills library, inspect what each skill contains, and use the same library inside the agent editor."
        eyebrow="Built-in Skills"
        title="Curated skill library"
      />

      <section className="cc-panel p-4 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <input
            className="cc-input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search skills"
            value={search}
          />
          <select
            className="cc-input"
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            {categories.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All categories" : value}
              </option>
            ))}
          </select>
        </div>
      </section>

      {catalogQuery.isLoading ? <LoadingState /> : null}
      {catalogQuery.error ? (
        <ErrorState
          description={readError(catalogQuery.error)}
          title="Built-in skills could not be loaded."
        />
      ) : null}
      {!catalogQuery.isLoading && !catalogQuery.error && skills.length === 0 ? (
        <EmptyState
          description="Built-in skills are bundled with CommandsCenter and become assignable to agents automatically."
          title="No built-in skills available"
        />
      ) : null}
      {!catalogQuery.isLoading &&
      !catalogQuery.error &&
      skills.length > 0 &&
      filteredSkills.length === 0 ? (
        <EmptyState
          description="Try a different search term or category to find the skill you need."
          title="No skills match this filter"
        />
      ) : null}

      {!catalogQuery.isLoading && !catalogQuery.error && filteredSkills.length > 0 ? (
        <WorkspaceLayout
          contextPane={
            selectedSkill
              ? {
                  title: "Skill details",
                  tabs: [
                    {
                      id: "details",
                      label: "Details",
                      content: <SkillDetail skill={selectedSkill} />,
                    },
                  ],
                }
              : undefined
          }
          primary={
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSkills.map((skill) => {
                const selected = selectedSkill?.slug === skill.slug;

                return (
                  <button
                    className={
                      selected
                        ? "rounded-3xl border border-accent/30 bg-accent/5 p-5 text-left"
                        : "rounded-3xl border border-border bg-surface p-5 text-left"
                    }
                    key={skill.slug}
                    onClick={() => setSelectedSlug(skill.slug)}
                    type="button"
                  >
                    <p className="text-lg font-semibold text-text-primary">{skill.name}</p>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {skill.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">
                      <span className="rounded-full border border-border px-2 py-1">
                        {skill.category}
                      </span>
                      {skill.version ? (
                        <span className="rounded-full border border-border px-2 py-1">
                          v{skill.version}
                        </span>
                      ) : null}
                      {skill.license ? (
                        <span className="rounded-full border border-border px-2 py-1">
                          {skill.license}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          }
        />
      ) : null}
    </div>
  );
}

function SkillDetail(props: {
  skill: NonNullable<ReturnType<typeof useAgentCatalogQuery>["data"]>["builtInSkills"][number];
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-lg font-semibold text-text-primary">{props.skill.name}</p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{props.skill.description}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
        <span className="rounded-full border border-border px-2 py-1">{props.skill.category}</span>
        {props.skill.version ? (
          <span className="rounded-full border border-border px-2 py-1">
            v{props.skill.version}
          </span>
        ) : null}
        {props.skill.compatibility ? (
          <span className="rounded-full border border-border px-2 py-1">
            {props.skill.compatibility}
          </span>
        ) : null}
      </div>
      {Object.keys(props.skill.metadata).length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">
          {Object.entries(props.skill.metadata).map(([key, value]) => (
            <p key={key}>
              <span className="font-medium text-text-primary">{key}:</span> {value}
            </p>
          ))}
        </div>
      ) : null}
      {props.skill.files.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-medium text-text-primary">Files</p>
          <ul className="mt-3 grid gap-2 text-sm text-text-secondary">
            {props.skill.files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.skill.detailsMarkdown ? (
        <pre className="overflow-auto rounded-2xl border border-border bg-terminal-bg p-4 text-sm text-terminal-fg whitespace-pre-wrap">
          {props.skill.detailsMarkdown}
        </pre>
      ) : null}
    </div>
  );
}

function readError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Built-in skills could not be loaded.";
}
