import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Coins,
  Clock3,
  Crown,
  Gavel,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Search,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "@/components/aidoru/AppShell";
import {
  bidOnAuctionCard,
  fetchAuctionBoard,
  startAuctionBatch,
  uploadUpcomingAuctionCard,
} from "@/lib/aidoru.functions";
import { formatCoins } from "@/lib/game";

export const Route = createFileRoute("/auctions")({
  head: () => ({
    meta: [
      { title: "Live Card Auctions — AIDORU" },
      {
        name: "description",
        content: "Bid live on anime cards and see every card's leading bidders.",
      },
    ],
  }),
  component: AuctionsPage,
});

const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythical", "Secret"] as const;
const EMPTY_AUCTIONS: AuctionCardModel[] = [];

function AuctionsPage() {
  return (
    <AppShell
      title="Live Card Auctions"
      subtitle="Six cards per round. Every bid, countdown, and winner stays in sync with your shared collection."
    >
      <AuctionsBoard />
    </AppShell>
  );
}

function AuctionsBoard() {
  const getBoard = useServerFn(fetchAuctionBoard);
  const sendBid = useServerFn(bidOnAuctionCard);
  const uploadCard = useServerFn(uploadUpcomingAuctionCard);
  const startBatch = useServerFn(startAuctionBatch);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [notice, setNotice] = useState("");

  const boardQuery = useQuery({
    queryKey: ["aidoru", "auctions"],
    queryFn: () => getBoard(),
    refetchInterval: 4_000,
    staleTime: 1_000,
    retry: false,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const bid = useMutation({
    mutationFn: ({ auctionId, amount }: { auctionId: string; amount: number }) =>
      sendBid({ data: { auctionId, amount } }),
    onSuccess: async () => {
      setNotice("Bid placed. Your coins are held until you’re outbid or the card closes.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["aidoru", "auctions"] }),
        queryClient.invalidateQueries({ queryKey: ["aidoru", "session"] }),
      ]);
    },
    onError: () => setNotice(""),
  });

  const upload = useMutation({
    mutationFn: async ({
      name,
      series,
      tier,
      startingBid,
      durationMinutes,
      file,
    }: {
      name: string;
      series: string;
      tier: (typeof TIERS)[number];
      startingBid: number;
      durationMinutes: number;
      file: File;
    }) => {
      const image = await prepareAuctionImage(file);
      return uploadCard({
        data: { name, series, tier, startingBid, durationMinutes, ...image },
      });
    },
    onSuccess: async ({ cardId }) => {
      setNotice(`${cardId} added to the upcoming queue.`);
      await queryClient.invalidateQueries({ queryKey: ["aidoru", "auctions"] });
    },
    onError: () => setNotice(""),
  });

  const start = useMutation({
    mutationFn: () => startBatch(),
    onSuccess: async ({ started }) => {
      setNotice(`${started} cards are live. Good luck, trainers.`);
      await queryClient.invalidateQueries({ queryKey: ["aidoru", "auctions"] });
    },
    onError: () => setNotice(""),
  });

  const board = boardQuery.data;
  const live = board?.live ?? EMPTY_AUCTIONS;
  const upcoming = board?.upcoming ?? [];
  const ended = board?.ended ?? [];
  const filteredLive = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return live;
    return live.filter((card) =>
      `${card.name} ${card.series} ${card.tier}`.toLowerCase().includes(query),
    );
  }, [live, search]);
  const mutationError = [bid.error, upload.error, start.error].find(
    (error) => error instanceof Error,
  )?.message;

  return (
    <main className="aidoru-page space-y-7 pb-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[radial-gradient(ellipse_at_80%_0%,rgba(34,211,238,0.13),transparent_35%),linear-gradient(135deg,#111822,#0a1018_65%,#11111b)] p-5 shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full border border-cyan-200/10" />
        <div className="pointer-events-none absolute -right-9 -top-16 size-56 rounded-full border border-fuchsia-200/10" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="hof-kicker flex items-center gap-2">
              <span className="size-2 animate-pulse rounded-full bg-cyan-300" /> AIDORU • CARD
              EXCHANGE
            </p>
            <h2 className="hof-heading mt-3 text-4xl leading-none sm:text-5xl">Live Auctions</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              Six cards go live together. Follow the countdown, bid with your wallet coins, and
              watch each card’s leaderboard update.
            </p>
          </div>
          <div className="flex gap-2">
            <StatPill
              icon={<Gavel className="size-4" />}
              label="LIVE NOW"
              value={String(live.length)}
            />
            <StatPill
              icon={<Layers3 className="size-4" />}
              label="UPCOMING"
              value={String(upcoming.length)}
            />
          </div>
        </div>
        <label className="relative mt-6 flex max-w-2xl items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 focus-within:border-cyan-200/45">
          <Search className="size-4 shrink-0 text-cyan-200" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search live auctions by card, series, or tier"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          <span className="hidden shrink-0 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-slate-500 sm:block">
            Live board
          </span>
        </label>
      </section>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-sm text-cyan-100"
        >
          {notice}
        </div>
      )}
      {mutationError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
        >
          {mutationError}
        </div>
      )}
      {boardQuery.isError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
        >
          The auction board could not load. Refresh the page to reconnect.
        </div>
      )}

      {boardQuery.isLoading && (
        <div className="hof-panel grid min-h-52 place-items-center text-sm text-slate-400">
          <LoaderCircle className="size-6 animate-spin text-cyan-200" />
        </div>
      )}

      {!boardQuery.isLoading && !boardQuery.isError && (
        <>
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="hof-kicker">Place your bid</p>
                <h3 className="hof-heading mt-1 text-3xl">
                  On the block <span className="ml-1 text-cyan-200">({filteredLive.length})</span>
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Board refreshes every 4 seconds · countdowns update live
              </p>
            </div>
            {filteredLive.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredLive.map((card) => (
                  <AuctionCard
                    key={card.id}
                    card={card}
                    clock={clock}
                    bidBusy={bid.isPending}
                    onBid={(amount) => {
                      setNotice("");
                      bid.mutate({ auctionId: card.id, amount });
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyAuctions
                title={search ? "No matching cards" : "The floor is quiet"}
                body={
                  search
                    ? "Try a different card name, series, or tier."
                    : "The next six-card round will appear here as soon as the owner starts it."
                }
              />
            )}
          </section>

          {board?.canManage && (
            <AdminDesk
              upcoming={upcoming}
              uploadBusy={upload.isPending}
              startBusy={start.isPending}
              onUpload={(input) => {
                setNotice("");
                upload.mutate(input);
              }}
              onStart={() => {
                setNotice("");
                start.mutate();
              }}
            />
          )}

          {!!upcoming.length && (
            <section>
              <SectionHeading
                eyebrow="Next in rotation"
                title="Upcoming cards"
                count={upcoming.length}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {upcoming.map((card, index) => (
                  <UpcomingCard key={card.id} card={card} index={index} />
                ))}
              </div>
            </section>
          )}

          {!!ended.length && (
            <section>
              <SectionHeading
                eyebrow="Winners are in"
                title="Recently ended"
                count={ended.length}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {ended.map((card, index) => (
                  <EndedCard key={card.id} card={card} index={index} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function StatPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-[5.5rem] rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-cyan-200">
        {icon}
        <span className="font-mono-ui text-[9px] tracking-[0.12em] text-slate-400">{label}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

type AuctionCardModel = {
  id: string;
  cardId: string;
  name: string;
  tier: string;
  tierNum: string;
  series: string;
  media: string;
  startingBid: number;
  durationMinutes: number;
  status: "upcoming" | "live" | "ended";
  topBid: { userName: string; amount: number; active: boolean; updatedAt: string } | null;
  bidders: { userName: string; amount: number; active: boolean; updatedAt: string }[];
  endsAt: string | null;
  endedAt: string | null;
  winnerName: string | null;
  winningBid: number;
  ownerName: string;
};

function AuctionCard({
  card,
  clock,
  bidBusy,
  onBid,
}: {
  card: AuctionCardModel;
  clock: number;
  bidBusy: boolean;
  onBid: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const minimumBid = Math.max(card.startingBid, (card.topBid?.amount ?? 0) + 1);
  const secondsLeft = Math.max(
    0,
    Math.ceil(((card.endsAt ? new Date(card.endsAt).getTime() : clock) - clock) / 1000),
  );
  const rankedBidders = card.bidders;
  const image = card.media && /^https?:\/\//.test(card.media);

  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-slate-700/70 bg-[#0c1017] shadow-xl shadow-black/20 transition hover:border-cyan-200/35">
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-cyan-300/15 via-slate-950 to-fuchsia-300/10">
        {image ? (
          <img
            src={card.media}
            alt={`${card.name} auction card`}
            loading="lazy"
            className="size-full object-contain transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid size-full place-items-center text-center">
            <Sparkles className="size-8 text-cyan-200" />
            <p className="mt-2 font-display text-xl">{card.name}</p>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/75 px-3 py-1.5 font-display text-xs font-bold text-cyan-100">
          {card.tier}
        </span>
        <span
          className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono-ui text-xs font-bold ${secondsLeft < 60 ? "border-rose-200/35 bg-rose-950/80 text-rose-100" : "border-white/15 bg-black/75 text-white"}`}
        >
          <Clock3 className="size-3.5" /> {formatCountdown(secondsLeft)}
        </span>
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0c1017] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="truncate font-display text-xl font-bold text-white">{card.name}</p>
          <p className="truncate text-xs text-slate-300">
            {card.series} <span className="mx-1 text-slate-600">·</span> {card.cardId}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="mb-3 flex items-end justify-between border-b border-white/10 pb-3">
          <div>
            <p className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-slate-500">
              Current leader
            </p>
            <p className="mt-1 flex items-center gap-1.5 font-display text-sm font-semibold text-cyan-100">
              {card.topBid ? (
                <>
                  <Crown className="size-4 text-amber-300" />
                  {card.topBid.userName}
                </>
              ) : (
                "Waiting for first bid"
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-slate-500">
              Top bid
            </p>
            <p className="font-display text-xl font-bold text-cyan-200">
              {card.topBid ? formatCoins(card.topBid.amount) : "—"}
            </p>
          </div>
        </div>

        <div className="mb-3 rounded-xl border border-white/5 bg-white/[0.025] p-3">
          <p className="mb-2 font-mono-ui text-[9px] uppercase tracking-[0.15em] text-slate-500">
            Bid ladder <span className="text-slate-600">· highest to lowest</span>
          </p>
          {rankedBidders.length ? (
            <ol className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {rankedBidders.map((entry, index) => (
                <li key={`${card.id}-${index}`} className="flex items-center gap-2 text-xs">
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-md font-mono-ui text-[9px] ${index === 0 ? "bg-amber-300/15 text-amber-200" : "bg-white/5 text-slate-500"}`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-200">{entry.userName}</span>
                  {!entry.active && (
                    <span className="font-mono-ui text-[8px] uppercase tracking-wider text-slate-600">
                      Outbid
                    </span>
                  )}
                  <span className="font-mono-ui font-semibold text-cyan-100">
                    {formatCoins(entry.amount)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-1 text-xs text-slate-500">Be the first trainer on the board.</p>
          )}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = Number(amount || minimumBid);
            onBid(next);
            setAmount("");
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 focus-within:border-cyan-200/45">
            <Coins className="size-4 shrink-0 text-cyan-200" aria-hidden="true" />
            <input
              type="number"
              min={minimumBid}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Min ${formatCoins(minimumBid)}`}
              aria-label={`Your bid for ${card.name}`}
              className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-600"
            />
          </label>
          <button
            type="submit"
            disabled={bidBusy || secondsLeft <= 0}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 font-display text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-50"
          >
            {bidBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Gavel className="size-4" />
            )}{" "}
            Bid
          </button>
        </form>
        <p className="mt-2 text-[10px] text-slate-500">
          Your bid is held from your wallet until you’re outbid or win.
        </p>
      </div>
    </article>
  );
}

function AdminDesk({
  upcoming,
  uploadBusy,
  startBusy,
  onUpload,
  onStart,
}: {
  upcoming: AuctionCardModel[];
  uploadBusy: boolean;
  startBusy: boolean;
  onUpload: (input: {
    name: string;
    series: string;
    tier: (typeof TIERS)[number];
    startingBid: number;
    durationMinutes: number;
    file: File;
  }) => void;
  onStart: () => void;
}) {
  const [name, setName] = useState("");
  const [series, setSeries] = useState("");
  const [tier, setTier] = useState<(typeof TIERS)[number]>("Rare");
  const [startingBid, setStartingBid] = useState("500");
  const [durationMinutes, setDurationMinutes] = useState("15");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [localError, setLocalError] = useState("");

  const remaining = Math.max(0, 6 - upcoming.length);
  const canStartRound = upcoming.length >= 6;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (!file) {
      setLocalError("Choose a card image first.");
      return;
    }
    if (!name.trim() || !series.trim()) {
      setLocalError("Add the card name and series tag.");
      return;
    }
    onUpload({
      name: name.trim(),
      series: series.trim(),
      tier,
      startingBid: Number(startingBid),
      durationMinutes: Number(durationMinutes),
      file,
    });
    setName("");
    setSeries("");
    setFile(null);
    setPreview("");
  }

  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-fuchsia-200/20 bg-[linear-gradient(135deg,rgba(34,20,42,0.56),rgba(12,16,23,0.98)_48%)] shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
        <div>
          <p className="hof-kicker text-fuchsia-200">Owner tools</p>
          <h3 className="hof-heading mt-1 text-2xl">Auction control room</h3>
          <p className="mt-1 text-xs text-slate-400">
            Upload and tag cards now; start launches the next six together.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
          <div className="text-right">
            <p className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-slate-500">
              Round readiness
            </p>
            <p
              className={`font-display text-sm font-bold ${canStartRound ? "text-emerald-200" : "text-amber-200"}`}
            >
              {canStartRound ? "6 cards ready" : `${remaining} more to start`}
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStartRound || startBusy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fuchsia-200 px-4 font-display text-xs font-bold uppercase tracking-wide text-slate-950 transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Gavel className="size-4" />
            )}{" "}
            Start next 6
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)]">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Card name"
              value={name}
              onChange={setName}
              placeholder="e.g. Touka Kirishima"
              required
            />
            <TextField
              label="Series tag"
              value={series}
              onChange={setSeries}
              placeholder="e.g. Tokyo Ghoul"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-slate-400">
                Tier
              </span>
              <select
                value={tier}
                onChange={(event) => setTier(event.target.value as (typeof TIERS)[number])}
                className="w-full rounded-xl border border-white/10 bg-[#0b1017] px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-200/40"
              >
                {TIERS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <TextField
              label="Starting bid · coins"
              type="number"
              min="1"
              value={startingBid}
              onChange={setStartingBid}
              required
            />
            <label className="space-y-1.5">
              <span className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-slate-400">
                Timer
              </span>
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b1017] px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-200/40"
              >
                {[5, 10, 15, 30, 60].map((value) => (
                  <option key={value} value={value}>
                    {value} minutes
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="group flex min-h-28 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-fuchsia-100/25 bg-black/20 p-4 transition hover:border-fuchsia-100/50">
            {preview ? (
              <img
                src={preview}
                alt="Selected card preview"
                className="size-20 rounded-xl object-cover"
              />
            ) : (
              <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-fuchsia-100">
                <ImagePlus className="size-6" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-semibold text-white">
                {file ? file.name : "Choose card artwork"}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                JPG, PNG, or WebP · compressed for fast loading
              </span>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
                setPreview(nextFile ? URL.createObjectURL(nextFile) : "");
                setLocalError("");
              }}
            />
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300">
              <Upload className="size-3.5" /> Browse
            </span>
          </label>
          {localError && (
            <p role="alert" className="text-xs text-rose-200">
              {localError}
            </p>
          )}
          <button
            type="submit"
            disabled={uploadBusy}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-100/30 bg-fuchsia-100/10 px-4 font-display text-sm font-bold text-fuchsia-50 transition hover:bg-fuchsia-100/15 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
          >
            {uploadBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}{" "}
            Add to upcoming
          </button>
        </form>

        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-slate-500">
                Queue
              </p>
              <p className="font-display text-lg font-bold text-white">Upcoming cards</p>
            </div>
            <span className="rounded-full bg-fuchsia-100/10 px-2.5 py-1 font-mono-ui text-xs text-fuchsia-100">
              {upcoming.length}
            </span>
          </div>
          {upcoming.length ? (
            <div className="max-h-[23rem] space-y-2 overflow-y-auto pr-1">
              {upcoming.map((card, index) => (
                <div
                  key={card.id}
                  className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.025] p-2"
                >
                  <img
                    src={card.media}
                    alt=""
                    className="size-12 rounded-lg bg-slate-900 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">
                      {index + 1}. {card.name}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {card.series} · {card.tier} · {card.durationMinutes}m
                    </p>
                  </div>
                  <span className="font-mono-ui text-[10px] text-cyan-100">
                    {formatCoins(card.startingBid)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/10 px-5 text-center text-xs leading-5 text-slate-500">
              Uploaded cards appear here as upcoming until you start a six-card round.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1.5">
      <span className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      <input
        type={type}
        min={min}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-[#0b1017] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-200/40"
      />
    </label>
  );
}

function UpcomingCard({ card, index }: { card: AuctionCardModel; index: number }) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-[#0b1017] p-3">
      <div className="relative size-[4.25rem] shrink-0 overflow-hidden rounded-xl bg-slate-900">
        <img
          src={card.media}
          alt={card.name}
          loading={index > 3 ? "lazy" : "eager"}
          className="size-full object-cover"
        />
        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 font-mono-ui text-[8px] text-cyan-100">
          {card.tier}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold text-white">{card.name}</p>
        <p className="truncate text-xs text-slate-500">{card.series}</p>
        <p className="mt-1 font-mono-ui text-[10px] text-amber-200">UPCOMING</p>
      </div>
      <div className="text-right">
        <p className="font-mono-ui text-[9px] text-slate-500">START</p>
        <p className="font-display text-sm font-bold text-cyan-100">
          {formatCoins(card.startingBid)}
        </p>
      </div>
    </article>
  );
}

function EndedCard({ card, index }: { card: AuctionCardModel; index: number }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-700/55 bg-[#0b1017]">
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-fuchsia-200/10 to-slate-950">
        {card.media && (
          <img
            src={card.media}
            alt={card.name}
            loading="lazy"
            className="size-full object-contain opacity-90 transition group-hover:scale-[1.02]"
          />
        )}
        <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-wider text-slate-300">
          Ended
        </span>
        {card.winnerName && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-200 px-2.5 py-1 font-mono-ui text-[9px] font-bold uppercase text-slate-950">
            <Trophy className="size-3" /> Winner
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="truncate font-display font-bold text-white">{card.name}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{card.series}</p>
        <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2.5">
          <span className="truncate text-xs text-slate-300">
            {card.winnerName || "No bids received"}
          </span>
          {card.winnerName && (
            <span className="shrink-0 font-display font-bold text-amber-200">
              {formatCoins(card.winningBid)}
            </span>
          )}
        </div>
      </div>
      <span className="sr-only">Recent result {index + 1}</span>
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        <p className="hof-kicker">{eyebrow}</p>
        <h3 className="hof-heading mt-1 text-2xl">{title}</h3>
      </div>
      <span className="font-mono-ui text-xs text-slate-500">{count} cards</span>
    </div>
  );
}

function EmptyAuctions({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-700 bg-[#0c1017] px-6 py-14 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-cyan-200/15 bg-cyan-200/5 text-cyan-100">
        <Gavel className="size-5" />
      </div>
      <p className="mt-4 font-display text-xl font-bold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{body}</p>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

async function prepareAuctionImage(file: File): Promise<{
  contentType: "image/jpeg" | "image/png" | "image/webp";
  imageBase64: string;
}> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP card image.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1200 / image.width, 1600 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the card image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (!blob) throw new Error("The card image could not be compressed.");
    if (blob.size > 1_250_000)
      throw new Error("This image is still too large. Choose a smaller card image.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Image read failed."));
      reader.onerror = () => reject(new Error("Image read failed."));
      reader.readAsDataURL(blob);
    });
    const separator = dataUrl.indexOf(",");
    return {
      contentType: "image/webp",
      imageBase64: dataUrl.slice(separator + 1),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
