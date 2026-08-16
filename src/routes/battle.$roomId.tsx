import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, DoorOpen, Eye, Flame, Heart, LoaderCircle, Package, Radio, RotateCcw, Share2, Shield, Sparkles, Swords, UserRound, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AppShell } from "@/components/aidoru/AppShell";
import { applyBattleAction, fetchBattleRoom } from "@/lib/aidoru.functions";
import type { BattleAction, BattlePokemon, BattleRoom, BattleTrainer } from "@/lib/game";

export const Route = createFileRoute("/battle/$roomId")({
  head: () => ({
    meta: [
      { title: "Battle Room — AIDORU" },
      { name: "description", content: "A live Pokémon battle room with moves, items, switching, and spectators." },
    ],
  }),
  component: BattleRoomPage,
});

function BattleRoomPage() {
  const { roomId } = Route.useParams();
  return (
    <AppShell title="Pokémon Battle" subtitle="Enter the arena, ready your party, or spectate the live battle.">
      <BattleRoomBody roomId={roomId} />
    </AppShell>
  );
}

function BattleRoomBody({ roomId }: { roomId: string }) {
  const queryClient = useQueryClient();
  const loadRoom = useServerFn(fetchBattleRoom);
  const act = useServerFn(applyBattleAction);
  const query = useQuery({ queryKey: ["aidoru", "battle-room", roomId], queryFn: () => loadRoom({ data: { roomId } }), refetchInterval: 1400, retry: false });
  const mutation = useMutation({
    mutationFn: (action: BattleAction) => act({ data: { roomId, action } }),
    onSuccess: (room) => queryClient.setQueryData(["aidoru", "battle-room", roomId], room),
  });
  const [flash, setFlash] = useState<string | null>(null);
  const redirectedToLogin = useRef(false);
  const room = query.data;

  useEffect(() => {
    const message = query.error instanceof Error ? query.error.message : "";
    if (!query.isError || redirectedToLogin.current || !/^not signed in\.$/i.test(message)) return;
    redirectedToLogin.current = true;
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/?returnTo=${encodeURIComponent(returnTo)}`);
  }, [query.error, query.isError]);

  if (query.isLoading) return <RoomState icon={<LoaderCircle className="size-7 animate-spin" />} text="Loading battle room…" />;
  if (query.isError || !room) {
    const message = query.error instanceof Error ? query.error.message : "Battle room unavailable.";
    return <RoomState icon={<DoorOpen className="size-7" />} text={message === "Not signed in." ? "Opening the trainer portal so you can sign in and return to this battle…" : message} />;
  }

  const perform = (action: BattleAction) => {
    setFlash(null);
    mutation.mutate(action, { onError: (error) => setFlash(error instanceof Error ? error.message : "That battle action failed.") });
  };
  const isFinished = room.status === "finished";
  const isSpectator = room.joinedAs === "spectator";
  const me = room.joinedAs === "challenger" ? room.challenger : room.opponent;
  const foe = room.joinedAs === "challenger" ? room.opponent : room.challenger;
  const waitingForOpponent = !room.opponent;
  const waitingForReady = Boolean(room.opponent && room.status === "waiting");
  const forcedSwitch = room.forcedSwitch === room.joinedAs;
  const myTurn = room.turn === room.joinedAs;

  return (
    <div className="aidoru-page aidoru-page-battle-room space-y-5 pb-12">
      <section className="battle-room-toolbar hof-panel flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-3"><span className="battle-live-dot" /><div><p className="hof-kicker">Room {room.code}</p><p className="font-display text-lg font-bold">{room.status === "active" ? "Live combat" : room.status === "finished" ? "Battle complete" : "Waiting room"}</p></div></div>
        <div className="flex flex-wrap gap-2"><BattleSoundscape combatLog={room.combatLog} status={room.status} /><button type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href).then(() => setFlash("Battle link copied."))} className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><Copy className="size-3" />Share room</button><a href="/battle" className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><Radio className="size-3" />All rooms</a></div>
      </section>

      {waitingForOpponent && <WaitingRoomCard room={room} />}
      {isSpectator && <section className="battle-spectator-banner"><Eye className="size-5 text-cyan-200" /><div><p className="font-display text-lg font-bold text-cyan-100">Spectate mode</p><p className="text-sm text-slate-300">You are watching this room read-only. Trainers keep control of their Pokémon.</p></div></section>}
      {waitingForReady && <section className="battle-ready-banner hof-panel p-5"><p className="hof-kicker">Both parties loaded</p><h2 className="hof-heading mt-1 text-3xl">Ready when you are.</h2><p className="mt-2 text-sm text-slate-300">The room is shared. Each trainer must press ready before the first lead Pokémon is sent out.</p><button type="button" onClick={() => perform({ type: "ready" })} disabled={mutation.isPending || me?.ready} className="hof-button mt-4 inline-flex items-center gap-2"><Check className="size-4" />{me?.ready ? "Ready" : "Ready up"}</button></section>}

      <BattleArena room={room} me={me} foe={foe} myTurn={myTurn} forcedSwitch={forcedSwitch} isSpectator={isSpectator} mutationPending={mutation.isPending} onAction={perform} />
      {flash && <p className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{flash}</p>}
    </div>
  );
}

function WaitingRoomCard({ room }: { room: BattleRoom }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const roomUrl = `${typeof window === "undefined" ? "" : window.location.origin}/battle/${encodeURIComponent(room.code)}`;
  const copy = (value: string, kind: "code" | "link") => {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(value).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1600);
    });
  };
  const share = () => {
    if (navigator.share) {
      void navigator.share({ title: "AIDORU Pokémon Battle", text: `Join my Pokémon battle with code ${room.code}.`, url: roomUrl }).catch(() => undefined);
      return;
    }
    copy(roomUrl, "link");
  };

  return (
    <section className="battle-waiting-card hof-panel">
      <div className="battle-waiting-heading"><div><p className="hof-kicker">Room ready</p><h2 className="battle-panel-title">Waiting for trainer</h2></div><span className="battle-waiting-status"><span className="battle-waiting-dot" />Open</span></div>
      <p className="mt-4 text-sm leading-6 text-slate-300">Share this code or link. The first signed-in trainer who opens it joins automatically.</p>
      <div className="battle-code-box"><p className="hof-kicker">Room code</p><p className="battle-code-value">{room.code}</p><p className="battle-code-url">{roomUrl}</p></div>
      <div className="battle-waiting-actions"><button type="button" onClick={() => copy(room.code, "code")} className="battle-secondary-button">{copied === "code" ? <><Check className="size-4" />Copied</> : <><Copy className="size-4" />Copy code</>}</button><button type="button" onClick={share} className="battle-primary-button"><Share2 className="size-4" />{copied === "link" ? "Link copied" : "Share room"}</button></div>
      <a href="/battle" className="battle-back-link">Return to battle lobby</a>
    </section>
  );
}

function BattleSoundscape({ combatLog, status }: { combatLog: string[]; status: BattleRoom["status"] }) {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const previousLength = useRef(combatLog.length);

  const context = () => {
    if (typeof window === "undefined") return null;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioRef.current ??= new AudioContextCtor();
    void audioRef.current.resume();
    return audioRef.current;
  };

  const tone = (frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.035) => {
    const ctx = context();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  };

  useEffect(() => {
    if (!enabled) {
      previousLength.current = combatLog.length;
      return;
    }
    const latest = combatLog[combatLog.length - 1] ?? "";
    if (combatLog.length > previousLength.current) {
      if (/fainted/i.test(latest)) {
        tone(180, 0.24, "sawtooth", 0.06);
        window.setTimeout(() => tone(110, 0.35, "triangle", 0.045), 100);
      } else if (/wins|victory|complete/i.test(latest) || status === "finished") {
        tone(523, 0.18, "triangle");
        window.setTimeout(() => tone(659, 0.24, "triangle"), 130);
      } else if (/hit|damage|used|attacked|sent out/i.test(latest)) {
        tone(260, 0.08, "square", 0.025);
      }
      previousLength.current = combatLog.length;
    }
  }, [combatLog, enabled, status]);

  useEffect(() => {
    if (!enabled) return;
    const ctx = context();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 98;
    gain.gain.value = 0.006;
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    const pulse = window.setInterval(() => {
      oscillator.frequency.setTargetAtTime(98 + Math.random() * 16, ctx.currentTime, 0.8);
    }, 1800);
    return () => {
      window.clearInterval(pulse);
      oscillator.stop();
      oscillator.disconnect();
      gain.disconnect();
    };
  }, [enabled]);

  return <button type="button" onClick={() => setEnabled((value) => !value)} className="hof-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs" aria-pressed={enabled}><Radio className={`size-3 ${enabled ? "text-cyan-200" : ""}`} />{enabled ? "Sound on" : "Sound"}</button>;
}

function BattleArena({ room, me, foe, myTurn, forcedSwitch, isSpectator, mutationPending, onAction }: { room: BattleRoom; me: BattleTrainer | null; foe: BattleTrainer | null; myTurn: boolean; forcedSwitch: boolean; isSpectator: boolean; mutationPending: boolean; onAction: (action: BattleAction) => void }) {
  const activeMe = me?.party[me.activeIndex] ?? null;
  const activeFoe = foe?.party[foe.activeIndex] ?? null;
  const [tab, setTab] = useState<"moves" | "items" | "switch">("moves");
  const [transitionId, setTransitionId] = useState(0);
  const previousLogLength = useRef(room.combatLog.length);
  useEffect(() => {
    if (room.combatLog.length > previousLogLength.current) setTransitionId((value) => value + 1);
    previousLogLength.current = room.combatLog.length;
  }, [room.combatLog.length]);
  const statusText = room.status === "finished" ? (room.winnerId ? `${room.winnerId === me?.id ? "You win" : "Battle complete"}` : "Battle complete") : room.status === "waiting" ? (room.opponent ? "Both trainers loaded" : "Waiting for opponent") : forcedSwitch ? "Choose a replacement Pokémon" : myTurn ? "Your turn" : isSpectator ? "Spectating live battle" : "Opponent’s turn";
  const canAct = !isSpectator && !mutationPending && room.status === "active" && (myTurn || forcedSwitch);

  return (
    <section className="battle-arena hof-panel overflow-hidden">
      <div className="battle-arena-top flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"><div className="flex items-center gap-2"><Swords className="size-4 text-cyan-200" /><span className="font-display text-lg font-bold">{room.challenger.name} <span className="text-cyan-300">vs</span> {room.opponent?.name ?? "Waiting"}</span></div><span className="battle-turn-label">{statusText}</span></div>
      <div className={`battle-field ${transitionId > 0 ? "battle-field-pulse" : ""} ${myTurn ? "battle-field-my-turn" : ""} ${room.status === "finished" ? "battle-field-finished" : ""}`}>
        <div className="battle-aurora battle-aurora-one" /><div className="battle-aurora battle-aurora-two" />
        <div className="battle-particle-field" aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <span key={index} className={`battle-particle battle-particle-${index % 7}`} />)}</div>
        <div className="battle-cloud cloud-one" /><div className="battle-cloud cloud-two" />
        <div className="battle-trainer trainer-foe" aria-hidden="true"><UserRound className="size-10 text-rose-100/70" /></div>
        <div className="battle-trainer trainer-me" aria-hidden="true"><UserRound className="size-10 text-cyan-100/70" /></div>
        {activeFoe && <BattlePokemonSprite pokemon={activeFoe} side="foe" defeated={activeFoe.hp <= 0} />}
        {activeMe && <BattlePokemonSprite pokemon={activeMe} side="me" defeated={activeMe.hp <= 0} />}
        <div className="battle-platform platform-foe" /><div className="battle-platform platform-me" />
        <div className="battle-impact battle-impact-foe" aria-hidden="true" /><div className="battle-impact battle-impact-me" aria-hidden="true" />
        <BattleHud pokemon={activeFoe} trainer={foe} side="foe" />
        <BattleHud pokemon={activeMe} trainer={me} side="me" />
        <div className="battle-sparks" aria-hidden="true"><Sparkles className="size-5" /><Zap className="size-4" /></div>
        {transitionId > 0 && <BattleParticleTransition key={transitionId} />}
      </div>

      <div className="battle-controls border-t border-white/10 bg-black/25 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="hof-kicker">Command console</p><p className="mt-1 text-sm text-slate-300">{forcedSwitch ? "Your active Pokémon fainted. Send out a healthy teammate." : "Select a move, use an item, or switch your active Pokémon."}</p></div>{!isSpectator && room.status === "active" && <button type="button" onClick={() => onAction({ type: "forfeit" })} disabled={mutationPending} className="text-xs text-rose-200/75 underline underline-offset-4">Forfeit</button>}</div>
        {room.status === "waiting" && <div className="battle-spectator-note"><Radio className="size-4 text-cyan-200" />{room.opponent ? "Both Pokémon parties are loaded. Ready up or wait for the match to start." : "This Pokémon arena is open. Share the room link with the opposing trainer to load their party."}</div>}
        {!isSpectator && room.status === "active" && <div className="mb-4 flex gap-2 overflow-x-auto"><TabButton active={tab === "moves"} onClick={() => setTab("moves")} icon={<Flame className="size-4" />}>Moves</TabButton><TabButton active={tab === "items"} onClick={() => setTab("items")} icon={<Package className="size-4" />}>Items</TabButton><TabButton active={tab === "switch"} onClick={() => setTab("switch")} icon={<RotateCcw className="size-4" />}>Switch</TabButton></div>}
        {isSpectator && <div className="battle-spectator-note"><Radio className="size-4 text-cyan-200" />Spectator mode is read-only. Share the room URL with another trainer to fill the next seat.</div>}
        {!isSpectator && tab === "moves" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{activeMe?.moves.map((move, index) => <button key={`${move.name}-${index}`} type="button" onClick={() => onAction({ type: "move", moveIndex: index })} disabled={!canAct || forcedSwitch} className="battle-move-button"><span className="font-display text-base font-bold">{move.name}</span><span className="mt-1 text-[10px] uppercase tracking-[0.15em] text-cyan-200/70">{move.type} · {move.power || "status"}</span></button>)}</div>}
        {!isSpectator && tab === "items" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["potion", "superpotion", "hyperpotion", "fullrestore"].map((item) => <button key={item} type="button" onClick={() => onAction({ type: "item", item: item as "potion" | "superpotion" | "hyperpotion" | "fullrestore" })} disabled={!canAct || forcedSwitch || Number(me?.inventory[item] ?? 0) < 1} className="battle-move-button"><span className="font-display text-base font-bold">{item}</span><span className="mt-1 text-[10px] uppercase tracking-[0.15em] text-cyan-200/70">x{Number(me?.inventory[item] ?? 0)}</span></button>)}</div>}
        {!isSpectator && tab === "switch" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{me?.party.map((pokemon, index) => <SwitchButton key={pokemon.id} pokemon={pokemon} active={index === me.activeIndex} disabled={!canAct || pokemon.hp <= 0 || (!forcedSwitch && index === me.activeIndex)} onClick={() => onAction({ type: "switch", pokemonIndex: index })} />)}</div>}
      </div>

      <div className="grid gap-4 border-t border-white/10 bg-[#061019]/85 p-4 sm:grid-cols-[1fr_1.35fr] sm:p-6"><div><p className="hof-kicker">Battle log</p><div className="battle-log mt-2">{room.combatLog.slice().reverse().map((line, index) => <p key={`${line}-${index}`} className={index === 0 ? "text-cyan-100" : ""}>{line}</p>)}</div></div><div><p className="hof-kicker">Party status</p><div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">{me?.party.map((pokemon, index) => <PartyDot key={pokemon.id} pokemon={pokemon} active={index === me.activeIndex} />)}</div></div></div>
    </section>
  );
}

function BattleParticleTransition() {
  return (
    <div className="battle-particle-transition" aria-hidden="true">
      <span className="battle-transition-ring" />
      <span className="battle-transition-ring" />
      {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ ["--burst-index" as string]: index } as CSSProperties} />)}
    </div>
  );
}

function BattlePokemonSprite({ pokemon, side, defeated }: { pokemon: BattlePokemon; side: "me" | "foe"; defeated: boolean }) {
  const [fallback, setFallback] = useState(false);
  const animated = animatedPokemonUrl(pokemon);
  const source = fallback ? pokemon[side === "me" ? "backSpriteUrl" : "frontSpriteUrl"] : animated;
  return <div className={`battle-pokemon battle-pokemon-${side} ${defeated ? "battle-pokemon-fainted" : ""}`}><img src={source} alt={pokemon.displayName} onError={() => setFallback(true)} /><span className="battle-pokemon-shadow" /></div>;
}

function animatedPokemonUrl(pokemon: BattlePokemon) {
  if (pokemon.pokedexId >= 810 && pokemon.pokedexId <= 905) return `https://raw.githubusercontent.com/kelin132/gmax-gifs/master/Generation%208/${encodeURIComponent(pokemon.name)}.gif`;
  return `https://raw.githubusercontent.com/kelin132/animated-pokemon-gifs/master/${pokemon.pokedexId}.gif`;
}

function BattleHud({ pokemon, trainer, side }: { pokemon: BattlePokemon | null; trainer: BattleTrainer | null; side: "me" | "foe" }) {
  if (!pokemon) return null;
  const hp = Math.max(0, Math.min(100, pokemon.maxHp ? (pokemon.hp / pokemon.maxHp) * 100 : 0));
  return <div className={`battle-hud battle-hud-${side}`}><div className="flex items-center justify-between gap-3"><span className="truncate font-display text-lg font-bold">{pokemon.displayName}</span><span className="font-mono-ui text-[10px] text-slate-300">Lv. {pokemon.level}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/50"><div className={`h-full rounded-full transition-all ${hp < 25 ? "bg-rose-400" : hp < 55 ? "bg-amber-300" : "bg-emerald-300"}`} style={{ width: `${hp}%` }} /></div><div className="mt-1 flex items-center justify-between font-mono-ui text-[10px] text-slate-300"><span>{trainer?.name}</span><span>{pokemon.hp}/{pokemon.maxHp} HP</span></div></div>;
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`battle-tab ${active ? "battle-tab-active" : ""}`}>{icon}{children}</button>;
}

function SwitchButton({ pokemon, active, disabled, onClick }: { pokemon: BattlePokemon; active: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`battle-switch-button ${active ? "battle-switch-active" : ""} ${pokemon.hp <= 0 ? "battle-switch-fainted" : ""}`}><img src={pokemon.frontSpriteUrl || pokemon.imageUrl} alt="" /><span className="min-w-0 text-left"><span className="block truncate font-display text-sm font-bold">{pokemon.displayName}</span><span className="font-mono-ui text-[9px] text-slate-400">{pokemon.hp > 0 ? `${pokemon.hp}/${pokemon.maxHp} HP` : "FAINTED"}</span></span></button>;
}

function PartyDot({ pokemon, active }: { pokemon: BattlePokemon; active: boolean }) {
  return <div className={`battle-party-dot ${active ? "battle-party-active" : ""} ${pokemon.hp <= 0 ? "battle-party-fainted" : ""}`} title={`${pokemon.displayName}: ${pokemon.hp}/${pokemon.maxHp} HP`}><img src={pokemon.frontSpriteUrl || pokemon.imageUrl} alt="" /></div>;
}

function RoomState({ icon, text }: { icon: ReactNode; text: string }) {
  return <section className="hof-panel battle-empty flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center">{icon}<p className="max-w-md text-sm text-slate-300">{text}</p></section>;
}

function UsersIcon() {
  return <div className="grid size-9 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/10"><UserRound className="size-4 text-cyan-200" /></div>;
}
