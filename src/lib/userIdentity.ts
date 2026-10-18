import type { Db } from "mongodb";

export const USER_IDENTITY_FIELDS = [
  "_id", "phoneNumber", "phone", "whatsappNumber", "whatsappId",
  "whatsappJid", "jid", "userId", "userJid", "sender", "owner", "migratedFrom",
] as const;

export function identityVariants(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const withoutDevice = raw.replace(/:\d+(?=@)/, "");
  const [local = "", server = "s.whatsapp.net"] = withoutDevice.split("@");
  const domain = server.toLowerCase();
  const bare = local.replace(/^\+/, "");
  if (!/^\d+$/.test(bare)) return [...new Set([raw, withoutDevice])];
  // A privacy LID is not a phone number. Only a persisted mapping may join them.
  if (domain === "lid") return [...new Set([raw, withoutDevice, bare, `${bare}@lid`])];
  return [...new Set([
    raw, withoutDevice, bare, `+${bare}`, `${bare}@${domain}`,
    `${bare}@s.whatsapp.net`, `${bare}@c.us`,
    `${bare}:0@s.whatsapp.net`, `${bare}:0@c.us`,
  ])];
}

export function userIdentityKeys(user: Record<string, unknown>): string[] {
  const aliases = Array.isArray(user["identityAliases"]) ? user["identityAliases"] : [];
  return [...new Set([
    ...USER_IDENTITY_FIELDS.flatMap((field) => identityVariants(user[field])),
    ...aliases.flatMap(identityVariants),
  ])];
}

export async function resolveUserIdentityKeys(db: Db, user: Record<string, unknown>): Promise<string[]> {
  const keys = userIdentityKeys(user);
  if (!keys.length) return keys;
  // Older LID accounts may contain the verified phone mapping while the
  // signed-in canonical account does not yet contain the reverse alias.
  const linked = await db.collection("users").find({
    $or: [
      ...USER_IDENTITY_FIELDS.map((field) => ({ [field]: { $in: keys } })),
      { identityAliases: { $in: keys } },
    ],
  }, {
    projection: Object.fromEntries([...USER_IDENTITY_FIELDS, "identityAliases"].map((field) => [field, 1])),
  }).toArray();
  return [...new Set([...keys, ...linked.flatMap(userIdentityKeys)])];
}
