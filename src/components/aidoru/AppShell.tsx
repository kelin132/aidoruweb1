import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Sparkles,
  ShoppingBag,
  Users,
  Dices,
  LogOut,
  Coins,
  Landmark,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { AuroraField } from "./AuroraField";
import { useLogout, useSession } from "./session";
import { Sprite } from "./Sprite";
import { ConnectionNotice } from "./ConnectionNotice";
import { formatCoins, levelProgress, rankFromLevel } from "@/lib/game";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/journey", label: "Journey", icon: Sparkles },
  { to: "/mart", label: "Mart", icon: ShoppingBag },
  { to: "/guild", label: "Guild", icon: Users },
  { to: "/arcade", label: "Arcade", icon: Dices },
] as const;

function NavOrb({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link to={to} aria-label={label} className="group relative flex flex-col items-center gap-1.5">
      <span
        className={cn(
          "relative grid size-12 place-items-center rounded-full border transition-all duration-400 md:size-13",
          active
            ? "border-neon-cyan/60 bg-gradient-brand glow-pink scale-105"
            : "glass border-border group-hover:border-neon-cyan/40 group-hover:scale-105",
        )}
      >
        {active && (
          <span className="animate-halo border-neon-cyan absolute inset-0 rounded-full border" />
        )}
        <Icon className={cn("size-5", active ? "text-foreground" : "text-muted-foreground")} />
      </span>
      <span
        className={cn(
          "font-display text-[10px] tracking-[0.16em] uppercase transition-colors",
          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isLoading && user === null) void navigate({ to: "/", replace: true });
  }, [isLoading, user, navigate]);

  if (sessionError) {
    return <ConnectionNotice onRetry={() => window.location.reload()} />;
  }

  if (isLoading || !user) {
    return (
      <div className="relative min-h-screen">
        <AuroraField />
        <div className="flex min-h-screen items-center justify-center">
          <div className="glass animate-float-soft rounded-full px-8 py-4">
            <span className="font-display text-gradient-brand text-sm tracking-[0.3em] uppercase">
              Loading Aidoru
            </span>
          </div>
        </div>
      </div>
    );
  }

  const progress = levelProgress(user.xp);

  return (
    <div className="relative min-h-screen pb-28">
      <AuroraField />

      <header className="sticky top-0 z-40 px-3 pt-3 md:px-6 md:pt-5">
        <div className="glass-strong mx-auto flex max-w-7xl flex-wrap items-center gap-4 rounded-3xl px-4 py-3 md:px-6">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="bg-gradient-brand glow-pink grid size-10 place-items-center rounded-full">
              <Sparkles className="size-5" />
            </span>
            <span className="font-display text-gradient-brand text-xl leading-none font-bold tracking-[0.2em]">
              AIDORU
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <div className="glass flex items-center gap-2 rounded-full px-3 py-1.5">
              <Coins className="text-neon-pink size-4" />
              <span className="font-mono-ui text-sm font-semibold">{formatCoins(user.coins)}</span>
            </div>
            <div className="glass hidden items-center gap-2 rounded-full px-3 py-1.5 sm:flex">
              <Landmark className="text-neon-cyan size-4" />
              <span className="font-mono-ui text-sm font-semibold">{formatCoins(user.bank)}</span>
            </div>

            <div className="glass flex items-center gap-3 rounded-full py-1 pr-3 pl-1">
              <span className="border-neon-cyan/40 grid size-9 place-items-center overflow-hidden rounded-full border">
                <Sprite name={user.avatar} alt="" className="size-9" />
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="text-xs font-semibold">{user.name}</p>
                <p className="text-muted-foreground font-mono-ui text-[10px] tracking-widest uppercase">
                  Lv {progress.level} · {rankFromLevel(progress.level)}
                </p>
              </div>
            </div>

            <button
              onClick={() => logout.mutate()}
              aria-label="Sign out"
              className="glass glass-hover hover:text-destructive text-muted-foreground grid size-9 place-items-center rounded-full"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 pt-8 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm">{subtitle}</p>}
        </motion.div>

        <div className="mt-8">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
        <div className="glass-strong flex items-end gap-4 rounded-full px-5 py-3 md:gap-7 md:px-8">
          {NAV.map((item) => (
            <NavOrb key={item.to} {...item} active={pathname === item.to} />
          ))}
        </div>
      </nav>
    </div>
  );
}
