import test from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { identityVariants, resolveUserIdentityKeys, selectPrimaryTrainer, userIdentityKeys } from "../src/lib/userIdentity.ts";

test("legacy phone formats match but privacy LIDs do not become phone JIDs", () => {
  assert.ok(identityVariants("263771234567:4@c.us").includes("263771234567@s.whatsapp.net"));
  assert.ok(identityVariants("263771234567").includes("+263771234567"));
  assert.ok(!identityVariants("123456789@lid").includes("123456789@s.whatsapp.net"));
});

test("stored verified aliases connect phone login to legacy cards and Pokémon", async () => {
  let query: unknown;
  const db = { collection(name: string) { return { find(filter: unknown) {
    query = filter;
    return { async toArray() { return name === "users" ? [{
      _id: "123456789@lid", phoneNumber: "263771234567",
      identityAliases: ["123456789@lid", "263771234567@s.whatsapp.net"],
    }] : []; } };
  } }; } } as unknown as Db;
  const keys = await resolveUserIdentityKeys(db, { _id: "263771234567@s.whatsapp.net" });
  assert.ok(query);
  assert.ok(keys.includes("123456789@lid"));
  assert.ok(!keys.includes("123456789")); // bare LIDs require per-record ownership evidence
  assert.ok(keys.includes("263771234567@s.whatsapp.net"));
  assert.ok(!keys.includes("123456789@s.whatsapp.net"));
});

test("migration metadata preserves old ownership lookups", () => {
  const keys = userIdentityKeys({
    _id: "263771234567@s.whatsapp.net",
    migratedFrom: "123456789@lid",
  });
  assert.ok(keys.includes("123456789@lid"));
});

test("profile and Mart resolve to the same populated trainer document", () => {
  const trainers = [
    { _id: "empty-placeholder", party: [], pc: [], inventory: { potion: 1 } },
    { _id: "legacy-populated", party: ["p1", "p2"], pc: ["p3"], inventory: { potion: 7 } },
  ];
  assert.equal(selectPrimaryTrainer(trainers)?.["_id"], "legacy-populated");
  assert.equal(selectPrimaryTrainer(trainers)?.["inventory"]?.["potion"], 7);
});
