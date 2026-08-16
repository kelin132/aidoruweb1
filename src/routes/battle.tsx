import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, Link2, LoaderCircle, Plus, Radio, Swords, Users } from "lucide-react";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { AppShell, PokeballMark } from "@/components/aidoru/AppShell";
import { fetchBattleRooms, openBattleRoom } from "@/lib/aidoru.functions";
import type { BattleRoomSummary } from "@/lib/game";

export const Route = createFileRoute("/battle")({
  head: () => ({
    meta: [
      { title: "Pokémon Battle Arena — AIDORU" },
      { name: "description", content: "Challenge trainers, spectate live rooms, and enter the Pokémon battle arena." },
    ],
  }),
  component: BattleLobbyPage,
});

function BattleLobbyPage() {
  return (
    <AppShell title="Battle Arena" subtitle="Bring your party online, challenge a trainer, or spectate an active room.">
      <BattleLobby />
    </AppShell>
  );
}

function BattleLobby() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get("room");
    if (roomId) window.location.replace(`/battle/${encodeURIComponent(roomId)}`);
  }, []);
  const listRooms = useServerFn(fetchBattleRooms);
  const openRoom = useServerFn(openBattleRoom);
  const query = useQuery({ queryKey: ["aidoru", "battle-rooms"], queryFn: () => listRooms(), refetchInterval: 4000, retry: false });
  const mutation = useMutation({
    mutationFn: () => openRoom(),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ["aidoru", "battle-rooms"] });
      window.location.assign(`/battle/${encodeURIComponent(room.id)}`);
    },
  });

  const rooms = (query.data ?? []) as BattleRoomSummary[];
  return (
    <div className="aidoru-page aidoru-page-battle space-y-6 pb-12">
      <section className="battle-hero hof-panel relative overflow-hidden p-5 sm:p-8">
        <BattleLobbyBackdrop />
        <div className="relative z-10 max-w-2xl">
          <p className="hof-kicker">Live trainer combat</p>
          <h2 className="hof-heading mt-2 text-4xl sm:text-6xl">Enter the arena.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">Open a room here, share its URL with another trainer, and use your bot party order, lead Pokémon, moves, and battle items in the live arena.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="hof-button inline-flex items-center gap-2">
              {mutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {mutation.isPending ? "Opening room…" : "Open battle room"}
            </button>
            <a href="#rooms" className="hof-button-secondary inline-flex items-center gap-2"><Radio className="size-4" />Watch live rooms</a>
          </div>
          {mutation.isError && <p className="mt-3 text-sm text-rose-200">{mutation.error instanceof Error ? mutation.error.message : "Unable to open a room."}</p>}
        </div>
        <div className="battle-hero-orb" aria-hidden="true"><Swords className="size-16 text-cyan-100" /></div>
      </section>

      <JoinBattleCard />

      <section id="rooms" className="hof-panel p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="hof-kicker">Spectator feed</p><h2 className="hof-heading mt-1 text-3xl">Live rooms</h2></div>
          <div className="font-mono-ui text-xs text-muted-foreground"><Users className="mr-1 inline size-3" />{rooms.length} visible</div>
        </div>
        {query.isLoading && <div className="battle-empty"><LoaderCircle className="size-6 animate-spin text-cyan-200" />Scanning the arena…</div>}
        {query.isError && <div className="battle-empty text-rose-100">The arena feed is offline. Refresh when the shared room service is available.</div>}
        {!query.isLoading && !query.isError && rooms.length === 0 && <div className="battle-empty">No rooms are open. Create the first one and invite a trainer.</div>}
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {rooms.map((room) => <BattleRoomCard key={room.id} room={room} />)}
        </div>
      </section>
    </div>
  );
}

function JoinBattleCard() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = (roomId.trim().split("/battle/").pop() ?? "").replace(/^\/+|\/+$/g, "");
    if (!normalized) {
      setError("Enter a battle ID or paste a battle-room link.");
      return;
    }
    setError(null);
    window.location.assign(`/battle/${encodeURIComponent(normalized)}`);
  };

  return (
    <section className="battle-join-card hof-panel relative overflow-hidden p-5 sm:p-8">
      <div className="battle-join-card-glow" aria-hidden="true" />
      <div className="battle-join-ball" aria-hidden="true"><img src="/item-ball.png" alt="" /></div>
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <p className="hof-kicker">Enter a shared arena</p>
        <h2 className="hof-heading mt-2 text-3xl sm:text-5xl">Join a battle</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-300">Enter a room ID to play with another trainer or spectate a live room. WhatsApp challenges use *.cha* and open this exact battle arena for both trainers.</p>
        <form onSubmit={join} className="mx-auto mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="battle-room-id">Battle ID</label>
          <input id="battle-room-id" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="e.g. battle-a1b2c3d4" className="battle-room-input" autoComplete="off" />
          <button type="submit" className="hof-button inline-flex items-center justify-center gap-2 whitespace-nowrap"><span>Enter battle</span><ArrowRight className="size-4" /></button>
        </form>
        {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}
      </div>
    </section>
  );
}

function BattleLobbyBackdrop() {
  const Pokémon = [
    { name: "Pikachu", src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png", className: "battle-lobby-pokemon battle-lobby-pikachu" },
    { name: "Dragonite", src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/149.png", className: "battle-lobby-pokemon battle-lobby-dragonite" },
    { name: "Charizard", src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png", className: "battle-lobby-pokemon battle-lobby-charizard" },
    { name: "Jigglypuff", src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/39.png", className: "battle-lobby-pokemon battle-lobby-jigglypuff" },
  ];

  return (
    <div className="battle-lobby-backdrop" aria-hidden="true">
      <div className="battle-lobby-nebula" />
      <div className="battle-lobby-grid" />
      <div className="battle-lobby-particle-cloud">
        {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ ["--particle-index" as string]: index, ["--particle-top" as string]: `${8 + index * 4.8}%`, ["--particle-left" as string]: `${3 + ((index * 17) % 94)}%` } as CSSProperties} />)}
      </div>
      {Pokémon.map((pokemon) => <img key={pokemon.name} className={pokemon.className} src={pokemon.src} alt="" />)}
    </div>
  );
}

function BattleRoomCard({ room }: { room: BattleRoomSummary }) {
  return (
    <article className="battle-room-card">
      <div className="flex items-center justify-between gap-3">
        <span className={`battle-status battle-status-${room.status}`}>{room.status}</span>
        <span className="font-mono-ui text-[10px] text-muted-foreground">{room.spectators} watching</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TrainerMini name={room.challenger.name} avatar={room.challenger.avatarUrl} />
        <span className="font-display text-2xl font-black text-cyan-200">VS</span>
        <TrainerMini name={room.opponent?.name ?? "Waiting"} avatar={room.opponent?.avatarUrl ?? null} align="right" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`/battle/${encodeURIComponent(room.id)}`} className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><ExternalLink className="size-3" />Enter room</a>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/battle/${room.id}`)} className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><Link2 className="size-3" />Copy link</button>
      </div>
    </article>
  );
}

function TrainerMini({ name, avatar, align = "left" }: { name: string; avatar: string | null; align?: "left" | "right" }) {
  return <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end text-right" : ""}`}><div className="battle-avatar">{avatar ? <img src={avatar} alt="" loading="lazy" /> : <PokeballMark small />}</div><span className="truncate font-display text-lg font-bold">{name}</span></div>;
}
