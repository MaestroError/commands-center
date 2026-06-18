import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { Specialist } from "@cc/shared/schemas";

import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { useSpecialistMutations, useSpecialistsQuery } from "@/hooks/use-specialists-query";

const EMPTY_SPECIALISTS: Specialist[] = [];

export function SpecialistsPage() {
  const specialistsQuery = useSpecialistsQuery();
  const specialistMutations = useSpecialistMutations();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Specialist>();
  const deferredSearch = useDeferredValue(search);
  const specialists = specialistsQuery.data ?? EMPTY_SPECIALISTS;
  const filteredSpecialists = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    if (query.length === 0) {
      return specialists;
    }

    return specialists.filter((specialist) => {
      const haystack = `${specialist.name} ${specialist.role}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [specialists, deferredSearch]);

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link className="cc-button" to="/specialists/new">
            Create specialist
          </Link>
        }
        description="Browse, search, edit, delete, and launch specialists."
        eyebrow="Specialists"
        title="All workspace specialists"
      />

      <section className="cc-panel p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Specialist directory</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Search by specialist name or role, then jump straight into chat or editing.
            </p>
          </div>
          <label className="block w-full max-w-md" htmlFor="specialist-search-input">
            <span className="sr-only">Search specialists</span>
            <input
              className="cc-input"
              id="specialist-search-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or role"
              value={search}
            />
          </label>
        </div>
      </section>

      {specialistsQuery.isLoading ? <LoadingState testId="specialists-loading" /> : null}
      {specialistsQuery.error ? (
        <ErrorState
          action={
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void specialistsQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          }
          description={readError(specialistsQuery.error)}
          title="Specialists could not be loaded."
        />
      ) : null}

      {!specialistsQuery.isLoading && !specialistsQuery.error && specialists.length === 0 ? (
        <EmptyState
          action={
            <Link className="cc-button" to="/specialists/new">
              Create your first specialist
            </Link>
          }
          description="Add a specialist with a default model and built-in skills to start building direct chat workflows."
          title="No specialists yet"
        />
      ) : null}

      {!specialistsQuery.isLoading &&
      !specialistsQuery.error &&
      specialists.length > 0 &&
      filteredSpecialists.length === 0 ? (
        <EmptyState
          description="Try a different search term or clear the current filter to see all available specialists."
          title="No specialists match this search"
        />
      ) : null}

      {!specialistsQuery.isLoading && !specialistsQuery.error && filteredSpecialists.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSpecialists.map((specialist) => (
            <article className="cc-panel flex min-h-72 flex-col p-5" key={specialist.id}>
              <div className="flex items-start gap-4">
                <SpecialistAvatar iconPath={specialist.iconPath} name={specialist.name} size="lg" />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-text-primary">
                    {specialist.name}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">{specialist.role}</p>
                </div>
              </div>

              <p className="mt-5 line-clamp-4 text-sm leading-6 text-text-secondary">
                {specialist.instructions}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
                  {specialist.defaultModel}
                </span>
                {[
                  ...specialist.capabilities.builtInSkills,
                  ...(specialist.capabilities.workspaceSkills ?? []),
                ].map((skill) => (
                  <span
                    className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary"
                    key={skill}
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                <Link className="cc-button" to={`/chat/${specialist.slug}`}>
                  Open chat
                </Link>
                <Link
                  className="cc-button cc-button-secondary"
                  to={`/specialists/${specialist.slug}/edit`}
                >
                  Edit
                </Link>
                <Link
                  className="cc-button cc-button-secondary"
                  to={`/files?root=workspace&path=${encodeURIComponent(
                    `sessions/specialists/${specialist.id}`,
                  )}`}
                >
                  Session archive
                </Link>
                <button
                  className="cc-button cc-button-danger"
                  onClick={() => setPendingDelete(specialist)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
          onClick={() => setPendingDelete(undefined)}
        >
          <section
            className="cc-panel w-full max-w-lg p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-text-primary">
              Delete {pendingDelete.name}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              This archives the specialist and moves its workspace data out of the active
              specialists folder.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                className="cc-button cc-button-danger"
                onClick={() => void handleDelete()}
                type="button"
              >
                Confirm delete
              </button>
              <button
                className="cc-button cc-button-secondary"
                onClick={() => setPendingDelete(undefined)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );

  async function handleDelete() {
    if (!pendingDelete) {
      return;
    }

    await specialistMutations.archive.mutateAsync(pendingDelete.id);
    setPendingDelete(undefined);
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Specialists could not be loaded.";
}
