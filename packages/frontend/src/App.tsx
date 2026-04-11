import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { AppRouter } from "@/app/AppRouter";
import { ThemeProvider } from "@/context/ThemeProvider";
import { queryClient } from "@/lib/query-client";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
