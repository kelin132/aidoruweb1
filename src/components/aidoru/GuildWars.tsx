import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  Crown,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from './UserAvatar';
import { useSession } from './session';
import { GuildWarPlanner } from './GuildWarPlanner';
import { GuildWarChallengePanel } from './GuildWarChallengePanel';
import {
  fetchGuildWars,
  updateGuildMemberRole,
  updateGuildWar,
  enterGuildWarMatch,
} from '@/lib/guild-wars.functions';
import { WAR_RULES, sameFighter, type GuildWar, type WarSide } from '@/lib/guild-wars';
import type { PublicGuild, PublicGuildMember } from '@/lib/game';

type WarAction = 'accept' | 'decline' | 'register' | 'withdraw' | 'end' | 'reorder';
type FeedFilter = 'All' | 'Battle' | 'Preparation' | 'Challenges';

function phaseTitle(phase: GuildWar['phase']) {
  if (phase === 'challenge') return 'Challenge sent';
  if (phase === 'preparation') return 'Preparation phase';
  if (phase === 'battle') return 'Battle phase';
  if (phase === 'declined') return 'Challenge declined';
  if (phase === 'expired') return 'Challenge expired';
  return 'War complete';
}

function resultLabel(war: GuildWar) {
  if (war.phase === 'finished') {
    return war.winnerGuildId
      ? `${war.winnerGuildId === war.challenger.id ? war.challenger.name : war.defender.name} wins`
      : 'Draw';
  }
  return war.phase === 'declined' ? 'Challenge declined' : 'Challenge expired';
}

function remainingTime(deadline: number, now: number | null) {
  if (now === null) return '—';
  const remaining = Math.max(0, deadline - now);
  if (remaining >= 86_400_000) {
    return `${Math.floor(remaining / 86_400_000)}d ${Math.floor(remaining / 3_600_000) % 24}h`;
  }
  return `${Math.floor(remaining / 3_600_000)}h ${Math.floor(remaining / 60_000) % 60}m`;
}

function progressPercent(war: GuildWar, now: number | null) {
  if (!now || !['challenge', 'preparation', 'battle'].includes(war.phase)) return 100;
  const phaseLength = war.phase === 'challenge' ? 24 * 60 * 60_000 : war.phase === 'preparation' ? 15 * 60_000 : 48 * 60 * 60_000;
  const startedAt = war.deadline - phaseLength;
  return Math.max(4, Math.min(100, ((now - startedAt) / phaseLength) * 100));
}

function WarFeedCard({
  war,
  selected,
  now,
  onSelect,
}: {
  war: GuildWar;
  selected: boolean;
  now: number | null;
  onSelect: () => void;
}) {
  const active = ['challenge', 'preparation', 'battle'].includes(war.phase);
  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-card/80 shadow-sm transition ${
        selected ? 'border-primary/70 ring-1 ring-primary/30' : 'border-border/70 hover:border-primary/40'
      }`}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="relative grid min-h-44 grid-cols-[1fr_auto_1fr] items-end gap-2 overflow-hidden px-4 pb-5 pt-12 sm:min-h-52 sm:px-7">
          {war.challenger.bannerUrl && (
            <img src={war.challenger.bannerUrl} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
          )}
          {war.defender.bannerUrl && (
            <img src={war.defender.bannerUrl} alt="" className="absolute inset-0 size-full object-cover opacity-20 [mask-image:linear-gradient(to_left,black,transparent_75%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/75 to-background" />
          <span
            className={`absolute left-1/2 top-4 z-[1] -translate-x-1/2 rounded-full border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] ${
              war.phase === 'battle'
                ? 'border-amber-300/30 bg-amber-300/10 text-amber-200'
                : 'border-primary/30 bg-primary/10 text-primary'
            }`}
          >
            {phaseTitle(war.phase)}
          </span>
          <div className="relative z-[1] flex min-w-0 items-center gap-2 sm:gap-3">
            <UserAvatar name={war.challenger.name} src={war.challenger.iconUrl} className="size-12 shrink-0 rounded-xl border-2 border-primary sm:size-16" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black sm:text-base">{war.challenger.name}</p>
              <p className="text-xs text-muted-foreground">Level {war.challenger.level}</p>
            </div>
          </div>
          <div className="relative z-[1] text-center">
            <p className="text-2xl font-black tabular-nums sm:text-3xl">
              {war.phase === 'battle' || war.phase === 'finished'
                ? `${war.challenger.score} — ${war.defender.score}`
                : '—'}
            </p>
            {war.phase === 'battle' && <Swords className="mx-auto mt-1 size-5 text-primary" />}
          </div>
          <div className="relative z-[1] flex min-w-0 items-center justify-end gap-2 text-right sm:gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black sm:text-base">{war.defender.name}</p>
              <p className="text-xs text-muted-foreground">Level {war.defender.level}</p>
            </div>
            <UserAvatar name={war.defender.name} src={war.defender.iconUrl} className="size-12 shrink-0 rounded-xl border-2 border-rose-400 sm:size-16" />
          </div>
          <ChevronDown className={`absolute bottom-3 right-4 z-[1] size-4 text-muted-foreground transition ${selected ? 'rotate-180' : ''}`} />
        </div>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-4 sm:px-7">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-4 text-primary" />
            {active ? <>Phase ends in <strong className="text-foreground">{remainingTime(war.deadline, now)}</strong></> : resultLabel(war)}
          </div>
          <div className="text-xs font-bold">
            {war.phase === 'battle'
              ? `${war.matches.filter(match => match.completedAt).length} / ${war.matches.length} resolved`
              : war.phase === 'preparation'
                ? `${war.challenger.fighters.length + war.defender.fighters.length} fighters registered`
                : war.phase === 'challenge'
                  ? 'Response pending'
                  : 'Final result'}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted sm:order-3">
            <div
              className={`h-full rounded-full ${war.phase === 'battle' ? 'bg-amber-300' : 'bg-primary'}`}
              style={{ width: `${progressPercent(war, now)}%` }}
            />
          </div>
        </div>
      </button>
    </article>
  );
}

function MatchupOrder({
  side,
  canManage,
  pending,
  onMove,
}: {
  side: WarSide;
  canManage: boolean;
  pending: boolean;
  onMove: (fighterId: string, direction: 'up' | 'down') => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">{side.name}</h3>
      {side.fighters.map((fighter, index) => (
        <div key={fighter.id} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/50 p-3">
          <span className="w-6 text-center text-xs font-black text-primary">{index + 1}</span>
          <UserAvatar name={fighter.name} src={fighter.avatarUrl} className="size-9" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fighter.name}</span>
          {canManage && (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${fighter.name} up`}
                disabled={pending || index === 0}
                onClick={() => onMove(fighter.id, 'up')}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${fighter.name} down`}
                disabled={pending || index === side.fighters.length - 1}
                onClick={() => onMove(fighter.id, 'down')}
              >
                <ChevronDown className="size-4" />
              </Button>
            </div>
          )}
        </div>
      ))}
      {!side.fighters.length && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No fighters registered yet.</p>}
    </div>
  );
}

function GuildRoleRoster({
  guild,
  canManage,
  pending,
  onRoleChange,
}: {
  guild: PublicGuild;
  canManage: boolean;
  pending: boolean;
  onRoleChange: (member: PublicGuildMember, role: 'officer' | 'member') => void;
}) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card/60 p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Shield className="size-5 text-primary" />
        <div>
          <h2 className="font-black">Guild roles</h2>
          <p className="text-xs text-muted-foreground">Leader can promote or return members to the roster.</p>
        </div>
      </div>
      <div className="space-y-2">
        {guild.members.map(member => (
          <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-border/60 p-3">
            <UserAvatar name={member.name} src={member.avatarUrl} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{member.name}</p>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{member.role}</p>
            </div>
            {member.isOwner ? (
              <span className="flex items-center gap-1 rounded-full border border-amber-300/30 px-3 py-1 text-xs font-bold text-amber-200"><Crown className="size-3" />Leader</span>
            ) : canManage ? (
              <select
                aria-label={`Role for ${member.name}`}
                className="guild-input max-w-32"
                value={member.role === 'officer' ? 'officer' : 'member'}
                disabled={pending}
                onChange={event => onRoleChange(member, event.target.value as 'officer' | 'member')}
              >
                <option value="member">Member</option>
                <option value="officer">Officer</option>
              </select>
            ) : (
              <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground">{member.role}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function GuildWars({
  guilds,
  guildsLoading = false,
  initialWarId,
  onBack,
}: {
  guilds: PublicGuild[];
  guildsLoading?: boolean;
  initialWarId?: string;
  onBack: () => void;
}) {
  const { data: user } = useSession();
  const client = useQueryClient();
  const getWars = useServerFn(fetchGuildWars);
  const act = useServerFn(updateGuildWar);
  const changeRole = useServerFn(updateGuildMemberRole);
  const enter = useServerFn(enterGuildWarMatch);
  const [rules, setRules] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialWarId);
  const [filter, setFilter] = useState<FeedFilter>('All');
  const [search, setSearch] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (initialWarId) setSelectedId(initialWarId);
  }, [initialWarId]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const query = useQuery({
    queryKey: ['aidoru', 'guild-wars'],
    queryFn: () => getWars(),
    enabled: Boolean(user),
    refetchInterval: 15_000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (data: { warId: string; action: WarAction; fighterId?: string; direction?: 'up' | 'down' }) => act({ data }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['aidoru', 'guild-wars'] });
      toast.success('War updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const roleMutation = useMutation({
    mutationFn: (data: { guildId: string; memberId: string; role: 'officer' | 'member' }) => changeRole({ data }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['aidoru', 'guilds'] });
      toast.success('Guild role updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const enterMutation = useMutation({
    mutationFn: (data: { warId: string; matchId: string }) => enter({ data }),
    onSuccess: result => setRoomId(result.roomId),
    onError: (error: Error) => toast.error(error.message),
  });

  const wars = query.data ?? [];
  const war = wars.find(item => item.id === selectedId) ?? wars[0];
  const mine = guilds.find(guild => guild.isOwner) ?? guilds.find(guild => guild.isMember);
  const activeCount = wars.filter(item => ['challenge', 'preparation', 'battle'].includes(item.phase)).length;
  const term = search.trim().toLowerCase();
  const visibleWars = wars.filter(item => {
    const matchesText = !term || `${item.challenger.name} ${item.defender.name} ${item.challenger.tag} ${item.defender.tag}`.toLowerCase().includes(term);
    const matchesFilter = filter === 'All'
      || (filter === 'Challenges' && item.phase === 'challenge')
      || (filter === 'Preparation' && item.phase === 'preparation')
      || (filter === 'Battle' && item.phase === 'battle');
    return matchesText && matchesFilter;
  });
  const mySide = war && mine ? [war.challenger, war.defender].find(side => side.id === mine.id) : undefined;
  const registered = Boolean(mySide?.fighters.some(fighter => user && sameFighter(fighter.id, user.id)));
  const canManageMine = Boolean(
    mine?.isOwner
      || mine?.members.some(member => member.role === 'officer' && user && sameFighter(member.id, user.id)),
  );

  const update = (action: WarAction, extra: { fighterId?: string; direction?: 'up' | 'down' } = {}) => {
    if (!war) return;
    mutation.mutate({ warId: war.id, action, ...extra });
  };

  return (
    <div className="guild-interface space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Back to guilds"><ChevronLeft /></Button>
        <div className="mr-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Matchups</p>
          <h1 className="text-2xl font-black sm:text-3xl">Guild Wars</h1>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-black text-primary">
          {activeCount} ongoing {activeCount === 1 ? 'war' : 'wars'}
        </span>
        {mine?.isOwner && <Button variant="outline" onClick={() => setPlannerOpen(true)}>AI coach</Button>}
        <Button variant="outline" size="icon" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Refresh wars">
          <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
        </Button>
      </header>

      <section className="rounded-3xl border border-border/70 bg-card/60 p-3 sm:p-5">
        <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by guild name..."
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="mt-3 grid grid-cols-4 gap-2" role="tablist" aria-label="Guild war phase">
          {(['All', 'Battle', 'Preparation', 'Challenges'] as FeedFilter[]).map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={filter === tab}
              onClick={() => setFilter(tab)}
              className={`rounded-xl px-2 py-3 text-[11px] font-black transition sm:text-sm ${
                filter === tab ? 'bg-primary/15 text-primary ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <Button variant="outline" className="mt-3 w-full justify-center" onClick={() => setRules(true)}>
          <BookOpen className="size-4" />Rules &amp; rewards
        </Button>
      </section>

      {query.isError ? (
        <div className="rounded-3xl border border-destructive/30 bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{(query.error as Error).message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>Try again</Button>
        </div>
      ) : query.isPending ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading matchups…</div>
      ) : (
        <section className="space-y-4" aria-label="Guild war matchups">
          {visibleWars.map(item => (
            <WarFeedCard
              key={item.id}
              war={item}
              selected={war?.id === item.id}
              now={now}
              onSelect={() => {
                setSelectedId(item.id);
                setRoomId(null);
              }}
            />
          ))}
          {!visibleWars.length && (
            <div className="rounded-3xl border border-dashed border-border p-10 text-center">
              <Swords className="mx-auto mb-3 size-9 text-primary" />
              <h2 className="font-bold">{wars.length ? 'No matchups found' : 'No wars yet'}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {wars.length ? 'Try another phase or guild name.' : 'Choose an available guild below to send the first challenge.'}
              </p>
            </div>
          )}
        </section>
      )}

      {!query.isPending && !query.isError && war && (
        <section className="space-y-5 rounded-3xl border border-border/70 bg-card/50 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Selected matchup</p>
              <h2 className="mt-1 text-xl font-black">{war.challenger.name} <span className="text-muted-foreground">vs</span> {war.defender.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{phaseTitle(war.phase)} · {remainingTime(war.deadline, now)} remaining</p>
            </div>
            {canManageMine && ['challenge', 'preparation', 'battle'].includes(war.phase) && (
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={mutation.isPending}
                onClick={() => {
                  if (window.confirm('End this guild war now? The current score will be recorded.')) update('end');
                }}
              >
                End war
              </Button>
            )}
          </div>

          {war.phase === 'challenge' && mine?.id === war.defender.id && mine.isOwner && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={mutation.isPending} onClick={() => update('accept')}><Check className="size-4" />Accept challenge</Button>
              <Button variant="outline" disabled={mutation.isPending} onClick={() => update('decline')}>Decline</Button>
            </div>
          )}

          {war.phase === 'preparation' && mySide && (
            <Button disabled={mutation.isPending} onClick={() => update(registered ? 'withdraw' : 'register')}>
              <Users className="size-4" />{registered ? 'Withdraw fighter' : 'Register as fighter'}
            </Button>
          )}

          {war.phase === 'preparation' && (
            <div className="grid gap-4 lg:grid-cols-2">
              {[war.challenger, war.defender].map(side => (
                <MatchupOrder
                  key={side.id}
                  side={side}
                  canManage={Boolean(canManageMine && mine?.id === side.id)}
                  pending={mutation.isPending}
                  onMove={(fighterId, direction) => update('reorder', { fighterId, direction })}
                />
              ))}
            </div>
          )}

          {!!war.matches.length && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 font-black"><Trophy className="size-4 text-primary" />Battle matchups</h3>
              {war.matches.map(match => (
                <article key={match.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-border/70 bg-background/50 p-3 text-center sm:gap-4">
                  <div className="min-w-0">
                    <UserAvatar name={match.challenger.name} src={match.challenger.avatarUrl} className="mx-auto size-10" />
                    <p className="mt-2 truncate text-xs font-bold">{match.challenger.name}</p>
                  </div>
                  <div>
                    <p className="font-black">{match.completedAt ? (sameFighter(match.winnerId || '', match.challenger.id) ? '1 — 0' : '0 — 1') : 'VS'}</p>
                    <p className={`mt-1 text-[9px] font-black uppercase ${match.completedAt ? 'text-primary' : 'text-muted-foreground'}`}>
                      {match.completedAt ? 'Complete' : 'Pending'}
                    </p>
                    {!match.completedAt && war.phase === 'battle' && user
                      && [match.challenger, match.defender].some(fighter => sameFighter(fighter.id, user.id))
                      && <Button size="sm" className="mt-2" disabled={enterMutation.isPending} onClick={() => enterMutation.mutate({ warId: war.id, matchId: match.id })}>Fight</Button>}
                  </div>
                  <div className="min-w-0">
                    <UserAvatar name={match.defender.name} src={match.defender.avatarUrl} className="mx-auto size-10" />
                    <p className="mt-2 truncate text-xs font-bold">{match.defender.name}</p>
                  </div>
                </article>
              ))}
            </div>
          )}

          {roomId && <Button asChild><Link to="/battle/$roomId" params={{ roomId }}><Swords />Open battle room</Link></Button>}

          {mine && (
            <GuildRoleRoster
              guild={mine}
              canManage={mine.isOwner}
              pending={roleMutation.isPending}
              onRoleChange={(member, role) => roleMutation.mutate({ guildId: mine.id, memberId: member.id, role })}
            />
          )}
        </section>
      )}

      {!query.isError && !query.isPending && (
        <GuildWarChallengePanel
          guilds={guilds}
          guildsLoading={guildsLoading}
          mine={mine}
          wars={wars}
          onCreated={warId => {
            setSelectedId(warId);
            setRoomId(null);
            void client.invalidateQueries({ queryKey: ['aidoru', 'guild-wars'] });
          }}
        />
      )}

      <GuildWarPlanner open={plannerOpen} onOpenChange={setPlannerOpen} guildId={mine?.id ?? ''} guildName={mine?.name ?? 'Your guild'} />
      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogTitle className="flex items-center gap-3 text-xl"><BookOpen className="size-5 text-primary" />Guild war rules</DialogTitle>
          <DialogDescription className="sr-only">Challenge, preparation, battle, and recovery rules.</DialogDescription>
          <div className="space-y-3">
            {WAR_RULES.map((rule, index) => (
              <article key={rule.title} className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-xs font-black text-primary">0{index + 1}</p>
                <h3 className="mt-2 font-black">{rule.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{rule.text}</p>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
