import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  GalleryHorizontalEnd,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShoppingBag,
  Sparkles,
  Swords,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLogout, useSession } from "./session";
import { UserAvatar } from "./UserAvatar";
import { formatCompactCoins, rankFromLevel, trainerLevelProgress } from "@/lib/game";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Leaderboards", icon: LayoutDashboard },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/cards", label: "Cards", icon: GalleryHorizontalEnd },
  { to: "/journey", label: "Pokémon", icon: Sparkles },
  { to: "/mart", label: "Mart", icon: ShoppingBag },
  { to: "/shop", label: "Shop", icon: Package },
  { to: "/guild", label: "Guild", icon: Users },
  { to: "/battle", label: "Battle", icon: Swords },
] as const;

type AppRoute =
  | "/dashboard"
  | "/profile"
  | "/cards"
  | "/journey"
  | "/mart"
  | "/shop"
  | "/guild"
  | "/battle"
  | "/auctions"
  | "/daily";

type MobileNavLink = { to: AppRoute; label: string; icon: LucideIcon };
type MobileNavItem =
  | ({ type: "link" } & MobileNavLink)
  | { type: "group"; label: string; icon: LucideIcon; items: MobileNavLink[] };

const MOBILE_NAV: MobileNavItem[] = [
  { type: "link", to: "/profile", label: "Profile", icon: UserRound },
  { type: "link", to: "/shop", label: "Shop", icon: Package },
  { type: "link", to: "/mart", label: "Mart", icon: ShoppingBag },
  {
    type: "group",
    label: "Cards",
    icon: GalleryHorizontalEnd,
    items: [
      { to: "/cards", label: "My cards", icon: GalleryHorizontalEnd },
      { to: "/auctions", label: "Card auctions", icon: ShoppingBag },
      { to: "/daily", label: "Daily rewards", icon: Sparkles },
    ],
  },
  {
    type: "group",
    label: "Guilds",
    icon: Users,
    items: [
      { to: "/guild", label: "All guilds", icon: Users },
    ],
  },
  {
    type: "group",
    label: "Pokémon",
    icon: Sparkles,
    items: [
      { to: "/journey", label: "Pokémon journey", icon: Sparkles },
    ],
  },
  { type: "link", to: "/battle", label: "Battle", icon: Swords },
  { type: "link", to: "/dashboard", label: "Leaderboard", icon: LayoutDashboard },
];

export function AppShell({
  title,
  subtitle,
  children,
  standalone = false,
  hidePageHeading = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  standalone?: boolean;
  hidePageHeading?: boolean;
}) {
  const { data: user, error: sessionError, isLoading, isFetching } = useSession();
  const logout = useLogout();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("Guilds");
  const isDiscordCallback =
    typeof window !== "undefined" &&
    pathname === "/profile" &&
    new URLSearchParams(window.location.search).get("discord") === "callback";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (!isLoading && !isFetching && !sessionError && user === null) {
      const isBattleRoute = pathname === "/battle" || pathname.startsWith("/battle/");
      const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
      const isLoginRoute = pathname === "/login";
      const isPublicRoute = isBattleRoute || isDashboardRoute || isDiscordCallback || isLoginRoute;

      if (!isPublicRoute) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      }
    }
  }, [isLoading, isFetching, sessionError, user, pathname]);

  const progress = user ? trainerLevelProgress(user.trainerLevel, user.trainerXp) : null;
  return (
    <div className={cn("min-h-screen aidoru-app", standalone && "aidoru-app-standalone", standalone ? "bg-[#0b0d11]" : "bg-background", `aidoru-app-${pathname.replace(/^\//, "").replaceAll("/", "-") || "home"}`)}>
      <header className={cn("sticky top-0 z-40 border-b border-white/10 px-3 py-3 backdrop-blur-xl sm:px-6", standalone ? "bg-[#0b0d11]/90" : "bg-background/85")}>
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          {!standalone && (
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:border-cyan-300/45 hover:text-cyan-200 sm:hidden"
          >
            <Menu className="size-5" />
          </button>

          )}
          <Link to={standalone ? "/auctions" : "/dashboard"} className="flex shrink-0 items-center gap-3">
            <span className="hof-heading text-2xl tracking-[0.16em]">AIDORU</span>
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {standalone && (
              <Link to="/dashboard" className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-200/40 hover:text-cyan-100">
                ← AIDORU
              </Link>
            )}
            {user && (
              <>
                <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 sm:flex">
                  <span className="hof-label">$</span>
                  <span className="font-mono-ui text-xs text-cyan-200">{formatCompactCoins(user.coins)}</span>
                </div>
                {progress && (
                  <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 md:flex">
                    <span className="hof-label">LV {progress.level}</span>
                    <span className="font-mono-ui text-xs text-muted-foreground">
                      {rankFromLevel(progress.level)}
                    </span>
                  </div>
                )}
                <Link to="/profile" aria-label="Open your profile" className="rounded-full outline-none ring-cyan-300/60 focus-visible:ring-2">
                  <UserAvatar name={user.name} src={user.avatarUrl} videoSrc={user.avatarVideoUrl} frame={user.profileFrame} className="size-10 border-cyan-300/50" />
                </Link>
                <button
                  type="button"
                  onClick={() => logout.mutate()}
                  aria-label="Sign out"
                  className="hidden size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition hover:text-cyan-200 sm:grid"
                >
                  <LogOut className="size-4" />
                </button>
              </>
            )}
            {!user && !sessionError && (
              <a
                href="/login"
                onClick={(event) => {
                  event.preventDefault();
                  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
                }}
                className="bg-gradient-brand text-foreground inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>

      {!standalone && (
        <aside className="aidoru-sidebar" aria-label="AIDORU navigation">
          <Link to="/dashboard" className="aidoru-sidebar-brand">
            <span className="aidoru-sidebar-brand-mark">A</span>
            <span><strong>AIDORU</strong><small>COMMUNITY</small></span>
          </Link>
          <p className="aidoru-sidebar-caption">YOUR SPACE</p>
          <nav className="aidoru-sidebar-nav">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                aria-current={pathname === to ? "page" : undefined}
                className={cn("aidoru-sidebar-link", pathname === to && "is-active")}
              >
                <Icon className="size-[1.05rem]" />
                <span>{label}</span>
                {pathname === to && <span className="aidoru-sidebar-active-mark" />}
              </Link>
            ))}
          </nav>
          <div className="aidoru-sidebar-bottom">
            {user ? (
              <>
                <Link to="/profile" className="aidoru-sidebar-user">
                  <UserAvatar
                    name={user.name}
                    src={user.avatarUrl}
                    videoSrc={user.avatarVideoUrl}
                    frame={user.profileFrame}
                    className="size-11 border-cyan-300/45"
                  />
                  <span className="min-w-0 flex-1">
                    <strong>{user.name}</strong>
                    <small>{formatCompactCoins(user.coins)} RYU</small>
                  </span>
                  <ChevronRight className="size-4 opacity-50" />
                </Link>
                <button
                  type="button"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                  className="aidoru-sidebar-signout"
                >
                  <LogOut className="size-4" />
                  {logout.isPending ? "Signing out…" : "Sign out"}
                </button>
              </>
            ) : (
              <Link to="/login" className="aidoru-sidebar-signout">
                <UserRound className="size-4" /> Sign in
              </Link>
            )}
          </div>
        </aside>
      )}

      {!standalone && (
      <div
        className={cn(
          "aidoru-mobile-menu fixed inset-0 z-50 transition",
          menuOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity",
            menuOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "aidoru-mobile-menu-panel absolute left-0 top-0 flex h-full min-h-0 w-[min(88vw,22rem)] flex-col overflow-hidden border-r border-cyan-300/15 bg-[#07151f]/96 p-5 shadow-2xl backdrop-blur-2xl transition-[transform,opacity] duration-300 ease-out",
            menuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="hof-kicker">Menu</p>
              <p className="hof-heading mt-1 text-2xl">AIDORU</p>
            </div>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMenuOpen(false)}
              className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition hover:border-cyan-300/45 hover:text-cyan-200"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="mt-8 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-3 pr-1">
            {MOBILE_NAV.map((item) => {
              if (item.type === "link") {
                const Icon = item.icon;
                const active = pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "menu-nav-link flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 transition duration-200",
                      active
                        ? "border-cyan-300/55 bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]"
                        : "border-transparent text-muted-foreground hover:border-white/10 hover:bg-white/5 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1 font-display text-lg font-semibold">{item.label}</span>
                    <ChevronRight className="size-4 opacity-45" />
                  </Link>
                );
              }

              const Icon = item.icon;
              const isOpen = openSection === item.label || item.items.some(({ to }) => pathname === to);
              return (
                <section key={item.label} className="menu-nav-section">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenSection(isOpen ? null : item.label)}
                    className={cn(
                      "menu-nav-link flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition duration-200",
                      isOpen
                        ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                        : "border-transparent text-muted-foreground hover:border-white/10 hover:bg-white/5 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1 font-display text-lg font-semibold">{item.label}</span>
                    <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="menu-nav-children ml-5 mt-2 space-y-1 border-l border-cyan-200/20 pl-3">
                      {item.items.map(({ to, label, icon: ChildIcon }) => (
                        <Link
                          key={to}
                          to={to}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "menu-nav-child flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition",
                            pathname === to
                              ? "bg-cyan-300/12 text-cyan-100"
                              : "text-slate-300 hover:bg-white/5 hover:text-white",
                          )}
                        >
                          <ChildIcon className="size-4 text-cyan-200/80" />
                          {label}
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="menu-signout mt-auto flex items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/7 px-4 py-3 font-display text-base font-semibold text-rose-100 transition hover:bg-rose-300/12 disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
        </aside>
      </div>
      )}


      <main key={pathname} className="aidoru-route-main mx-auto max-w-[1180px] px-3 pt-8 sm:px-6 sm:pt-10">
        {!standalone && !hidePageHeading && (
          <div className="mb-7">
            <p className="hof-kicker">AIDORU</p>
            <h1 className="hof-heading mt-1 text-4xl sm:text-5xl">{title}</h1>
            {subtitle && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        {children}
      </main>


    </div>
  );
}

export function PokeballMark({ small = false }: { small?: boolean }) {
  return <span className={`pokeball-mark ${small ? "pokeball-mark-small" : ""}`} aria-hidden="true"><span className="pokeball-mark-band" /><span className="pokeball-mark-button" /></span>;
}
