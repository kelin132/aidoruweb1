import type { Db } from "mongodb";
import { ID_FIELDS, identityVariants, resolveAccountIdentity } from "./accountIdentity.mjs";
export { identityVariants, collectionOwnershipQuery } from "./accountIdentity.mjs";

export const USER_IDENTITY_FIELDS = ID_FIELDS;

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
