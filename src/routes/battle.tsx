import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, LoaderCircle, Plus, Radio, Swords, Users } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
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
  const listRooms = useServerFn(fetchBattleRooms);
  const openRoom = useServerFn(openBattleRoom);
  const query = useQuery({ queryKey: ["aidoru", "battle-rooms"], queryFn: () => listRooms(), refetchInterval: 4000, retry: false });
  const mutation = useMutation({
    mutationFn: () => openRoom(),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ["aidoru", "battle-rooms"] });
      window.location.href = `/battle/${room.id}`;
    },
  });

  const rooms = (query.data ?? []) as BattleRoomSummary[];
  return (
    <div className="aidoru-page aidoru-page-battle space-y-6 pb-12">
      <section className="battle-hero hof-panel relative overflow-hidden p-5 sm:p-8">
        <div className="relative z-10 max-w-2xl">
          <p className="hof-kicker">Live trainer combat</p>
          <h2 className="hof-heading mt-2 text-4xl sm:text-6xl">Enter the arena.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">The room uses your bot party order, lead Pokémon, moves, and battle items. Share the room URL after you challenge a trainer from WhatsApp.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="hof-button inline-flex items-center gap-2">
              {mutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Open battle room
            </button>
            <a href="#rooms" className="hof-button-secondary inline-flex items-center gap-2"><Radio className="size-4" />Watch live rooms</a>
          </div>
          {mutation.isError && <p className="mt-3 text-sm text-rose-200">{mutation.error instanceof Error ? mutation.error.message : "Unable to open a room."}</p>}
        </div>
        <div className="battle-hero-orb" aria-hidden="true"><Swords className="size-16 text-cyan-100" /></div>
      </section>

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
        <a href={`/battle/${room.id}`} className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><ExternalLink className="size-3" />Enter room</a>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/battle/${room.id}`)} className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><Link2 className="size-3" />Copy link</button>
      </div>
    </article>
  );
}

function TrainerMini({ name, avatar, align = "left" }: { name: string; avatar: string | null; align?: "left" | "right" }) {
  return <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end text-right" : ""}`}><div className="battle-avatar">{avatar ? <img src={avatar} alt="" loading="lazy" /> : <Swords className="size-4 text-cyan-200" />}</div><span className="truncate font-display text-lg font-bold">{name}</span></div>;
}
