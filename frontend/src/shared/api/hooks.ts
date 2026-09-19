import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, paged } from "./client";

/** Список с распаковкой пагинации DRF. */
export function useList<T>(
  key: unknown[],
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
  enabled = true,
) {
  return useQuery({
    queryKey: key,
    queryFn: async () => paged<T>(await api.get(path, query)),
    enabled,
  });
}

export function useItem<T>(key: unknown[], path: string, enabled = true) {
  return useQuery({ queryKey: key, queryFn: () => api.get<T>(path), enabled });
}

/** Мутация с инвалидацией связанных ключей. */
export function useApiMutation<TData, TVars>(
  fn: (vars: TVars) => Promise<TData>,
  invalidate: unknown[][] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      invalidate.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}
