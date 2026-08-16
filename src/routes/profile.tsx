import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Backpack, Coins, ImageUp, Landmark, Save, Sparkles, Trophy, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { fetchShopItems, saveProfile } from "@/lib/aidoru.functions";
import { formatCoins, formatCompactCoins, rankFromLevel, trainerLevelProgress, type ShopItem } from "@/lib/game";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — AIDORU" },
      { name: "description", content: "Your live AIDORU trainer profile, Pokémon party, collection, and bag." },
    ],
  }),
  component: ProfilePage,
});

async function compressGalleryImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image from your gallery.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onerror = () => reject(new Error("The selected image could not be decoded."));
    element.onload = () => resolve(element);
    element.src = source;
  });
  const maxWidth = 1280;
  const maxHeight = 900;
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare that image.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let result = canvas.toDataURL("image/jpeg", 0.78);
  if (result.length > 1_400_000) result = canvas.toDataURL("image/jpeg", 0.62);
  if (result.length > 1_500_000) throw new Error("That image is too large. Please choose a smaller gallery image.");
  return result;
}

function ProfilePage() {
  return (
    <AppShell title="My Profile" subtitle="Your trainer identity and live Pokémon records only.">
      <ProfileBody />
    </AppShell>
  );
}

function ProfileBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const save = useServerFn(saveProfile);
  const [background, setBackground] = useState(user?.profileBackground ?? "");
  const [uploading, setUploading] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (user) setBackground(user.profileBackground ?? "");
  }, [user?.id, user?.profileBackground]);
  const saveMutation = useMutation({
    mutationFn: () => save({ data: {
      name: user?.name ?? "Player",
      bio: user?.bio ?? "",
      title: user?.title ?? "Player",
      avatar: user?.avatar ?? "default",
      banner: user?.banner ?? "aurora",
      background: background.trim(),
    } }),
    onSuccess: (next) => { writeSession(next); toast.success("Profile background synced to WhatsApp."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const handleGalleryChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setBackground(await compressGalleryImage(file));
      toast.success("Gallery image ready. Save to sync it to WhatsApp.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That image could not be prepared.");
    } finally {
      setUploading(false);
    }
  };
  const fetchItems = useServerFn(fetchShopItems);
  const itemsQuery = useQuery({ queryKey: ["aidoru", "items"], queryFn: fetchItems, retry: false });
  if (!user) return null;

  const progress = trainerLevelProgress(user.trainerLevel, user.trainerXp);
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
        <div className="relative mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={uploading || saveMutation.isPending} className="hof-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm">
            <ImageUp className="size-4" /> {uploading ? "Preparing image…" : "Edit cover"}
          </button>
          <span className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs text-muted-foreground">Choose an image from your gallery and sync it to WhatsApp</span>
          <input ref={galleryInputRef} id="profile-background-gallery" type="file" accept="image/*" onChange={handleGalleryChange} className="hidden" disabled={uploading || saveMutation.isPending} />
        </div>
        <div className="relative mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
          <ProfileMetric icon={Coins} label="Wallet" value={formatCompactCoins(user.coins)} detail={`${formatCoins(user.coins)} coins`} />
          <ProfileMetric icon={Landmark} label="Bank" value={formatCompactCoins(user.bank)} detail={`${formatCoins(user.bank)} coins`} />
          <ProfileMetric icon={Sparkles} label={`Level ${progress.level}`} value={`${progress.percent}%`} detail={`${formatCoins(progress.current)} / ${formatCoins(progress.needed)} XP`} />
          <ProfileMetric icon={Trophy} label="Rank" value={rankFromLevel(progress.level)} detail={`${user.streak} day streak`} />
        </div>
      </section>

      <section className="hof-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hof-kicker">Website-only customization</p>
            <h2 className="hof-heading mt-1 text-3xl">Profile background</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose an image from your phone or computer gallery. A compressed copy is stored as <code>profileBackground</code> and reused by the bot’s <code>.profile</code> renderer.</p>
          </div>
          <Save className="size-6 text-cyan-300" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={uploading || saveMutation.isPending} className="hof-button inline-flex items-center justify-center gap-2">
              <ImageUp className="size-4" /> {uploading ? "Preparing image…" : "Choose from gallery"}
            </button>
            {background && <button type="button" onClick={() => setBackground("")} className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><X className="size-3" />Remove image</button>}
          </div>
          <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploading} className="hof-button inline-flex items-center justify-center gap-2">
            <Save className="size-4" /> {saveMutation.isPending ? "Syncing…" : "Save background"}
          </button>
        </div>
        {background && <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/20 bg-black/20"><img src={background} alt="Selected profile background preview" className="max-h-64 w-full object-cover" /></div>}
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
