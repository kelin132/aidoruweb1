import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Backpack, Coins, Landmark, Pencil, Save, Sparkles, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
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

async function prepareProfileVideo(file: File): Promise<string> {
  if (!file.type.startsWith("video/")) throw new Error("Please choose a video file.");
  if (file.size > 1_800_000) throw new Error("That video is too large. Choose a file under 1.8 MB.");
  const source = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("The selected video could not be read."));
      video.src = source;
    });
    if (!Number.isFinite(duration) || duration > 10.05) throw new Error("Profile videos must be 10 seconds or shorter.");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The selected video could not be read."));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function compressGalleryImage(file: File, options: { maxWidth: number; maxHeight: number }): Promise<string> {
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
  const scale = Math.min(1, options.maxWidth / image.naturalWidth, options.maxHeight / image.naturalHeight);
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
    <AppShell title="Profile" subtitle="Your trainer identity and live Pokémon records only.">
      <ProfileBody />
    </AppShell>
  );
}

function ProfileBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const save = useServerFn(saveProfile);
  const [background, setBackground] = useState(user?.profileBackground ?? "");
  const [avatarImage, setAvatarImage] = useState(user?.avatarUrl ?? "");
  const [avatarVideo, setAvatarVideo] = useState(user?.avatarVideoUrl ?? "");
  const [uploading, setUploading] = useState<"avatar" | "background" | "video" | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setBackground(user.profileBackground ?? "");
    setAvatarImage(user.avatarUrl ?? "");
    setAvatarVideo(user.avatarVideoUrl ?? "");
  }, [user?.id, user?.profileBackground, user?.avatarUrl, user?.avatarVideoUrl]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: {
      name: user?.name ?? "Player",
      bio: user?.bio ?? "",
      title: user?.title ?? "Player",
      avatar: user?.avatar ?? "default",
      banner: user?.banner ?? "aurora",
      avatarImage: avatarImage.trim(),
      background: background.trim(),
      profileVideo: avatarVideo.trim(),
    } }),
    onSuccess: (next) => {
      writeSession(next);
      toast.success("Profile image and background synced successfully.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>, type: "avatar" | "background") => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(type);
    try {
      const image = await compressGalleryImage(file, type === "avatar" ? { maxWidth: 900, maxHeight: 900 } : { maxWidth: 1280, maxHeight: 900 });
      if (type === "avatar") setAvatarImage(image);
      else setBackground(image);
      toast.success(`${type === "avatar" ? "Profile image" : "Profile background"} ready. Press Save changes to apply it.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That image could not be prepared.");
    } finally {
      setUploading(null);
    }
  };

  const fetchItems = useServerFn(fetchShopItems);
  const itemsQuery = useQuery({ queryKey: ["aidoru", "items"], queryFn: fetchItems, retry: false });
  if (!user) return null;

  const progress = trainerLevelProgress(user.trainerLevel, user.trainerXp);
  const itemMap = new Map((itemsQuery.data ?? []).map((item) => [item.id, item]));
  const bag = user.trainerInventory.length > 0 ? user.trainerInventory : user.inventory;
  const totalBagItems = bag.reduce((sum, entry) => sum + entry.qty, 0);
  const profileStyle = {
    "--profile-background": background ? `url(${background})` : "none",
  } as CSSProperties;

  return (
    <div className="profile-page space-y-6 pb-10">
      <section className="profile-card hof-panel" style={profileStyle}>
        <div className="profile-card-cover">
          <div className="profile-card-cover-overlay" />
          <button type="button" onClick={() => backgroundInputRef.current?.click()} disabled={Boolean(uploading) || saveMutation.isPending} className="profile-cover-edit" aria-label="Edit profile background">
            <Pencil className="size-4" />
          </button>
          <div className="profile-card-cover-mark" aria-hidden="true" />
        </div>
        <div className="profile-card-body">
          <div className="profile-identity-row">
            <div className="profile-avatar-wrap">
              <UserAvatar name={user.name} src={avatarImage || user.avatarUrl} videoSrc={avatarVideo || user.avatarVideoUrl} className="profile-avatar" imageClassName="profile-avatar-image" />
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={Boolean(uploading) || saveMutation.isPending} className="profile-avatar-edit" aria-label="Edit profile image">
                <Pencil className="size-4" />
              </button>
            </div>
            <div className="profile-identity-copy min-w-0 flex-1">
              <p className="profile-eyebrow">AIDORU TRAINER PROFILE</p>
              <h2 className="profile-name truncate">{user.name}</h2>
              <p className="profile-bio">{user.bio || "Your profile is synced from your live trainer data."}</p>
            </div>
            <div className="profile-heart" aria-hidden="true">♡</div>
          </div>
          <div className="profile-chip-row">
            <span className="profile-chip profile-chip-primary">{user.websiteId}</span>
            <span className="profile-chip">{user.title}</span>
            {user.guildName && <span className="profile-chip">{user.guildName}</span>}
            <button type="button" onClick={() => videoInputRef.current?.click()} disabled={Boolean(uploading) || saveMutation.isPending} className="profile-chip profile-chip-edit" aria-label="Edit animated profile video">
              <Pencil className="size-3" /> {avatarVideo ? "Edit video" : "Add video"}
            </button>
          </div>
          <div className="profile-badge-strip" aria-label="Trainer badges">
            <span className="profile-badge profile-badge-purple">✦</span>
            <span className="profile-badge profile-badge-cyan">◉</span>
            <span className="profile-badge profile-badge-pink">△</span>
            <span className="profile-badge profile-badge-green">#</span>
            <span className="profile-badge profile-badge-blue">✧</span>
            <span className="profile-badge profile-badge-violet">◆</span>
          </div>
        </div>
      </section>

      <section className="profile-editor hof-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hof-kicker">Quick profile editing</p>
            <p className="mt-1 text-sm text-muted-foreground">Use the pencil icons on your profile card to change your picture, background, or animated video.</p>
          </div>
          <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || Boolean(uploading)} className="hof-button inline-flex items-center justify-center gap-2">
            <Save className="size-4" /> {saveMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" onChange={(event) => handleImageChange(event, "avatar")} className="hidden" disabled={Boolean(uploading) || saveMutation.isPending} />
        <input ref={backgroundInputRef} type="file" accept="image/*" onChange={(event) => handleImageChange(event, "background")} className="hidden" disabled={Boolean(uploading) || saveMutation.isPending} />
        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setUploading("video");
          try { setAvatarVideo(await prepareProfileVideo(file)); toast.success("Profile video ready. Press Save changes to apply it."); }
          catch (error) { toast.error(error instanceof Error ? error.message : "That video could not be prepared."); }
          finally { setUploading(null); }
        }} className="hidden" disabled={Boolean(uploading) || saveMutation.isPending} />
      </section>

      <section className="profile-metrics-grid">
        <ProfileMetric icon={Coins} label="Wallet" value={formatCompactCoins(user.coins)} detail={`${formatCoins(user.coins)} coins`} />
        <ProfileMetric icon={Landmark} label="Bank" value={formatCompactCoins(user.bank)} detail={`${formatCoins(user.bank)} coins`} />
        <ProfileMetric icon={Sparkles} label={`Level ${progress.level}`} value={`${progress.percent}%`} detail={`${formatCoins(progress.current)} / ${formatCoins(progress.needed)} XP`} />
        <ProfileMetric icon={Trophy} label="Rank" value={rankFromLevel(progress.level)} detail={`${user.streak} day streak`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="hof-panel p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3"><div><p className="hof-kicker">Live trainer inventory</p><h2 className="hof-heading mt-1 text-3xl">Your bag</h2></div><Backpack className="size-6 text-cyan-300" /></div>
          <p className="mt-2 text-xs text-muted-foreground">{totalBagItems} item{totalBagItems === 1 ? "" : "s"} in the Pokémon trainer bag from WhatsApp.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{bag.length === 0 && <p className="text-sm text-muted-foreground">Your trainer bag is empty. Use the Pokémon Mart in WhatsApp or on AIDORU.</p>}{bag.map((entry) => <InventoryCard key={entry.itemId} entry={entry} item={itemMap.get(entry.itemId)} />)}</div>
        </div>
        <div className="hof-panel p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3"><div><p className="hof-kicker">Battle party</p><h2 className="hof-heading mt-1 text-3xl">Your Pokémon</h2></div><Sparkles className="size-6 text-cyan-300" /></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">{(user.partyPokemon.length > 0 ? user.partyPokemon : user.pokemon.slice(0, 6)).map((pokemon) => <motion.div key={pokemon.id} whileHover={{ y: -3 }} className="hof-image overflow-hidden rounded-2xl border border-white/10 p-2 text-center"><img src={pokemon.imageUrl} alt={pokemon.displayName} loading="lazy" className="mx-auto aspect-square w-full object-contain" /><p className="truncate font-display text-base font-semibold">{pokemon.nickname || pokemon.displayName}</p><p className="font-mono-ui text-[10px] text-cyan-200">LV {pokemon.level}{pokemon.shiny ? " · SHINY" : ""}</p></motion.div>)}{user.partyPokemon.length === 0 && user.pokemon.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No Pokémon yet. Start your journey in WhatsApp.</p>}</div>
        </div>
      </section>
    </div>
  );
}


function ProfileMetric({ icon: Icon, label, value, detail }: { icon: typeof Coins; label: string; value: string; detail: string }) {
  return <div className="profile-metric rounded-xl border border-white/10 bg-black/15 px-3 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5 text-cyan-300" />{label}</div><p className="mt-1 truncate font-display text-2xl font-bold">{value}</p><p className="mt-1 truncate font-mono-ui text-[9px] text-muted-foreground">{detail}</p></div>;
}

function InventoryCard({ entry, item }: { entry: { itemId: string; qty: number }; item: ShopItem | undefined }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3"><div className="hof-image grid size-14 shrink-0 place-items-center rounded-xl p-2">{item?.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="size-10 object-contain" /> : <span className="font-mono-ui text-xs text-cyan-200">ITEM</span>}</div><div className="min-w-0 flex-1"><p className="truncate font-display text-lg font-semibold">{item?.name ?? entry.itemId}</p><p className="hof-label">Quantity {entry.qty}</p></div></div>;
}
