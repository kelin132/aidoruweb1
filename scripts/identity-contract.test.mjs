import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccountIdentity, collectionOwnershipQuery } from "../src/lib/accountIdentity.mjs";
const phone = "263771234567@s.whatsapp.net", lid = "263779999999@lid";
const other = "263779999999@s.whatsapp.net", discord = "discord:123456789012345678";
function condition(actual, expected) {
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (!expected || typeof expected !== "object") return actual === expected;
  return Object.entries(expected).every(([op, value]) => {
    if (op === "$in") return (Array.isArray(actual) ? actual : [actual]).some(item => value.includes(item));
    if (op === "$nin") return !(Array.isArray(actual) ? actual : [actual]).some(item => value.includes(item));
    if (op === "$exists") return (actual !== undefined) === value;
    if (op === "$not") return !condition(actual, value);
    throw new Error(`Unsupported operator ${op}`);
  });
}
function matches(doc, query) {
  return Object.entries(query).every(([key, value]) =>
    key === "$or" ? value.some(part => matches(doc, part))
      : key === "$and" ? value.every(part => matches(doc, part))
      : condition(doc[key], value));
}
test("website selects the same wallet and collections for phone, LID and Discord", async () => {
  const data = {
    users: [{ _id: phone, registered: true, money: 30000 },
      { _id: lid, registered: true, money: 7654, websiteId: "AID-EXISTING" },
      { _id: other, registered: true, money: 6543 }, { _id: discord, registered: true, money: 999 }],
    identity_links: [{ _id: lid, phoneId: phone, source: "baileys" }],
    account_links: [{ whatsappId: phone, discordId: discord.slice(8), status: "active" }],
    mn_users: [{ _id: "old", userId: "263779999999", whatsappNumber: lid },
      { _id: "other", userId: 263779999999, whatsappNumber: phone, identityAliases: [lid, phone] },
      { _id: "dc", userId: discord }],
  };
  const db = { collection: name => ({ find: query => ({ toArray: async () => (data[name] || []).filter(doc => matches(doc, query)) }) }) };
  for (const id of [phone, lid, discord]) {
    const identity = await resolveAccountIdentity(db, id);
    assert.equal(identity.accountId, lid);
    assert.equal(identity.account.money, 7654);
    const rows = await db.collection("mn_users").find(collectionOwnershipQuery(identity.ids, ["_id", "userId"])).toArray();
    assert.deepEqual(rows.map(row => row._id).sort(), ["dc", "old"]);
  }
  const identity = await resolveAccountIdentity(db, other);
  assert.deepEqual((await db.collection("mn_users").find(collectionOwnershipQuery(identity.ids, ["userId"])).toArray()).map(r => r._id), ["other"]);
});

test("website mart trainer lookup reaches the verified legacy LID trainer record", async () => {
  const phone = "263771234567@s.whatsapp.net";
  const lid = "263779999999@lid";
  const collections = {
    users: [{ _id: lid, registered: true, money: 7654 }],
    identity_links: [{ _id: lid, phoneId: phone, source: "baileys" }],
    account_links: [],
    pokemon_trainers: [{ _id: "legacy-trainer", jid: lid, starter: "volt-kitsune" }],
  };
  const db = {
    collection: name => ({
      find: query => ({
        toArray: async () => (collections[name] || []).filter(doc => matches(doc, query)),
      }),
      findOne: async query => (collections[name] || []).find(doc => matches(doc, query)) ?? null,
    }),
  };
  const identity = await resolveAccountIdentity(db, phone);
  const query = collectionOwnershipQuery(
    identity.ids,
    ["_id", "jid", "userId", "whatsappNumber", "owner"],
  );
  const trainer = await db.collection("pokemon_trainers").findOne(query);
  assert.equal(trainer?._id, "legacy-trainer");
  assert.equal(trainer?.jid, lid);
});
