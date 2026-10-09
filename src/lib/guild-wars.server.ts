import { ObjectId } from 'mongodb';
import { requireUser } from './auth.server';
import { getDb, withMongoTransaction, type GuildDoc } from './db.server';
import { advanceWar, finishWar, sameFighter, WAR_TIMING, type GuildWar, type WarSide } from './guild-wars';

type WarDoc = GuildWar & { _id: string };
const activePhases = ['challenge', 'preparation', 'battle'] as const;
function aliases(user: Record<string, unknown>) {
  const fields = ['_id', 'userId', 'jid', 'whatsappNumber', 'whatsappId', 'whatsappJid', 'userJid', 'phoneNumber', 'phone', 'sender'];
  return [...new Set(fields.flatMap(key => {
    const raw = String(user[key] ?? '').trim();
    if (!raw) return [];
    const withoutDevice = raw.replace(/:\d+(?=@)/, '');
    const [local = withoutDevice, domain = 's.whatsapp.net'] = withoutDevice.split('@');
    const normalizedDomain = domain.toLowerCase() === 'c.us' ? 's.whatsapp.net' : domain;
    const digits = local.replace(/\D/g, '');
    const isLid = normalizedDomain.toLowerCase() === 'lid';
    const variants = [
      raw,
      withoutDevice,
      local,
      `${local}@${domain}`,
      `${local}@${normalizedDomain}`,
      ...(digits ? [digits, `+${digits}`] : []),
      ...(digits && isLid
        ? [`${digits}@lid`]
        : digits
          ? [
              `${digits}@s.whatsapp.net`,
              `${digits}@c.us`,
              `${digits}:0@s.whatsapp.net`,
              `${digits}:0@c.us`,
            ]
          : []),
    ];
    return variants.filter(Boolean);
  }))];
}
function belongs(ids: string[], members: string[] = []) { return members.some(member => ids.some(id => sameFighter(member, id))); }
function idFilter(id: string) { return { _id: { $in: [id, ...(ObjectId.isValid(id) ? [new ObjectId(id)] : [])] } }; }
function side(guild: GuildDoc & Record<string, unknown>): WarSide {
  return { id: String(guild._id), name: guild.name || 'Unnamed guild', tag: guild.tag || 'GUILD', iconUrl: guild.icon || null, bannerUrl: typeof guild['bannerUrl'] === 'string' ? guild['bannerUrl'] : null, level: guild.level || 1, fighters: [], score: 0 };
}
async function refreshWar(doc: WarDoc) {
  const next = advanceWar(advanceWar(doc, Date.now()), Date.now());
  if (next.phase === doc.phase) return doc;
  const col = (await getDb()).collection<WarDoc>('web_guild_wars');
  const result = await col.findOneAndUpdate({ _id: doc._id, revision: doc.revision }, { $set: { ...next, revision: doc.revision + 1 } }, { returnDocument: 'after' });
  return result ?? await col.findOne({ _id: doc._id }) ?? doc;
}
export async function listGuildWars(): Promise<GuildWar[]> {
  await requireUser();
  const docs = await (await getDb()).collection<WarDoc>('web_guild_wars').find({}).sort({ createdAt: -1 }).limit(100).toArray();
  return Promise.all(docs.map(async doc => { const { _id, ...war } = await refreshWar(doc); return war; }));
}
export async function challengeGuild(targetId: string) {
  const user = await requireUser();
  const ids = aliases(user as unknown as Record<string, unknown>);
  // Refresh elapsed phases before checking availability; no scheduled job required.
  await listGuildWars();
  return withMongoTransaction(async (db, session) => {
    const guildCol = db.collection<GuildDoc>('guilds');
    const source = await guildCol.findOne({ owner: { $in: ids } }, { session });
    const target = await guildCol.findOne(idFilter(targetId) as never, { session });
    if (!source || !belongs(ids, source.members)) throw new Error('Only a current guild leader can issue a challenge.');
    if (!target) throw new Error('Guild not found.');
    if (String(source._id) === String(target._id)) throw new Error('Choose another guild to challenge.');
    if (!source.members?.length || !target.members?.length) throw new Error('Both guilds need members before a war.');
    const guildIds = [String(source._id), String(target._id)];
    const wars = db.collection<WarDoc>('web_guild_wars');
    const conflict = await wars.findOne({ $and: [ { $or: [{ 'challenger.id': { $in: guildIds } }, { 'defender.id': { $in: guildIds } }] }, { $or: [{ phase: { $in: activePhases } }, { phase: 'finished', finishedAt: { $gt: Date.now() - WAR_TIMING.cooldown } }] } ] }, { session });
    if (conflict) throw new Error('One of these guilds is already at war or on cooldown.');
    // Write both guilds in the transaction so concurrent challenges conflict.
    await guildCol.updateMany({ _id: { $in: [source._id, target._id] } } as never, { $inc: { webWarRevision: 1 } } as never, { session });
    const now = Date.now(); const id = `war-${crypto.randomUUID()}`;
    const war: WarDoc = { _id: id, id, phase: 'challenge', challenger: side(source as GuildDoc & Record<string, unknown>), defender: side(target as GuildDoc & Record<string, unknown>), matches: [], createdAt: now, deadline: now + WAR_TIMING.challenge, finishedAt: null, winnerGuildId: null, revision: 0 };
    await wars.insertOne(war, { session });
    return { id };
  });
}
export async function actOnGuildWar(warId: string, action: 'accept' | 'decline' | 'register' | 'withdraw') {
  const user = await requireUser(); const ids = aliases(user as unknown as Record<string, unknown>);
  const db = await getDb(); const wars = db.collection<WarDoc>('web_guild_wars');
  const found = await wars.findOne({ _id: warId });
  if (!found) throw new Error('War not found.');
  const war = await refreshWar(found);
  const docs = await db.collection<GuildDoc>('guilds').find({ $or: [idFilter(war.challenger.id), idFilter(war.defender.id)] } as never).toArray();
  const guild = docs.find(g => belongs(ids, g.members));
  if (!guild) throw new Error('Join one of these guilds to take part.');
  const isDefender = String(guild._id) === war.defender.id;
  if (action === 'accept' || action === 'decline') {
    if (war.phase !== 'challenge' || !isDefender || !belongs(ids, [guild.owner ?? ''])) throw new Error('Only the defending guild leader can respond to a pending challenge.');
    war.phase = action === 'accept' ? 'preparation' : 'declined';
    war.deadline = Date.now() + WAR_TIMING.preparation;
    if (action === 'decline') war.finishedAt = Date.now();
  } else {
    if (war.phase !== 'preparation') throw new Error('Fighter registration is closed.');
    const target = isDefender ? war.defender : war.challenger;
    const memberId = guild.members?.find(member => ids.some(id => sameFighter(member, id)));
    if (!memberId) throw new Error('Guild membership not found.');
    target.fighters = target.fighters.filter(fighter => !sameFighter(fighter.id, memberId));
    if (action === 'register') {
      const trainer = await db.collection('pokemon_trainers').findOne({ jid: { $in: ids } });
      if (!trainer) throw new Error('Start your Pokémon journey before registering.');
      if (target.fighters.length >= 20) throw new Error('This roster is full.');
      target.fighters.push({ id: memberId, name: user.name || user.username || 'Trainer', avatarUrl: user.profilePictureUrl || null });
    }
  }
  const changed = await wars.updateOne({ _id: warId, revision: war.revision }, { $set: { ...war, revision: war.revision + 1 } });
  if (!changed.modifiedCount) throw new Error('War status changed. Refresh and try again.');
  return { ok: true };
}
export async function launchWarMatch(warId: string, matchId: string) {
  const user = await requireUser(); const ids = aliases(user as unknown as Record<string, unknown>);
  const wars = (await getDb()).collection<WarDoc>('web_guild_wars');
  const found = await wars.findOne({ _id: warId });
  if (!found) throw new Error('War not found.');
  const war = await refreshWar(found); const match = war.matches.find(m => m.id === matchId);
  if (war.phase !== 'battle' || !match || match.completedAt) throw new Error('This matchup is not available.');
  if (!ids.some(id => sameFighter(id, match.challenger.id) || sameFighter(id, match.defender.id))) throw new Error('Only matched fighters can enter this battle.');
  const { createGuildWarBattle } = await import('./battle.server');
  const room = await createGuildWarBattle(war.id, match.id, match.challenger.id, match.defender.id);
  await wars.updateOne({ _id: warId, phase: 'battle' }, { $set: { [`matches.${war.matches.indexOf(match)}.roomId`]: room.id } });
  return { roomId: room.id };
}
// Called from the battle engine with its persisted winner, never client scores.
export async function recordGuildWarWin(warId: string, matchId: string, winnerId: string) {
  await withMongoTransaction(async (db, session) => {
    const col = db.collection<WarDoc>('web_guild_wars'); const war = await col.findOne({ _id: warId, phase: 'battle' }, { session });
    if (!war || Date.now() > war.deadline) return;
    const match = war.matches.find(m => m.id === matchId);
    if (!match || match.completedAt) return;
    const challengerWon = sameFighter(winnerId, match.challenger.id);
    if (!challengerWon && !sameFighter(winnerId, match.defender.id)) return;
    match.winnerId = challengerWon ? match.challenger.id : match.defender.id; match.completedAt = Date.now();
    if (challengerWon) war.challenger.score += 1; else war.defender.score += 1;
    const next = war.matches.every(m => m.completedAt) ? finishWar(war, Date.now()) : war;
    await col.updateOne({ _id: warId, revision: war.revision }, { $set: { ...next, revision: war.revision + 1 } }, { session });
  });
}