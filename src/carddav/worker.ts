/**
 * 只读 CardDAV 服务端（Cloudflare Workers）
 *
 * 数据来自 R2 中的静态聚合 JSON，由 src/carddav/build.ts 生成。
 * 仅实现读方法与只读属性，所有写操作返回 405。
 *
 * 支持：
 * - OPTIONS / GET / HEAD / PROPFIND / REPORT
 * - /.well-known/carddav 发现
 * - current-user-principal / addressbook-home-set
 * - addressbook-query / addressbook-multiget
 * - ETag / CTag / sync-token / supported-report-set
 * - iOS 多地址簿（按分类）与 macOS 单地址簿（全部）两种入口
 */

import type { BookData, Catalog, CatalogBook, CatalogContact } from "./types";

interface Env {
  R2: R2Bucket;
  /** Basic Auth 用户名，默认 cn */
  CARDDAV_USER?: string;
  /** Basic Auth 密码，默认 cn */
  CARDDAV_PASS?: string;
  /** 是否允许匿名访问，默认 false */
  ALLOW_ANONYMOUS?: string;
}

const NS = {
  D: "DAV:",
  C: "urn:ietf:params:xml:ns:carddav",
  CS: "http://calendarserver.org/ns/",
} as const;

const XML_DECL = '<?xml version="1.0" encoding="utf-8" ?>';

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** vCard 作为 address-data 返回时需要 XML 转义，但保留其自身换行 */
const addressData = (vcard: string): string => xmlEscape(vcard);

const xmlResponse = (body: string, status = 207): Response =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      DAV: "1, 2, 3, addressbook",
    },
  });

const notFound = (): Response =>
  new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });

const methodNotAllowed = (): Response =>
  new Response("Read-only CardDAV server", {
    status: 405,
    headers: { Allow: "OPTIONS, GET, HEAD, PROPFIND, REPORT" },
  });

const unauthorized = (realm: string): Response =>
  new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
  });

/** 常量时间比较，避免时序侧信道 */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const checkAuth = (request: Request, env: Env): Response | null => {
  if (env.ALLOW_ANONYMOUS === "true") return null;

  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Basic ")) return unauthorized("vCards");

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized("vCards");
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return unauthorized("vCards");

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const expectUser = env.CARDDAV_USER || "cn";
  const expectPass = env.CARDDAV_PASS || "cn";

  if (!timingSafeEqual(username, expectUser) || !timingSafeEqual(password, expectPass)) {
    return unauthorized("vCards");
  }
  return null;
};

/** 去掉首尾斜杠，统一为不含尾斜杠的路径 */
const normalizePath = (pathname: string): string => {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.replace(/\/+$/, "") || "/";
  } catch {
    return pathname.replace(/\/+$/, "") || "/";
  }
};

type Route =
  | { kind: "root" }
  | { kind: "principal" }
  | { kind: "home"; mode: "ios" | "macos" }
  | { kind: "book"; mode: "ios" | "macos"; bookId: string }
  | { kind: "contact"; mode: "ios" | "macos"; bookId: string; contactId: string }
  | { kind: "unknown" };

/**
 * 路由规则：
 *   /                                  -> root
 *   /cn/                               -> principal
 *   /cn/addressbooks/                  -> iOS home
 *   /cn/addressbooks/<bookId>/         -> iOS book
 *   /cn/addressbooks/<bookId>/<id>.vcf -> iOS contact
 *   /cn/macos/                         -> macOS home
 *   /cn/macos/<bookId>/                -> macOS book
 *   /cn/macos/<bookId>/<id>.vcf        -> macOS contact
 *
 * 同时兼容不带 /cn 前缀的路径，方便直接用域名根订阅。
 */
const resolveRoute = (pathname: string): Route => {
  const parts = normalizePath(pathname).split("/").filter(Boolean);

  if (parts.length === 0) return { kind: "root" };

  let index = 0;
  if (parts[0] === "cn") index = 1;

  if (parts.length === index) {
    return index === 1 ? { kind: "principal" } : { kind: "root" };
  }

  const first = parts[index];
  if (index === 1 && first === "addressbooks") {
    const rest = parts.slice(index + 1);
    if (rest.length === 0) return { kind: "home", mode: "ios" };
    if (rest.length === 1) return { kind: "book", mode: "ios", bookId: rest[0]! };
    if (rest.length === 2) {
      return {
        kind: "contact",
        mode: "ios",
        bookId: rest[0]!,
        contactId: rest[1]!.replace(/\.vcf$/, ""),
      };
    }
    return { kind: "unknown" };
  }

  if (first === "addressbooks") {
    const rest = parts.slice(index + 1);
    if (rest.length === 0) return { kind: "home", mode: "ios" };
    if (rest.length === 1) return { kind: "book", mode: "ios", bookId: rest[0]! };
    if (rest.length === 2) {
      return {
        kind: "contact",
        mode: "ios",
        bookId: rest[0]!,
        contactId: rest[1]!.replace(/\.vcf$/, ""),
      };
    }
    return { kind: "unknown" };
  }

  if (first === "macos") {
    const rest = parts.slice(index + 1);
    if (rest.length === 0) return { kind: "home", mode: "macos" };
    if (rest.length === 1) return { kind: "book", mode: "macos", bookId: rest[0]! };
    if (rest.length === 2) {
      return {
        kind: "contact",
        mode: "macos",
        bookId: rest[0]!,
        contactId: rest[1]!.replace(/\.vcf$/, ""),
      };
    }
    return { kind: "unknown" };
  }

  // 其他根下的一级路径按 principal 处理，兼容某些客户端探测
  if (parts.length === index + 1) return { kind: "principal" };
  return { kind: "unknown" };
};

/** 从 R2 读取清单，模块级缓存减少子请求 */
let catalogCache: { value: Catalog; expires: number } | null = null;
const getCatalog = async (env: Env): Promise<Catalog> => {
  const now = Date.now();
  if (catalogCache && catalogCache.expires > now) return catalogCache.value;
  const object = await env.R2.get("catalog.json");
  if (!object) throw new Error("catalog.json 不存在，请先运行构建与上传脚本");
  const catalog = (await object.json()) as Catalog;
  catalogCache = { value: catalog, expires: now + 60_000 };
  return catalog;
};

const getBookData = async (
  env: Env,
  mode: "ios" | "macos",
  bookId: string,
): Promise<BookData | null> => {
  const object = await env.R2.get(`books/${mode}/${bookId}.json`);
  if (!object) return null;
  return (await object.json()) as BookData;
};

const findBook = (catalog: Catalog, mode: "ios" | "macos", bookId: string): CatalogBook | null => {
  if (mode === "macos") {
    return catalog.macosBook.id === bookId ? catalog.macosBook : null;
  }
  return catalog.books.find((book) => book.id === bookId) ?? null;
};

const findContact = (book: BookData, contactId: string): (BookData["contacts"][number] | null) =>
  book.contacts.find((contact) => contact.id === contactId) ?? null;

const baseUrl = (request: Request): string => {
  const url = new URL(request.url);
  return url.origin;
};

/** 构造 /cn 下的路径，避免硬编码域名 */
const pathFor = (...segments: string[]): string =>
  `/cn/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;

const hrefOf = (
  base: string,
  route: Extract<Route, { kind: "home" | "book" | "contact" }>,
): string => {
  if (route.kind === "home") {
    return base + (route.mode === "macos" ? pathFor("macos") + "/" : pathFor("addressbooks") + "/");
  }
  if (route.kind === "book") {
    return base + (route.mode === "macos"
      ? pathFor("macos", route.bookId) + "/"
      : pathFor("addressbooks", route.bookId) + "/");
  }
  return base + (route.mode === "macos"
    ? pathFor("macos", route.bookId, `${route.contactId}.vcf`)
    : pathFor("addressbooks", route.bookId, `${route.contactId}.vcf`));
};

const multistatus = (responses: string[]): Response =>
  xmlResponse(`${XML_DECL}<D:multistatus xmlns:D="${NS.D}" xmlns:C="${NS.C}" xmlns:CS="${NS.CS}">${responses.join("")}</D:multistatus>`);

const propstat = (props: string, status = "HTTP/1.1 200 OK"): string =>
  `<D:propstat><D:prop>${props}</D:prop><D:status>${status}</D:status></D:propstat>`;

const responseBlock = (href: string, props: string): string =>
  `<D:response><D:href>${xmlEscape(href)}</D:href>${propstat(props)}</D:response>`;

const resourcetype = (...types: Array<"collection" | "addressbook" | "principal">): string =>
  `<D:resourcetype>${types
    .map((type) =>
      type === "addressbook" ? `<C:addressbook/>` : `<D:${type}/>`,
    )
    .join("")}</D:resourcetype>`;

const supportedReportSet = (): string =>
  `<C:supported-report-set>` +
  `<C:supported-report><C:report><C:addressbook-query/></C:report></C:supported-report>` +
  `<C:supported-report><C:report><C:addressbook-multiget/></C:report></C:supported-report>` +
  `</C:supported-report-set>`;

/** 解析客户端请求的 PROPFIND 属性名，返回需要的属性集合 */
const requestedProps = (body: string): Set<string> => {
  if (!body) return new Set(["allprop"]);
  const names = new Set<string>();
  const regex = /<([A-Za-z0-9]+):([A-Za-z0-9\-]+)\s*\/?\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    const prefix = match[1]!;
    const local = match[2]!;
    const namespace = NS[prefix as keyof typeof NS];
    if (!namespace) continue;
    names.add(`${namespace}|${local}`);
  }
  return names;
};

/** 解析 REPORT 请求体，返回 href 列表与是否请求 address-data */
const parseReport = (body: string): { hrefs: string[]; wantsData: boolean; isQuery: boolean } => {
  const hrefs = [...body.matchAll(/<(?:\w+:)?href[^>]*>([^<]+)<\/(?:\w+:)?href>/g)]
    .map((match) => match[1]!.trim())
    .filter(Boolean);
  return {
    hrefs,
    wantsData: /<(?:\w+:)?address-data\b/.test(body),
    isQuery: /addressbook-query/.test(body),
  };
};

const contactProps = (
  contact: CatalogContact,
  vcard: string | undefined,
  wantsData: boolean,
): string => {
  let props =
    `<D:getetag>${xmlEscape(contact.etag)}</D:getetag>` +
    `<D:getcontenttype>text/vcard; charset=utf-8</D:getcontenttype>`;
  if (wantsData && vcard !== undefined) {
    props += `<C:address-data>${addressData(vcard)}</C:address-data>`;
  }
  return props;
};

/** PROPFIND /：返回 current-user-principal */
const handleRootPropfind = (request: Request): Response => {
  const base = baseUrl(request);
  const principalHref = base + pathFor("cn") + "/";
  const props =
    resourcetype("collection") +
    `<D:displayname>vCards</D:displayname>` +
    `<D:current-user-principal><D:href>${xmlEscape(principalHref)}</D:href></D:current-user-principal>`;
  return multistatus([responseBlock(base + "/", props)]);
};

/** PROPFIND /cn：principal 资源 */
const handlePrincipalPropfind = (request: Request): Response => {
  const base = baseUrl(request);
  const principalHref = base + pathFor("cn") + "/";
  const props =
    resourcetype("collection", "principal") +
    `<D:displayname>cn</D:displayname>` +
    `<C:addressbook-home-set><D:href>${xmlEscape(base + pathFor("addressbooks") + "/")}</D:href></C:addressbook-home-set>` +
    `<D:principal-URL><D:href>${xmlEscape(principalHref)}</D:href></D:principal-URL>`;
  return multistatus([responseBlock(principalHref, props)]);
};

/** PROPFIND home：列出地址簿 */
const handleHomePropfind = async (
  request: Request,
  env: Env,
  mode: "ios" | "macos",
  depth: string,
): Promise<Response> => {
  const catalog = await getCatalog(env);
  const base = baseUrl(request);
  const homeRoute: Extract<Route, { kind: "home" }> = { kind: "home", mode };
  const responses: string[] = [];

  const homeProps =
    resourcetype("collection") +
    `<D:displayname>${mode === "macos" ? "全部通讯录" : "vCards 黄页"}</D:displayname>` +
    `<C:addressbook-home-set><D:href>${xmlEscape(hrefOf(base, homeRoute))}</D:href></C:addressbook-home-set>`;
  responses.push(responseBlock(hrefOf(base, homeRoute), homeProps));

  if (depth !== "0") {
    const books = mode === "macos" ? [catalog.macosBook] : catalog.books;
    for (const book of books) {
      const route: Extract<Route, { kind: "book" }> = { kind: "book", mode, bookId: book.id };
      const props =
        resourcetype("collection", "addressbook") +
        `<D:displayname>${xmlEscape(book.displayName)}</D:displayname>` +
        `<D:getctag>${xmlEscape(book.ctag)}</D:getctag>` +
        `<CS:getctag>${xmlEscape(book.ctag)}</CS:getctag>` +
        `<D:sync-token>${xmlEscape(book.ctag)}</D:sync-token>` +
        supportedReportSet() +
        `<D:current-user-privilege-set><D:privilege><D:read/></D:privilege></D:current-user-privilege-set>` +
        `<C:supported-address-data><C:address-data-type content-type="text/vcard" version="3.0"/></C:supported-address-data>`;
      responses.push(responseBlock(hrefOf(base, route), props));
    }
  }
  return multistatus(responses);
};

/** PROPFIND 地址簿：Depth 0 返回集合属性，Depth 1 附带联系人列表 */
const handleBookPropfind = async (
  request: Request,
  env: Env,
  mode: "ios" | "macos",
  bookId: string,
  depth: string,
  body: string,
): Promise<Response> => {
  const catalog = await getCatalog(env);
  const book = findBook(catalog, mode, bookId);
  if (!book) return notFound();

  const data = await getBookData(env, mode, bookId);
  if (!data) return notFound();

  const base = baseUrl(request);
  const route: Extract<Route, { kind: "book" }> = { kind: "book", mode, bookId };
  const responses: string[] = [];

  const bookProps =
    resourcetype("collection", "addressbook") +
    `<D:displayname>${xmlEscape(book.displayName)}</D:displayname>` +
    `<D:getctag>${xmlEscape(book.ctag)}</D:getctag>` +
    `<CS:getctag>${xmlEscape(book.ctag)}</CS:getctag>` +
    `<D:sync-token>${xmlEscape(book.ctag)}</D:sync-token>` +
    supportedReportSet() +
    `<D:current-user-privilege-set><D:privilege><D:read/></D:privilege></D:current-user-privilege-set>` +
    `<C:supported-address-data><C:address-data-type content-type="text/vcard" version="3.0"/></C:supported-address-data>`;
  responses.push(responseBlock(hrefOf(base, route), bookProps));

  if (depth !== "0") {
    const wantsData = requestedProps(body).has(`${NS.C}|address-data`);
    for (const contact of data.contacts) {
      const contactRoute: Extract<Route, { kind: "contact" }> = {
        kind: "contact",
        mode,
        bookId,
        contactId: contact.id,
      };
      responses.push(
        responseBlock(
          hrefOf(base, contactRoute),
          contactProps(contact, contact.vcard, wantsData),
        ),
      );
    }
  }
  return multistatus(responses);
};

/** PROPFIND 单个联系人 */
const handleContactPropfind = async (
  request: Request,
  env: Env,
  mode: "ios" | "macos",
  bookId: string,
  contactId: string,
  body: string,
): Promise<Response> => {
  const data = await getBookData(env, mode, bookId);
  if (!data) return notFound();
  const contact = findContact(data, contactId);
  if (!contact) return notFound();

  const base = baseUrl(request);
  const route: Extract<Route, { kind: "contact" }> = { kind: "contact", mode, bookId, contactId };
  const wantsData = requestedProps(body).has(`${NS.C}|address-data`);
  return multistatus([
    responseBlock(hrefOf(base, route), contactProps(contact, contact.vcard, wantsData)),
  ]);
};

const handlePropfind = async (request: Request, env: Env): Promise<Response> => {
  const route = resolveRoute(new URL(request.url).pathname);
  const depth = request.headers.get("Depth") ?? "infinity";
  const body = await request.text();

  switch (route.kind) {
    case "root":
      return handleRootPropfind(request);
    case "principal":
      return handlePrincipalPropfind(request);
    case "home":
      return handleHomePropfind(request, env, route.mode, depth);
    case "book":
      return handleBookPropfind(request, env, route.mode, route.bookId, depth, body);
    case "contact":
      return handleContactPropfind(request, env, route.mode, route.bookId, route.contactId, body);
    default:
      return notFound();
  }
};

/** REPORT addressbook-query / addressbook-multiget */
const handleReport = async (request: Request, env: Env): Promise<Response> => {
  const route = resolveRoute(new URL(request.url).pathname);
  if (route.kind !== "book") return notFound();

  const data = await getBookData(env, route.mode, route.bookId);
  if (!data) return notFound();

  const body = await request.text();
  const { hrefs, wantsData, isQuery } = parseReport(body);
  const base = baseUrl(request);
  const responses: string[] = [];

  const selected = isQuery || hrefs.length === 0
    ? data.contacts
    : (() => {
        const wanted = new Set(
          hrefs.map((href) => {
            try {
              return decodeURIComponent(new URL(href, base).pathname).split("/").pop()?.replace(/\.vcf$/, "") ?? "";
            } catch {
              return "";
            }
          }),
        );
        return data.contacts.filter((contact) => wanted.has(contact.id));
      })();

  for (const contact of selected) {
    const contactRoute: Extract<Route, { kind: "contact" }> = {
      kind: "contact",
      mode: route.mode,
      bookId: route.bookId,
      contactId: contact.id,
    };
    responses.push(
      responseBlock(
        hrefOf(base, contactRoute),
        contactProps(contact, contact.vcard, wantsData),
      ),
    );
  }
  return multistatus(responses);
};

/** GET/HEAD 单个联系人 */
const handleGet = async (request: Request, env: Env): Promise<Response> => {
  const route = resolveRoute(new URL(request.url).pathname);
  if (route.kind !== "contact") return notFound();
  const data = await getBookData(env, route.mode, route.bookId);
  if (!data) return notFound();
  const contact = findContact(data, route.contactId);
  if (!contact) return notFound();

  return new Response(contact.vcard, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      ETag: contact.etag,
      "Cache-Control": "private, max-age=3600",
    },
  });
};

const handleOptions = (): Response =>
  new Response(null, {
    status: 200,
    headers: {
      DAV: "1, 2, 3, addressbook",
      Allow: "OPTIONS, GET, HEAD, PROPFIND, REPORT",
      "MS-Author-Via": "DAV",
    },
  });

export default {
  async fetch(request: Request, env: Env, _ctx?: ExecutionContext): Promise<Response> {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);

    // 服务发现：/.well-known/carddav 重定向到 principal
    if (url.pathname === "/.well-known/carddav" || url.pathname === "/.well-known/carddav/") {
      return new Response(null, {
        status: 301,
        headers: { Location: "/cn/" },
      });
    }

    const authError = checkAuth(request, env);
    if (authError) return authError;

    try {
      switch (method) {
        case "OPTIONS":
          return handleOptions();
        case "GET":
        case "HEAD":
          return handleGet(request, env);
        case "PROPFIND":
          return await handlePropfind(request, env);
        case "REPORT":
          return await handleReport(request, env);
        default:
          return methodNotAllowed();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(`Internal Server Error: ${message}`, { status: 500 });
    }
  },
};
