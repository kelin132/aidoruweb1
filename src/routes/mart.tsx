import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { Sprite } from "@/components/aidoru/Sprite";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { fetchShopItems, purchaseItem } from "@/lib/aidoru.functions";
import { RARITY_LABEL, formatCoins, type Rarity } from "@/lib/game";

export const Route = createFileRoute("/mart")({
  head: () => ({
    meta: [
      { title: "Mart — Buy balls, potions and boosts | AIDORU" },
      {
        name: "description",
        content:
          "Spend your Kelin-MD2 coins on Poké Balls, potions, evolution stones, boosts and cosmetics with a live balance.",
      },
      { property: "og:title", content: "Mart — Buy balls, potions and boosts | AIDORU" },
      {
        property: "og:description",
        content: "Live-balance shop for balls, potions, stones, boosts and cosmetics.",
      },
    ],
  }),
  component: MartPage,
});

const RARITY_CLASS: Record<Rarity, string> = {
  common: "text-rarity-common",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legend: "text-rarity-legend",
};

const CATEGORIES = ["all", "pokeball", "potion", "stone", "boost", "cosmetic", "key"] as const;

function MartPage() {
  return (
    <AppShell title="Mart & Shop" subtitle="Restock your bag. Your balance updates instantly.">
      <MartBody />
    </AppShell>
  );
}

function MartBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>("all");
  const [qty, setQty] = useState<Record<string, number>>({});

  const itemsQuery = useQuery({
    queryKey: ["aidoru", "items"],
    queryFn: useServerFn(fetchShopItems),
  });
  const buy = useServerFn(purchaseItem);

  const purchase = useMutation({
    mutationFn: (vars: { itemId: string; qty: number }) => buy({ data: vars }),
    onSuccess: (result) => {
      writeSession(result.user);
      toast.success(`Bought ${result.itemName} for ${formatCoins(result.spent)} coins`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;
  const items = (itemsQuery.data ?? []).filter((i) => filter === "all" || i.category === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`font-mono-ui rounded-full px-4 py-2 text-[10px] tracking-[0.2em] uppercase transition-all ${
              filter === c
                ? "bg-gradient-brand text-foreground glow-pink"
                : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {itemsQuery.isLoading && <p className="text-muted-foreground text-sm">Loading stock…</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, i) => {
          const count = qty[item.id] ?? 1;
          const affordable = user.coins >= item.price * count;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04 }}
              className="glass glass-hover flex flex-col rounded-3xl p-5"
            >
              <div className="flex items-start gap-4">
                <span className="glass grid size-16 shrink-0 place-items-center rounded-2xl">
                  <Sprite name={item.sprite} alt={item.name} className="size-12" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display truncate text-base font-bold">{item.name}</p>
                  <p
                    className={`font-mono-ui text-[10px] tracking-[0.22em] uppercase ${RARITY_CLASS[item.rarity]}`}
                  >
                    {RARITY_LABEL[item.rarity]}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <div className="glass flex items-center gap-1 rounded-full px-2 py-1.5">
                  <button
                    aria-label="Decrease"
                    onClick={() => setQty({ ...qty, [item.id]: Math.max(1, count - 1) })}
                    className="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded-full"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="font-mono-ui w-6 text-center text-sm">{count}</span>
                  <button
                    aria-label="Increase"
                    onClick={() => setQty({ ...qty, [item.id]: Math.min(99, count + 1) })}
                    className="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded-full"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => purchase.mutate({ itemId: item.id, qty: count })}
                  disabled={!affordable || purchase.isPending}
                  className="bg-gradient-brand text-foreground font-mono-ui flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[11px] font-bold tracking-[0.16em] uppercase transition-transform hover:scale-[1.02] disabled:scale-100 disabled:opacity-40"
                >
                  <ShoppingBag className="size-3.5" />
                  {formatCoins(item.price * count)}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
