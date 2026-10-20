import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Menu, Sparkles, Swords, Users, WalletCards, X } from "lucide-react";

const destinations = [
  { href: "/cards", label: "Cards", icon: WalletCards },
  { href: "/journey", label: "Pokémon", icon: Sparkles },
  { href: "/battle", label: "Battle", icon: Swords },
  { href: "/guild", label: "Guilds", icon: Users },
];

export function AidoruLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
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
          <small>TRAINER NETWORK</small>
        </a>
        <nav className="anime-home-nav" aria-label="Main navigation">
          <a href="/dashboard">Community</a>
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
            {[...destinations, { href: "/dashboard", label: "Community", icon: Users }].map(({ href, label, icon: Icon }) => (
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

      <section className="anime-home-hero">
        <motion.div
          className="anime-home-copy"
          initial={{ opacity: 0, x: -22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="anime-home-kicker"><span /> YOUR TRAINER WORLD</p>
          <h1>Find your<br /><span>next world.</span></h1>
          <p className="anime-home-description">
            One trainer profile for your cards, Pokémon, battles and community.
            Pick up where you left off.
          </p>
          <div className="anime-home-actions">
            <a className="anime-home-primary" href="/login?mode=create">Create account <ArrowUpRight className="size-4" /></a>
            <a className="anime-home-secondary" href="/dashboard">Explore AIDORU</a>
          </div>
          <div className="anime-home-links" aria-label="Explore AIDORU">
            {destinations.map(({ href, label, icon: Icon }) => (
              <a key={href} href={href}>
                <Icon className="size-4" />{label}<ArrowUpRight className="size-3.5 anime-home-link-arrow" />
              </a>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="anime-home-art"
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.85, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <img src="/aidoru-login-library.webp" alt="Anime adventurers gathered in a fantasy library" fetchPriority="high" />
          <div className="anime-home-art-shade" />
          <div className="anime-home-art-caption">
            <small>COLLECT · EXPLORE · CONNECT</small>
            <strong>Your story,<br />one account.</strong>
          </div>
          <div className="anime-home-art-stamp">AIDORU<br /><span>ONLINE</span></div>
          <span className="anime-home-art-edge" />
        </motion.div>
      </section>
      <footer className="anime-home-footer">
        <span>TRAINER NETWORK · EST. FOR YOUR NEXT ADVENTURE</span>
        <span>01 / 04</span>
      </footer>
    </main>
  );
}
