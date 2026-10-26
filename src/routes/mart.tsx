import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Coins, Landmark, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { fetchShopItems, purchaseItem } from "@/lib/aidoru.functions";
import { formatCoins, type ShopItem } from "@/lib/game";

const EMPTY_ITEMS: ShopItem[] = [];
const PAGE_SIZE = 10;
const STORE_PREVIEW_IMAGE = "https://aidoru.zone.id/economy-preview-mart.jpg";

export const Route = createFileRoute("/mart")({
  head: () => ({
    meta: [
      { title: "Pokémon Mart — AIDORU" },
      { name: "description", content: "Shop Pokémon items with your AIDORU wallet." },
      { property: "og:title", content: "Pokémon Mart — AIDORU" },
      { property: "og:description", content: "Shop Pokémon items with your AIDORU wallet." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://aidoru.zone.id/mart" },
      { property: "og:image", content: STORE_PREVIEW_IMAGE },
      { property: "og:image:alt", content: "Illustrated anime marketplace with item stalls." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pokémon Mart — AIDORU" },
      { name: "twitter:description", content: "Shop Pokémon items with your AIDORU wallet." },
      { name: "twitter:image", content: STORE_PREVIEW_IMAGE },
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const items = query.data ?? EMPTY_ITEMS;
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  );
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items
      .filter((item) => filter === "all" || item.category === filter)
      .filter((item) => {
        if (!normalizedSearch) return true;
        return [item.name, item.description, item.category].some((value) =>
          value.toLowerCase().includes(normalizedSearch),
        );
      })
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }, [filter, items, search]);
  useEffect(() => setPage(1), [filter, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const buyMutation = useMutation({
    mutationFn: (data: { itemId: string; qty: number }) => purchase({ data }),
    onSuccess: (result) => {
      writeSession(result.user);
      toast.success("Bought " + result.itemName + " · -" + formatCoins(result.spent));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title="Mart" hidePageHeading>
      <div className="storefront-page pb-8">
        <header className="storefront-header">
          <h1 className="storefront-title">Pokémon Mart</h1>
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

        <section className="storefront-filters" aria-label="Mart filters">
          <label className="storefront-search">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              aria-label="Search Mart items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items…"
            />
          </label>
          <select
            aria-label="Filter Mart items by category"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="storefront-select"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "all" ? "All categories" : category}
              </option>
            ))}
          </select>
        </section>

        {query.isLoading && <p className="storefront-status">Loading Mart…</p>}
        {query.isError && <p className="storefront-status">Mart is unavailable right now.</p>}
        {!query.isLoading && !query.isError && filtered.length === 0 && (
          <p className="storefront-status">No items found.</p>
        )}
        {!query.isLoading && !query.isError && filtered.length > 0 && (
          <>
            <p className="storefront-count">{filtered.length} items</p>
            <div className="storefront-grid">
              {pageItems.map((item) => (
                <MartCard
                  key={item.id}
                  item={item}
                  pending={buyMutation.isPending}
                  onBuy={(qty) => buyMutation.mutate({ itemId: item.id, qty })}
                />
              ))}
            </div>
            <nav className="storefront-pagination" aria-label="Mart pages">
              <button
                type="button"
                className="storefront-page-button"
                aria-label="Previous Mart page"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="size-4" /> Previous
              </button>
              <span className="storefront-page-number">{currentPage} / {pageCount}</span>
              <button
                type="button"
                className="storefront-page-button"
                aria-label="Next Mart page"
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
  const image = item.imageUrl ?? item.sprite;

  return (
    <article className="hof-shop-card group">
      <div className="hof-shop-card-image hof-image" data-category={item.category}>
        <img
          src={image}
          alt={item.name}
          loading="lazy"
          className="size-full object-contain p-2 transition duration-300 group-hover:scale-105"
        />
      </div>
      <div className="storefront-card-body min-w-0">
        <h2 className="storefront-card-title" title={item.name}>{item.name}</h2>
        <p className="storefront-card-description">{item.description}</p>
        <div className="storefront-price">
          <Coins className="size-4" aria-hidden="true" />
          <strong>{formatCoins(item.price)}</strong>
        </div>
      </div>
      <div className="storefront-card-actions flex shrink-0 flex-col gap-2">
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
            onChange={(event) => setQty(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
          />
          <button
            type="button"
            aria-label={"Increase " + item.name + " quantity"}
            onClick={() => setQty((value) => Math.min(99, value + 1))}
          >+</button>
        </div>
        <button
          type="button"
          onClick={() => onBuy(qty)}
          disabled={pending}
          className="hof-button storefront-buy-button"
        >
          <ShoppingBag className="size-4" />
          {pending ? "Buying…" : "Buy"}
        </button>
      </div>
    </article>
  );
}
