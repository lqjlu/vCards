/**
 * CardDAV 同步日志
 *
 * 每次客户端请求（PROPFIND / REPORT / PUT / DELETE …）都留一条记录到 D1，
 * 后台「同步日志」页据此判断手机到底有没有把修改写上来、失败在哪一步。
 *
 * 日志写入失败不能影响主流程，所以所有异常都被吞掉。
 */

import type { Env } from "./worker-types";

export type SyncResult = "ok" | "conflict" | "fail";

export interface SyncLogEntry {
  method: string;
  path: string;
  status: number;
  result?: SyncResult;
  username?: string;
  platform?: string;
  uid?: string;
  detail?: string | Record<string, unknown>;
  durationMs?: number;
  userAgent?: string;
}

export interface SyncLogRow {
  id: number;
  created_at: string;
  method: string;
  path: string;
  username: string;
  platform: string;
  status: number;
  result: SyncResult;
  uid: string;
  detail: string;
  duration_ms: number;
  user_agent: string;
}

const MAX_PATH = 500;
const MAX_UA = 200;
const MAX_DETAIL = 4000;
/** 只保留最近 2000 条，避免日志无限增长 */
const KEEP_LATEST = 2000;

const clip = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max) + "…" : value;

const resultOf = (status: number): SyncResult =>
  status === 412 ? "conflict" : status >= 400 ? "fail" : "ok";

let tableReady: Promise<void> | null = null;

/** DDL 自愈：不依赖部署时手动跑 schema.sql */
const ensureTable = (db: D1Database): Promise<void> => {
  if (!tableReady) {
    tableReady = db
      .prepare(
        "CREATE TABLE IF NOT EXISTS sync_logs (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, " +
          "method TEXT NOT NULL, path TEXT NOT NULL, username TEXT NOT NULL DEFAULT '', " +
          "platform TEXT NOT NULL DEFAULT '', status INTEGER NOT NULL, " +
          "result TEXT NOT NULL, uid TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', " +
          "duration_ms INTEGER NOT NULL DEFAULT 0, user_agent TEXT NOT NULL DEFAULT '')",
      )
      .run()
      .then(() => undefined)
      .catch((error: unknown) => {
        tableReady = null;
        throw error;
      });
  }
  return tableReady!;
};

let lastPrune = 0;

/** 低频清理旧日志（每 10 分钟最多一次） */
const prune = (db: D1Database): void => {
  const now = Date.now();
  if (now - lastPrune < 10 * 60_000) return;
  lastPrune = now;
  void db
    .prepare(
      "DELETE FROM sync_logs WHERE id NOT IN " +
        "(SELECT id FROM sync_logs ORDER BY id DESC LIMIT " + KEEP_LATEST + ")",
    )
    .run()
    .catch(() => undefined);
};

/** 写一条日志。永远不抛异常。 */
export const recordSyncLog = async (env: Env, entry: SyncLogEntry): Promise<void> => {
  const db = env.DB;
  if (!db) return;
  try {
    await ensureTable(db);
    const detail =
      typeof entry.detail === "string"
        ? entry.detail
        : entry.detail
          ? JSON.stringify(entry.detail)
          : "";
    await db
      .prepare(
        "INSERT INTO sync_logs (created_at, method, path, username, platform, status, " +
          "result, uid, detail, duration_ms, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        new Date().toISOString(),
        clip(entry.method, 16),
        clip(entry.path, MAX_PATH),
        clip(entry.username ?? "", 100),
        clip(entry.platform ?? "", 16),
        entry.status,
        entry.result ?? resultOf(entry.status),
        clip(entry.uid ?? "", 200),
        clip(detail, MAX_DETAIL),
        Math.max(0, Math.round(entry.durationMs ?? 0)),
        clip(entry.userAgent ?? "", MAX_UA),
      )
      .run();
    prune(db);
  } catch {
    // 日志基础设施故障不应打断同步
  }
};

/** 调度日志：写路径 await，读路径用 waitUntil 不阻塞响应 */
export const scheduleSyncLog = (
  env: Env,
  ctx: ExecutionContext | undefined,
  entry: SyncLogEntry,
): void => {
  const task = recordSyncLog(env, entry);
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(task);
  else void task;
};

/** 管理页读取日志：按时间倒序，取最近 limit 条 */
export const listSyncLogs = async (db: D1Database, limit = 200): Promise<SyncLogRow[]> => {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  await ensureTable(db);
  const result = await db
    .prepare("SELECT * FROM sync_logs ORDER BY id DESC LIMIT " + safeLimit)
    .all<SyncLogRow>();
  return result.results ?? [];
};

/** 清空日志 */
export const clearSyncLogs = async (db: D1Database): Promise<void> => {
  await ensureTable(db);
  await db.prepare("DELETE FROM sync_logs").run();
};
