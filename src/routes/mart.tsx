import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ShoppingBag, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { fetchShopItems, purchaseItem } from "@/lib/aidoru.functions";
import { formatCoins, type ShopItem } from "@/lib/game";

const EMPTY_ITEMS: ShopItem[] = [];

export const Route = createFileRoute("/mart")({
  head: () => ({
    meta: [
      { title: "Pokémon Mart — AIDORU" },
      { name: "description", content: "Buy live Pokémon trainer items with your AIDORU wallet." },
    ],
  }),
  component: MartPage,
});

function MartPage() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const fetchItems = useServerFn(fetchShopItems);
  const purchase = useServerFn(purchaseItem);
  const query = useQuery({ queryKey: ["aidoru", "items"], queryFn: fetchItems, retry: false });
  const [filter, setFilter] = useState("all");
  const items = query.data ?? EMPTY_ITEMS;
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  );
  const filtered = items.filter((item) => filter === "all" || item.category === filter);
  const buyMutation = useMutation({
    mutationFn: (data: { itemId: string; qty: number }) => purchase({ data }),
    onSuccess: (result) => {
      writeSession(result.user);
      toast.success(`Bought ${result.itemName} · -${formatCoins(result.spent)} coins`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Pokémon Mart"
      subtitle="Buy the same trainer items your bot uses, now from your live wallet."
    >
      <div className="space-y-7">
        <section className="hof-panel flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
          <div>
            <p className="hof-kicker">Live trainer shop</p>
            <h2 className="hof-heading mt-1 text-3xl">Stock your journey</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Purchases update the same Pokémon trainer inventory used by your WhatsApp battle
              system.
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
            <MartCard
              key={item.id}
              item={item}
              pending={buyMutation.isPending}
              onBuy={(qty) => buyMutation.mutate({ itemId: item.id, qty })}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function MartCard({
  item,
  pending,
  onBuy,
}: {
  item: ShopItem;
  pending: boolean;
  onBuy: (qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  return (
    <article className="hof-panel group flex min-h-[280px] flex-col p-4 transition hover:-translate-y-1 hover:border-cyan-300/45">
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
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="flex items-center justify-between">
          <span className="font-mono-ui text-xs text-cyan-200">
            {formatCoins(item.price)} coins
          </span>
          <span className="font-mono-ui text-[10px] text-muted-foreground uppercase">
            {item.category}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            aria-label={`Quantity for ${item.name}`}
            type="number"
            min={1}
            max={99}
            value={qty}
            onChange={(event) => setQty(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
            className="w-20 rounded-full border border-white/15 bg-black/20 px-3 py-2 text-center font-mono-ui text-xs outline-none focus:border-cyan-300/60"
          />
          <button
            type="button"
            onClick={() => onBuy(qty)}
            disabled={pending}
            className="hof-button flex-1 inline-flex items-center justify-center gap-2"
          >
            <ShoppingBag className="size-4" />
            {pending ? "Buying…" : "Buy now"}
          </button>
        </div>
        <p className="mt-2 text-center font-mono-ui text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
          Bot command: .mart buy {item.index} [qty]
        </p>
      </div>
    </article>
  );
}
