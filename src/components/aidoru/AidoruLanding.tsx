import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { ArrowUpRight, Bot, Layers3, Menu, MessageCircle, Sparkles, Swords, Users, WalletCards, X } from "lucide-react";
import { fetchCommunityBots, fetchCommunityOverview } from "@/lib/community.functions";

const destinations = [
  { href: "/cards", label: "Cards", icon: WalletCards },
  { href: "/journey", label: "Pokémon", icon: Sparkles },
  { href: "/battle", label: "Battle", icon: Swords },
  { href: "/guild", label: "Guilds", icon: Users },
  { href: "/reqbot", label: "Request bot", icon: Bot },
];

export function AidoruLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const fetchOverview = useServerFn(fetchCommunityOverview);
  const fetchBots = useServerFn(fetchCommunityBots);
  const overview = useQuery({
    queryKey: ["aidoru", "community-overview"],
    queryFn: fetchOverview,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const botsOverview = useQuery({
    queryKey: ["aidoru", "active-community-bots"],
    queryFn: fetchBots,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const stats = overview.data;
  const activeBots = botsOverview.data;
  const number = (value: number | null | undefined) =>
    typeof value === "number" ? new Intl.NumberFormat().format(value) : "—";

  return (
    <main className="anime-home">
      <div className="anime-home-noise" aria-hidden="true" />
      <header className="anime-home-header">
        <button
          type="button"
          className="anime-home-menu-button"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" />
        </button>
        <a className="anime-home-brand" href="/" aria-label="AIDORU home">
          <span>AIDORU</span>
          <small>ANIME COMMUNITY</small>
        </a>
        <nav className="anime-home-nav" aria-label="Main navigation">
          <a href="#community">Community</a>
          <a href="/cards">Cards</a>
          <a href="/journey">Pokémon</a>
          <a href="/battle">Battle</a>
          <a href="/guild">Guilds</a>
        </nav>
        <a className="anime-home-login" href="/login">
          Log in <ArrowUpRight className="size-4" />
        </a>
      </header>

      <div
        className={`anime-home-drawer ${menuOpen ? "is-open" : ""}`}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <button
          type="button"
          className="anime-home-drawer-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
        <aside className="anime-home-drawer-panel" aria-label="AIDORU navigation">
          <div className="anime-home-drawer-heading">
            <div><small>EXPLORE</small><strong>AIDORU</strong></div>
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
              <X className="size-5" />
            </button>
          </div>
          <nav>
            {[...destinations, { href: "#community", label: "Community", icon: Users }].map(({ href, label, icon: Icon }) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                <Icon className="size-5" />
                <span>{label}</span>
                <ArrowUpRight className="ml-auto size-4" />
              </a>
            ))}
            <a href="/login" onClick={() => setMenuOpen(false)}>
              <span className="anime-home-drawer-login">Log in</span>
              <ArrowUpRight className="ml-auto size-4" />
            </a>
          </nav>
        </aside>
      </div>

      <section className="anime-home-hero anime-home-hero-full">
        <motion.div
          className="anime-home-copy"
          initial={{ opacity: 0, x: -22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="anime-home-kicker"><span /> AIDORU COMMUNITY</p>
          <h1>Make your<br /><span>next move.</span></h1>
          <p className="anime-home-description">
            Collect cards, build your Pokémon party, battle, and meet the people
            behind the community—all with one connected account.
          </p>
          <div className="anime-home-actions">
            <a className="anime-home-primary" href="/login?mode=create">Create account <ArrowUpRight className="size-4" /></a>
            <a className="anime-home-secondary" href="#community">Join the community</a>
          </div>
          <div className="anime-home-links" aria-label="Explore AIDORU">
            {destinations.map(({ href, label, icon: Icon }) => (
              <a key={href} href={href}>
                <Icon className="size-4" />{label}<ArrowUpRight className="size-3.5 anime-home-link-arrow" />
              </a>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="anime-home-stats" aria-labelledby="community-stats-title">
        <div className="anime-home-section-heading">
          <p className="anime-home-kicker"><span /> THE COMMUNITY, LIVE</p>
          <h2 id="community-stats-title">Built by players.<br /><em>Growing together.</em></h2>
          <p>Live totals from the shared AIDORU database, plus the bots that keep the community connected.</p>
        </div>
        <div className="anime-home-stat-grid">
          <article className="anime-home-stat-card">
            <span className="anime-home-stat-icon"><Layers3 className="size-5" /></span>
            <small>CARDS COLLECTED</small>
            <strong>{number(stats?.cardsCollected)}</strong>
            <span>Across the collection</span>
          </article>
          <article className="anime-home-stat-card">
            <span className="anime-home-stat-icon"><Users className="size-5" /></span>
            <small>REGISTERED ACCOUNTS</small>
            <strong>{number(stats?.accounts)}</strong>
            <span>Registered community members</span>
          </article>
          <article className="anime-home-stat-card anime-home-bot-card">
            <span className="anime-home-stat-icon"><MessageCircle className="size-5" /></span>
            <small>COMMUNITY BOTS</small>
            <strong>{number(activeBots?.length)}</strong>
            <div className="anime-home-bot-list">
              {activeBots?.map((bot) => <span key={`${bot.platform}:${bot.name}`}><b />{bot.name}<small>{bot.platform}</small></span>)}
              {botsOverview.isLoading && <span className="anime-home-bot-empty">Checking live status…</span>}
              {activeBots?.length === 0 && <span className="anime-home-bot-empty">No bots online right now</span>}
              {activeBots === null && <span className="anime-home-bot-empty">Live bot status is unavailable</span>}
            </div>
          </article>
        </div>
        {overview.isError && <p className="anime-home-stats-note">Live totals are temporarily unavailable. The community links below still work.</p>}
      </section>

      <section className="anime-home-community" id="community" aria-labelledby="community-title">
        <div className="anime-home-community-copy">
          <p className="anime-home-kicker"><span /> FIND YOUR PEOPLE</p>
          <h2 id="community-title">The next chapter<br /><em>is better together.</em></h2>
          <p>Join the AIDORU community for announcements, card drops, Pokémon, battles, and help from other players.</p>
        </div>
        <div className="anime-home-community-actions">
          <a className="anime-home-community-link whatsapp" href="https://chat.whatsapp.com/LPAJoRnzzdaKkHAyBGQytg" target="_blank" rel="noreferrer">
            <MessageCircle className="size-5" />
            <span><strong>Join WhatsApp</strong><small>Open the community group</small></span>
            <ArrowUpRight className="ml-auto size-4" />
          </a>
          {stats?.discordInvite ? (
            <a className="anime-home-community-link discord" href={stats.discordInvite} target="_blank" rel="noreferrer">
              <DiscordMark />
              <span><strong>Join Discord</strong><small>Invite synced from the Aidoru server</small></span>
              <ArrowUpRight className="ml-auto size-4" />
            </a>
          ) : (
            <div className="anime-home-community-link discord is-unavailable" aria-live="polite">
              <DiscordMark />
              <span><strong>Discord invite syncing</strong><small>The Aidoru bot will publish the current server invite</small></span>
            </div>
          )}
        </div>
      </section>

      <footer className="anime-home-footer">
        <span>AIDORU · COLLECT · EXPLORE · CONNECT</span>
        <a href="#">Back to top ↑</a>
      </footer>
    </main>
  );
}

function DiscordMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19.7 5.2a18.5 18.5 0 0 0-4.6-1.4l-.6 1.2a17 17 0 0 0-5 0L8.9 3.8a18.5 18.5 0 0 0-4.6 1.4C1.4 9.4.6 13.5 1 17.5a18.7 18.7 0 0 0 5.7 2.9l1.2-2a12.2 12.2 0 0 1-1.9-.9l.5-.4a13.4 13.4 0 0 0 11 0l.5.4a12.2 12.2 0 0 1-1.9.9l1.2 2a18.7 18.7 0 0 0 5.7-2.9c.5-4.6-.8-8.6-3.3-12.3ZM8.8 14.7c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 .9 2 2.2-.9 2.2-2 2.2Zm6.4 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 .9 2 2.2-.9 2.2-2 2.2Z" />
    </svg>
  );
}
