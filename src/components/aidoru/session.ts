import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSession, logout } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";

export const sessionKey = ["aidoru", "session"] as const;

export function useSession() {
  const fetchSession = useServerFn(getSession);
  return useQuery<PublicUser | null>({
    queryKey: sessionKey,
    queryFn: () => fetchSession(),
    staleTime: 10_000,
  });
}

/** Writes a fresh user object returned by a mutation into the session cache. */
export function useSessionWriter() {
  const queryClient = useQueryClient();
  return (user: PublicUser) => queryClient.setQueryData(sessionKey, user);
}

export function useLogout() {
  const queryClient = useQueryClient();
  const signOut = useServerFn(logout);
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.setQueryData(sessionKey, null);
      queryClient.clear();
    },
  });
}
