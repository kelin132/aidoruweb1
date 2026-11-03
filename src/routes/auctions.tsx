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
  RotateCcw,
  Search,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession } from "@/components/aidoru/session";
import {
  bidOnAuctionCard,
  fetchAuctionBoard,
  removeEndedAuctionCard,
  restartEndedAuctionCard,
  searchAuctionCards,
  startAuctionBatch,
  uploadUpcomingAuctionCard,
} from "@/lib/aidoru.functions";
import { formatCoins } from "@/lib/game";

export const Route = createFileRoute("/auctions")({
  head: () => ({
    meta: [
      { title: "Live Card Auctions — AIDORU" },
      { name: "description", content: "Bid live on anime cards. Follow every timer and winner." },
      { property: "og:title", content: "AIDORU Live Card Auctions" },
      { property: "og:description", content: "Browse live anime card auctions, place a bid, and see who wins." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://aidoru.zone.id/auction-preview.jpg" },
      { property: "og:image:alt", content: "Anime artwork for the AIDORU card auction page" },
      { property: "og:image:type", content: "image/jpeg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://aidoru.zone.id/auction-preview.jpg" },
    ],
  }),
  component: AuctionsPage,
});

const EMPTY_AUCTIONS: AuctionCardModel[] = [];

function AuctionsPage() {
  return (
    <AppShell
      title="Card auctions"
      hidePageHeading
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
  const restartCard = useServerFn(restartEndedAuctionCard);
  const removeCard = useServerFn(removeEndedAuctionCard);
  const queryClient = useQueryClient();
  const session = useSession();
  const [search, setSearch] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [notice, setNotice] = useState("");

  const boardQuery = useQuery({
    queryKey: ["aidoru", "auctions"],
    queryFn: () => getBoard(),
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    retry: false,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const bid = useMutation({
    mutationFn: ({ auctionId, amount }: { auctionId: string; amount: number }) =>
      sendBid({ data: { auctionId, amount } }),
    onMutate: ({ auctionId, amount }) => {
      void queryClient.cancelQueries({ queryKey: ["aidoru", "auctions"] });
      setNotice("Sending your bid…");
      const previousBoard = queryClient.getQueryData<AuctionBoardModel>(["aidoru", "auctions"]);
      if (previousBoard) {
        const bidderName = session.data?.name ?? "You";
        const optimisticBid: AuctionBidModel = {
          userName: bidderName,
          amount,
          active: true,
          updatedAt: new Date().toISOString(),
          avatarUrl: session.data?.avatarUrl ?? null,
        };
        queryClient.setQueryData<AuctionBoardModel>(["aidoru", "auctions"], {
          ...previousBoard,
          live: previousBoard.live.map((card) => {
            if (card.id !== auctionId) return card;
            const bidders = card.bidders.map((entry) =>
              card.topBid &&
              entry.userName === card.topBid.userName &&
              card.topBid.userName !== bidderName
                ? { ...entry, active: false }
                : entry,
            );
            const bidderIndex = bidders.findIndex((entry) => entry.userName === bidderName);
            if (bidderIndex >= 0) bidders[bidderIndex] = optimisticBid;
            else bidders.push(optimisticBid);
            return {
              ...card,
              topBid: optimisticBid,
              bidders: bidders.sort((left, right) => right.amount - left.amount),
            };
          }),
        });
      }
      return { previousBoard };
    },
    onSuccess: () => {
      setNotice("Bid placed.");
      void queryClient.invalidateQueries({ queryKey: ["aidoru", "auctions"] });
      void queryClient.invalidateQueries({ queryKey: ["aidoru", "session"] });
    },
    onError: (error, _variables, context) => {
      if (context?.previousBoard)
        queryClient.setQueryData(["aidoru", "auctions"], context.previousBoard);
      setNotice(error instanceof Error ? error.message : "Your bid could not be placed. Try again.");
    },
  });

  const upload = useMutation({
    mutationFn: async ({
      name,
      series,
      tier,
      startingBid,
      durationMinutes,
      file,
      imageUrl,
      tierNum,
    }: {
      name: string;
      series: string;
      tier: string;
      tierNum?: number;
      startingBid: number;
      durationMinutes: number;
      file?: File;
      imageUrl?: string;
    }) => {
      const image = file
        ? await prepareAuctionImage(file)
        : null;
      if (!file && !imageUrl) throw new Error("Choose an image or select a card from the API.");
      return uploadCard({
        data: {
          name,
          series,
          tier,
          ...(tierNum === undefined ? {} : { tierNum }),
          startingBid,
          durationMinutes,
          ...(image ? image : { imageUrl }),
        },
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

  const restart = useMutation({
    mutationFn: (auctionId: string) => restartCard({ data: { auctionId } }),
    onSuccess: async () => {
      setNotice("Auction restarted.");
      await queryClient.invalidateQueries({ queryKey: ["aidoru", "auctions"] });
    },
  });

  const removeEnded = useMutation({
    mutationFn: (auctionId: string) => removeCard({ data: { auctionId } }),
    onSuccess: async () => {
      setNotice("Ended auction removed.");
      await queryClient.invalidateQueries({ queryKey: ["aidoru", "auctions"] });
    },
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
  const mutationError = [bid.error, start.error, restart.error, removeEnded.error].find(
    (error) => error instanceof Error,
  )?.message;

  return (
    <main className="storefront-page auction-board storefront-page-mart pb-12">
      <style>{`
        @keyframes auction-card-arrive { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .auction-card-enter { animation: auction-card-arrive 380ms cubic-bezier(.2,.75,.25,1) both; }
        .auction-board { gap: 1.1rem; }
        .auction-hero-copy { min-width: 0; }
        .auction-hero-kicker { color: #78e7ed; font: 800 .58rem/1 var(--font-mono, monospace); letter-spacing: .18em; text-transform: uppercase; }
        .auction-hero-subtitle { max-width: 34rem; margin-top: .55rem; color: #9ba7b8; font: 500 .75rem/1.5 var(--font-display, sans-serif); }
        .auction-stat { min-width: 6rem; }
        .auction-search { grid-column: 1 / -1; }
        .auction-search input { min-height: 2.75rem; }
        .auction-section-heading { display: flex; align-items: end; justify-content: space-between; gap: .75rem; margin: .15rem 0 .75rem; }
        .auction-section-heading h2 { color: #edf6fc; font: 850 clamp(1.25rem, 4vw, 1.7rem)/1.15 var(--font-display, sans-serif); }
        .auction-section-heading p { color: #6cebf0; font: 700 .58rem/1 var(--font-mono, monospace); letter-spacing: .15em; text-transform: uppercase; }
        .auction-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
        .auction-upcoming-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; }
        .auction-wallet { display:flex; align-items:center; gap:.55rem; border:1px solid rgba(255,255,255,.15); border-radius:5px; background:rgba(13,14,17,.82); padding:.6rem .8rem; color:#ffd674; }
        .auction-wallet strong { font:700 .75rem var(--font-mono,monospace); }
        .auction-mascot { display:block; width:clamp(3.5rem,12vw,6rem); height:auto; flex:none; border:0; background:transparent; object-fit:contain; }
        .auction-store-card, .auction-upcoming-card, .auction-ended-card, .auction-admin {
          overflow: hidden; border: 1px solid rgba(160,179,211,.18); border-radius: 1.1rem;
          background: linear-gradient(155deg, rgba(15,20,30,.96), rgba(7,10,16,.96));
          box-shadow: 0 .8rem 2.5rem rgba(0,0,0,.22); backdrop-filter: blur(12px);
        }
        .auction-store-card { min-width: 0; }
        .auction-card-image { position: relative; height: clamp(10rem, 27vw, 15rem); overflow: hidden; background: rgba(4,7,12,.65); }
        .auction-card-image > img { width: 100%; height: 100%; object-fit: contain; padding: .45rem; transition: transform 300ms ease; }
        .auction-store-card:hover .auction-card-image > img { transform: scale(1.035); }
        .auction-image-placeholder { display: grid; height: 100%; place-content: center; text-align: center; color: #6cebf0; }
        .auction-image-placeholder p { margin-top: .5rem; color: #e7edf7; font: 800 1rem var(--font-display, sans-serif); }
        .auction-card-badge { position: absolute; top: .65rem; left: .65rem; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(4,7,12,.86); padding: .38rem .6rem; color: #d9f8fa; font: 800 .55rem/1 var(--font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; }
        .auction-card-badge.timer { right: .65rem; left: auto; color: #f4f7ff; }
        .auction-card-meta { min-width: 0; padding: .72rem .78rem .15rem; }
        .auction-card-title { overflow: hidden; color: #f4f7ff; font: 850 clamp(.88rem,3.5vw,1rem)/1.2 var(--font-display,sans-serif); text-overflow: ellipsis; white-space: nowrap; }
        .auction-card-caption { overflow: hidden; margin-top: .28rem; color: #9099a9; font: 500 .66rem/1.3 var(--font-display,sans-serif); text-overflow: ellipsis; white-space: nowrap; }
        .auction-card-body { padding: .2rem .78rem .78rem; }
        .auction-bid-summary { display:flex; align-items:center; justify-content:space-between; gap:.6rem; border-top:1px solid rgba(255,255,255,.1); padding:.62rem 0; }
        .auction-micro-label { color:#8993a5; font:800 .52rem/1.2 var(--font-mono,monospace); letter-spacing:.12em; text-transform:uppercase; }
        .auction-leader { display:flex; align-items:center; gap:.35rem; min-width:0; margin-top:.25rem; color:#e4f7fa; font:750 .68rem/1.2 var(--font-display,sans-serif); }
        .auction-leader-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .auction-top-bid { margin-top:.25rem; color:#f4d36d; font:850 .9rem/1 var(--font-display,sans-serif); }
        .auction-bidders { margin:.1rem 0 .6rem; border:1px solid rgba(130,153,184,.12); border-radius:.75rem; background:rgba(3,5,9,.34); padding:.55rem; }
        .auction-bidders ol { max-height:6.2rem; overflow:auto; margin-top:.4rem; padding-right:.2rem; }
        .auction-bidders li { min-width:0; color:#cbd5e1; }
        .auction-bid-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.45rem; }
        .auction-bid-input { min-width:0; display:flex; align-items:center; gap:.45rem; border:1px solid rgba(130,153,184,.18); border-radius:.72rem; background:rgba(3,5,9,.55); padding:0 .65rem; color:#6cebf0; }
        .auction-bid-input input { width:100%; min-width:0; min-height:2.55rem; background:transparent; color:#f4f7ff; font:650 .68rem var(--font-display,sans-serif); outline:none; }
        .auction-bid-button { display:inline-flex; min-height:2.55rem; align-items:center; justify-content:center; gap:.35rem; border:1px solid rgba(103,232,249,.2); border-radius:.72rem; background:rgba(28,176,190,.18); padding:0 .8rem; color:#8cf1f2; font:800 .64rem var(--font-display,sans-serif); letter-spacing:.06em; text-transform:uppercase; }
        .auction-bid-button:hover { background:rgba(28,176,190,.28); }
        .auction-bid-button:disabled { cursor:wait; opacity:.52; }
        .auction-admin { border-color:rgba(103,232,249,.2); }
        .auction-admin-header { border-bottom:1px solid rgba(255,255,255,.1); background:rgba(5,9,15,.3); }
        .auction-admin .auction-field input, .auction-admin .auction-field select { min-height:2.7rem; border:1px solid rgba(130,153,184,.18); border-radius:.72rem; background:#080c12; padding:.55rem .7rem; color:#eef4ff; font:600 .72rem var(--font-display,sans-serif); }
        .auction-admin .auction-field select option { background:#10151d; }
        .auction-admin .auction-upload { border-color:rgba(103,232,249,.25); }
        .auction-queue-item { border-color:rgba(130,153,184,.12); background:rgba(255,255,255,.025); }
        .auction-upcoming-card, .auction-ended-card { min-width:0; }
        .auction-upcoming-card { display:flex; min-height:7.5rem; align-items:center; gap:.65rem; padding:.65rem; }
        .auction-upcoming-card .auction-small-media { width:clamp(3.25rem, 19vw, 5.5rem); height:clamp(3.25rem, 19vw, 5.5rem); border-radius:.65rem; object-fit:contain; }
        .auction-small-media { width:4.2rem; height:4.2rem; flex:none; border-radius:.8rem; background:#080c12; object-fit:contain; }
        .auction-end-image { position:relative; height:9rem; background:rgba(4,7,12,.65); }
        .auction-end-image img { width:100%; height:100%; object-fit:contain; padding:.4rem; }
        .auction-status { border-color:rgba(130,153,184,.16); background:rgba(7,10,17,.86); color:#c0c8d4; }
        .auction-focus:focus-visible, .auction-board button:focus-visible, .auction-board input:focus-visible, .auction-board select:focus-visible { outline:2px solid #74e5eb; outline-offset:2px; }
        @media (max-width: 600px) {
          .auction-grid { grid-template-columns: minmax(0,1fr); }
          .auction-upcoming-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap:.5rem; }
          .auction-upcoming-card { align-items:flex-start; flex-wrap:wrap; gap:.45rem; padding:.55rem; }
          .auction-upcoming-card .auction-upcoming-copy { min-width:0; flex:1 1 calc(100% - 3.8rem); }
          .auction-upcoming-card .auction-upcoming-price { width:100%; display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,.08); padding-top:.4rem; }
          .auction-card-image { height: min(68vw, 16rem); }
          .auction-stat { min-width:5rem; }
        }
        @media (prefers-reduced-motion: reduce) { .auction-card-enter, .auction-card-image > img { animation:none; transition:none; } }
      `}</style>
      <header className="storefront-header storefront-hero">
        <div className="auction-hero-copy">
            <p className="auction-hero-kicker flex items-center gap-2">
              <span className="size-2 rounded-full bg-cyan-300" /> AIDORU · CARD EXCHANGE
            </p>
            <h1 className="storefront-title mt-2">Live Auctions</h1>
            <p className="auction-hero-subtitle">Rare finds move quickly. Follow the clock, watch the lead change, and make your bid.</p>
          </div>
          <div className="storefront-balances">
            <div className="auction-wallet" aria-label="Wallet balance">
              <Coins className="size-4" aria-hidden="true" />
              <strong>{formatCoins(session.data?.coins ?? 0)}</strong>
            </div>
            <StatPill icon={<Gavel className="size-4" />} label="Live now" value={String(live.length)} />
            <StatPill icon={<Layers3 className="size-4" />} label="Upcoming" value={String(upcoming.length)} />
          </div>
        </header>
        <section className="storefront-filters" aria-label="Auction filters">
          <label className="storefront-search auction-search">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <input
            aria-label="Search live auctions"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search cards, series, or tier…"
          />
        </label>
        </section>

      {notice && (
        <div
          role="status"
          className="storefront-status"
        >
          {notice}
        </div>
      )}
      {mutationError && (
        <div
          role="alert"
          className="storefront-status border-rose-300/25 text-rose-100"
        >
          {mutationError}
        </div>
      )}
      {boardQuery.isError && (
        <div
          role="alert"
          className="storefront-status border-rose-300/25 text-rose-100"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>The auction board is temporarily unavailable. The rest of the site is still usable.</span>
            <button
              type="button"
              onClick={() => void boardQuery.refetch()}
              disabled={boardQuery.isFetching}
              className="font-semibold underline underline-offset-4 disabled:opacity-50"
            >
              {boardQuery.isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        </div>
      )}

      {boardQuery.isLoading && (
        <div className="storefront-status grid min-h-52 place-items-center gap-3">
          <LoaderCircle className="size-6 animate-spin text-cyan-200" aria-hidden="true" />
          <span>Loading auction board…</span>
        </div>
      )}

      {!boardQuery.isLoading && !boardQuery.isError && (
        <>
          <section>
            <div className="auction-section-heading">
              <div>
                <p>Live auctions</p>
                <h2 className="mt-1">On the block <span>({filteredLive.length})</span></h2>
              </div>
              <img
                src="/auction-mascot.gif"
                alt=""
                aria-hidden="true"
                className="auction-mascot"
                data-testid="img-auction-mascot"
              />
            </div>
            {filteredLive.length ? (
              <div className="storefront-grid auction-grid">
                {filteredLive.map((card, index) => (
                  <AuctionCard
                    key={card.id}
                    card={card}
                    index={index}
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
                    ? "Try another search."
                    : "No cards are live right now."
                }
              />
            )}
          </section>

          {board?.canManage && (
            <AdminDesk
              upcoming={upcoming}
              uploadBusy={upload.isPending}
              startBusy={start.isPending}
              onUpload={async (input) => {
                setNotice("");
                await upload.mutateAsync(input);
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
              <div className="auction-grid auction-upcoming-grid grid">
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
              <div className="auction-grid grid">
                {ended.map((card, index) => (
                  <EndedCard
                    key={card.id}
                    card={card}
                    index={index}
                    canManage={board?.canManage ?? false}
                    restartBusy={restart.isPending && restart.variables === card.id}
                    removeBusy={removeEnded.isPending && removeEnded.variables === card.id}
                    onRestart={() => {
                      setNotice("");
                      restart.mutate(card.id);
                    }}
                    onRemove={() => {
                      setNotice("");
                      removeEnded.mutate(card.id);
                    }}
                  />
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
    <div className="storefront-balance auction-stat">
      <div className="flex items-center gap-1.5 text-cyan-200">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
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
  topBid: AuctionBidModel | null;
  bidders: AuctionBidModel[];
  endsAt: string | null;
  endedAt: string | null;
  winnerName: string | null;
  winnerAvatarUrl: string | null;
  winningBid: number;
  ownerName: string;
};

type AuctionBoardModel = {
  live: AuctionCardModel[];
  upcoming: AuctionCardModel[];
  ended: AuctionCardModel[];
  canManage: boolean;
};

type AuctionBidModel = {
  userName: string;
  amount: number;
  active: boolean;
  updatedAt: string;
  avatarUrl: string | null;
};

function BidderAvatar({ name, src, size = "size-7" }: { name: string; src: string | null; size?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "T";
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-slate-800 font-display text-[9px] font-bold text-cyan-100`} role="img" aria-label={`${name} profile photo`} title={name}>
      {src && !failed ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" /> : initials}
    </span>
  );
}

function AuctionCard({
  card,
  index,
  clock,
  bidBusy,
  onBid,
}: {
  card: AuctionCardModel;
  index: number;
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
    <article style={{ animationDelay: `${index * 65}ms` }} className="auction-card-enter auction-store-card group">
      <div className="auction-card-image">
        {image ? (
          <img
            src={card.media}
            alt={`${card.name} auction card`}
            loading="lazy"
            className="size-full object-contain transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="auction-image-placeholder">
            <Trophy className="mx-auto size-8" aria-hidden="true" />
            <p>{card.name}</p>
          </div>
        )}
        <span className="auction-card-badge">
          {card.tier}
        </span>
        <span
          className={`auction-card-badge timer ${secondsLeft < 60 ? "border-rose-200/35 text-rose-100" : ""}`}
        >
          <Clock3 className="size-3.5" /> {formatCountdown(secondsLeft)}
        </span>
      </div>

      <div className="auction-card-meta">
        <p className="auction-card-title" title={card.name}>{card.name}</p>
        <p className="auction-card-caption">{card.series} <span className="mx-1">·</span> {card.cardId}</p>
      </div>
      <div className="auction-card-body">
        <div className="auction-bid-summary">
          <div>
            <p className="auction-micro-label">
              Current leader
            </p>
            <p className="auction-leader">
              {card.topBid ? (
                <>
                  <Crown className="size-4 text-amber-300" />
                  <BidderAvatar name={card.topBid.userName} src={card.topBid.avatarUrl} />
                  <span className="auction-leader-name">{card.topBid.userName}</span>
                </>
              ) : (
                "Waiting for first bid"
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="auction-micro-label">
              Top bid
            </p>
            <p className="auction-top-bid">
              {card.topBid ? formatCoins(card.topBid.amount) : "—"}
            </p>
          </div>
        </div>

        <div className="auction-bidders">
          <p className="auction-micro-label">
            Bids
          </p>
          {rankedBidders.length ? (
            <ol className="space-y-1.5">
              {rankedBidders.map((entry, index) => (
                <li key={`${card.id}-${index}`} className="flex items-center gap-2 text-xs">
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-md font-mono-ui text-[9px] ${index === 0 ? "bg-amber-300/15 text-amber-200" : "bg-white/5 text-slate-500"}`}
                  >
                    {index + 1}
                  </span>
                  <BidderAvatar name={entry.userName} src={entry.avatarUrl} size="size-6" />
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
            <p className="py-1 text-xs text-slate-500">No bids yet. Set the opening offer.</p>
          )}
        </div>

        <form
          className="auction-bid-form"
          onSubmit={(event) => {
            event.preventDefault();
            const next = Number(amount || minimumBid);
            onBid(next);
            setAmount("");
          }}
        >
          <label className="auction-bid-input">
            <Coins className="size-4 shrink-0 text-cyan-200" aria-hidden="true" />
            <input
              type="number"
              min={minimumBid}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Min ${formatCoins(minimumBid)}`}
              aria-label={`Your bid for ${card.name}`}
              className="auction-focus"
            />
          </label>
          <button
            type="submit"
            disabled={bidBusy || secondsLeft <= 0}
            className="auction-bid-button"
          >
            {bidBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Gavel className="size-4" />
            )}{" "}
            Bid
          </button>
        </form>
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
    tier: string;
    tierNum?: number;
    startingBid: number;
    durationMinutes: number;
    file?: File;
    imageUrl?: string;
  }) => Promise<void>;
  onStart: () => void;
}) {
  const [name, setName] = useState("");
  const [series, setSeries] = useState("");
  const [tier, setTier] = useState("Rare");
  const [tierNum, setTierNum] = useState<number | undefined>(undefined);
  const [startingBid, setStartingBid] = useState("500");
  const [durationMinutes, setDurationMinutes] = useState("15");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [apiSearch, setApiSearch] = useState("");
  const [debouncedApiSearch, setDebouncedApiSearch] = useState("");
  const [localError, setLocalError] = useState("");
  const searchCards = useServerFn(searchAuctionCards);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedApiSearch(apiSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [apiSearch]);

  const apiCardsQuery = useQuery({
    queryKey: ["aidoru", "auction-card-api", debouncedApiSearch.toLowerCase()],
    queryFn: () => searchCards({ data: { query: debouncedApiSearch } }),
    enabled: debouncedApiSearch.length >= 2,
    staleTime: 15_000,
    retry: false,
  });
  const searchIsCurrent =
    apiSearch.trim().toLowerCase() === debouncedApiSearch.toLowerCase();
  const matchingApiCards = searchIsCurrent ? apiCardsQuery.data ?? [] : [];

  const remaining = Math.max(0, 6 - upcoming.length);
  const canStartRound = upcoming.length >= 6;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (!file && !imageUrl) {
      setLocalError("Choose an image or select a card from the API.");
      return;
    }
    if (!name.trim() || !series.trim()) {
      setLocalError("Add the card name and series tag.");
      return;
    }
    const input = {
      name: name.trim(),
      series: series.trim(),
      tier,
      ...(tierNum === undefined ? {} : { tierNum }),
      startingBid: Number(startingBid),
      durationMinutes: Number(durationMinutes),
      ...(file ? { file } : { imageUrl }),
    };
    void onUpload(input).then(() => {
      setName("");
      setSeries("");
      setFile(null);
      setImageUrl("");
      setTierNum(undefined);
      setPreview("");
      setLocalError("");
    }).catch((error: unknown) => {
      setLocalError(error instanceof Error ? error.message : "The card could not be added. Try again.");
    });
  }

  return (
    <section className="auction-admin">
      <div className="auction-admin-header flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-7">
        <div>
          <p className="auction-hero-kicker">Owner tools</p>
          <h3 className="mt-1 font-display text-2xl font-bold text-slate-100">Auction control room</h3>
          <p className="mt-1 text-xs text-slate-400">
            Start when six cards are queued.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-500/15 bg-black/25 px-3 py-2.5">
          <div className="text-right">
            <p className="auction-micro-label">
              Round readiness
            </p>
            <p
              className={`mt-1 font-display text-sm font-bold ${canStartRound ? "text-emerald-200" : "text-amber-200"}`}
            >
              {canStartRound ? "6 cards ready" : `${remaining} more to start`}
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStartRound || startBusy}
            className="hof-button inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-display text-xs font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
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
          <div className="space-y-2">
            <TextField
              label="Find a card in the API"
              value={apiSearch}
              onChange={setApiSearch}
              placeholder="Search name, series, tier, or ID"
            />
            {apiSearch.trim().length === 1 && (
              <p className="text-xs text-slate-400">Enter at least 2 characters to search.</p>
            )}
            {apiSearch.trim().length >= 2 && (!searchIsCurrent || apiCardsQuery.isFetching) && (
              <p className="flex items-center gap-2 text-xs text-slate-400">
                <LoaderCircle className="size-3 animate-spin" />
                Searching cards…
              </p>
            )}
            {searchIsCurrent && apiCardsQuery.isError && (
              <div className="flex items-center justify-between gap-3 text-xs text-rose-200" role="alert">
                <span>The card search could not be completed.</span>
                <button type="button" onClick={() => void apiCardsQuery.refetch()} className="underline underline-offset-4">
                  Retry
                </button>
              </div>
            )}
            {searchIsCurrent && debouncedApiSearch.length >= 2 && !apiCardsQuery.isFetching &&
              !apiCardsQuery.isError && matchingApiCards.length === 0 && (
              <p className="text-xs text-slate-400">No cards with artwork match this search.</p>
            )}
            {matchingApiCards.length > 0 && (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-2">
                {matchingApiCards.map((card) => (
                  <button
                    key={card.cardId}
                    type="button"
                    data-testid={`button-select-auction-api-card-${card.cardId}`}
                    aria-pressed={imageUrl === card.media}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-white/5 ${imageUrl === card.media ? "bg-cyan-200/10 ring-1 ring-cyan-200/35" : ""}`}
                    onClick={() => {
                      setName(card.name);
                      setSeries(card.series || "AIDORU");
                      setTier(card.tier || "Common");
                      setTierNum(Number(card.tierNum) || undefined);
                      setImageUrl(card.media);
                      setFile(null);
                      setPreview(card.media);
                      setLocalError("");
                    }}
                  >
                    <span className="min-w-0 truncate font-semibold text-slate-100">{card.name}</span>
                    <span className="shrink-0 text-slate-400">{card.series} · {card.tier}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
              <label className="auction-field space-y-1.5">
              <span className="auction-micro-label">
                Tier
              </span>
              <input
                value={tier}
                onChange={(event) => {
                  setTier(event.target.value);
                  setTierNum(undefined);
                }}
                maxLength={32}
                required
                className="auction-focus w-full"
              />
            </label>
            <TextField
              label="Starting bid · coins"
              type="number"
              min="1"
              value={startingBid}
              onChange={setStartingBid}
              required
            />
              <label className="auction-field space-y-1.5">
              <span className="auction-micro-label">
                Timer
              </span>
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                className="auction-focus w-full"
              >
                {[5, 10, 15, 30, 60].map((value) => (
                  <option key={value} value={value}>
                    {value} minutes
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="auction-upload group flex min-h-28 cursor-pointer items-center gap-4 rounded-2xl border border-dashed bg-black/20 p-4 transition hover:border-cyan-100/50">
            {preview ? (
              <img
                src={preview}
                alt="Selected card preview"
                className="size-20 rounded-xl object-cover"
              />
            ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-100">
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
                setImageUrl("");
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
            className="hof-button inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-bold disabled:cursor-wait disabled:opacity-50 sm:w-auto"
          >
            {uploadBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}{" "}
            Add to upcoming
          </button>
        </form>

        <div className="rounded-2xl border border-slate-500/15 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="auction-micro-label">
                Queue
              </p>
              <p className="font-display text-lg font-bold text-white">Upcoming cards</p>
            </div>
            <span className="rounded-full bg-cyan-100/10 px-2.5 py-1 font-mono-ui text-xs text-cyan-100">
              {upcoming.length}
            </span>
          </div>
          {upcoming.length ? (
            <div className="grid max-h-[23rem] grid-cols-2 gap-2 overflow-y-auto pr-1">
              {upcoming.map((card, index) => (
                <div
                  key={card.id}
                  className="auction-queue-item min-w-0 rounded-xl border p-2"
                >
                  <img
                    src={card.media}
                    alt={card.name}
                    className="h-24 w-full rounded-lg bg-slate-900 object-contain"
                  />
                  <div className="mt-2 min-w-0">
                    <p className="truncate text-xs font-semibold text-white" title={card.name}>
                      {index + 1}. {card.name}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {card.series} · {card.tier} · {card.durationMinutes}m
                    </p>
                  </div>
                  <span className="mt-1 block truncate font-mono-ui text-[10px] text-cyan-100">
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
    <label className="auction-field space-y-1.5">
      <span className="auction-micro-label">
        {label}
      </span>
      <input
        type={type}
        min={min}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="auction-focus w-full"
      />
    </label>
  );
}

function UpcomingCard({ card, index }: { card: AuctionCardModel; index: number }) {
  return (
    <article className="auction-upcoming-card">
      <div className="relative">
        <img
          src={card.media}
          alt={card.name}
          loading={index > 3 ? "lazy" : "eager"}
          className="auction-small-media"
        />
        <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1.5 py-0.5 font-mono-ui text-[8px] text-cyan-100">
          {card.tier}
        </span>
      </div>
      <div className="auction-upcoming-copy">
        <p className="truncate font-display text-sm font-bold text-slate-100">{card.name}</p>
        <p className="truncate text-xs text-slate-500">{card.series}</p>
        <p className="mt-1 font-mono-ui text-[10px] text-amber-200">UPCOMING</p>
      </div>
      <div className="auction-upcoming-price text-right">
        <p className="font-mono-ui text-[9px] text-slate-500">START</p>
        <p className="font-display text-sm font-bold text-cyan-100">
          {formatCoins(card.startingBid)}
        </p>
      </div>
    </article>
  );
}

function EndedCard({
  card,
  index,
  canManage,
  restartBusy,
  removeBusy,
  onRestart,
  onRemove,
}: {
  card: AuctionCardModel;
  index: number;
  canManage: boolean;
  restartBusy: boolean;
  removeBusy: boolean;
  onRestart: () => void;
  onRemove: () => void;
}) {
  const sold = Boolean(
    card.winnerName ||
      card.winningBid > 0 ||
      Number(card.topBid?.amount) > 0 ||
      card.bidders.some((bid) => bid.active && bid.amount > 0),
  );

  return (
    <article className="auction-ended-card group">
      <div className="auction-end-image">
        {card.media && (
          <img
            src={card.media}
            alt={card.name}
            loading="lazy"
            className="transition group-hover:scale-[1.02]"
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
        <p className="truncate font-display font-bold text-slate-100">{card.name}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{card.series}</p>
        <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2.5">
          <span className="flex min-w-0 items-center gap-2 truncate text-xs text-slate-300">
            {card.winnerName && (
              <BidderAvatar name={card.winnerName} src={card.winnerAvatarUrl} size="size-6" />
            )}
            <span className="truncate">{card.winnerName || "No bids received"}</span>
          </span>
          {card.winnerName && (
            <span className="shrink-0 font-display font-bold text-amber-200">
              {formatCoins(card.winningBid)}
            </span>
          )}
        </div>
        {canManage && (
          <div className="mt-3 flex items-center gap-2">
            {sold ? (
              <span className="flex-1 text-[10px] text-slate-500">Sold cards can’t be restarted.</span>
            ) : (
              <button
                type="button"
                disabled={restartBusy || removeBusy}
                onClick={() => {
                  if (window.confirm(`Restart the auction for "${card.name}"?`)) onRestart();
                }}
                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-200/15 disabled:cursor-wait disabled:opacity-50"
              >
                {restartBusy ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Restart
              </button>
            )}
            <button
              type="button"
              disabled={restartBusy || removeBusy}
              onClick={() => {
                if (window.confirm(`Remove "${card.name}" from ended auctions?`)) onRemove();
              }}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200/15 bg-rose-200/5 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-200/10 disabled:cursor-wait disabled:opacity-50"
            >
              {removeBusy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Remove
            </button>
          </div>
        )}
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
        <p className="auction-hero-kicker">{eyebrow}</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-100">{title}</h2>
      </div>
      <span className="font-mono-ui text-xs text-slate-500">{count} cards</span>
    </div>
  );
}

function EmptyAuctions({ title, body }: { title: string; body: string }) {
  return (
    <div className="storefront-status px-6 py-14 text-center">
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
