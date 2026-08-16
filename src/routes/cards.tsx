import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Library, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/aidoru/AppShell";
import { fetchMyCards } from "@/lib/aidoru.functions";
import { formatCoins, type OwnedCard } from "@/lib/game";

export const Route = createFileRoute("/cards")({
  head: () => ({
    meta: [
      { title: "Card Vault — AIDORU" },
      { name: "description", content: "View your live anime card collection." },
    ],
  }),
  component: CardsPage,
});

function CardsPage() {
  return (
    <AppShell title="Card Vault" subtitle="Every claimed card from your live collection, arranged for the next showcase.">
      <CardsBody />
    </AppShell>
  );
}

function CardsBody() {
  const fetchCards = useServerFn(fetchMyCards);
  const [view, setView] = useState<"mine" | "global">("mine");
  const query = useQuery({ queryKey: ["aidoru", "cards", view], queryFn: () => fetchCards({ data: { scope: view } }), retry: false });
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("all");
  const cards = query.data ?? [];
  const tiers = ["all", ...new Set(cards.map((card) => card.tier.toLowerCase()))];
  const visible = useMemo(() => cards.filter((card) => {
    const haystack = `${card.name} ${card.series} ${card.tier}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (tier === "all" || card.tier.toLowerCase() === tier);
  }), [cards, search, tier]);

  return (
    <div className="aidoru-page aidoru-page-cards space-y-6 pb-10">
      <section className="hof-panel relative overflow-hidden p-5 sm:p-7">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hof-kicker">Collection archive</p>
            <h2 className="hof-heading mt-1 text-4xl">{view === "mine" ? "Your Cards" : "Global Card Index"}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">Browse the live <code>mn_users.cards</code> collection. Switch between your collection and every trainer’s public card index.</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
            {(["mine", "global"] as const).map((option) => <button key={option} type="button" onClick={() => setView(option)} className="hof-tab px-3 py-2 text-[10px] font-semibold uppercase" data-active={view === option}>{option === "mine" ? "My cards" : "All cards"}</button>)}
          </div>
          <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-right">
            <p className="hof-label">Cards owned</p>
            <p className="font-display text-3xl font-bold text-cyan-200">{cards.length}</p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
            <Search className="size-4 text-cyan-300" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or series" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tiers.map((value) => (
              <button key={value} type="button" onClick={() => setTier(value)} className="hof-tab whitespace-nowrap px-4 py-2 text-xs font-semibold" data-active={tier === value}>
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </section>

      {query.isLoading && <LoadingPanel />}
      {query.isError && <EmptyPanel title="Card vault unavailable" body="The live card collection could not be reached. Try refreshing once the shared database is online." />}
      {!query.isLoading && !query.isError && visible.length === 0 && <EmptyPanel title={cards.length ? "No cards match" : "No cards claimed yet"} body={cards.length ? "Try another search or tier filter." : "Claim cards in the bot and they will appear here automatically."} />}
      {visible.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((card, index) =>           <CardTile key={`${card.cardId}-${index}`} card={card} index={index} global={view === "global"} />)}
        </div>
      )}
    </div>
  );
}

function CardTile({ card, index, global }: { card: OwnedCard; index: number; global: boolean }) {
  const image = card.media && /^https?:\/\//.test(card.media) ? card.media : null;
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.025, 0.2) }} whileHover={{ y: -4 }} className="aidoru-card-tile group overflow-hidden rounded-2xl border border-white/12 bg-[#07151f]/85 shadow-xl">
      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-cyan-300/20 via-slate-950 to-fuchsia-300/10">
        {image ? <img src={image} alt={card.name} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid size-full place-items-center p-4 text-center"><Sparkles className="size-8 text-cyan-200" /><span className="font-display text-lg font-semibold">{card.name}</span></div>}
        <span className="absolute left-2 top-2 rounded-full border border-white/20 bg-black/60 px-2 py-1 font-mono-ui text-[9px] tracking-[0.14em] text-cyan-100">{card.tier || "COMMON"}</span>
      </div>
      <div className="p-3">
        <p className="truncate font-display text-lg font-bold">{card.name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{card.series} · #{card.index ?? index + 1}</p>
        {global && <p className="mt-1 truncate font-mono-ui text-[9px] uppercase tracking-[0.12em] text-fuchsia-200">Trainer: {card.ownerName || "Unknown"}</p>}
        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2">
          <span className="hof-label">Card value</span>
          <span className="font-mono-ui text-[10px] text-cyan-200">{formatCoins(card.price)}</span>
        </div>
      </div>
    </motion.article>
  );
}

function LoadingPanel() {
  return <div className="hof-panel py-16 text-center text-sm text-muted-foreground"><Library className="mx-auto mb-3 size-8 animate-pulse text-cyan-300" />Loading your live card vault…</div>;
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return <div className="hof-panel py-16 text-center"><Library className="mx-auto mb-3 size-8 text-cyan-300/70" /><p className="font-display text-2xl font-semibold">{title}</p><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p></div>;
}
