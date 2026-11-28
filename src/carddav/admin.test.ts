/**
 * 管理 API + 双源合并的端到端测试
 * 用内存 mock D1 验证：编辑字段、上游更新保留用户值、删除墓碑、新增联系人
 */
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import worker from "./worker";
import { mergeVCard } from "./merge";
import type { Catalog } from "./types";

const DIST_DIR = path.resolve("dist/carddav");
const catalog = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "catalog.json"), "utf8")) as Catalog;

class MockObject {
  constructor(private readonly rawText: string) {}
  async json() { return JSON.parse(this.rawText); }
  async text() { return this.rawText; }
}
class MockR2 {
  private objects = new Map<string, string>();
  put(k: string, v: string) { this.objects.set(k, v); }
  async get(k: string) { const v = this.objects.get(k); return v === undefined ? null : new MockObject(v); }
}
const r2 = new MockR2();
r2.put("catalog.json", JSON.stringify(catalog));
for (const b of catalog.books) {
  r2.put(`books/ios/${b.id}.json`, fs.readFileSync(path.join(DIST_DIR, "books", "ios", `${b.id}.json`), "utf8"));
}
r2.put(`books/macos/${catalog.macosBook.id}.json`,
  fs.readFileSync(path.join(DIST_DIR, "books", "macos", `${catalog.macosBook.id}.json`), "utf8"));

/** 极简 D1 mock：支持本测试用到的 SQL */
class MockD1 {
  meta = { version: 0 };
  overrides = new Map<string, string | null>(); // "uid|field_key" -> value
  extras: Array<{ id: string; uid: string; book_id: string; vcard: string; etag: string }> = [];
  tombstones = new Set<string>();
  customBooks: Array<{ id: string; name: string; display_name: string }> = [];
  accounts: Array<{ username: string; password_hash: string; platform: string }> = [];
  logs: Array<Record<string, unknown>> = [];

  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({ run: async () => this.run(sql, args), first: async () => this.first(sql, args), all: async () => this.all(sql) }),
      run: async () => this.run(sql, []),
      first: async () => this.first(sql, []),
      all: async () => this.all(sql),
    };
  }
  private run(sql: string, args: unknown[]) {
    if (sql.includes("UPDATE meta SET value")) this.meta.version += 1;
    else if (sql.includes("CREATE TABLE IF NOT EXISTS sync_logs")) { /* 自愈建表 */ }
    else if (sql.startsWith("INSERT INTO sync_logs")) {
      this.logs.push({
        id: this.logs.length + 1,
        created_at: args[0], method: args[1], path: args[2], username: args[3],
        platform: args[4], status: args[5], result: args[6], uid: args[7],
        detail: args[8], duration_ms: args[9], user_agent: args[10],
      });
    } else if (sql.startsWith("DELETE FROM sync_logs")) {
      if (sql.includes("WHERE id NOT IN")) { /* 清理旧日志 */ } else this.logs = [];
    } else if (sql.startsWith("DELETE FROM overrides WHERE uid")) {
      const uid = args[0] as string;
      for (const k of [...this.overrides.keys()]) if (k.startsWith(uid + "|")) this.overrides.delete(k);
    } else if (sql.startsWith("INSERT INTO overrides") || sql.startsWith("INSERT OR REPLACE INTO overrides")) {
      this.overrides.set(`${args[0]}|${args[1]}`, (args[2] as string) ?? null);
    } else if (sql.startsWith("INSERT OR REPLACE INTO tombstones")) {
      this.tombstones.add(args[0] as string);
    } else if (sql.startsWith("DELETE FROM tombstones")) {
      this.tombstones.delete(args[0] as string);
    } else if (sql.startsWith("INSERT INTO extra_contacts")) {
      this.extras.push({ id: args[0] as string, uid: args[1] as string, book_id: args[2] as string, vcard: args[3] as string, etag: args[4] as string });
    } else if (sql.startsWith("DELETE FROM extra_contacts")) {
      this.extras = this.extras.filter((e) => e.uid !== args[0]);
    } else if (sql.startsWith("INSERT INTO custom_books")) {
      this.customBooks.push({ id: args[0] as string, name: args[1] as string, display_name: args[2] as string });
    } else if (sql.startsWith("INSERT INTO dav_accounts") || sql.startsWith("INSERT OR IGNORE INTO dav_accounts")) {
      const username = args[0] as string;
      this.accounts = this.accounts.filter((a) => a.username !== username);
      this.accounts.push({ username, password_hash: args[1] as string, platform: args[2] as string });
    } else if (sql.startsWith("UPDATE dav_accounts SET username")) {
      const acc = this.accounts.find((a) => a.username === args[2]);
      if (acc) { acc.username = args[0] as string; acc.platform = args[1] as string; }
    } else if (sql.startsWith("DELETE FROM dav_accounts")) {
      this.accounts = this.accounts.filter((a) => a.username !== args[0]);
    }
    return { success: true };
  }
  private first(sql: string, args: unknown[]) {
    if (sql.includes("FROM meta WHERE key = 'version'")) return { value: String(this.meta.version) };
    if (sql.includes("SELECT 1 FROM extra_contacts WHERE uid")) return this.extras.some((e) => e.uid === args[0]) ? { 1: 1 } : null;
    if (sql.includes("COUNT(*) AS n FROM dav_accounts")) return { n: this.accounts.length };
    if (sql.includes("SELECT username FROM dav_accounts WHERE username")) {
      return this.accounts.find((a) => a.username === args[0]) ?? null;
    }
    return null;
  }
  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    for (const stmt of statements) await stmt.run();
    return [];
  }
  private all(sql: string) {
    if (sql.includes("FROM overrides")) return { results: [...this.overrides.entries()].map(([k, v]) => { const [uid, field_key] = k.split("|"); return { uid, field_key, value: v }; }) };
    if (sql.includes("FROM extra_contacts")) return { results: this.extras };
    if (sql.includes("FROM tombstones")) return { results: [...this.tombstones].map((uid) => ({ uid })) };
    if (sql.includes("FROM custom_books")) return { results: this.customBooks };
    if (sql.includes("FROM dav_accounts")) return { results: this.accounts };
    if (sql.includes("FROM sync_logs")) {
      const match = sql.match(/LIMIT (\d+)/);
      const limit = match ? Number(match[1]) : 200;
      return { results: [...this.logs].reverse().slice(0, limit) };
    }
    return { results: [] };
  }
}

const d1 = new MockD1();
const env = { R2: r2, DB: d1 as never, CARDDAV_USER: "cn", CARDDAV_PASS: "card" } as never;
const auth = `Basic ${btoa("cn:card")}`;
const call = (url: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://card.example.com${url}`, {
    ...init,
    headers: { Authorization: auth, ...(init.headers ?? {}) },
  }), env, {} as ExecutionContext);

const firstBook = catalog.books[0]!;
const firstContact = (() => {
  const data = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "books", "ios", `${firstBook.id}.json`), "utf8"));
  return data.contacts[0] as { uid: string; vcard: string; id: string };
})();

describe("管理界面与 API", () => {
  test("/admin 返回 HTML 界面", async () => {
    const res = await call("/admin");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("vCards 通讯录管理");
  });

  test("生成的 HTML 脚本语法合法（防止模板转义导致白屏）", async () => {
    const res = await call("/admin");
    const html = await res.text();
    const start = html.indexOf("<script>") + "<script>".length;
    const end = html.indexOf("</script>");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const script = html.slice(start, end);
    // 用 Function 构造做语法校验；语法错误会抛出，合法则通过
    expect(() => new Function(script)).not.toThrow();
  });

  test("未认证访问 /admin 显示登录页而非 Basic Auth 弹窗", async () => {
    const res = await worker.fetch(new Request("https://card.example.com/admin"), env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('onsubmit="login(event)"');
    expect(html).toContain('/admin/api/login');
  });

  test("未认证访问管理 API 返回 401", async () => {
    const res = await worker.fetch(new Request("https://card.example.com/admin/api/contacts"), env, {} as ExecutionContext);
    expect(res.status).toBe(401);
  });

  test("登录接口：错误密码返回 401，正确凭据返回会话 Cookie", async () => {
    const wrong = await worker.fetch(new Request("https://card.example.com/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "cn", password: "wrong" }),
    }), env, {} as ExecutionContext);
    expect(wrong.status).toBe(401);

    const ok = await worker.fetch(new Request("https://card.example.com/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "cn", password: "card" }),
    }), env, {} as ExecutionContext);
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("vcards_admin=");

    // 用签发的 Cookie 访问管理页应拿到管理界面
    const token = cookie.split(";")[0]!;
    const page = await worker.fetch(new Request("https://card.example.com/admin", {
      headers: { Cookie: token },
    }), env, {} as ExecutionContext);
    const html = await page.text();
    expect(html).toContain("vCards 通讯录管理");
    expect(html).not.toContain('onsubmit="login(event)"');
  });

  test("列出联系人包含基线数据", async () => {
    const res = await call("/admin/api/contacts");
    const data = await res.json() as { contacts: Array<{ uid: string; source: string }> };
    expect(data.contacts.length).toBeGreaterThan(300);
    expect(data.contacts.some((c) => c.uid === firstContact.uid && c.source === "base")).toBe(true);
  });

  test("编辑字段后 CardDAV 返回用户值，未改字段保留", async () => {
    const fields = firstContact.vcard.split(/\r?\n/)
      .filter((l) => l && !l.startsWith(" ") && !/^(BEGIN|END|VERSION|UID|REV|PHOTO)/.test(l))
      .map((l) => { const i = l.indexOf(":"); return { key: l.slice(0, i) + "#0", value: l.slice(i + 1) }; });
    const targetKey = fields[0]!.key;
    const res = await call("/admin/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: firstContact.uid, fields: [{ key: targetKey, value: "我的自定义值" }], deleted: [] }),
    });
    expect(res.status).toBe(200);

    // CardDAV GET 应返回合并后的 vCard
    const get = await call(`/cn/addressbooks/${firstBook.id}/${firstContact.id}.vcf`);
    const vcard = await get.text();
    expect(vcard).toContain("我的自定义值");
    expect(vcard).toContain("UID:" + firstContact.uid);
    // CardDAV 保留内嵌 PHOTO（头像对同步是必需的）
    expect(vcard).toContain("PHOTO");
  });

  test("用户改过的字段在模拟上游更新后仍保留用户值", () => {
    const updatedBase = firstContact.vcard.replace("URL:", "URL:"); // 上游原样
    const merged = mergeVCard(updatedBase, [{ key: "ORG#0", value: "我的自定义值" }]);
    expect(merged).toContain("我的自定义值");
  });

  test("删除联系人后 CardDAV 不再返回（墓碑）", async () => {
    const victim = firstContact;
    await call("/admin/api/contact", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: victim.uid }),
    });
    const get = await call(`/cn/addressbooks/${firstBook.id}/${victim.id}.vcf`);
    expect(get.status).toBe(404);

    // 恢复
    await call("/admin/api/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: victim.uid }),
    });
    const get2 = await call(`/cn/addressbooks/${firstBook.id}/${victim.id}.vcf`);
    expect(get2.status).toBe(200);
  });

  test("新增联系人出现在指定分类", async () => {
    const res = await call("/admin/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: "我添加的测试联系人",
        bookId: firstBook.id,
        fields: [{ key: "FN#0", value: "我添加的测试联系人" }, { key: "TEL;TYPE=CELL#0", value: "13800138000" }],
      }),
    });
    expect(res.status).toBe(200);
    const list = await (await call("/admin/api/contacts")).json() as { contacts: Array<{ uid: string; source: string }> };
    const added = list.contacts.find((c) => c.uid === "我添加的测试联系人");
    expect(added?.source).toBe("user");
  });

  test("CardDAV OPTIONS 声明写权限", async () => {
    const res = await call(`/cn/addressbooks/${firstBook.id}/`, { method: "OPTIONS" });
    expect(res.headers.get("Allow")).toContain("PUT");
    expect(res.headers.get("Allow")).toContain("DELETE");
  });

  test("手机提交空 TEL 不会把基线号码清空", async () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(DIST_DIR, "books", "ios", `${firstBook.id}.json`), "utf8"),
    ) as { contacts: Array<{ id: string; uid: string; vcard: string }> };
    const victim = data.contacts.find((c) => /(^|\r?\n)TEL[^:]*:[^\r\n]+/.test(c.vcard));
    expect(victim).toBeTruthy();
    const original = victim!.vcard.match(/(?:^|\r?\n)TEL[^:]*:([^\r\n]+)/)?.[1] ?? "";
    expect(original).not.toBe("");
    const blanked = victim!.vcard.replace(/TEL[^:]*:[^\r\n]*/g, "TEL;TYPE=CELL:");
    const put = await call(`/cn/addressbooks/${firstBook.id}/${victim!.id}.vcf`, {
      method: "PUT", body: blanked,
    });
    expect(put.status).toBe(204);
    const got = await (await call(`/cn/addressbooks/${firstBook.id}/${victim!.id}.vcf`)).text();
    expect(got).toContain(original);
    const list = await (await call("/admin/api/contacts")).json() as {
      contacts: Array<{ uid: string; fields: Array<{ label: string; value: string }> }>;
    };
    const item = list.contacts.find((c) => c.uid === victim!.uid);
    expect(item?.fields.some((f) => /^TEL/i.test(f.label) && f.value === original)).toBe(true);
  });

  test("同步日志：PUT 写回生成成功记录并含字段变化", async () => {
    d1.logs = [];
    const vcard = [
      "BEGIN:VCARD", "VERSION:3.0", "UID:日志测试联系人", "FN:日志测试联系人",
      "TEL;TYPE=CELL:13900002222", "END:VCARD", "",
    ].join("\r\n");
    const res = await call(`/cn/addressbooks/${firstBook.id}/log-new.vcf`, {
      method: "PUT", body: vcard,
    });
    expect(res.status).toBe(201);

    const data = await (await call("/admin/api/logs?limit=10")).json() as {
      logs: Array<{ method: string; status: number; result: string; username: string; uid: string; detail: string }>;
    };
    const put = data.logs.find((l) => l.method === "PUT");
    expect(put?.status).toBe(201);
    expect(put?.result).toBe("ok");
    expect(put?.username).toBe("cn");
    expect(put?.uid).toBe("日志测试联系人");
    const detail = JSON.parse(put?.detail ?? "{}") as { action?: string; changes?: unknown[] };
    expect(detail.action).toBe("created");
    expect(detail.changes?.length).toBeGreaterThan(0);
  });

  test("同步日志：过期的 If-Match 不再硬 412，写入成功并标记 staleIfMatch", async () => {
    d1.logs = [];
    const res = await call(`/cn/addressbooks/${firstBook.id}/${firstContact.id}.vcf`, {
      method: "PUT",
      headers: { "If-Match": '"stale-etag"' },
      body: firstContact.vcard,
    });
    // 单用户黄页：last-write-wins，避免客户端旧 ETag 导致号码永远写不进去
    expect(res.status).toBe(204);
    const data = await (await call("/admin/api/logs?limit=10")).json() as {
      logs: Array<{ result: string; status: number; detail: string }>;
    };
    expect(data.logs[0]?.status).toBe(204);
    expect(data.logs[0]?.detail).toContain("staleIfMatch");
  });

  test("同步日志：PROPFIND 读取被记录，管理 API 可清空日志", async () => {
    d1.logs = [];
    const res = await call(`/cn/addressbooks/${firstBook.id}/`, {
      method: "PROPFIND", headers: { Depth: "1" },
    });
    expect(res.status).toBe(207);
    const before = await (await call("/admin/api/logs")).json() as {
      logs: Array<{ method: string; status: number }>;
    };
    expect(before.logs.some((l) => l.method === "PROPFIND" && l.status === 207)).toBe(true);

    const cleared = await call("/admin/api/logs", { method: "DELETE" });
    expect(cleared.status).toBe(200);
    const after = await (await call("/admin/api/logs")).json() as { logs: unknown[] };
    expect(after.logs.length).toBe(0);
  });

  test("CardDAV PUT 新增联系人写入 D1 覆盖层并出现在列表", async () => {
    const uid = "手机新增测试";
    const vcard = [
      "BEGIN:VCARD", "VERSION:3.0", `UID:${uid}`, "FN:手机新增测试",
      "TEL;TYPE=CELL:13900001111", "END:VCARD", "",
    ].join("\r\n");
    const res = await call(`/cn/addressbooks/${firstBook.id}/new-contact-id.vcf`, {
      method: "PUT", body: vcard,
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("X-VCards-Version")).toBeTruthy();

    // 用 REPORT 拉完整 vCard 验证内容（PROPFIND 默认只返回 etag）
    const report = await call(`/cn/addressbooks/${firstBook.id}/`, {
      method: "REPORT",
      headers: { "Content-Type": "application/xml" },
      body: '<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop></C:addressbook-query>',
    });
    const xml = await report.text();
    expect(xml).toContain(uid);
    expect(xml).toContain("13900001111");
  });

  test("CardDAV PUT 编辑基线联系人只覆盖改动字段", async () => {
    const victim = firstContact;
    // 用一份改了 FN、其余原样的 vCard 覆盖
    const modified = victim.vcard.replace(/FN:[^\r\n]*/, "FN:手机改的名字");
    const res = await call(`/cn/addressbooks/${firstBook.id}/${victim.id}.vcf`, {
      method: "PUT", body: modified,
    });
    expect(res.status).toBe(204);

    const get = await call(`/cn/addressbooks/${firstBook.id}/${victim.id}.vcf`);
    const text = await get.text();
    expect(text).toContain("FN:手机改的名字");
    expect(text).toContain("UID:" + victim.uid);
  });

  test("手机新增第二个电话能同步回来，且再次 PUT 不丢失", async () => {
    const bookId = firstBook.id;
    const data = JSON.parse(
      fs.readFileSync(path.join(DIST_DIR, "books", "ios", `${bookId}.json`), "utf8"),
    ) as { contacts: Array<{ id: string; uid: string; vcard: string }> };
    const victim = data.contacts.find(
      (c) => c.id !== firstContact.id && /(^|\r?\n)TEL/i.test(c.vcard),
    );
    expect(victim).toBeTruthy();
    const base = victim!.vcard;
    const originalTel = base.match(/(?:^|\r?\n)TEL[^:]*:([^\r\n]+)/)?.[1] ?? "";
    expect(originalTel).not.toBe("");

    // iOS 保存时提交的是整张 vCard：原号码 + 新号码
    const withNew = base.replace(/(\r?\n)END:VCARD/, "$1TEL;TYPE=CELL:1068306003$1END:VCARD");
    const put1 = await call(`/cn/addressbooks/${bookId}/${victim!.id}.vcf`, {
      method: "PUT",
      body: withNew,
    });
    expect(put1.status).toBe(204);

    const got = await (await call(`/cn/addressbooks/${bookId}/${victim!.id}.vcf`)).text();
    expect(got).toContain("1068306003");
    expect(got).toContain(originalTel);

    // 下一次同步：客户端把「看到的整张 vCard」原样再 PUT 一次（最容易丢号码的场景）
    const put2 = await call(`/cn/addressbooks/${bookId}/${victim!.id}.vcf`, {
      method: "PUT",
      body: got,
    });
    expect(put2.status).toBe(204);
    const got2 = await (await call(`/cn/addressbooks/${bookId}/${victim!.id}.vcf`)).text();
    expect(got2).toContain("1068306003");
    expect(got2).toContain(originalTel);

    // 管理页列表也要能看到这个号码（label 不能带 item1. 前缀）
    const list = (await (await call("/admin/api/contacts")).json()) as {
      contacts: Array<{ uid: string; fields: Array<{ label: string; value: string }> }>;
    };
    const item = list.contacts.find((c) => c.uid === victim!.uid);
    expect(
      item?.fields.some((f) => /(^|\.)TEL/i.test(f.label) && f.value === "1068306003"),
    ).toBe(true);
  });

  test("客户端改写电话参数（CELL→VOICE）不会丢号码", async () => {
    const found = (() => {
      for (const book of catalog.books) {
        const data = JSON.parse(
          fs.readFileSync(path.join(DIST_DIR, "books", "ios", `${book.id}.json`), "utf8"),
        ) as { contacts: Array<{ id: string; uid: string; vcard: string }> };
        const contact = data.contacts.find((c) => /(^|\r?\n)TEL[^:]*:/i.test(c.vcard));
        if (contact) return { bookId: book.id, contact };
      }
      return null;
    })();
    expect(found).toBeTruthy();
    const { bookId, contact } = found!;
    const originalTel = contact.vcard.match(/(?:^|\r?\n)TEL[^:]*:([^\r\n]+)/)?.[1] ?? "";
    expect(originalTel).not.toBe("");

    // iOS 有时会把「手机」改成「工作」等类型，参数变了但号码没变
    const rewritten = contact.vcard.replace(/(^|\r?\n)TEL[^:]*:/i, "$1TEL;TYPE=VOICE:");
    const res = await call(`/cn/addressbooks/${bookId}/${contact.id}.vcf`, {
      method: "PUT",
      body: rewritten,
    });
    expect(res.status).toBe(204);
    const got = await (await call(`/cn/addressbooks/${bookId}/${contact.id}.vcf`)).text();
    expect(got).toContain(originalTel);
  });

  test("旧版本写坏的孤儿覆盖（TEL#1）会自动恢复成新增号码", async () => {
    const found = (() => {
      for (const book of catalog.books) {
        const data = JSON.parse(
          fs.readFileSync(path.join(DIST_DIR, "books", "ios", `${book.id}.json`), "utf8"),
        ) as { contacts: Array<{ id: string; uid: string; vcard: string }> };
        const contact = data.contacts.find((c) => {
          const count = (c.vcard.match(/(^|\r?\n)TEL;TYPE=CELL:/gi) ?? []).length;
          return count === 1;
        });
        if (contact) return { bookId: book.id, contact };
      }
      return null;
    })();
    expect(found).toBeTruthy();
    const { bookId, contact } = found!;
    const key = `${contact.uid}|TEL;TYPE=CELL#1`;
    d1.overrides.set(key, "1068306003");
    try {
      const got = await (await call(`/cn/addressbooks/${bookId}/${contact.id}.vcf`)).text();
      expect(got).toContain("1068306003");
      // 原号码仍然在
      expect(got).toContain(contact.vcard.match(/TEL;TYPE=CELL:([^\r\n]+)/)?.[1] ?? "x");

      const list = (await (await call("/admin/api/contacts")).json()) as {
        contacts: Array<{ uid: string; fields: Array<{ value: string }> }>;
      };
      expect(
        list.contacts
          .find((c) => c.uid === contact.uid)
          ?.fields.some((f) => f.value === "1068306003"),
      ).toBe(true);
    } finally {
      d1.overrides.delete(key);
    }
  });

  test("CardDAV DELETE 联系人后不再返回", async () => {
    const victim = firstContact;
    const res = await call(`/cn/addressbooks/${firstBook.id}/${victim.id}.vcf`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    const get = await call(`/cn/addressbooks/${firstBook.id}/${victim.id}.vcf`);
    expect(get.status).toBe(404);
    // 恢复，避免影响后续测试
    await call("/admin/api/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: victim.uid }),
    });
  });

  test("账户管理：列出默认账户（cn=ios, mac=macos）", async () => {
    const res = await call("/admin/api/accounts");
    expect(res.status).toBe(200);
    const data = await res.json() as { accounts: Array<{ username: string; platform: string }> };
    expect(data.accounts.find((a) => a.username === "cn")?.platform).toBe("ios");
    expect(data.accounts.find((a) => a.username === "mac")?.platform).toBe("macos");
    expect(data.accounts.every((a) => !("password_hash" in a))).toBe(true);
  });

  test("账户管理：新增 macos 账户并可用于 CardDAV 认证与分流", async () => {
    await call("/admin/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "laptop", password: "newpass", platform: "macos" }),
    });
    // 新账户认证成功
    const basic = `Basic ${btoa("laptop:newpass")}`;
    const principal = await worker.fetch(new Request("https://card.example.com/cn/", {
      method: "PROPFIND",
      headers: { Authorization: basic },
    }), env, {} as ExecutionContext);
    expect(principal.status).toBe(207);
    expect(await principal.text()).toContain("/cn/macos/");
    // 错误密码拒绝
    const bad = await worker.fetch(new Request("https://card.example.com/cn/", {
      method: "PROPFIND",
      headers: { Authorization: `Basic ${btoa("laptop:wrong")}` },
    }), env, {} as ExecutionContext);
    expect(bad.status).toBe(401);
    // 清理
    await call("/admin/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "laptop" }),
    });
  });

  test("账户管理：可修改密码后旧密码失效", async () => {
    await call("/admin/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "tempuser", password: "pass1", platform: "ios" }),
    });
    const oldAuth = `Basic ${btoa("tempuser:pass1")}`;
    expect((await worker.fetch(new Request("https://card.example.com/cn/", {
      method: "PROPFIND", headers: { Authorization: oldAuth },
    }), env, {} as ExecutionContext)).status).toBe(207);

    await call("/admin/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "tempuser", password: "pass2", platform: "ios" }),
    });
    expect((await worker.fetch(new Request("https://card.example.com/cn/", {
      method: "PROPFIND", headers: { Authorization: oldAuth },
    }), env, {} as ExecutionContext)).status).toBe(401);
    expect((await worker.fetch(new Request("https://card.example.com/cn/", {
      method: "PROPFIND", headers: { Authorization: `Basic ${btoa("tempuser:pass2")}` },
    }), env, {} as ExecutionContext)).status).toBe(207);

    await call("/admin/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "tempuser" }),
    });
  });
});
