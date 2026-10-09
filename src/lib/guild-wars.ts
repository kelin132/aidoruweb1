import type { PublicGuildMember } from './game';

export const WAR_TIMING = { challenge: 24 * 60 * 60_000, preparation: 15 * 60_000, battle: 48 * 60 * 60_000, cooldown: 48 * 60 * 60_000 };
export type WarPhase = 'challenge' | 'preparation' | 'battle' | 'finished' | 'declined' | 'expired';
export type WarFighter = Pick<PublicGuildMember, 'id' | 'name' | 'avatarUrl'>;
export type WarMatch = { id: string; challenger: WarFighter; defender: WarFighter; winnerId: string | null; roomId: string | null; completedAt: number | null };
export type WarSide = { id: string; name: string; tag: string; iconUrl: string | null; bannerUrl: string | null; level: number; fighters: WarFighter[]; score: number };
export type GuildWar = { id: string; phase: WarPhase; challenger: WarSide; defender: WarSide; matches: WarMatch[]; createdAt: number; deadline: number; finishedAt: number | null; winnerGuildId: string | null; revision: number };
export const WAR_RULES = [
  { title: 'Challenge', text: 'Guild leaders can challenge another available guild. The defender has 24 hours to respond.' },
  { title: 'Prepare', text: 'Both guilds have 15 minutes to register fighters before matchups are generated. Each fighter enters one matchup.' },
  { title: 'Battle', text: 'Each completed Pokémon battle win adds one point. The battle phase lasts up to 48 hours. Unplayed matchups award no points.' },
  { title: 'Recover', text: 'The highest score wins; equal scores are a draw. Results are recorded and both guilds enter a 48-hour cooldown.' },
] as const;
export function sameFighter(a: string, b: string) { return a.replace(/:\d+(?=@)/, '').split('@')[0] === b.replace(/:\d+(?=@)/, '').split('@')[0]; }
export function advanceWar(war: GuildWar, now: number): GuildWar {
  if (now < war.deadline) return war;
  if (war.phase === 'challenge') return { ...war, phase: 'expired', finishedAt: now };
  if (war.phase === 'preparation') {
    const matches = war.challenger.fighters.slice(0, war.defender.fighters.length).map((fighter, index) => {
      const defender = war.defender.fighters[index];
      if (!defender) return null;
      return { id: `${war.id}-${index + 1}`, challenger: fighter, defender, winnerId: null, roomId: null, completedAt: null };
    }).filter((match): match is WarMatch => match !== null);
    return { ...war, matches, phase: matches.length ? 'battle' : 'finished', deadline: war.deadline + WAR_TIMING.battle, finishedAt: matches.length ? null : now };
  }
  if (war.phase === 'battle') return finishWar(war, now);
  return war;
}
export function finishWar(war: GuildWar, now: number): GuildWar {
  return { ...war, phase: 'finished', finishedAt: now, winnerGuildId: war.challenger.score === war.defender.score ? null : war.challenger.score > war.defender.score ? war.challenger.id : war.defender.id };
}