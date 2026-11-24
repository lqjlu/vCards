/**
 * 构建 Cloudflare R2 静态数据 + 清单。
 *
 * 产物结构（OUT_DIR = dist/carddav）：
 *   catalog.json                  全局清单（不含 vCard 正文）
 *   books/ios/<bookId>.json       iOS：每个分类一个聚合文件
 *   books/macos/<bookId>.json     macOS：全部联系人的聚合文件
 *
 * 按地址簿聚合而非逐个 vcf 存放，是为了规避 Workers 免费版
 * "单次调用最多 50 个子请求" 的限制：一次 PROPFIND/REPORT
 * 只需读取 1 个 JSON 对象。
 *
 * 运行：bun run src/carddav/build.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { listYamlPaths } from "../core/data";
import { renderVCard } from "../core/vcard";
import { batchRevisions } from "./revision";
import type { BookData, Catalog, CatalogBook, CatalogContact } from "./types";

const OUT_DIR = "dist/carddav";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** ETag 用 vcf 内容 hash，保证内容变则 ETag 变 */
const etagOf = (content: string): string => `"${sha256(content)}"`;

/** 短 ID：由分类 + 名称生成，稳定且无需依赖文件系统 */
const resourceId = (category: string, name: string): string =>
  sha256(`${category}/${name}`).slice(0, 16);

interface ContactRecord {
  category: string;
  name: string;
  content: string;
  etag: string;
}

const writeBookData = (mode: "ios" | "macos", book: CatalogBook, records: ContactRecord[]): void => {
  const contacts = book.contacts.map((contact) => {
    const record = records.find(
      (item) => resourceId(item.category, item.name) === contact.id,
    );
    if (!record) throw new Error(`找不到联系人数据: ${contact.id}`);
    return { ...contact, vcard: record.content };
  });
  const data: BookData = {
    id: book.id,
    name: book.name,
    displayName: book.displayName,
    ctag: book.ctag,
    contacts,
  };
  const file = join(OUT_DIR, "books", mode, `${book.id}.json`);
  writeFileSync(file, JSON.stringify(data), "utf8");
};

const build = async (): Promise<void> => {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(join(OUT_DIR, "books", "ios"), { recursive: true });
  mkdirSync(join(OUT_DIR, "books", "macos"), { recursive: true });

  const yamlPaths = listYamlPaths();
  const revisions = await batchRevisions(yamlPaths);

  const records: ContactRecord[] = [];
  for (const yamlPath of yamlPaths) {
    const category = basename(dirname(yamlPath));
    const name = basename(yamlPath, ".yaml");
    const revision = revisions.get(yamlPath) ?? new Date(0).toISOString();
    const content = await renderVCard(yamlPath, {
      carddav: { revision },
    });

    records.push({ category, name, content, etag: etagOf(content) });
  }

  // 按分类分组，保持字典序
  const grouped = new Map<string, ContactRecord[]>();
  for (const record of records) {
    const list = grouped.get(record.category) ?? [];
    list.push(record);
    grouped.set(record.category, list);
  }
  const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b, "zh-CN"));

  const books: CatalogBook[] = categories.map((category) => {
    const list = (grouped.get(category) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, "zh-CN"),
    );
    const contacts: CatalogContact[] = list.map((record) => ({
      id: resourceId(record.category, record.name),
      etag: record.etag,
      uid: record.name,
    }));

    const book: CatalogBook = {
      id: resourceId("book", category),
      name: category,
      displayName: `${category}(${contacts.length})`,
      // CTag 由全部联系人 ETag 拼接后 hash，任一变化即更新
      ctag: `"${sha256(contacts.map((c) => c.etag).join(""))}"`,
      contacts,
    };
    writeBookData("ios", book, list);
    return book;
  });

  // macOS 合并模式：单个地址簿 "全部"
  const allRecords = [...records].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const allContacts: CatalogContact[] = allRecords.map((record) => ({
    id: resourceId(record.category, record.name),
    etag: record.etag,
    uid: record.name,
  }));
  const macosBook: CatalogBook = {
    id: resourceId("book", "全部"),
    name: "全部",
    displayName: `全部(${allContacts.length})`,
    ctag: `"${sha256(allContacts.map((c) => c.etag).join(""))}"`,
    contacts: allContacts,
  };
  writeBookData("macos", macosBook, allRecords);

  const catalog: Catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ctag: `"${sha256(books.map((b) => b.ctag).join(""))}"`,
    books,
    macosBook,
  };
  writeFileSync(
    join(OUT_DIR, "catalog.json"),
    JSON.stringify(catalog, null, 2),
    "utf8",
  );

  console.log(
    `[carddav] 生成完成: ${books.length} 个分类 + 1 个合并簿, ${records.length} 个联系人 -> ${OUT_DIR}`,
  );
};

await build();
