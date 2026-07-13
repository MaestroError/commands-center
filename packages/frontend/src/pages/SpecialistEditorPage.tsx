import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { CreateSpecialistInput, UpdateSpecialistInput } from "@cc/shared/schemas";

import { SpecialistForm } from "@/components/specialists/SpecialistForm";
import {
  specialistFormSlug,
  createSpecialistFormFromSpecialist,
  createEmptySpecialistForm,
  resolveCustomToolOverwriteSlugs,
  validateSpecialistForm,
  type SpecialistFormErrors,
  type SpecialistFormState,
} from "@/lib/specialist-form";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { useSpecialistCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import {
  useSpecialistCatalogQuery,
  useSpecialistMutations,
  useSpecialistQuery,
  useSpecialistsQuery,
} from "@/hooks/use-specialists-query";

type SpecialistEditorPageProps = {
  mode: "create" | "edit";
};

type AppliedSpecialistSnapshot = {
  key: string;
  updatedAtMs: number;
};

export function SpecialistEditorPage(props: SpecialistEditorPageProps) {
  const params = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const catalogQuery = useSpecialistCatalogQuery();
  const specialistsQuery = useSpecialistsQuery();
  const specialistQuery = useSpecialistQuery(props.mode === "edit" ? params.slug : undefined);
  const specialistMutations = useSpecialistMutations();
  const [form, setForm] = useState<SpecialistFormState>(createEmptySpecialistForm());
  const [errors, setErrors] = useState<SpecialistFormErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const appliedSnapshotRef = useRef<AppliedSpecialistSnapshot | undefined>(undefined);
  const catalog = catalogQuery.data;
  const specialists = specialistsQuery.data ?? [];
  const specialist = specialistQuery.data;
  const specialistCustomToolsQuery = useSpecialistCustomToolsQuery(specialist?.id);
  const hasProviderModels = (catalog?.providerModels.length ?? 0) > 0;

  useEffect(() => {
    if (!catalog) {
      return;
    }

    if (props.mode === "edit" && !specialist) {
      return;
    }

    const nextKey =
      props.mode === "create" ? "create" : `${specialist?.slug}:${specialist?.updatedAt}`;

    if (!nextKey) {
      return;
    }

    if (props.mode === "edit" && specialist?.updatedAt) {
      const nextUpdatedAtMs = Date.parse(specialist.updatedAt);
      const currentSnapshot = appliedSnapshotRef.current;

      if (
        currentSnapshot &&
        Number.isFinite(nextUpdatedAtMs) &&
        nextUpdatedAtMs < currentSnapshot.updatedAtMs
      ) {
        return;
      }
    }

    if (appliedSnapshotRef.current?.key === nextKey) {
      return;
    }

    appliedSnapshotRef.current = {
      key: nextKey,
      updatedAtMs:
        props.mode === "edit" && specialist?.updatedAt
          ? Date.parse(specialist.updatedAt)
          : Number.NaN,
    };
    setForm(createSpecialistFormFromSpecialist(catalog, specialist));
    setErrors({});
    setSaveError(undefined);
  }, [specialist, catalog, props.mode]);

  const catalogError = catalogQuery.error ? readError(catalogQuery.error) : undefined;
  const specialistError = specialistQuery.error ? readError(specialistQuery.error) : undefined;

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          props.mode === "edit" && specialist ? (
            <Link className="cc-button cc-button-secondary" to={`/chat/${specialist.slug}`}>
              Open chat
            </Link>
          ) : undefined
        }
        description="Create a new specialist or update an existing one using the same reusable workflow and workspace-backed configuration."
        eyebrow={props.mode === "create" ? "Create Specialist" : "Edit Specialist"}
        title={
          props.mode === "create" ? "Create specialist" : (specialist?.name ?? "Edit specialist")
        }
      />

      {catalogError ? (
        <ErrorState description={catalogError} title="Specialist catalog could not be loaded." />
      ) : null}
      {specialistError ? (
        <ErrorState description={specialistError} title="Specialist details could not be loaded." />
      ) : null}
      {catalogQuery.isLoading || (props.mode === "edit" && specialistQuery.isLoading) ? (
        <LoadingState />
      ) : null}

      {!catalogQuery.isLoading &&
      !catalogError &&
      props.mode === "edit" &&
      !specialist &&
      !specialistQuery.isLoading ? (
        <EmptyState
          description="The requested specialist slug no longer exists."
          title="Specialist not found"
        />
      ) : null}

      {!catalogQuery.isLoading && !catalogError && (props.mode === "create" || specialist) ? (
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <SpecialistForm
            agentId={specialist?.id}
            errors={errors}
            isSaving={specialistMutations.create.isPending || specialistMutations.update.isPending}
            mode={props.mode}
            onChange={(next) => {
              setForm(next);
              setErrors({});
              setSaveError(undefined);
            }}
            value={form}
          />

          <div className="flex flex-wrap gap-2">
            {saveError ? <p className="w-full text-sm text-danger">{saveError}</p> : null}
            <button
              className="cc-button"
              disabled={
                specialistMutations.create.isPending ||
                specialistMutations.update.isPending ||
                !hasProviderModels
              }
              type="submit"
            >
              {specialistMutations.create.isPending || specialistMutations.update.isPending
                ? "Saving..."
                : props.mode === "create"
                  ? "Create specialist"
                  : "Save changes"}
            </button>
            <Link className="cc-button cc-button-secondary" to="/specialists">
              Back to specialists
            </Link>
          </div>
        </form>
      ) : null}
    </div>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(undefined);

    const slugTaken = specialists.some(
      (entry) => entry.slug === specialistFormSlug(form.name) && entry.id !== specialist?.id,
    );
    const validation = validateSpecialistForm(form, { hasProviderModels, slugTaken });
    setErrors(validation);

    if (Object.values(validation).some(Boolean)) {
      return;
    }

    const overwriteSlugs = resolveCustomToolOverwriteSlugs(
      form.capabilities.customTools ?? [],
      specialistCustomToolsQuery.data ?? [],
    );

    if (overwriteSlugs === undefined) {
      return;
    }

    const payload: UpdateSpecialistInput = {
      name: form.name.trim(),
      role: form.role.trim(),
      instructions: form.instructions.trim(),
      defaultModel: form.defaultModel.trim(),
      iconPath: form.iconPath.trim() || undefined,
      customToolOverwriteSlugs: overwriteSlugs,
      capabilities: form.capabilities,
      rewriteAgentsMd: form.rewriteAgentsMd,
    };

    try {
      if (props.mode === "create") {
        await specialistMutations.create.mutateAsync(payload as CreateSpecialistInput);
        void navigate("/specialists", { replace: true });
        return;
      }

      if (!specialist) {
        return;
      }

      await specialistMutations.update.mutateAsync({ id: specialist.id, input: payload });
      void navigate("/specialists", { replace: true });
    } catch (error) {
      setSaveError(readError(error));
    }
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Specialist editor could not be loaded.";
}
