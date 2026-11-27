/**
 * CardDAV 写操作：把客户端 PUT/DELETE 的 vCard 落到 D1 覆盖层。
 *
 * 与网页后台（admin.ts）共用同一套覆盖层表，因此：
 *   - 手机改的号码，网页能看到；网页改的，手机能看到
 *   - 上游 GitHub 更新只动 R2 基线，用户改过的字段通过 overrides 保留
 *   - 每次写操作 bumpVersion，CTag/ETag 变化触发客户端增量同步
 */

import { createHash } from "node:crypto";
import { fieldName, parseVCard, type FieldOverride, type VCardField } from "./merge";
import { bumpVersion } from "./store";
import type { Env } from "./worker-types";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const newId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** 为新字段分配唯一的 + 前缀 key（同一 baseKey 多次追加时用 ~N 区分） */
const plusKey = (baseKey: string, used: Set<string>): string => {
  const base = `+${baseKey}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}~${n}`)) n++;
  const key = `${base}~${n}`;
  used.add(key);
  return key;
};

/** 视图字段：key 保留来源（基线序号 / + 追加 / 孤儿），baseValue 为基线原值 */
interface ViewField {
  key: string;
  name: string;
  value: string;
  baseValue?: string;
}

/**
 * 构造“用户当前看到的”字段列表：基线字段套用已有覆盖，再加上追加字段与历史孤儿覆盖。
 * 必须与 mergeVCard 的判定保持一致，否则会出现手机上看得到、再次同步又消失的情况。
 */
const buildView = (
  baseFields: VCardField[],
  previous: FieldOverride[],
): { view: ViewField[]; used: Set<string> } => {
  const previousMap = new Map(previous.map((o) => [o.key, o.value]));
  const used = new Set(previous.map((o) => o.key));
  const baseKeys = new Set(baseFields.map((f) => f.key));
  const view: ViewField[] = [];

  for (const field of baseFields) {
    const value = previousMap.has(field.key) ? previousMap.get(field.key)! : field.value;
    if (value === null) continue;
    view.push({ key: field.key, name: field.name, value, baseValue: field.value });
  }

  for (const o of previous) {
    if (o.value === null) continue;
    if (o.key.startsWith("+")) {
      view.push({
        key: o.key,
        name: fieldName(o.key.slice(1).replace(/~\d+$/, "")),
        value: o.value,
      });
      continue;
    }
    if (baseKeys.has(o.key)) continue;
    const storedKey = o.key.replace(/#\d+$/, "");
    const name = fieldName(storedKey);
    // 与基线同名同值的孤儿属于参数漂移残留，忽略
    if (baseFields.some((f) => f.name === name && f.value === o.value)) continue;
    view.push({ key: o.key, name, value: o.value });
  }

  return { view, used };
};

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
  /** 原始基线 vCard（未合并覆盖层） */
  baseVcard?: string;
  baseUid?: string;
  /** 该联系人已有的覆盖，用于识别“新增字段”与孤儿覆盖 */
  overrides?: FieldOverride[];
}): Promise<PutResult> => {
  const { env, mode, bookId, contactId, vcard, baseVcard, baseUid, overrides: previous = [] } = params;
  if (!env.DB) return { ok: false, status: 500, error: "D1 未绑定" };

  const uid = vcardUid(vcard) ?? baseUid ?? contactId;
  if (!uid) return { ok: false, status: 400, error: "vCard 缺少 UID" };

  const db = env.DB;
  const now = new Date().toISOString();

  if (baseVcard) {
    // 编辑已有联系人：按「字段名 + 顺序」对齐，只写变化部分。
    // 不用完整 baseKey 匹配，因为客户端常改写参数（TEL;TYPE=CELL → TEL;TYPE=VOICE），
    // 一旦失配，新增号码会被当成孤儿丢掉，而原号码会被误判为删除。
    const submitted = parseVCard(vcard);
    const baseFields = parseVCard(baseVcard);
    const { view, used } = buildView(baseFields, previous);

    const groupBy = <T extends { name: string }>(list: T[]): Map<string, T[]> => {
      const map = new Map<string, T[]>();
      for (const item of list) {
        const bucket = map.get(item.name) ?? [];
        bucket.push(item);
        map.set(item.name, bucket);
      }
      return map;
    };

    const viewByName = groupBy(view);
    const submittedByName = groupBy(submitted);
    const names = new Set([...viewByName.keys(), ...submittedByName.keys()]);
    const next: FieldOverride[] = [];

    for (const name of names) {
      const current = viewByName.get(name) ?? [];
      const incoming = submittedByName.get(name) ?? [];
      const count = Math.max(current.length, incoming.length);
      for (let i = 0; i < count; i++) {
        const before = current[i];
        const after = incoming[i];
        if (before && after) {
          // 追加字段：始终保留为 + key
          if (before.key.startsWith("+")) {
            next.push({ key: before.key, value: after.value });
            continue;
          }
          // 历史孤儿：保留原 key，值变化时更新
          if (before.baseValue === undefined) {
            next.push({ key: before.key, value: after.value });
            continue;
          }
          // 基线字段：只有偏离基线值才需要覆盖
          if (before.baseValue !== after.value) {
            next.push({ key: before.key, value: after.value });
          }
          continue;
        }
        if (after) {
          // 客户端多出来的字段 → 新增
          next.push({ key: plusKey(after.baseKey, used), value: after.value });
          continue;
        }
        if (!before) continue;
        // 客户端删掉的字段 → 墓碑（追加字段与孤儿直接不写回）
        if (before.key.startsWith("+") || before.baseValue === undefined) continue;
        next.push({ key: before.key, value: null });
      }
    }

    const batch: D1PreparedStatement[] = [
      db.prepare("DELETE FROM overrides WHERE uid = ?").bind(uid),
    ];
    for (const o of next) {
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
