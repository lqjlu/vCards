/**
 * vCard 字段级合并引擎（纯函数，Workers 与本地均可运行）
 *
 * 设计目标：上游更新的字段自动并入，用户手动改过的字段保持用户值。
 *
 * 字段键（fieldKey）规则：
 *   "ORG#0"、"TEL;TYPE=CELL#0"  —— 基线中第 N 个同名字段
 *   "+TEL;TYPE=CELL"            —— 用户追加的新字段（前缀 +）
 * value 为 null 表示用户删除了该字段（墓碑）。
 *
 * PHOTO 的 base64 跨行折叠：解析时记录原始物理行组，合并时原样输出，
 * 避免重新折行破坏图片数据。系统字段（UID/REV/PHOTO）只在编辑界面隐藏，
 * 合并时保持原位。
 */

export interface VCardField {
  /** 稳定字段键 */
  key: string;
  /** 字段名（含参数），如 TEL;TYPE=CELL */
  baseKey: string;
  /** 冒号后的值（已合并折行） */
  value: string;
  /** 原始物理行组（保留折行） */
  raw: string;
}

export interface FieldOverride {
  key: string;
  /** null = 用户删除该字段 */
  value: string | null;
}

/** 这些字段不开放编辑，但必须原样保留在 vCard 中 */
export const HIDDEN_FIELDS = new Set(["BEGIN", "END", "VERSION", "UID", "REV", "PHOTO"]);

/** 把物理行拆成逻辑行，同时保留原始行组（含折行） */
const splitLines = (vcard: string): { logical: string[]; raw: string[] } => {
  const lines = vcard.split(/\r?\n/);
  const logical: string[] = [];
  const raw: string[] = [];
  for (const line of lines) {
    const isContinuation = /^[ \t]/.test(line);
    if (isContinuation && raw.length) {
      raw[raw.length - 1] += "\n" + line;
      logical[logical.length - 1] += line.slice(1);
    } else if (line.trim()) {
      raw.push(line);
      logical.push(line);
    }
  }
  return { logical, raw };
};

/** 解析 vCard 为可编辑字段列表（跳过系统字段与 PHOTO） */
export const parseVCard = (vcard: string): VCardField[] => {
  const { logical, raw } = splitLines(vcard);
  const counters = new Map<string, number>();
  const fields: VCardField[] = [];
  for (let i = 0; i < logical.length; i++) {
    const line = logical[i]!;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const baseKey = line.slice(0, colon);
    if (HIDDEN_FIELDS.has(baseKey.split(";")[0]!)) continue;
    const index = counters.get(baseKey) ?? 0;
    counters.set(baseKey, index + 1);
    fields.push({
      key: `${baseKey}#${index}`,
      baseKey,
      value: line.slice(colon + 1),
      raw: raw[i] ?? line,
    });
  }
  return fields;
};

/**
 * 逐行合并：把每条逻辑行映射为输出行。
 * - 隐藏字段（UID/REV/PHOTO/BEGIN/END/VERSION）：原样输出
 * - 可编辑字段：若有覆盖则替换/删除，否则原样输出
 * - 用户追加字段（+ 前缀）：插入到 END:VCARD 之前
 */
export const mergeVCard = (base: string, overrides: FieldOverride[]): string => {
  const { logical, raw } = splitLines(base);
  const counters = new Map<string, number>();
  const overrideMap = new Map(overrides.map((o) => [o.key, o.value]));
  const output: string[] = [];

  for (let i = 0; i < logical.length; i++) {
    const line = logical[i]!;
    const colon = line.indexOf(":");
    if (colon < 0) {
      output.push(raw[i] ?? line);
      continue;
    }
    const baseKey = line.slice(0, colon);
    const name = baseKey.split(";")[0]!;
    if (HIDDEN_FIELDS.has(name)) {
      // PHOTO 等多行字段用 raw 保留折行；UID/REV 单行用 raw 也无害
      output.push(raw[i] ?? line);
      continue;
    }
    const index = counters.get(baseKey) ?? 0;
    counters.set(baseKey, index + 1);
    const key = `${baseKey}#${index}`;
    if (overrideMap.has(key)) {
      const value = overrideMap.get(key)!;
      if (value === null) continue; // 用户删除
      output.push(`${baseKey}:${value}`);
    } else {
      output.push(raw[i] ?? line);
    }
  }

  const additions = overrides.filter((o) => o.key.startsWith("+") && o.value !== null);
  if (additions.length) {
    const endIndex = output.findIndex((l) => l.startsWith("END:VCARD"));
    const insertAt = endIndex < 0 ? output.length : endIndex;
    output.splice(
      insertAt,
      0,
      ...additions.map((o) => `${o.key.slice(1)}:${o.value}`),
    );
  }

  return output.join("\r\n") + "\r\n";
};

/**
 * 从结构化字段生成一张全新的 vCard（用户新增联系人）
 */
export const buildVCard = (params: {
  uid: string;
  fields: Array<{ key: string; value: string }>;
  revision?: string;
}): string => {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  for (const field of params.fields) {
    if (!field.value.trim()) continue;
    const baseKey = field.key.startsWith("+") ? field.key.slice(1) : field.key.replace(/#\d+$/, "");
    lines.push(`${baseKey}:${field.value}`);
  }
  lines.push(`UID:${params.uid}`);
  lines.push(`REV:${params.revision ?? new Date().toISOString()}`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
};
