/**
 * 管理 API：联系人字段级编辑、新增、删除、分类管理
 *
 * 路由：/admin/api/*
 * 认证：复用 CardDAV 的 Basic Auth（checkAuth 在 worker 入口统一处理）
 */

import { createHash } from "node:crypto";
import { buildVCard, fieldName, parseVCard, stripGroup, type FieldOverride } from "./merge";
import {
  bumpVersion,
  hashPassword,
  loadUserState,
  type AccountPlatform,
} from "./store";
import { clearSyncLogs, listSyncLogs } from "./sync-log";
import type { Env } from "./worker-types";
import type { BookData, Catalog } from "./types";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const newId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** 读取基线联系人（从 R2 所有簿中按 uid 定位） */
const findBaseContact = async (env: Env, uid: string): Promise<{ bookId: string; vcard: string } | null> => {
  const catalogObject = await env.R2.get("catalog.json");
  if (!catalogObject) return null;
  const catalog = (await catalogObject.json()) as Catalog;

  for (const book of catalog.books) {
    const object = await env.R2.get(`books/ios/${book.id}.json`);
    if (!object) continue;
    const data = (await object.json()) as BookData;
    const contact = data.contacts.find((c) => c.uid === uid);
    if (contact) return { bookId: book.id, vcard: contact.vcard };
  }
  const macosObject = await env.R2.get(`books/macos/${catalog.macosBook.id}.json`);
  if (macosObject) {
    const data = (await macosObject.json()) as BookData;
    const contact = data.contacts.find((c) => c.uid === uid);
    if (contact) return { bookId: catalog.macosBook.id, vcard: contact.vcard };
  }
  return null;
};

/** 合并基线与覆盖层，产出管理页展示用的字段列表（与 mergeVCard 的判定保持一致） */
const buildAdminFields = (
  vcard: string,
  overrides: Array<{ key: string; value: string | null }>,
): Array<{ key: string; label: string; value: string; edited: boolean }> => {
  const baseFields = parseVCard(vcard);
  const baseKeys = new Set(baseFields.map((f) => f.key));
  const overrideMap = new Map(overrides.map((o) => [o.key, o.value]));
  const fields = baseFields.map((f) => ({
    key: f.key,
    // 去掉 item1. 分组前缀，否则前端 ^TEL 判断不到，列表里会显示“没有号码”
    label: stripGroup(f.baseKey),
    // 空覆盖视为无效，继续显示基线值，避免后台出现“电话是空的”
    value: overrideMap.has(f.key) ? (overrideMap.get(f.key) || f.value) : f.value,
    edited: overrideMap.has(f.key) && Boolean(overrideMap.get(f.key)),
  }));

  for (const o of overrides) {
    if (o.value === null || o.value === "") continue;
    if (o.key.startsWith("+")) {
      fields.push({
        key: o.key,
        label: stripGroup(o.key.slice(1).replace(/~\d+$/, "")),
        value: o.value,
        edited: true,
      });
      continue;
    }
    // 基线里没有的序号 key：旧版本把“客户端新增字段”存成了基线序号，这里补回来
    if (baseKeys.has(o.key)) continue;
    const storedKey = o.key.replace(/#\d+$/, "");
    const name = fieldName(storedKey);
    if (baseFields.some((f) => f.name === name && f.value === o.value)) continue;
    fields.push({
      key: o.key,
      label: stripGroup(storedKey),
      value: o.value,
      edited: true,
    });
  }

  return fields;
};

/** 获取合并后的联系人列表（网页主列表） */
const listContacts = async (env: Env): Promise<Response> => {
  const state = await loadUserState(env);
  const catalogObject = await env.R2.get("catalog.json");
  if (!catalogObject) return json({ error: "catalog.json 不存在" }, 500);
  const catalog = (await catalogObject.json()) as Catalog;

  const items: Array<{
    uid: string; id: string; name: string; book: string; source: "base" | "user";
    fields: Array<{ key: string; label: string; value: string; edited: boolean }>;
  }> = [];

  const userOverrides = state.overrides;

  for (const book of catalog.books) {
    const object = await env.R2.get(`books/ios/${book.id}.json`);
    if (!object) continue;
    const data = (await object.json()) as BookData;
    for (const contact of data.contacts) {
      if (state.tombstones.has(contact.uid)) continue;
      const overrides = userOverrides.get(contact.uid) ?? [];
      items.push({
        uid: contact.uid,
        id: contact.id,
        name: contact.uid,
        book: book.name,
        source: "base",
        fields: buildAdminFields(contact.vcard, overrides),
      });
    }
  }

  for (const row of state.extraContacts) {
    const overrides = userOverrides.get(row.uid) ?? [];
    const custom = state.customBooks.find((b) => b.id === row.book_id);
    const baseBook = catalog.books.find((b) => b.id === row.book_id);
    items.push({
      uid: row.uid,
      id: row.id,
      name: row.uid,
      book: custom?.name ?? baseBook?.name ?? row.book_id,
      source: "user",
      fields: buildAdminFields(row.vcard, overrides),
    });
  }

  return json({ version: state.version, contacts: items });
};

/** 保存字段覆盖：body = { uid, fields: [{key, value}], deleted: [key] } */
const saveContact = async (request: Request, env: Env): Promise<Response> => {
  if (!env.DB) return json({ error: "D1 未绑定" }, 500);
  const body = (await request.json()) as {
    uid?: string;
    fields?: Array<{ key: string; value: string }>;
    deleted?: string[];
  };
  const uid = body.uid?.trim();
  if (!uid) return json({ error: "缺少 uid" }, 400);

  const db = env.DB;
  const batch: D1PreparedStatement[] = [];
  // 先清掉该 uid 的旧覆盖，再写入新的一套，避免残留
  batch.push(db.prepare("DELETE FROM overrides WHERE uid = ?").bind(uid));
  const now = new Date().toISOString();
  for (const field of body.fields ?? []) {
    if (!field.key || !field.value) continue; // 空值不写覆盖，保留基线号码
    batch.push(
      db
        .prepare(
          "INSERT INTO overrides (uid, field_key, value, updated_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(uid, field_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        )
        .bind(uid, field.key, field.value, now),
    );
  }
  for (const key of body.deleted ?? []) {
    if (!key) continue;
    batch.push(
      db
        .prepare(
          "INSERT INTO overrides (uid, field_key, value, updated_at) VALUES (?, ?, NULL, ?) " +
            "ON CONFLICT(uid, field_key) DO UPDATE SET value = NULL, updated_at = excluded.updated_at",
        )
        .bind(uid, key, now),
    );
  }
  await db.batch(batch);
  const version = await bumpVersion(env);
  return json({ ok: true, version });
};

/** 新增联系人：body = { uid, bookId, fields: [{key, value}], newBook?: string } */
const createContact = async (request: Request, env: Env): Promise<Response> => {
  if (!env.DB) return json({ error: "D1 未绑定" }, 500);
  const body = (await request.json()) as {
    uid?: string;
    bookId?: string;
    fields?: Array<{ key: string; value: string }>;
    newBook?: string;
  };
  const uid = body.uid?.trim();
  if (!uid) return json({ error: "请填写名称（UID）" }, 400);

  const db = env.DB;
  let bookId = body.bookId?.trim() || "custom-default";

  // 新建分类
  if (body.newBook?.trim()) {
    const name = body.newBook.trim();
    bookId = newId("book-");
    await db
      .prepare(
        "INSERT INTO custom_books (id, name, display_name, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(bookId, name, `${name}(0)`, new Date().toISOString())
      .run();
  } else {
    // 若选的是内置分类，确保存在（custom_books 里没有也会工作，因为基线 catalog 有）
    const catalogObject = await env.R2.get("catalog.json");
    if (catalogObject) {
      const catalog = (await catalogObject.json()) as Catalog;
      const exists =
        catalog.books.some((b) => b.id === bookId) ||
        catalog.macosBook.id === bookId ||
        (await loadUserState(env)).customBooks.some((b) => b.id === bookId);
      if (!exists) return json({ error: "分类不存在" }, 400);
    }
  }

  // 检查 UID 冲突
  const existing = await db.prepare("SELECT 1 FROM extra_contacts WHERE uid = ?").bind(uid).first();
  if (existing) return json({ error: "该名称已存在" }, 409);
  const base = await findBaseContact(env, uid);
  if (base && !stateHasTombstone(await loadUserState(env), uid)) {
    return json({ error: "该名称与上游联系人冲突，请换个名称" }, 409);
  }

  const vcard = buildVCard({ uid, fields: body.fields ?? [] });
  const etag = `"${sha256(vcard)}"`;
  const id = newId("c-");
  await db
    .prepare(
      "INSERT INTO extra_contacts (id, uid, book_id, vcard, etag, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, uid, bookId, vcard, etag, new Date().toISOString())
    .run();
  const version = await bumpVersion(env);
  return json({ ok: true, version, id });
};

const stateHasTombstone = (state: { tombstones: Set<string> }, uid: string): boolean =>
  state.tombstones.has(uid);

/** 删除联系人：基线联系人写墓碑；用户新增的直接删除 */
const deleteContact = async (request: Request, env: Env): Promise<Response> => {
  if (!env.DB) return json({ error: "D1 未绑定" }, 500);
  const body = (await request.json()) as { uid?: string };
  const uid = body.uid?.trim();
  if (!uid) return json({ error: "缺少 uid" }, 400);

  const db = env.DB;
  const extra = await db.prepare("SELECT id FROM extra_contacts WHERE uid = ?").bind(uid).first();
  if (extra) {
    await db.prepare("DELETE FROM extra_contacts WHERE uid = ?").bind(uid).run();
  } else {
    await db
      .prepare("INSERT OR REPLACE INTO tombstones (uid, deleted_at) VALUES (?, ?)")
      .bind(uid, new Date().toISOString())
      .run();
  }
  await db.prepare("DELETE FROM overrides WHERE uid = ?").bind(uid).run();
  const version = await bumpVersion(env);
  return json({ ok: true, version });
};

/** 列出所有分类（基线 + 自定义） */
const listBooks = async (env: Env): Promise<Response> => {
  const state = await loadUserState(env);
  const catalogObject = await env.R2.get("catalog.json");
  const baseBooks = catalogObject
    ? ((await catalogObject.json()) as Catalog).books.map((b) => ({ id: b.id, name: b.name }))
    : [];
  return json({
    books: [...baseBooks, ...state.customBooks.map((b) => ({ id: b.id, name: b.name }))],
  });
};

/** 恢复被删除的基线联系人 */
const restoreContact = async (request: Request, env: Env): Promise<Response> => {
  if (!env.DB) return json({ error: "D1 未绑定" }, 500);
  const body = (await request.json()) as { uid?: string };
  const uid = body.uid?.trim();
  if (!uid) return json({ error: "缺少 uid" }, 400);
  await env.DB.prepare("DELETE FROM tombstones WHERE uid = ?").bind(uid).run();
  const version = await bumpVersion(env);
  return json({ ok: true, version });
};

/** 列出 CardDAV 账户（不返回密码哈希） */
const listAccounts = async (env: Env): Promise<Response> => {
  const state = await loadUserState(env);
  return json({
    accounts: state.accounts.map((a) => ({
      username: a.username,
      platform: a.platform,
    })),
  });
};

/** 新增或更新账户。password 留空表示保持原密码 */
const saveAccount = async (request: Request, env: Env): Promise<Response> => {
  if (!env.DB) return json({ error: "D1 未绑定" }, 500);
  const body = (await request.json()) as {
    username?: string;
    password?: string;
    platform?: string;
    originalUsername?: string;
  };
  const username = body.username?.trim();
  if (!username) return json({ error: "缺少用户名" }, 400);
  const platform: AccountPlatform = body.platform === "macos" ? "macos" : "ios";
  const original = body.originalUsername?.trim() || username;
  const db = env.DB;

  // 检查目标用户名是否已存在（改名时排除自己）
  const existing = await db
    .prepare("SELECT username FROM dav_accounts WHERE username = ?")
    .bind(username)
    .first<{ username: string }>();
  if (existing && existing.username !== original) {
    return json({ error: "用户名已存在" }, 409);
  }

  const batch: D1PreparedStatement[] = [];
  if (body.password) {
    // 提供了新密码：整条更新
    batch.push(
      db
        .prepare(
          "INSERT INTO dav_accounts (username, password_hash, platform, created_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, platform = excluded.platform",
        )
        .bind(username, hashPassword(body.password), platform, new Date().toISOString()),
    );
  } else {
    // 未改密码：只更新用户名与平台
    batch.push(
      db
        .prepare("UPDATE dav_accounts SET username = ?, platform = ? WHERE username = ?")
        .bind(username, platform, original),
    );
  }
  if (username !== original) {
    batch.push(db.prepare("DELETE FROM dav_accounts WHERE username = ?").bind(original));
  }
  await db.batch(batch);
  const version = await bumpVersion(env);
  return json({ ok: true, version });
};

/** 删除账户（至少保留一个） */
const deleteAccount = async (request: Request, env: Env): Promise<Response> => {
  if (!env.DB) return json({ error: "D1 未绑定" }, 500);
  const body = (await request.json()) as { username?: string };
  const username = body.username?.trim();
  if (!username) return json({ error: "缺少用户名" }, 400);
  const db = env.DB;
  const count = await db.prepare("SELECT COUNT(*) AS n FROM dav_accounts").first<{ n: number }>();
  if ((count?.n ?? 0) <= 1) return json({ error: "至少保留一个账户" }, 400);
  await db.prepare("DELETE FROM dav_accounts WHERE username = ?").bind(username).run();
  const version = await bumpVersion(env);
  return json({ ok: true, version });
};

/** 同步日志：GET 列表，DELETE 清空 */
const syncLogs = async (request: Request, env: Env): Promise<Response> => {
  const method = request.method.toUpperCase();
  if (method === "DELETE") {
    if (!env.DB) return json({ error: "D1 未绑定" }, 500);
    await clearSyncLogs(env.DB);
    return json({ ok: true });
  }
  if (!env.DB) return json({ logs: [], total: 0 });
  const url = new URL(request.url);
  const logs = await listSyncLogs(env.DB, Number(url.searchParams.get("limit") ?? 200));
  return json({ logs, total: logs.length });
};

export const handleAdminApi = async (request: Request, env: Env, pathWithQuery: string): Promise<Response> => {
  const path = pathWithQuery.split("?")[0] ?? pathWithQuery;
  const method = request.method.toUpperCase();
  if (path === "/admin/api/logs" && (method === "GET" || method === "DELETE")) {
    return syncLogs(request, env);
  }
  if (path === "/admin/api/contacts" && method === "GET") return listContacts(env);
  if (path === "/admin/api/contacts" && method === "POST") return createContact(request, env);
  if (path === "/admin/api/contact" && method === "POST") return saveContact(request, env);
  if (path === "/admin/api/contact" && method === "DELETE") return deleteContact(request, env);
  if (path === "/admin/api/restore" && method === "POST") return restoreContact(request, env);
  if (path === "/admin/api/books" && method === "GET") return listBooks(env);
  if (path === "/admin/api/accounts" && method === "GET") return listAccounts(env);
  if (path === "/admin/api/accounts" && method === "POST") return saveAccount(request, env);
  if (path === "/admin/api/accounts" && method === "DELETE") return deleteAccount(request, env);
  return json({ error: "Not Found" }, 404);
};

export { parseVCard, type FieldOverride };
