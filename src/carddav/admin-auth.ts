/**
 * 管理页会话认证
 *
 * CardDAV 客户端仍用 Basic Auth；浏览器管理页改用登录页 + HttpOnly Cookie。
 * Cookie 里放一个 HMAC 签名的 token（密钥复用 CARDDAV_PASS），无需额外存储，
 * 改密码后旧 token 自动失效。
 */

const COOKIE_NAME = "vcards_admin";
const SESSION_DAYS = 30;

const encoder = new TextEncoder();

const base64url = (input: Uint8Array | string): string => {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64url = (value: string): string => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const sign = async (data: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(new Uint8Array(signature));
};

const parseCookies = (request: Request): Map<string, string> => {
  const result = new Map<string, string>();
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    result.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return result;
};

/** 校验凭据（用户名/密码），与 CardDAV Basic Auth 使用同一套配置 */
export const checkCredentials = (
  username: string,
  password: string,
  env: { CARDDAV_USER?: string; CARDDAV_PASS?: string; ADMIN_USER?: string; ADMIN_PASS?: string },
): boolean => {
  // 后台管理员账号：优先用 Cloudflare 里配置的 ADMIN_USER/ADMIN_PASS，
  // 未配置时回退到 CARDDAV_USER/CARDDAV_PASS（向后兼容）
  const expectUser = env.ADMIN_USER || env.CARDDAV_USER || "cn";
  const expectPass = env.ADMIN_PASS || env.CARDDAV_PASS || "cn";
  return username === expectUser && password === expectPass;
};

/** 签发会话 token */
export const issueToken = async (
  username: string,
  env: { CARDDAV_PASS?: string; ADMIN_PASS?: string },
): Promise<string> => {
  const secret = env.ADMIN_PASS || env.CARDDAV_PASS || "cn";
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = base64url(JSON.stringify({ u: username, e: expires }));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
};

/** 校验会话 token 是否有效 */
export const verifyToken = async (
  token: string | undefined,
  env: { CARDDAV_USER?: string; CARDDAV_PASS?: string; ADMIN_USER?: string; ADMIN_PASS?: string },
): Promise<boolean> => {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const secret = env.ADMIN_PASS || env.CARDDAV_PASS || "cn";
  const expected = await sign(payload, secret);
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const data = JSON.parse(fromBase64url(payload)) as { u?: string; e?: number };
    if (data.u !== (env.ADMIN_USER || env.CARDDAV_USER || "cn")) return false;
    return typeof data.e === "number" && data.e > Date.now();
  } catch {
    return false;
  }
};

/** 管理页请求是否已认证：Cookie token 或 Basic Auth 均可 */
export const isAdminAuthenticated = async (
  request: Request,
  env: {
    CARDDAV_USER?: string;
    CARDDAV_PASS?: string;
    ADMIN_USER?: string;
    ADMIN_PASS?: string;
    ALLOW_ANONYMOUS?: string;
  },
): Promise<boolean> => {
  if (env.ALLOW_ANONYMOUS === "true") return true;

  const cookies = parseCookies(request);
  if (await verifyToken(cookies.get(COOKIE_NAME), env)) return true;

  const header = request.headers.get("Authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const separator = decoded.indexOf(":");
      if (separator >= 0) {
        return checkCredentials(decoded.slice(0, separator), decoded.slice(separator + 1), env);
      }
    } catch {
      // 非法 Basic 头，视为未认证
    }
  }
  return false;
};

/** 构造设置 Cookie 的响应头片段 */
export const sessionCookie = (token: string, maxAgeSeconds: number): string =>
  `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

/** 构造清除 Cookie 的响应头片段 */
export const clearCookie = (): string =>
  `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
