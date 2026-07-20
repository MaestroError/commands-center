import { Alert } from "@/components/ui/alert";
import { Surface } from "@/components/ui/surface";

type StateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  testId?: string;
};

export function LoadingState(props: { testId?: string }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid={props.testId}>
      {Array.from({ length: 6 }).map((_, index) => (
        <Surface className="min-h-56 animate-pulse bg-surface-elevated/70" key={String(index)} />
      ))}
    </section>
  );
}

export function ErrorState(props: StateProps) {
  return (
    <Alert asChild>
      <section
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        data-testid={props.testId}
      >
        <div>
          <p className="font-semibold">{props.title}</p>
          <p className="mt-1 text-sm text-danger-contrast/90">{props.description}</p>
        </div>
        {props.action ? <div>{props.action}</div> : null}
      </section>
    </Alert>
  );
}

export function EmptyState(props: StateProps) {
  return (
    <Surface asChild variant="empty">
      <section data-testid={props.testId}>
        <div>
          <p className="text-lg font-semibold text-text-primary">{props.title}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            {props.description}
          </p>
        </div>
        {props.action ? <div className="mt-5">{props.action}</div> : null}
      </section>
    </Surface>
  );
}
