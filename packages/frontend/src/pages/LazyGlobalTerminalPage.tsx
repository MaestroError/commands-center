import { lazy, Suspense } from "react";

const GlobalTerminalPage = lazy(async () =>
  import("@/pages/GlobalTerminalPage").then((module) => ({ default: module.GlobalTerminalPage })),
);

export function LazyGlobalTerminalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[24rem] items-center justify-center text-sm text-text-secondary">
          Loading terminal...
        </div>
      }
    >
      <GlobalTerminalPage />
    </Suspense>
  );
}
