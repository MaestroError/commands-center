import { PageHeader } from "@/components/common/PageHeader";
import { useTheme } from "@/context/use-theme";

export function ProfilePage() {
  const { theme, themes, setTheme } = useTheme();

  return (
    <div className="grid gap-4">
      <PageHeader
        description="Theme selection is available now and persists locally so later UX epics can inherit the chosen visual mood immediately."
        eyebrow="Profile"
        title="Personalize your workspace"
      />
      <section className="cc-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary">Theme</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Themes change the mood, not the layout or information architecture.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {themes.map((option) => (
            <button
              className={option === theme ? "cc-tab cc-tab-active" : "cc-tab"}
              key={option}
              onClick={() => setTheme(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
