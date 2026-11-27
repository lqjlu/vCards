/**
 * CardDAV Worker 本地协议自测
 *
 * 用内存 mock 的 R2 bucket 直接调用 worker.fetch，
 * 不需要部署到 Cloudflare 即可验证 DAV 协议行为。
 *
 * 运行：bun test src/carddav/worker.test.ts
 */

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import worker from "./worker";
import type { Catalog } from "./types";

const DIST_DIR = path.resolve("dist/carddav");

class MockR2Object {
  constructor(private readonly textValue: string) {}
  async text(): Promise<string> {
    return this.textValue;
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.textValue);
  }
}

class MockR2Bucket {
  private readonly objects = new Map<string, string>();

  put(key: string, value: string): void {
    this.objects.set(key, value);
  }

  async get(key: string): Promise<MockR2Object | null> {
    const value = this.objects.get(key);
    return value === undefined ? null : new MockR2Object(value);
  }
}

const catalog = JSON.parse(
  fs.readFileSync(path.join(DIST_DIR, "catalog.json"), "utf8"),
) as Catalog;

const bucket = new MockR2Bucket();
bucket.put("catalog.json", JSON.stringify(catalog));
for (const book of catalog.books) {
  const file = path.join(DIST_DIR, "books", "ios", `${book.id}.json`);
  bucket.put(`books/ios/${book.id}.json`, fs.readFileSync(file, "utf8"));
}
bucket.put(
  `books/macos/${catalog.macosBook.id}.json`,
  fs.readFileSync(
    path.join(DIST_DIR, "books", "macos", `${catalog.macosBook.id}.json`),
    "utf8",
  ),
);

const env = {
  R2: bucket,
  CARDDAV_USER: "cn",
  CARDDAV_PASS: "testpass",
} as never;

const authHeader = `Basic ${btoa("cn:testpass")}`;

const call = (
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Response> =>
  worker.fetch(
    new Request(`https://card.example.com${url}`, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
    }),
    env,
    {} as ExecutionContext,
  );

describe("CardDAV Worker", () => {
  test("well-known 重定向到 principal", async () => {
    const response = await call("/.well-known/carddav");
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/cn/");
  });

  test("well-known 不受 UA 影响，统一到 /cn/", async () => {
    for (const ua of [
      "com.apple.AddressBook/1.0 (iOS)",
      "com.apple.AddressBook",
      "AddressBook/1.0 (Mac OS X 10.15.7)",
      "iOS/17.0 (iPhone)",
    ]) {
      const response = await call("/.well-known/carddav", {
        headers: { "User-Agent": ua },
      });
      expect(response.headers.get("Location")).toBe("/cn/");
    }
  });

  test("cn 账号 principal 指向多分类 home", async () => {
    const response = await call("/cn/", {
      method: "PROPFIND",
      headers: { Authorization: authHeader },
    });
    const xml = await response.text();
    expect(xml).toContain("/cn/addressbooks/");
    expect(xml).not.toContain("/cn/macos/");
  });

  test("mac 账号 principal 指向合并簿 home", async () => {
    const macAuth = `Basic ${btoa("mac:testpass")}`;
    const response = await call("/cn/", {
      method: "PROPFIND",
      headers: { Authorization: macAuth },
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("/cn/macos/");
  });

  test("mac 账号可用同一密码通过认证", async () => {
    const macAuth = `Basic ${btoa("mac:testpass")}`;
    const response = await call("/cn/macos/", {
      method: "PROPFIND",
      headers: { Authorization: macAuth, Depth: "0" },
    });
    expect(response.status).toBe(207);
  });

  test("macOS home 补齐 principal 属性", async () => {
    const macAuth = `Basic ${btoa("mac:testpass")}`;
    const response = await call("/cn/macos/", {
      method: "PROPFIND",
      headers: { Authorization: macAuth, Depth: "0" },
    });
    const xml = await response.text();
    expect(xml).toContain("current-user-principal");
    expect(xml).toContain("principal-URL");
  });

  test("未认证请求返回 401", async () => {
    const response = await call("/cn/", { method: "PROPFIND" });
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  test("OPTIONS 声明 DAV 能力", async () => {
    const response = await call("/cn/", {
      method: "OPTIONS",
      headers: { Authorization: authHeader },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("DAV")).toContain("addressbook");
    expect(response.headers.get("Allow")).toContain("REPORT");
  });

  test("PROPFIND 根路径返回 current-user-principal", async () => {
    const response = await call("/", {
      method: "PROPFIND",
      headers: { Authorization: authHeader, Depth: "0" },
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("current-user-principal");
    expect(xml).toContain("/cn/");
  });

  test("PROPFIND principal 返回 addressbook-home-set", async () => {
    const response = await call("/cn/", {
      method: "PROPFIND",
      headers: { Authorization: authHeader, Depth: "0" },
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("addressbook-home-set");
    expect(xml).toContain("/cn/addressbooks/");
  });

  test("PROPFIND home Depth 1 列出所有分类地址簿", async () => {
    const response = await call("/cn/addressbooks/", {
      method: "PROPFIND",
      headers: { Authorization: authHeader, Depth: "1" },
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<C:addressbook/>");
    expect(xml).toContain("supported-report-set");
    expect(xml).toContain("getctag");
    // 分类数量与 XML 中地址簿数量一致
    const bookCount = (xml.match(/<C:addressbook\/>/g) ?? []).length;
    expect(bookCount).toBe(catalog.books.length);
  });

  test("PROPFIND 地址簿 Depth 1 列出联系人及 ETag", async () => {
    const book = catalog.books[0]!;
    const response = await call(`/cn/addressbooks/${book.id}/`, {
      method: "PROPFIND",
      headers: { Authorization: authHeader, Depth: "1" },
      body: '<D:propfind xmlns:D="DAV:"><D:prop><D:getetag/></D:prop></D:propfind>',
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<D:getetag>");
    expect(xml).toContain(".vcf");
    const contactCount = (xml.match(/\.vcf</g) ?? []).length;
    expect(contactCount).toBe(book.contacts.length);
  });

  test("PROPFIND 地址簿请求 address-data 时返回 vCard 正文", async () => {
    const book = catalog.books[0]!;
    const response = await call(`/cn/addressbooks/${book.id}/`, {
      method: "PROPFIND",
      headers: { Authorization: authHeader, Depth: "1" },
      body: '<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><C:address-data/></D:prop></D:propfind>',
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<C:address-data>");
    expect(xml).toContain("BEGIN:VCARD");
  });

  test("REPORT addressbook-query 返回全部联系人", async () => {
    const book = catalog.books[0]!;
    const response = await call(`/cn/addressbooks/${book.id}/`, {
      method: "REPORT",
      headers: { Authorization: authHeader, "Content-Type": "application/xml" },
      body: '<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop></C:addressbook-query>',
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("BEGIN:VCARD");
    const count = (xml.match(/<D:response>/g) ?? []).length;
    expect(count).toBe(book.contacts.length);
  });

  test("REPORT addressbook-multiget 只返回指定联系人", async () => {
    const book = catalog.books[0]!;
    const contact = book.contacts[0]!;
    const href = `/cn/addressbooks/${book.id}/${contact.id}.vcf`;
    const response = await call(`/cn/addressbooks/${book.id}/`, {
      method: "REPORT",
      headers: { Authorization: authHeader, "Content-Type": "application/xml" },
      body: `<?xml version="1.0"?><C:addressbook-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop><D:href>${href}</D:href></C:addressbook-multiget>`,
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain(contact.id);
    const count = (xml.match(/<D:response>/g) ?? []).length;
    expect(count).toBe(1);
  });

  test("GET 单个联系人返回 vCard 与 ETag", async () => {
    const book = catalog.books[0]!;
    const contact = book.contacts[0]!;
    const response = await call(`/cn/addressbooks/${book.id}/${contact.id}.vcf`, {
      headers: { Authorization: authHeader },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe(contact.etag);
    expect(response.headers.get("Content-Type")).toContain("text/vcard");
    const text = await response.text();
    expect(text).toContain("BEGIN:VCARD");
    expect(text).toContain("REV:");
  });

  test("macOS 合并地址簿可用", async () => {
    const response = await call("/cn/macos/", {
      method: "PROPFIND",
      headers: { Authorization: authHeader, Depth: "1" },
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<C:addressbook/>");
    const count = (xml.match(/<C:addressbook\/>/g) ?? []).length;
    expect(count).toBe(1);
  });

  test("写方法返回 405", async () => {
    const response = await call(`/cn/addressbooks/${catalog.books[0]!.id}/`, {
      method: "PUT",
      headers: { Authorization: authHeader },
      body: "test",
    });
    expect(response.status).toBe(405);
  });

  test("不存在的资源返回 404", async () => {
    const response = await call("/cn/addressbooks/not-exist/", {
      method: "PROPFIND",
      headers: { Authorization: authHeader, Depth: "0" },
    });
    expect(response.status).toBe(404);
  });
});
