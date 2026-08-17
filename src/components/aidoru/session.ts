import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSession, logout } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";

export const sessionKey = ["aidoru", "session"] as const;

export function useSession() {
  const fetchSession = useServerFn(getSession);
  return useQuery<PublicUser | null>({
    queryKey: sessionKey,
    queryFn: () =>
      Promise.race([
        fetchSession(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Session request timed out. Please refresh and try again.")), 12_000);
        }),
      ]),
    staleTime: 10_000,
    retry: (failureCount, error) => {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("not configured")) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
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
