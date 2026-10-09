import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const fetchGuildWars = createServerFn({ method: 'GET' }).handler(async () => {
  const { listGuildWars } = await import('./guild-wars.server'); return listGuildWars();
});
export const sendGuildChallenge = createServerFn({ method: 'POST' }).inputValidator((data) => z.object({ guildId: z.string().min(1).max(128) }).parse(data)).handler(async ({ data }) => {
  const { challengeGuild } = await import('./guild-wars.server'); return challengeGuild(data.guildId);
});
export const updateGuildWar = createServerFn({ method: 'POST' }).inputValidator((data) => z.object({ warId: z.string().min(1).max(128), action: z.enum(['accept', 'decline', 'register', 'withdraw']) }).parse(data)).handler(async ({ data }) => {
  const { actOnGuildWar } = await import('./guild-wars.server'); return actOnGuildWar(data.warId, data.action);
});
export const enterGuildWarMatch = createServerFn({ method: 'POST' }).inputValidator((data) => z.object({ warId: z.string().min(1).max(128), matchId: z.string().min(1).max(160) }).parse(data)).handler(async ({ data }) => {
  const { launchWarMatch } = await import('./guild-wars.server'); return launchWarMatch(data.warId, data.matchId);
});