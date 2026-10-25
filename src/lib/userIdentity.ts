import type { Db } from "mongodb";
import { ID_FIELDS, identityVariants, resolveAccountIdentity } from "./accountIdentity.mjs";
export { identityVariants, collectionOwnershipQuery } from "./accountIdentity.mjs";

export const USER_IDENTITY_FIELDS = ID_FIELDS;
export const TRAINER_OWNER_FIELDS = ["jid", "_id", "userId", "ownerJid", "whatsappNumber", "owner"] as const;
export const POKEMON_OWNER_FIELDS = ["ownerJid", "owner", "userId"] as const;

export function userIdentityKeys(user: Record<string, unknown>): string[] {
  const aliases = Array.isArray(user["identityAliases"]) ? user["identityAliases"] : [];
  return [...new Set([
    ...USER_IDENTITY_FIELDS.flatMap((field) => identityVariants(user[field])),
    ...aliases.flatMap(identityVariants),
  ])];
}

export async function resolveUserIdentityKeys(db: Db, user: Record<string, unknown>): Promise<string[]> {
  return (await resolveAccountIdentity(db, user["_id"])).ids;
}

export function selectPrimaryTrainer<T extends Record<string, unknown>>(records: T[]): T | null {
  return [...records].sort((a, b) => {
    const count = (record: T) =>
      (Array.isArray(record["party"]) ? record["party"].length : 0) +
      (Array.isArray(record["pc"]) ? record["pc"].length : 0);
    return count(b) - count(a) || String(a["_id"] ?? a["jid"] ?? "")
      .localeCompare(String(b["_id"] ?? b["jid"] ?? ""));
  })[0] ?? null;
}
