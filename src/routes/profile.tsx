import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Backpack, ChevronLeft, ChevronRight, Coins, Landmark, Link2, Sparkles, Trophy, Unlink, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import {
  fetchDiscordLinkStatus,
  fetchShopItems,
  finishDiscordCallback,
  removeDiscordAccountLink,
  saveProfile,
  startDiscordAccountLink,
} from "@/lib/aidoru.functions";
import { formatCoins, formatCompactCoins, rankFromLevel, trainerLevelProgress, type ShopItem } from "@/lib/game";
import { PROFILE_FRAMES, normalizeProfileFrame } from "@/lib/profileFrames";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — AIDORU" },
      { name: "description", content: "Your live AIDORU trainer profile, Pokémon party, collection, and bag." },
    ],
  }),
  component: ProfilePage,
});

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
    <>
      <DiscordCallback />
      <AppShell title="Profile" subtitle="Your trainer identity and live Pokémon records only.">
        <ProfileBody />
      </AppShell>
    </>
  );
}

function DiscordCallback() {
  const queryClient = useQueryClient();
  const writeSession = useSessionWriter();
  const finish = useServerFn(finishDiscordCallback);
  const handled = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (handled.current || params.get("discord") !== "callback" || !code || !state) return;
    handled.current = true;

    void finish({ data: { code, state } })
      .then((result) => {
        window.history.replaceState({}, "", window.location.pathname);
        if (result.kind === "login") {
          writeSession(result.user);
          toast.success("Discord connected. Your shared trainer profile is ready.");
          return;
        }
        if (result.kind === "login_link_required") {
          const params = new URLSearchParams({
            discord: "link",
            name: result.discordUsername,
          });
          window.location.replace(`/?${params.toString()}`);
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ["aidoru", "discord-link"] });
        toast.success("Successfully connected your Discord account.");
      })
      .catch((error: Error) => {
        window.history.replaceState({}, "", window.location.pathname);
        toast.error(error.message || "Discord sign-in failed.");
      });
  }, []);

  return null;
}

function ProfileBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const save = useServerFn(saveProfile);
  const [background, setBackground] = useState(user?.profileBackground ?? "");
  const [avatarImage, setAvatarImage] = useState(user?.avatarUrl ?? "");
  const [avatarVideo, setAvatarVideo] = useState(user?.avatarVideoUrl ?? "");
  const [profileFrame, setProfileFrame] = useState(user?.profileFrame ?? "none");
  const [frameDraft, setFrameDraft] = useState(user?.profileFrame ?? "none");
  const [framePickerOpen, setFramePickerOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name ?? "");
  const [bioDraft, setBioDraft] = useState(user?.bio ?? "");
  const [framePage, setFramePage] = useState(0);
  const [uploading, setUploading] = useState<"avatar" | "background" | "video" | null>(null);
  const [showDiscordPrompt, setShowDiscordPrompt] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setBackground(user.profileBackground ?? "");
    setAvatarImage(user.avatarUrl ?? "");
    setAvatarVideo(user.avatarVideoUrl ?? "");
    setProfileFrame(normalizeProfileFrame(user.profileFrame));
    setFrameDraft(normalizeProfileFrame(user.profileFrame));
    setNameDraft(user.name ?? "");
    setBioDraft(user.bio ?? "");
  }, [user?.id, user?.profileBackground, user?.profileFrame, user?.avatarUrl, user?.avatarVideoUrl]);

  type ProfileMedia = {
    name?: string;
    bio?: string;
    avatarImage?: string;
    avatarVideo?: string;
    background?: string;
    profileFrame?: string;
  };
  const saveMutation = useMutation({
    mutationFn: (media: ProfileMedia = {}) => save({ data: {
      name: media.name ?? user?.name ?? "Player",
      bio: media.bio ?? user?.bio ?? "",
      title: user?.title ?? "Player",
      avatar: user?.avatar ?? "default",
      banner: user?.banner ?? "aurora",
      avatarImage: media.avatarImage ?? avatarImage.trim(),
      avatarVideo: media.avatarVideo ?? avatarVideo.trim(),
      background: media.background ?? background.trim(),
      profileFrame: media.profileFrame ?? profileFrame,
    } }),
    onSuccess: (next) => {
      writeSession(next);
      toast.success("Profile appearance synced successfully.");
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
      saveMutation.mutate(type === "avatar" ? { avatarImage: image } : { background: image });
      toast.success(`${type === "avatar" ? "Profile image" : "Profile background"} saved.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That image could not be prepared.");
    } finally {
      setUploading(null);
    }
    return;
  };

  const openFramePicker = () => {
    setFrameDraft(profileFrame);
    setFramePage(0);
    setFramePickerOpen(true);
  };

  const saveSelectedFrame = () => {
    const frame = normalizeProfileFrame(frameDraft);
    if (frame === profileFrame) {
      setFramePickerOpen(false);
      return;
    }
    setProfileFrame(frame);
    saveMutation.mutate(
      { profileFrame: frame },
      { onSuccess: () => setFramePickerOpen(false) },
    );
  };

  const openProfileEditor = () => {
    setNameDraft(user?.name ?? "");
    setBioDraft(user?.bio ?? "");
    setProfileEditorOpen(true);
  };

  const saveProfileText = () => {
    const name = nameDraft.trim();
    if (name.length < 2) {
      toast.error("Your name must be at least 2 characters.");
      return;
    }
    saveMutation.mutate(
      { name, bio: bioDraft.trim() },
      { onSuccess: () => setProfileEditorOpen(false) },
    );
  };

  const fetchItems = useServerFn(fetchShopItems);
  const itemsQuery = useQuery({ queryKey: ["aidoru", "items"], queryFn: fetchItems, retry: false });
  const fetchDiscordStatus = useServerFn(fetchDiscordLinkStatus);
  const startDiscord = useServerFn(startDiscordAccountLink);
  const removeDiscord = useServerFn(removeDiscordAccountLink);
  const discordQuery = useQuery({
    queryKey: ["aidoru", "discord-link"],
    queryFn: fetchDiscordStatus,
    retry: false,
  });
  useEffect(() => {
    if (discordQuery.data?.linked) {
      setShowDiscordPrompt(false);
    } else if (discordQuery.data && !discordQuery.data.linked) {
      setShowDiscordPrompt(true);
    }
  }, [discordQuery.data?.linked]);
  const discordLinkMutation = useMutation({
    mutationFn: async () => {
      const { authorizationUrl } = await startDiscord({});
      window.location.assign(authorizationUrl);
    },
    onError: (error: Error) => toast.error(error.message || "Could not start Discord linking."),
  });
  const discordUnlinkMutation = useMutation({
    mutationFn: () => removeDiscord({}),
    onSuccess: () => {
      void discordQuery.refetch();
      toast.success("Discord account unlinked.");
    },
    onError: (error: Error) => toast.error(error.message || "Could not unlink Discord."),
  });
  if (!user) return null;

  const progress = trainerLevelProgress(user.trainerLevel, user.trainerXp);
  const itemMap = new Map((itemsQuery.data ?? []).map((item) => [item.id, item]));
  const bag = user.trainerInventory.length > 0 ? user.trainerInventory : user.inventory;
  const totalBagItems = bag.reduce((sum, entry) => sum + entry.qty, 0);
  const profileStyle = {
    "--profile-background": background ? `url(${background})` : "none",
  } as CSSProperties;
  const framePageSize = 4;
  const framePageCount = Math.ceil(PROFILE_FRAMES.length / framePageSize);
  const visibleFrames = PROFILE_FRAMES.slice(framePage * framePageSize, framePage * framePageSize + framePageSize);

  return (
    <div className="profile-page space-y-6 pb-10">
      {showDiscordPrompt && !discordQuery.data?.linked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="discord-link-title">
          <div className="profile-discord-dialog relative w-full max-w-md rounded-3xl border border-indigo-300/30 bg-[#0d1730] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowDiscordPrompt(false)}
              className="absolute right-4 top-4 rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
              aria-label="Close Discord linking prompt"
            >
              <X className="size-4" />
            </button>
            <div className="grid size-12 place-items-center rounded-2xl border border-indigo-300/30 bg-indigo-400/15 text-indigo-200">
              <Link2 className="size-6" />
            </div>
            <p className="hof-kicker mt-5">Connect your accounts</p>
            <h2 id="discord-link-title" className="hof-heading mt-1 text-3xl">Want to link your data with Discord?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Authorize Discord and your Discord account will use this same WhatsApp trainer, progress, wallet, and profile.
            </p>
            <button
              type="button"
              onClick={() => discordLinkMutation.mutate()}
              disabled={discordLinkMutation.isPending}
              className="hof-button mt-6 inline-flex w-full items-center justify-center gap-2"
            >
              <Link2 className="size-4" />
              {discordLinkMutation.isPending ? "Opening Discord…" : "Authorize and link Discord"}
            </button>
            <button
              type="button"
              onClick={() => setShowDiscordPrompt(false)}
              className="mt-3 w-full rounded-xl px-4 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
      {framePickerOpen && (
        <div className="profile-frame-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="frame-picker-title">
          <div className="profile-frame-dialog">
            <div className="profile-frame-dialog-header">
              <h2 id="frame-picker-title">Select a Frame</h2>
              <button type="button" onClick={() => setFramePickerOpen(false)} className="profile-frame-dialog-close" aria-label="Close frame picker">
                <X className="size-5" />
              </button>
            </div>
            <div className="profile-frame-dialog-tab">Standard</div>
            <div className="profile-frame-showcase-grid">
              {visibleFrames.map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  className="profile-frame-showcase"
                  data-selected={frameDraft === frame.id}
                  onClick={() => setFrameDraft(frame.id)}
                  aria-pressed={frameDraft === frame.id}
                >
                  <UserAvatar
                    name=""
                    src={avatarImage || user.avatarUrl}
                    videoSrc={avatarVideo || user.avatarVideoUrl}
                    frame={frame.id}
                    className="profile-frame-showcase-avatar"
                  />
                  <span>{frame.label}</span>
                </button>
              ))}
            </div>
            <div className="profile-frame-dialog-pager">
              <button
                type="button"
                onClick={() => setFramePage((page) => Math.max(0, page - 1))}
                disabled={framePage === 0}
                aria-label="Previous frame page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span>Page {framePage + 1} of {framePageCount}</span>
              <button
                type="button"
                onClick={() => setFramePage((page) => Math.min(framePageCount - 1, page + 1))}
                disabled={framePage >= framePageCount - 1}
                aria-label="Next frame page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="profile-frame-dialog-footer">
              <button type="button" className="profile-frame-cancel" onClick={() => setFramePickerOpen(false)}>
                Cancel
              </button>
              <button type="button" className="profile-frame-save" onClick={saveSelectedFrame} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save Frame"}
              </button>
            </div>
          </div>
        </div>
      )}
      {profileEditorOpen && (
        <div className="profile-frame-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
          <div className="profile-editor-dialog">
            <div className="profile-frame-dialog-header">
              <h2 id="profile-editor-title">Edit Profile</h2>
              <button type="button" onClick={() => setProfileEditorOpen(false)} className="profile-frame-dialog-close" aria-label="Close profile editor">
                <X className="size-5" />
              </button>
            </div>
            <div className="profile-editor-fields">
              <label>
                <span>Name</span>
                <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={32} autoFocus />
              </label>
              <label>
                <span>Bio</span>
                <textarea value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} maxLength={240} rows={4} />
                <small>{bioDraft.length}/240</small>
              </label>
            </div>
            <div className="profile-frame-dialog-footer">
              <button type="button" className="profile-frame-cancel" onClick={() => setProfileEditorOpen(false)}>
                Cancel
              </button>
              <button type="button" className="profile-frame-save" onClick={saveProfileText} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="profile-card hof-panel" style={profileStyle}>
        <div className="profile-card-cover">
          <div className="profile-card-cover-overlay" />
          <button type="button" onClick={() => backgroundInputRef.current?.click()} disabled={Boolean(uploading) || saveMutation.isPending} className="profile-cover-edit" aria-label="Edit profile background">
              <span className="profile-edit-emoji" aria-hidden="true">✏️</span>
          </button>
          <div className="profile-card-cover-mark" aria-hidden="true" />
        </div>
        <div className="profile-card-body">
          <div className="profile-identity-row">
            <div className="profile-avatar-wrap">
              <UserAvatar
                name={user.name}
                src={avatarImage || user.avatarUrl}
                videoSrc={avatarVideo || user.avatarVideoUrl}
                frame={profileFrame}
                className="profile-avatar"
                imageClassName="profile-avatar-image"
              />
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={Boolean(uploading) || saveMutation.isPending} className="profile-avatar-edit" aria-label="Edit profile image">
                <span className="profile-edit-emoji" aria-hidden="true">✏️</span>
              </button>
            </div>
            <div className="profile-identity-copy min-w-0 flex-1">
              <p className="profile-eyebrow">AIDORU TRAINER PROFILE</p>
              <div className="flex items-center gap-2">
                <h2 className="profile-name truncate">{user.name}</h2>
                 <button type="button" className="profile-inline-edit" aria-label="Edit name" onClick={openProfileEditor}>✏️</button>
              </div>
              <div className="flex items-start gap-2">
                <p className="profile-bio">{user.bio || "Your profile is synced from your live trainer data."}</p>
                 <button type="button" className="profile-inline-edit mt-1" aria-label="Edit bio" onClick={openProfileEditor}>✏️</button>
              </div>
            </div>
            <div className="profile-heart" aria-hidden="true">♡</div>
          </div>
          <div className="profile-chip-row">
            <span className="profile-chip profile-chip-primary">WHATSAPP LINKED</span>
            <span className="profile-chip">{user.title}</span>
            {user.guildName && <span className="profile-chip">{user.guildName}</span>}
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" onChange={(event) => handleImageChange(event, "avatar")} className="hidden" disabled={Boolean(uploading) || saveMutation.isPending} />
        <input ref={backgroundInputRef} type="file" accept="image/*" onChange={(event) => handleImageChange(event, "background")} className="hidden" disabled={Boolean(uploading) || saveMutation.isPending} />
      </section>

      <section className="profile-editor hof-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hof-kicker">Profile customization</p>
            <h2 className="hof-heading mt-1 text-3xl">Choose your frame</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Pick a moving frame for your trainer circle. It appears on your profile and beside your name on every leaderboard.
            </p>
          </div>
          <span className="profile-frame-status">{saveMutation.isPending ? "Saving…" : "Synced"}</span>
        </div>
        <div className="profile-frame-current mt-5">
          <UserAvatar
            name={user.name}
            src={avatarImage || user.avatarUrl}
            videoSrc={avatarVideo || user.avatarVideoUrl}
            frame={profileFrame}
            className="profile-frame-current-avatar"
          />
          <div className="min-w-0 flex-1">
            <strong>{PROFILE_FRAMES.find((frame) => frame.id === profileFrame)?.label ?? "Clean"}</strong>
            <p>{PROFILE_FRAMES.find((frame) => frame.id === profileFrame)?.description ?? "No frame"}</p>
          </div>
          <button type="button" className="profile-frame-open" onClick={openFramePicker} disabled={Boolean(uploading) || saveMutation.isPending}>
            Browse frames
          </button>
        </div>
      </section>

      <section className="hof-panel flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-indigo-300/25 bg-indigo-400/10 text-indigo-200">
            <Link2 className="size-5" />
          </div>
          <div>
            <p className="hof-kicker">Shared bot identity</p>
            <h2 className="hof-heading mt-1 text-2xl">Discord account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {discordQuery.data?.linked
                ? `Connected as ${discordQuery.data.discordUsername ?? "Discord user"}. Discord commands reuse this WhatsApp trainer.`
                : "Connect Discord to reuse this WhatsApp trainer account in AKIRA-DISCORD."}
            </p>
          </div>
        </div>
        {discordQuery.data?.linked ? (
          <button
            type="button"
            onClick={() => discordUnlinkMutation.mutate()}
            disabled={discordUnlinkMutation.isPending}
            className="hof-button-secondary inline-flex items-center gap-2 px-4 py-2 text-xs"
          >
            <Unlink className="size-3.5" />
            {discordUnlinkMutation.isPending ? "Unlinking…" : "Unlink Discord"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => discordLinkMutation.mutate()}
            disabled={discordLinkMutation.isPending || discordQuery.isLoading}
            className="hof-button inline-flex items-center gap-2 px-4 py-2 text-xs"
          >
            <Link2 className="size-3.5" />
            {discordLinkMutation.isPending ? "Opening Discord…" : "Link Discord"}
          </button>
        )}
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
