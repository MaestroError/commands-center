import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHeader(props: PageHeaderProps) {
  return (
    <section className="cc-panel p-6">
      {props.eyebrow ? <p className="cc-eyebrow">{props.eyebrow}</p> : null}
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">{props.title}</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{props.description}</p>
        </div>
        {props.actions ? <div className="flex flex-wrap gap-2">{props.actions}</div> : null}
      </div>
    </section>
  );
}
