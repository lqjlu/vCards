/**
 * D1 覆盖层数据访问
 *
 * 为规避 Workers 子请求限制，所有读操作一次性把覆盖层整表读出（4 条 SQL），
 * 在内存中与 R2 基线合并。
 */

import { mergeVCard } from "./merge";

export interface FieldOverrideRow {
  uid: string;
  field_key: string;
  value: string | null;
}

export interface ExtraContactRow {
  id: string;
  uid: string;
  book_id: string;
  vcard: string;
  etag: string;
}

export interface TombstoneRow {
  uid: string;
}

export interface CustomBookRow {
  id: string;
  name: string;
  display_name: string;
}

export interface UserState {
  version: number;
  overrides: Map<string, Array<{ key: string; value: string | null }>>;
  extraContacts: ExtraContactRow[];
  extraByBook: Map<string, ExtraContactRow[]>;
  tombstones: Set<string>;
  customBooks: CustomBookRow[];
}

export const EMPTY_STATE: UserState = {
  version: 0,
  overrides: new Map(),
  extraContacts: [],
  extraByBook: new Map(),
  tombstones: new Set(),
  customBooks: [],
};

/**
 * 模块级缓存：D1 覆盖层读多写少，缓存几秒可大幅降低
 * 冷查询带来的偶发慢（免费版 D1 性能波动明显）。
 * 写操作（bumpVersion 等）会调用 invalidateUserState 主动失效。
 */
let userStateCache: { state: UserState; expires: number } | null = null;
const USER_STATE_TTL = 10_000;

/** 写操作后调用，使缓存立即失效 */
export const invalidateUserState = (): void => {
  userStateCache = null;
};

/** 一次性读取整个覆盖层（带短缓存） */
export const loadUserState = async (db: D1Database | undefined): Promise<UserState> => {
  if (!db) return EMPTY_STATE;

  const now = Date.now();
  if (userStateCache && userStateCache.expires > now) return userStateCache.state;

  const [meta, overrideRows, extraRows, tombRows, bookRows] = await Promise.all([
    db.prepare("SELECT value FROM meta WHERE key = 'version'").first<{ value: string }>(),
    db.prepare("SELECT uid, field_key, value FROM overrides").all<FieldOverrideRow>(),
    db.prepare("SELECT id, uid, book_id, vcard, etag FROM extra_contacts").all<ExtraContactRow>(),
    db.prepare("SELECT uid FROM tombstones").all<TombstoneRow>(),
    db.prepare("SELECT id, name, display_name FROM custom_books").all<CustomBookRow>(),
  ]);

  const overrides = new Map<string, Array<{ key: string; value: string | null }>>();
  for (const row of overrideRows.results ?? []) {
    const list = overrides.get(row.uid) ?? [];
    list.push({ key: row.field_key, value: row.value });
    overrides.set(row.uid, list);
  }

  const extraContacts = extraRows.results ?? [];
  const extraByBook = new Map<string, ExtraContactRow[]>();
  for (const row of extraContacts) {
    const list = extraByBook.get(row.book_id) ?? [];
    list.push(row);
    extraByBook.set(row.book_id, list);
  }

  const state: UserState = {
    version: Number(meta?.value ?? "0") || 0,
    overrides,
    extraContacts,
    extraByBook,
    tombstones: new Set((tombRows.results ?? []).map((r) => r.uid)),
    customBooks: bookRows.results ?? [],
  };
  userStateCache = { state, expires: now + USER_STATE_TTL };
  return state;
};

/** 写操作后递增版本号 */
export const bumpVersion = async (db: D1Database): Promise<number> => {
  await db
    .prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'version'")
    .run();
  invalidateUserState();
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'version'").first<{
    value: string;
  }>();
  return Number(row?.value ?? "0") || 0;
};

/**
 * 计算合并后的 ETag：
 * - 无用户介入的联系人沿用基线 ETag，避免无谓全量同步
 * - 有覆盖/新增的联系人用版本号参与 hash，保证每次修改必变
 */
export const mergedEtag = (
  baseEtag: string,
  uid: string,
  state: UserState,
  hash: (value: string) => string,
): string => {
  if (!state.overrides.has(uid) && !state.tombstones.has(uid)) return baseEtag;
  return `"${hash(`${baseEtag}|${uid}|${state.version}`)}"`;
};

/** 对 vCard 应用用户的字段级覆盖 */
export const applyOverrides = (
  vcard: string,
  uid: string,
  state: UserState,
): string => {
  const overrides = state.overrides.get(uid);
  if (!overrides?.length) return vcard;
  return mergeVCard(vcard, overrides);
};

/** 计算合并后的 CTag：基线 CTag + 全局版本号参与 hash */
export const mergedCtag = (
  baseCtag: string,
  state: UserState,
  hash: (value: string) => string,
): string => `"${hash(`${baseCtag}|${state.version}`)}"`;
