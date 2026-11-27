/**
 * CardDAV 写操作：把客户端 PUT/DELETE 的 vCard 落到 D1 覆盖层。
 *
 * 与网页后台（admin.ts）共用同一套覆盖层表，因此：
 *   - 手机改的号码，网页能看到；网页改的，手机能看到
 *   - 上游 GitHub 更新只动 R2 基线，用户改过的字段通过 overrides 保留
 *   - 每次写操作 bumpVersion，CTag/ETag 变化触发客户端增量同步
 */

import { createHash } from "node:crypto";
import { parseVCard, type FieldOverride } from "./merge";
import { bumpVersion } from "./store";
import type { Env } from "./worker-types";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const newId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** 从 vCard 文本中取 UID 字段值 */
export const vcardUid = (vcard: string): string | null => {
  for (const line of vcard.split(/\r?\n/)) {
    if (/^UID(?:;[^:]*)?:/i.test(line)) {
      const value = line.slice(line.indexOf(":") + 1).trim();
      return value || null;
    }
  }
  return null;
};

export interface PutResult {
  ok: boolean;
  status: number;
  uid?: string;
  id?: string;
  version?: number;
  error?: string;
}

/**
 * 写入一张 vCard。
 * - baseVcard 提供时表示编辑基线联系人：只把与基线不同的字段写成覆盖，缺失的字段写 NULL 删除。
 * - baseVcard 为空时表示新增：整张 vCard 存入 extra_contacts。
 */
export const putContact = async (params: {
  env: Env;
  mode: "ios" | "macos";
  bookId: string;
  contactId: string;
  vcard: string;
  baseVcard?: string;
  baseUid?: string;
}): Promise<PutResult> => {
  const { env, mode, bookId, contactId, vcard, baseVcard, baseUid } = params;
  if (!env.DB) return { ok: false, status: 500, error: "D1 未绑定" };

  const uid = vcardUid(vcard) ?? baseUid ?? contactId;
  if (!uid) return { ok: false, status: 400, error: "vCard 缺少 UID" };

  const db = env.DB;
  const now = new Date().toISOString();

  if (baseVcard) {
    // 编辑已有联系人：逐字段对比，只写变化部分
    const submitted = parseVCard(vcard);
    const submittedMap = new Map(submitted.map((f) => [f.baseKey, f.value]));
    const baseFields = parseVCard(baseVcard);
    const overrides: FieldOverride[] = [];

    // 提交里出现且与基线不同的字段 → 写覆盖
    for (const field of submitted) {
      const baseField = baseFields.find((f) => f.baseKey === field.baseKey);
      if (!baseField || baseField.value !== field.value) {
        overrides.push({ key: field.key, value: field.value });
      }
    }
    // 基线有但提交里没有的字段 → 写 NULL 删除（跳过系统隐藏字段与 PHOTO）
    for (const field of baseFields) {
      if (!submittedMap.has(field.baseKey)) {
        overrides.push({ key: field.key, value: null });
      }
    }

    const batch: D1PreparedStatement[] = [
      db.prepare("DELETE FROM overrides WHERE uid = ?").bind(uid),
    ];
    for (const o of overrides) {
      batch.push(
        db
          .prepare(
            "INSERT INTO overrides (uid, field_key, value, updated_at) VALUES (?, ?, ?, ?) " +
              "ON CONFLICT(uid, field_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
          )
          .bind(uid, o.key, o.value, now),
      );
    }
    await db.batch(batch);
    const version = await bumpVersion(env);
    return { ok: true, status: 204, uid, version };
  }

  // 新增联系人：确认 uid 不与现有冲突
  const existingExtra = await db.prepare("SELECT 1 FROM extra_contacts WHERE uid = ?").bind(uid).first();
  if (existingExtra) return { ok: false, status: 409, error: "该 UID 已存在", uid };

  const etag = `"${sha256(vcard)}"`;
  const id = newId("c-");
  const resolvedBook = mode === "macos" ? bookId : bookId;
  await db
    .prepare(
      "INSERT INTO extra_contacts (id, uid, book_id, vcard, etag, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, uid, resolvedBook, vcard, etag, now)
    .run();
  const version = await bumpVersion(env);
  return { ok: true, status: 201, uid, id, version };
};

/** 删除联系人：基线写墓碑，extra 直接删 */
export const deleteContactByUid = async (
  env: Env,
  uid: string,
): Promise<PutResult> => {
  if (!env.DB) return { ok: false, status: 500, error: "D1 未绑定" };
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
  return { ok: true, status: 204, uid, version };
};
