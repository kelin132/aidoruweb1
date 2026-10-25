import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowRight, Search, ShoppingBag, SlidersHorizontal, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { fetchEconomyShopItems, purchaseEconomyShopItem } from "@/lib/aidoru.functions";
import {
  ECONOMY_SHOP_CATEGORIES,
  ECONOMY_SHOP_FEATURE_ART,
  type EconomyShopCategory,
  type EconomyShopItem,
} from "@/lib/economyShopCatalog";
import { formatCoins } from "@/lib/game";

const EMPTY_ITEMS: readonly EconomyShopItem[] = [];
const FEATURED_ART = ECONOMY_SHOP_FEATURE_ART;

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — AIDORU" },
      {
        name: "description",
        content: "Buy Kelin-MD2 and Discord economy items with your shared AIDORU wallet.",
      },
    ],
  }),
  component: EconomyShopPage,
});

function EconomyShopPage() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const fetchItems = useServerFn(fetchEconomyShopItems);
  const purchase = useServerFn(purchaseEconomyShopItem);
  const query = useQuery({
    queryKey: ["aidoru", "economy-shop"],
    queryFn: fetchItems,
    retry: false,
  });
  const [filter, setFilter] = useState<EconomyShopCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"featured" | "price-low" | "price-high">("featured");
  const items = query.data ?? EMPTY_ITEMS;
  const categories = useMemo(
    () => ["all", ...Object.keys(ECONOMY_SHOP_CATEGORIES)] as Array<EconomyShopCategory | "all">,
    [],
  );
  const currentBankTier = useMemo(() => {
    const bankLimit = Number(user?.bankLimit ?? 50000);
    return items.reduce(
      (highest, item) =>
        item.bankTier && Number(item.bankLimit) <= bankLimit
          ? Math.max(highest, item.bankTier)
          : highest,
      0,
    );
  }, [items, user?.bankLimit]);
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items
      .filter((item) => filter === "all" || item.category === filter)
      .filter(
        (item) =>
          !normalizedSearch ||
          [item.name, item.description, item.category].some((value) =>
            value.toLowerCase().includes(normalizedSearch),
          ),
      )
      .sort((a, b) =>
        sort === "price-low"
          ? a.price - b.price
          : sort === "price-high"
            ? b.price - a.price
            : items.indexOf(a) - items.indexOf(b),
      );
  }, [filter, items, search, sort]);
  const buyMutation = useMutation({
    mutationFn: (data: { itemId: string; qty: number }) => purchase({ data }),
    onSuccess: (result) => {
      writeSession(result.user);
      toast.success("Bought " + result.itemName + " · -" + formatCoins(result.spent));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title="Shop" subtitle="Bot economy items, shared with your AIDORU wallet.">
      <div className="space-y-6 pb-8">
        <section className="hof-panel overflow-hidden p-4 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="hof-kicker">KELIN-MD2 + DISCORD ECONOMY</p>
              <h2 className="hof-heading mt-1 text-4xl font-black sm:text-5xl">AIDORU Shop</h2>
              <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-muted-foreground">
                Buy bot items here with your shared ryu wallet. Inventory items sync to your bot
                account; bank upgrades apply immediately.
              </p>
              <Link
                to="/mart"
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 text-xs font-extrabold text-cyan-100 transition hover:bg-cyan-300/20"
              >
                Pokémon Mart <ArrowRight className="size-4" />
              </Link>
            </div>
            <div
              className="grid shrink-0 grid-cols-4 gap-2 self-start lg:self-center"
              aria-label="Featured shop artwork"
            >
              {FEATURED_ART.map((image) => (
                <div
                  key={image}
                  className="grid size-[4.25rem] place-items-center rounded-2xl border border-white/10 bg-black/25 p-1 sm:size-20"
                >
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="size-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,.4)]"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/8 px-4 py-3">
              <span className="grid size-10 place-items-center rounded-xl bg-cyan-300/12 text-cyan-200">
                <WalletCards className="size-5" />
              </span>
              <div>
                <p className="hof-label">Available wallet · ryu</p>
                <p className="hof-value text-xl">{formatCoins(user?.coins ?? 0)}</p>
              </div>
            </div>
            <p className="text-xs font-bold text-muted-foreground">
              {items.length} live bot items · purchases sync to inventory
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="flex min-h-11 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 focus-within:border-cyan-300/55">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search shop items"
                className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 sm:w-52">
              <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="w-full bg-transparent text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground outline-none"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: low</option>
                <option value="price-high">Price: high</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                data-active={filter === category}
                onClick={() => setFilter(category)}
                className="hof-tab shrink-0 px-4 py-2 font-mono-ui text-[10px] font-bold uppercase tracking-[0.16em]"
              >
                {category === "all" ? "All items" : ECONOMY_SHOP_CATEGORIES[category].label}
              </button>
            ))}
          </div>
        </section>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="hof-kicker">{filtered.length} available</p>
            <h2 className="hof-heading mt-1 text-2xl font-black">Bot inventory & upgrades</h2>
          </div>
          <p className="hidden max-w-xs text-right text-xs font-semibold text-muted-foreground sm:block">
            The Pokémon Mart is separate and remains at /mart.
          </p>
        </div>
        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Loading the Shop catalogue…</p>
        )}
        {query.isError && (
          <p className="hof-panel p-5 text-sm font-semibold text-muted-foreground">
            The Shop catalogue is unavailable right now.
          </p>
        )}
        {!query.isLoading && !query.isError && filtered.length === 0 && (
          <div className="hof-panel p-8 text-center text-sm font-semibold text-muted-foreground">
            No items match this search. Try another category or clear the search field.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => (
            <EconomyShopCard
              key={item.id}
              item={item}
              wallet={user?.coins ?? 0}
              currentBankTier={currentBankTier}
              pending={buyMutation.isPending}
              onBuy={(qty) => buyMutation.mutate({ itemId: item.id, qty })}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function EconomyShopCard({
  item,
  wallet,
  currentBankTier,
  pending,
  onBuy,
}: {
  item: EconomyShopItem;
  wallet: number;
  currentBankTier: number;
  pending: boolean;
  onBuy: (qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const isService = Boolean(item.bankTier);
  const oneAtATime = isService || item.id === "gun";
  const canBuyTier = !item.bankTier || item.bankTier === currentBankTier + 1;
  const alreadyOwned = Boolean(item.bankTier && item.bankTier <= currentBankTier);
  const affordable = wallet >= item.price * qty;
  const unavailable = pending || !affordable || !canBuyTier || alreadyOwned;
  const actionLabel = alreadyOwned
    ? "Owned"
    : !canBuyTier
      ? "Buy previous tier first"
      : pending
        ? "Buying…"
        : !affordable
          ? "Insufficient ryu"
          : "Buy";
  return (
    <article className="hof-shop-card group">
      <div className="hof-shop-card-image hof-image" data-category={item.category}>
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="size-full object-contain p-2 transition duration-300 group-hover:scale-110"
        />
      </div>
      <div className="min-w-0 flex-1 self-stretch py-1">
        <div className="flex items-center justify-between gap-2">
          <span className="hof-kicker truncate font-extrabold">{item.category}</span>
          <span className="rounded-full border border-white/10 px-2 py-1 font-mono-ui text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {item.rarity}
          </span>
        </div>
        <h3 className="mt-1 truncate font-display text-xl font-black sm:text-2xl">
          {item.emoji} {item.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-muted-foreground">
          {item.description}
        </p>
        {item.bankTier && (
          <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-cyan-200">
            Tier {item.bankTier} · {item.bankLabel} · {formatCoins(item.bankLimit ?? 0)} bank limit
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono-ui text-sm font-black text-cyan-200">
            {formatCoins(item.price)}
          </span>
          {item.bankTier && (
            <span className="rounded-full border border-cyan-200/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-100">
              Bank service
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:min-w-32">
        {!oneAtATime && (
          <div className="flex items-center rounded-xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              aria-label={"Decrease " + item.name + " quantity"}
              onClick={() => setQty((value) => Math.max(1, value - 1))}
              className="grid size-7 place-items-center rounded-lg font-bold text-muted-foreground transition hover:bg-white/10 hover:text-white"
            >
              −
            </button>
            <input
              aria-label={"Quantity for " + item.name}
              type="number"
              min={1}
              max={99}
              value={qty}
              onChange={(event) =>
                setQty(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
              }
              className="w-10 bg-transparent text-center font-mono-ui text-xs font-bold outline-none"
            />
            <button
              type="button"
              aria-label={"Increase " + item.name + " quantity"}
              onClick={() => setQty((value) => Math.min(99, value + 1))}
              className="grid size-7 place-items-center rounded-lg font-bold text-muted-foreground transition hover:bg-white/10 hover:text-white"
            >
              +
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => onBuy(qty)}
          disabled={unavailable}
          className="hof-button inline-flex min-h-10 items-center justify-center gap-2 px-3 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag className="size-3.5" />
          {actionLabel}
        </button>
      </div>
    </article>
  );
}
