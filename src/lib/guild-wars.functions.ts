import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const fetchGuildWars = createServerFn({ method: 'GET' }).handler(async () => {
  const { listGuildWars } = await import('./guild-wars.server'); return listGuildWars();
});
export const sendGuildChallenge = createServerFn({ method: 'POST' }).inputValidator((data) => z.object({ guildId: z.string().min(1).max(128) }).parse(data)).handler(async ({ data }) => {
  const { challengeGuild } = await import('./guild-wars.server'); return challengeGuild(data.guildId);
});
export const updateGuildWar = createServerFn({ method: 'POST' }).inputValidator((data) => z.object({
  warId: z.string().min(1).max(128),
  action: z.enum(['accept', 'decline', 'register', 'withdraw', 'end', 'reorder']),
  fighterId: z.string().max(200).optional(),
  direction: z.enum(['up', 'down']).optional(),
}).parse(data)).handler(async ({ data }) => {
  const { actOnGuildWar } = await import('./guild-wars.server');
  return actOnGuildWar(data.warId, data.action, data.fighterId, data.direction);
});
export const updateGuildMemberRole = createServerFn({ method: 'POST' }).inputValidator((data) => z.object({
  guildId: z.string().min(1).max(128),
  memberId: z.string().min(1).max(200),
  role: z.enum(['officer', 'member']),
}).parse(data)).handler(async ({ data }) => {
  const { setGuildMemberRole } = await import('./guild-wars.server');
  return setGuildMemberRole(data.guildId, data.memberId, data.role);
});
export const enterGuildWarMatch = createServerFn({ method: 'POST' }).inputValidator((data) => z.object({ warId: z.string().min(1).max(128), matchId: z.string().min(1).max(160) }).parse(data)).handler(async ({ data }) => {
  const { launchWarMatch } = await import('./guild-wars.server'); return launchWarMatch(data.warId, data.matchId);
});
export const generateGuildWarPlan = createServerFn({ method: 'POST' })
  .validator((data) => z.object({
    guildId: z.string().trim().min(1).max(128),
    roster: z.string().trim().min(1).max(7000),
    opponent: z.string().trim().min(1).max(7000),
    battleFormat: z.string().trim().max(1000).default(''),
    focus: z.enum(['balanced', 'aggressive', 'defensive']).default('balanced'),
  }).strict().parse(data))
  .handler(async ({ data }) => {
    const { recommendGuildWarLineup } = await import('./guild-wars-ai.server');
    return recommendGuildWarLineup(data);
  });