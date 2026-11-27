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
    else if (sql.startsWith("DELETE FROM overrides WHERE uid")) {
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
