import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const phone = "263771234567@s.whatsapp.net", lid = "991234567890123@lid";
const discord = "discord:123456789012345678", other = "263779999999@s.whatsapp.net";
const data: Record<string, any[]> = {
  users: [{ _id: phone, registered: true, name: "Trainer", identityAliases: [lid, phone] }],
  account_links: [{ whatsappId: phone, discordId: discord.slice(8), status: "active" }],
  pokemon_trainers: [{ _id: "empty", jid: phone, party: [] },
    { _id: "legacy", jid: lid, party: ["legacy-pokemon", "discord-pokemon"], inventory: { potion: 4 } }],
  pokemon_owned: [
    { _id: "legacy-pokemon", ownerJid: lid, name: "Legacy", hp: 100, maxHp: 100, inParty: true },
    { _id: "discord-pokemon", ownerJid: discord, name: "Discord", hp: 100, maxHp: 100, inParty: true },
    { _id: "private-pokemon", ownerJid: other, whatsappNumber: phone, hp: 100, maxHp: 100 }],
};
function condition(actual: any, expected: any): boolean {
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (!expected || typeof expected !== "object") return actual === expected;
  return Object.entries(expected).every(([op, value]: [string, any]) => {
    if (op === "$in") return (Array.isArray(actual) ? actual : [actual]).some(item => value.includes(item));
    if (op === "$not") return !condition(actual, value);
    throw new Error(`Unsupported condition ${op}`);
  });
}
function matches(doc: any, query: any): boolean {
  return Object.entries(query).every(([key, value]: [string, any]) =>
    key === "$or" ? value.some((part: any) => matches(doc, part)) : condition(doc[key], value));
}
(globalThis as any).__battleIdentityDb = { collection: (name: string) => ({
  find: (query: any) => ({ toArray: async () => (data[name] || []).filter(doc => matches(doc, query)) }),
  findOne: async (query: any) => (data[name] || []).find(doc => matches(doc, query)) || null,
  updateOne: async (query: any, update: any) => {
    const doc = (data[name] || []).find(doc => matches(doc, query));
    if (doc) Object.assign(doc, update.$set);
    return { modifiedCount: doc ? 1 : 0 };
  },
}) };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL && !/\.(?:mjs|js|ts|tsx)$/i.test(specifier)) {
      const target = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(target))) return { url: target.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/db.server.ts")) return { format: "module", shortCircuit: true,
      source: "export const getDb=async()=>globalThis.__battleIdentityDb; export const battleRooms=async()=>{};" };
    if (url.endsWith("/auth.server.ts")) return { format: "module", shortCircuit: true,
      source: "export const requireUser=async()=>{};" };
    const loaded = nextLoad(url, context);
    if (url.endsWith("/battle.server.ts")) return { ...loaded,
      source: `${loaded.source}\nexport {loadTrainerSnapshot, persistHealth};` };
    return loaded;
  },
});
const battle = await import("../src/lib/battle.server.ts") as any;
test("website battle loads populated legacy trainer and both linked platforms' Pokemon", async () => {
  const snapshot = await battle.loadTrainerSnapshot(phone);
  assert.deepEqual(snapshot.party.map((p: any) => p.id), ["legacy-pokemon", "discord-pokemon"]);
  assert.equal(snapshot.inventory.potion, 4);
  snapshot.party[0].hp = 55;
  snapshot.party[1].hp = 66;
  await battle.persistHealth({ challenger: snapshot });
  assert.equal(data.pokemon_owned![0].hp, 55);
  assert.equal(data.pokemon_owned![1].hp, 66);
  data.pokemon_owned![0].ownerJid = other;
  snapshot.party[0].hp = 1;
  await battle.persistHealth({ challenger: snapshot });
  assert.equal(data.pokemon_owned![0].hp, 55, "a transferred Pokemon must not be changed by its previous owner's battle");
  assert.equal(data.pokemon_owned![2].hp, 100);
});
