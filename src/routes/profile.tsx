import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Backpack, Coins, Landmark, Sparkles, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { AppShell } from "@/components/aidoru/AppShell";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { useSession } from "@/components/aidoru/session";
import { fetchShopItems } from "@/lib/aidoru.functions";
import { formatCoins, formatCompactCoins, levelProgress, rankFromLevel, type ShopItem } from "@/lib/game";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — AIDORU" },
      { name: "description", content: "Your live AIDORU trainer profile, Pokémon party, collection, and bag." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <AppShell title="My Profile" subtitle="Your trainer identity and live Pokémon records only.">
      <ProfileBody />
    </AppShell>
  );
}

function ProfileBody() {
  const { data: user } = useSession();
  const fetchItems = useServerFn(fetchShopItems);
  const itemsQuery = useQuery({ queryKey: ["aidoru", "items"], queryFn: fetchItems, retry: false });
  if (!user) return null;

  const progress = levelProgress(user.xp);
  const itemMap = new Map((itemsQuery.data ?? []).map((item) => [item.id, item]));
  const bag = user.trainerInventory.length > 0 ? user.trainerInventory : user.inventory;
  const totalBagItems = bag.reduce((sum, entry) => sum + entry.qty, 0);

  return (
    <div className="space-y-6 pb-10">
      <section className="hof-panel relative overflow-hidden p-5 sm:p-8">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <UserAvatar name={user.name} src={user.avatarUrl} className="size-24 border-2 border-cyan-300/60 sm:size-32" />
          <div className="min-w-0 flex-1">
            <p className="hof-kicker">Live trainer profile</p>
            <h2 className="hof-heading mt-1 truncate text-4xl sm:text-5xl">{user.name}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{user.bio || "Your profile is synced from the live trainer data."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 font-mono-ui text-[10px] tracking-[0.16em] text-cyan-200">{user.websiteId}</span>
              <span className="rounded-full border border-white/10 px-3 py-1 font-mono-ui text-[10px] tracking-[0.16em] text-muted-foreground">{user.title}</span>
              {user.guildName && <span className="rounded-full border border-white/10 px-3 py-1 font-mono-ui text-[10px] tracking-[0.16em] text-muted-foreground">{user.guildName}</span>}
            </div>
          </div>
        </div>
        <div className="relative mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
          <ProfileMetric icon={Coins} label="Wallet" value={formatCompactCoins(user.coins)} detail={`${formatCoins(user.coins)} coins`} />
          <ProfileMetric icon={Landmark} label="Bank" value={formatCompactCoins(user.bank)} detail={`${formatCoins(user.bank)} coins`} />
          <ProfileMetric icon={Sparkles} label={`Level ${progress.level}`} value={`${progress.percent}%`} detail={`${formatCoins(progress.current)} / ${formatCoins(progress.needed)} XP`} />
          <ProfileMetric icon={Trophy} label="Rank" value={rankFromLevel(progress.level)} detail={`${user.streak} day streak`} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="hof-panel p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="hof-kicker">Live trainer inventory</p>
              <h2 className="hof-heading mt-1 text-3xl">Your bag</h2>
            </div>
            <Backpack className="size-6 text-cyan-300" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{totalBagItems} item{totalBagItems === 1 ? "" : "s"} in the Pokémon trainer bag from WhatsApp.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {bag.length === 0 && <p className="text-sm text-muted-foreground">Your trainer bag is empty. Use the Pokémon Mart in WhatsApp or on AIDORU.</p>}
            {bag.map((entry) => <InventoryCard key={entry.itemId} entry={entry} item={itemMap.get(entry.itemId)} />)}
          </div>
        </div>

        <div className="hof-panel p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="hof-kicker">Battle party</p>
              <h2 className="hof-heading mt-1 text-3xl">Your Pokémon</h2>
            </div>
            <Sparkles className="size-6 text-cyan-300" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
            {(user.partyPokemon.length > 0 ? user.partyPokemon : user.pokemon.slice(0, 6)).map((pokemon) => (
              <motion.div key={pokemon.id} whileHover={{ y: -3 }} className="hof-image overflow-hidden rounded-2xl border border-white/10 p-2 text-center">
                <img src={pokemon.imageUrl} alt={pokemon.displayName} loading="lazy" className="mx-auto aspect-square w-full object-contain" />
                <p className="truncate font-display text-base font-semibold">{pokemon.nickname || pokemon.displayName}</p>
                <p className="font-mono-ui text-[10px] text-cyan-200">LV {pokemon.level}{pokemon.shiny ? " · SHINY" : ""}</p>
              </motion.div>
            ))}
            {user.partyPokemon.length === 0 && user.pokemon.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No Pokémon yet. Start your journey in WhatsApp.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileMetric({ icon: Icon, label, value, detail }: { icon: typeof Coins; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5 text-cyan-300" />{label}</div>
      <p className="mt-1 truncate font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 truncate font-mono-ui text-[9px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function InventoryCard({ entry, item }: { entry: { itemId: string; qty: number }; item: ShopItem | undefined }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3">
      <div className="hof-image grid size-14 shrink-0 place-items-center rounded-xl p-2">
        {item?.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="size-10 object-contain" /> : <span className="font-mono-ui text-xs text-cyan-200">ITEM</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-semibold">{item?.name ?? entry.itemId}</p>
        <p className="hof-label">Quantity {entry.qty}</p>
      </div>
    </div>
  );
}
