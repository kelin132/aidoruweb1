import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, Menu, ShoppingBag, Sparkles, Users, Dices } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useLogout, useSession } from "./session";
import { UserAvatar } from "./UserAvatar";
import { ConnectionNotice } from "./ConnectionNotice";
import { formatCoins, levelProgress, rankFromLevel } from "@/lib/game";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Hall of Fame", icon: LayoutDashboard },
  { to: "/journey", label: "Journey", icon: Sparkles },
  { to: "/mart", label: "Mart", icon: ShoppingBag },
  { to: "/guild", label: "Guild", icon: Users },
  { to: "/arcade", label: "Arcade", icon: Dices },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { data: user, error: sessionError, isLoading } = useSession();
  const navigate = useNavigate();
  const logout = useLogout();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (!isLoading && user === null) void navigate({ to: "/", replace: true });
  }, [isLoading, user, navigate]);

  if (sessionError) return <ConnectionNotice onRetry={() => window.location.reload()} />;
  if (isLoading || !user)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="hof-kicker">Loading AIDORU</span>
      </div>
    );

  const progress = levelProgress(user.xp);
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85 px-3 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          <button
            type="button"
            aria-label="Open navigation"
            className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/5 sm:hidden"
          >
            <Menu className="size-5" />
          </button>
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
              <Sparkles className="size-5" />
            </span>
            <span className="hof-heading text-2xl tracking-[0.16em]">AIDORU</span>
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 sm:flex">
              <span className="hof-label">$</span>
              <span className="font-mono-ui text-xs text-cyan-200">{formatCoins(user.coins)}</span>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 md:flex">
              <span className="hof-label">LV {progress.level}</span>
              <span className="font-mono-ui text-xs text-muted-foreground">
                {rankFromLevel(progress.level)}
              </span>
            </div>
            <UserAvatar
              name={user.name}
              src={user.avatarUrl}
              className="size-10 border-cyan-300/50"
            />
            <button
              type="button"
              onClick={() => logout.mutate()}
              aria-label="Sign out"
              className="hidden size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition hover:text-cyan-200 sm:grid"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-3 pt-8 sm:px-6 sm:pt-10">
        <div className="mb-7">
          <p className="hof-kicker">AIDORU network</p>
          <h1 className="hof-heading mt-1 text-4xl sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-3 z-40 px-3 sm:bottom-5">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-2xl border border-white/10 bg-[#11151a]/95 px-2 py-2 shadow-2xl backdrop-blur-xl sm:px-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 transition",
                  active
                    ? "bg-cyan-300/10 text-cyan-200"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="truncate font-display text-xs font-semibold tracking-wide">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
