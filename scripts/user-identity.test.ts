import test from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { identityVariants, resolveUserIdentityKeys, userIdentityKeys } from "../src/lib/userIdentity.ts";

test("legacy phone formats match but privacy LIDs do not become phone JIDs", () => {
  assert.ok(identityVariants("263771234567:4@c.us").includes("263771234567@s.whatsapp.net"));
  assert.ok(identityVariants("263771234567").includes("+263771234567"));
  assert.ok(!identityVariants("123456789@lid").includes("123456789@s.whatsapp.net"));
});

test("stored verified aliases connect phone login to legacy cards and Pokémon", async () => {
  let query: unknown;
  const db = { collection() { return { find(filter: unknown) {
    query = filter;
    return { async toArray() { return [{
      _id: "123456789@lid", phoneNumber: "263771234567",
      identityAliases: ["123456789@lid", "263771234567@s.whatsapp.net"],
    }]; } };
  } }; } } as unknown as Db;
  const keys = await resolveUserIdentityKeys(db, { _id: "263771234567@s.whatsapp.net" });
  assert.ok(query);
  assert.ok(keys.includes("123456789@lid"));
  assert.ok(keys.includes("123456789")); // mn_users.userId
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
