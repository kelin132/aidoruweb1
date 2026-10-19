import type { Db } from "mongodb";
export const ID_FIELDS: string[];
export function identityVariants(value: unknown): string[];
export function selectAccount(records: Record<string, any>[]): Record<string, any> | null;
export function resolveAccountIdentity(db: Db, sender: unknown, discordId?: string | null): Promise<{
  account: (Record<string, any> & { _id?: any; registered?: boolean; websiteBanned?: boolean }) | null;
  accountId: any; ids: string[]; discordIds: string[];
}>;
export function collectionOwnershipQuery(values: unknown[], fields: string[]): Record<string, any>;
