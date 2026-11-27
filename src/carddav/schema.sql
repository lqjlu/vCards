-- 用户覆盖层：与 R2 基线数据叠加，生成最终 CardDAV 视图
-- 所有表都可安全重复执行（IF NOT EXISTS）

-- 全局版本号：任何写操作都会 +1，用于客户端增量同步
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('version', '0');

-- 字段级覆盖：key = vCard UID + field_key；value 为 NULL 表示删除该字段
CREATE TABLE IF NOT EXISTS overrides (
  uid TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, field_key)
);
CREATE INDEX IF NOT EXISTS idx_overrides_uid ON overrides(uid);

-- 墓碑：用户删除的基线联系人（按 UID），上游再更新也不会复活
CREATE TABLE IF NOT EXISTS tombstones (
  uid TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

-- 用户新增的联系人
CREATE TABLE IF NOT EXISTS extra_contacts (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL,
  vcard TEXT NOT NULL,
  etag TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_extra_book ON extra_contacts(book_id);

-- 用户新建的分类（现有分类来自基线 catalog）
CREATE TABLE IF NOT EXISTS custom_books (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- CardDAV 账户：可在管理页增删改，platform 决定走多分类簿(ios)还是合并簿(macos)
CREATE TABLE IF NOT EXISTS dav_accounts (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios',
  created_at TEXT NOT NULL
);
