import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { SignJWT } from "jose";

const phone = "263771234567@s.whatsapp.net";
const lid = "123456789@lid";
const pokemon = Array.from({ length: 60 }, (_, index) => ({
  _id: `owned-${index}`, ownerJid: lid, name: "Pikachu", pokedexId: 25,
  level: 10, inParty: index < 6,
}));
const cards = [
  { _id: "legacy-card-user", userId: "123456789", cards: [{ cardId: "same-character", name: "Legacy copy" }] },
  { _id: phone, cards: [{ cardId: "same-character", name: "Canonical copy" }] },
];
const queries: Record<string, any> = {};
const account = { _id: phone, registered: true, money: 1234, bank: 50 };
const trainer = {
  jid: lid, party: pokemon.slice(0, 6).map((item) => item._id),
  pc: pokemon.slice(6).map((item) => item._id), coins: 250,
};
const db = {
  collection(name: string) {
    return {
      async findOne() {
        if (name === "users") return account;
        return null;
      },
      async updateOne() { return { upsertedCount: 0 }; },
      find(query: unknown) {
        queries[name] = query;
        const cursor = {
          sort() { return cursor; },
          limit(count: number) { throw new Error(`Unexpected collection truncation at ${count}`); },
          async toArray() {
            if (name === "users") return [{ _id: lid, phoneNumber: "263771234567" }];
            if (name === "pokemon_trainers") return [trainer];
            if (name === "pokemon_owned") return pokemon;
            if (name === "mn_users") return cards;
            return [];
          },
        };
        return cursor;
      },
    };
  },
};
(globalThis as any).__collectionTestDb = db;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start/server") return {
      url: "fixture:server-cookies", shortCircuit: true,
    };
    if (specifier.endsWith("/db.server") || specifier === "./db.server") return {
      url: "fixture:database", shortCircuit: true,
    };
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith(".") && !/\.(?:ts|tsx|js|mjs|json)$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url === "fixture:server-cookies") return {
      format: "module", shortCircuit: true,
      source: "export const getCookie = () => globalThis.__collectionTestCookie; export const setCookie = () => {}; export const deleteCookie = () => {};",
    };
    if (url === "fixture:database") return {
      format: "module", shortCircuit: true,
      source: `
        export const getDb = async () => globalThis.__collectionTestDb;
        export const users = async () => (await getDb()).collection("users");
        export const guilds = async () => (await getDb()).collection("guilds");
        export const cardUsers = async () => (await getDb()).collection("mn_users");
        export const withMongoTransaction = async (operation) => operation(await getDb(), {});
        export const battleRooms = users, cardMarket = users, moderatorApplications = users, pets = users;
      `,
    };
    return nextLoad(url, context);
  },
});

const { toPublicUser } = await import("../src/lib/auth.server.ts");
const { listMyCards } = await import("../src/lib/aidoru.server.ts");

test("public profile includes every legacy-owned Pokémon and complete party/PC data", async () => {
  const user = await toPublicUser(account);
  assert.equal(user.coins, 1234);
  assert.equal(user.pokemon.length, 60);
  assert.equal(user.partyPokemon.length, 6);
  assert.equal(user.pcPokemon.length, 54);
  assert.equal(user.trainerCoins, 250);
  assert.ok(queries["pokemon_trainers"].jid.$in.includes(lid));
  assert.ok(queries["pokemon_owned"].$or[0].ownerJid.$in.includes(lid));
});

test("personal collection combines legacy and canonical cards without discarding duplicate characters", async () => {
  process.env["SESSION_SECRET"] = "collection-test-only-not-a-real-session-key";
  (globalThis as any).__collectionTestCookie = await new SignJWT({ sub: phone })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env["SESSION_SECRET"]));
  const owned = await listMyCards();
  assert.equal(owned.length, 2);
  assert.deepEqual(owned.map((card) => card.name), ["Legacy copy", "Canonical copy"]);
  assert.ok(queries["mn_users"].$or.some((clause: any) =>
    clause._id?.$in.includes(phone),
  ));
  const cardKeys = queries["mn_users"].$or.find((clause: any) => clause.userId).userId.$in;
  assert.ok(cardKeys.includes("123456789"));
  assert.ok(!cardKeys.includes("123456789@s.whatsapp.net"));
});
