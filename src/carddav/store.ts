/**
 * D1 覆盖层数据访问
 *
 * 读多写少：用户覆盖数据最终落在 D1，但 D1 免费版冷查询偶发极慢（实测 1~27 秒）。
 * iOS 全量同步会并发拉 20 个地址簿，若每个请求都冷查 D1，累积起来必然超时。
 * 因此把整份覆盖层状态序列化后镜像到 R2（跨 PoP 全局一致、读小对象极快），
 * 读路径只读 R2，D1 仅作为写入源与回源兜底。
 */

import { mergeVCard } from "./merge";
import type { Env } from "./worker-types";

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

/** 覆盖层状态在 R2 中的镜像对象（读路径只碰它，不查 D1） */
const STATE_R2_KEY = "__overlay-state.json";

type SerializedState = {
  version: number;
  overrides: Array<{ uid: string; key: string; value: string | null }>;
  extraContacts: ExtraContactRow[];
  tombstones: string[];
  customBooks: CustomBookRow[];
};

const serializeState = (s: UserState): SerializedState => ({
  version: s.version,
  overrides: [...s.overrides.entries()].flatMap(([uid, list]) =>
    list.map((o) => ({ uid, key: o.key, value: o.value })),
  ),
  extraContacts: s.extraContacts,
  tombstones: [...s.tombstones],
  customBooks: s.customBooks,
});

const deserializeState = (s: SerializedState): UserState => {
  const overrides = new Map<string, Array<{ key: string; value: string | null }>>();
  for (const o of s.overrides) {
    const list = overrides.get(o.uid) ?? [];
    list.push({ key: o.key, value: o.value });
    overrides.set(o.uid, list);
  }
  const extraByBook = new Map<string, ExtraContactRow[]>();
  for (const row of s.extraContacts) {
    const list = extraByBook.get(row.book_id) ?? [];
    list.push(row);
    extraByBook.set(row.book_id, list);
  }
  return {
    version: s.version,
    overrides,
    extraContacts: s.extraContacts,
    extraByBook,
    tombstones: new Set(s.tombstones),
    customBooks: s.customBooks,
  };
};

/** 模块级缓存：同一 isolate 内连 R2 都省掉；跨 isolate/跨 PoP 由 R2 镜像兜底 */
let userStateCache: { state: UserState; expires: number } | null = null;
const USER_STATE_TTL = 30_000;

const getSharedCache = (): Cache | undefined =>
  (globalThis as { caches?: CacheStorage }).caches?.default;

const writeCaches = async (env: Env, state: UserState): Promise<void> => {
  userStateCache = { state, expires: Date.now() + USER_STATE_TTL };
  try {
    await env.R2.put(STATE_R2_KEY, JSON.stringify(serializeState(state)));
  } catch {
    // R2 镜像写入失败：下次会回源 D1，不影响正确性
  }
  const cache = getSharedCache();
  if (cache) {
    try {
      await cache.put(
        "https://card.585119.xyz/__overlay-state.json",
        new Response(JSON.stringify(serializeState(state)), {
          headers: { "Cache-Control": "max-age=30" },
        }),
      );
    } catch {
      // 忽略
    }
  }
};

/** 写操作后调用：清掉模块缓存，R2 镜像由 bumpVersion 主动刷新 */
export const invalidateUserState = (): void => {
  userStateCache = null;
};

/** 从 D1 回源整份覆盖层（慢路径，仅写操作或 R2 未就绪时触发） */
const readStateFromD1 = async (db: D1Database): Promise<UserState> => {
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

  return {
    version: Number(meta?.value ?? "0") || 0,
    overrides,
    extraContacts,
    extraByBook,
    tombstones: new Set((tombRows.results ?? []).map((r) => r.uid)),
    customBooks: bookRows.results ?? [],
  };
};

/**
 * 读取覆盖层状态：模块缓存 → R2 镜像 → D1 回源。
 * 正常同步路径完全不查 D1，规避冷查询导致的 iOS 超时。
 */
export const loadUserState = async (env: Env): Promise<UserState> => {
  const db = env.DB;
  if (!db) return EMPTY_STATE;

  const now = Date.now();
  if (userStateCache && userStateCache.expires > now) return userStateCache.state;

  // R2 镜像：跨 isolate、跨 PoP 一致，读小对象极快
  try {
    const object = await env.R2.get(STATE_R2_KEY);
    if (object) {
      const state = deserializeState((await object.json()) as SerializedState);
      userStateCache = { state, expires: now + USER_STATE_TTL };
      return state;
    }
  } catch {
    // R2 读取失败则回源 D1
  }

  const state = await readStateFromD1(db);
  await writeCaches(env, state);
  return state;
};

/** 写操作后递增版本号，并把最新状态刷新到 R2 镜像 */
export const bumpVersion = async (env: Env): Promise<number> => {
  const db = env.DB;
  if (!db) return 0;
  await db
    .prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'version'")
    .run();
  const state = await readStateFromD1(db);
  await writeCaches(env, state);
  return state.version;
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
