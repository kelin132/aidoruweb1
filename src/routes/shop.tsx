import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Coins, Landmark, LoaderCircle, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionBalanceWriter } from "@/components/aidoru/session";
import { fetchEconomyShopItems, purchaseEconomyShopItem } from "@/lib/aidoru.functions";
import {
  ECONOMY_SHOP_CATEGORIES,
  type EconomyShopCategory,
  type EconomyShopItem,
} from "@/lib/economyShopCatalog";
import { formatCoins } from "@/lib/game";

const EMPTY_ITEMS: readonly EconomyShopItem[] = [];
const PAGE_SIZE = 10;
const STORE_PREVIEW_IMAGE = "https://aidoru.zone.id/economy-preview-mart.jpg";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — AIDORU" },
      { name: "description", content: "Visit the shop to purchase your items" },
      { property: "og:title", content: "AIDORU Shop" },
      { property: "og:description", content: "Visit the shop to purchase your items" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://aidoru.zone.id/shop" },
      { property: "og:image", content: STORE_PREVIEW_IMAGE },
      { property: "og:image:alt", content: "Illustrated anime marketplace with item stalls." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AIDORU Shop" },
      { name: "twitter:description", content: "Visit the shop to purchase your items" },
      { name: "twitter:image", content: STORE_PREVIEW_IMAGE },
    ],
  }),
  component: EconomyShopPage,
});

function EconomyShopPage() {
  const { data: user } = useSession();
  const writeSessionBalance = useSessionBalanceWriter();
  const fetchItems = useServerFn(fetchEconomyShopItems);
  const purchase = useServerFn(purchaseEconomyShopItem);
  const query = useQuery({
    queryKey: ["aidoru", "economy-shop"],
    queryFn: fetchItems,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const [filter, setFilter] = useState<EconomyShopCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const items = query.data ?? EMPTY_ITEMS;
  const categories = useMemo(
    () => Object.keys(ECONOMY_SHOP_CATEGORIES) as EconomyShopCategory[],
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
    return items.filter((item) => {
      const matchesCategory = filter === "all" || item.category === filter;
      const matchesSearch =
        !normalizedSearch ||
        [item.name, item.description, item.category].some((value) =>
          value.toLowerCase().includes(normalizedSearch),
        );
      return matchesCategory && matchesSearch;
    });
  }, [filter, items, search]);
  useEffect(() => setPage(1), [filter, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const submitPurchase = async (data: { itemId: string; qty: number }) => {
    const result = await purchase({ data });
    writeSessionBalance(result.coins);
    toast.success("Bought " + result.itemName + " · -" + formatCoins(result.spent));
  };;

  return (
    <AppShell title="Shop" hidePageHeading>
      <div className="storefront-page storefront-page-shop pb-8">
        <header className="storefront-header storefront-hero">
          <h1 className="storefront-title">Shop</h1>
          <div className="storefront-balances" aria-label="Account balances">
            <div className="storefront-balance">
              <Coins className="size-4" aria-hidden="true" />
              <span>Wallet</span>
              <strong>{formatCoins(user?.coins ?? 0)}</strong>
            </div>
            <div className="storefront-balance">
              <Landmark className="size-4" aria-hidden="true" />
              <span>Bank</span>
              <strong>{formatCoins(user?.bank ?? 0)}</strong>
            </div>
          </div>
        </header>

        <section className="storefront-filters" aria-label="Shop filters">
          <label className="storefront-search">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              aria-label="Search Shop items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items…"
            />
          </label>
          <select
            aria-label="Filter Shop items by category"
            value={filter}
            onChange={(event) => setFilter(event.target.value as EconomyShopCategory | "all")}
            className="storefront-select"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {ECONOMY_SHOP_CATEGORIES[category].label}
              </option>
            ))}
          </select>
        </section>

        {query.isLoading && <p className="storefront-status">Loading Shop…</p>}
        {query.isError && <p className="storefront-status">Shop is unavailable right now.</p>}
        {!query.isLoading && !query.isError && filtered.length === 0 && (
          <p className="storefront-status">No items found.</p>
        )}
        {!query.isLoading && !query.isError && filtered.length > 0 && (
          <>
            <p className="storefront-count">{filtered.length} items</p>
            <div className="storefront-grid">
              {pageItems.map((item) => (
                <EconomyShopCard
                  key={item.id}
                  item={item}
                  wallet={user?.coins ?? 0}
                  currentBankTier={currentBankTier}
                  onBuy={(qty) => submitPurchase({ itemId: item.id, qty })}
                />
              ))}
            </div>
            <nav className="storefront-pagination" aria-label="Shop pages">
              <button
                type="button"
                className="storefront-page-button"
                aria-label="Previous Shop page"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="size-4" /> Previous
              </button>
              <span className="storefront-page-number">{currentPage} / {pageCount}</span>
              <button
                type="button"
                className="storefront-page-button"
                aria-label="Next Shop page"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                Next <ChevronRight className="size-4" />
              </button>
            </nav>
          </>
        )}
      </div>
    </AppShell>
  );
}

function EconomyShopCard({ item, wallet, currentBankTier, onBuy }: {
  item: EconomyShopItem;
  wallet: number;
  currentBankTier: number;
  onBuy: (qty: number) => Promise<void>;
}) {
  const [qty, setQty] = useState(1);
  const buyMutation = useMutation({ mutationFn: onBuy, onError: (error: Error) => toast.error(error.message) });
  const isService = Boolean(item.bankTier);
  const oneAtATime = isService || item.id === "gun";
  const canBuyTier = !item.bankTier || item.bankTier === currentBankTier + 1;
  const alreadyOwned = Boolean(item.bankTier && item.bankTier <= currentBankTier);
  const affordable = wallet >= item.price * qty;
  const unavailable = buyMutation.isPending || !affordable || !canBuyTier || alreadyOwned;
  const actionLabel = alreadyOwned
    ? "Owned"
    : !canBuyTier
      ? "Next tier first"
      : buyMutation.isPending
        ? "Buying…"
        : !affordable
          ? "Insufficient funds"
          : "Buy";
  const categoryLabel = ECONOMY_SHOP_CATEGORIES[item.category].label;
  return (
    <article className="hof-shop-card group">
      <div className="hof-shop-card-image hof-image" data-category={categoryLabel}>
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="size-full object-contain p-2 transition duration-300 group-hover:scale-105"
        />
      </div>
      <div className="storefront-card-body min-w-0">
        <h2 className="storefront-card-title" title={item.name}>{item.name}</h2>
        <p className="storefront-card-description">{item.description}</p>
        {item.bankTier && (
          <p className="storefront-card-detail">
            Tier {item.bankTier} · Limit {formatCoins(item.bankLimit ?? 0)}
          </p>
        )}
        <div className="storefront-price">
          <Coins className="size-4" aria-hidden="true" />
          <strong>{formatCoins(item.price)}</strong>
        </div>
      </div>
      <div className="storefront-card-actions flex shrink-0 flex-col gap-2">
        {!oneAtATime && (
          <div className="storefront-quantity">
            <button
              type="button"
              aria-label={"Decrease " + item.name + " quantity"}
              onClick={() => setQty((value) => Math.max(1, value - 1))}
            >−</button>
            <input
              aria-label={"Quantity for " + item.name}
              type="number"
              min={1}
              max={99}
              value={qty}
              onChange={(event) =>
                setQty(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
              }
            />
            <button
              type="button"
              aria-label={"Increase " + item.name + " quantity"}
              onClick={() => setQty((value) => Math.min(99, value + 1))}
            >+</button>
          </div>
        )}
        <button
          type="button"
          onClick={() => buyMutation.mutate(qty)}
          disabled={unavailable}
          className="hof-button storefront-buy-button"
        >
          {buyMutation.isPending ? (
            <><LoaderCircle className="size-4 animate-spin" /> Buying…</>
          ) : (
            <><ShoppingBag className="size-4" /> {actionLabel}</>
          )}
        </button>
      </div>
    </article>
  );
}
