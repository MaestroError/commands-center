import { useQuery } from "@tanstack/react-query";

import { listAgents } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useAgentsQuery() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => listAgents(),
  });
}
