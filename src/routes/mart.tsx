import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ShoppingBag, WalletCards } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession } from "@/components/aidoru/session";
import { fetchShopItems } from "@/lib/aidoru.functions";
import { formatCoins, type ShopItem } from "@/lib/game";

const EMPTY_ITEMS: ShopItem[] = [];

export const Route = createFileRoute("/mart")({
  head: () => ({
    meta: [
      { title: "Pokémon Mart — AIDORU" },
      {
        name: "description",
        content: "Browse the live Kelin-MD2 Pokémon Mart catalog and buy items in WhatsApp.",
      },
    ],
  }),
  component: MartPage,
});

function MartPage() {
  const { data: user } = useSession();
  const fetchItems = useServerFn(fetchShopItems);
  const query = useQuery({ queryKey: ["aidoru", "items"], queryFn: fetchItems, retry: false });
  const [filter, setFilter] = useState("all");
  const items = query.data ?? EMPTY_ITEMS;
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  );
  const filtered = items.filter((item) => filter === "all" || item.category === filter);

  return (
    <AppShell
      title="Pokémon Mart"
      subtitle="The actual Kelin-MD2 catalogue, mirrored here for browsing."
    >
      <div className="space-y-7">
        <section className="hof-panel flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
          <div>
            <p className="hof-kicker">Live stock index</p>
            <h2 className="hof-heading mt-1 text-3xl">Browse the Mart</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Use <span className="text-cyan-200">.mart page &lt;number&gt;</span> in WhatsApp to
              see the same pages, then{" "}
              <span className="text-cyan-200">.mart buy &lt;number&gt; [qty]</span> to purchase.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <p className="hof-label">Wallet</p>
              <p className="hof-value">{formatCoins(user?.coins ?? 0)}</p>
            </div>
            <WalletCards className="size-9 text-cyan-300" />
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              data-active={filter === category}
              onClick={() => setFilter(category)}
              className="hof-tab shrink-0 px-4 py-2 font-mono-ui text-[10px] font-bold tracking-[0.16em] uppercase"
            >
              {category}
            </button>
          ))}
        </div>

        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Loading the live Mart catalogue…</p>
        )}
        {query.isError && (
          <p className="text-sm text-muted-foreground">
            The Mart catalogue is unavailable until the shared database is reachable.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <MartCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function MartCard({ item }: { item: ShopItem }) {
  return (
    <article className="hof-panel group flex min-h-[220px] flex-col p-4 transition hover:-translate-y-1 hover:border-cyan-300/45">
      <div className="flex items-start gap-4">
        <div className="hof-image grid size-20 shrink-0 place-items-center rounded-2xl border border-white/10 p-3">
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="size-full object-contain transition group-hover:scale-110"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="hof-kicker">#{item.index}</span>
            <span className="font-mono-ui text-[10px] text-muted-foreground uppercase">
              P{item.page}
            </span>
          </div>
          <h3 className="mt-1 font-display text-2xl font-bold leading-none">
            {item.emoji} {item.name}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4">
        <span className="font-mono-ui text-xs text-cyan-200">${item.price.toLocaleString()}</span>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 font-mono-ui text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          <ShoppingBag className="size-3" /> .mart buy {item.index}
        </span>
      </div>
    </article>
  );
}
