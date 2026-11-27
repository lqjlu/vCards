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
  /** 字段名（含参数与分组前缀），如 item1.TEL;TYPE=CELL */
  baseKey: string;
  /** 规范化字段名（去掉 item1. 分组前缀与参数，大写），如 TEL */
  name: string;
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

/** 去掉 vCard 3.0 的分组前缀：item1.TEL;TYPE=CELL → TEL;TYPE=CELL */
export const stripGroup = (baseKey: string): string => baseKey.replace(/^[A-Za-z0-9-]+\./, "");

/** 取规范化字段名：item1.TEL;TYPE=CELL → TEL */
export const fieldName = (baseKey: string): string =>
  stripGroup(baseKey).split(";")[0]!.toUpperCase();

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
    const name = fieldName(baseKey);
    if (HIDDEN_FIELDS.has(name)) continue;
    const index = counters.get(baseKey) ?? 0;
    counters.set(baseKey, index + 1);
    fields.push({
      key: `${baseKey}#${index}`,
      baseKey,
      name,
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
 * - 历史孤儿覆盖（基线中不存在的 #序号 key）：同样按追加字段输出，
 *   用于修复旧版本把「客户端新增字段」错存成基线序号、导致号码丢失的数据
 */
export const mergeVCard = (base: string, overrides: FieldOverride[]): string => {
  const { logical, raw } = splitLines(base);
  const counters = new Map<string, number>();
  const overrideMap = new Map(overrides.map((o) => [o.key, o.value]));
  const output: string[] = [];
  const baseKeys = new Set<string>();
  const baseValues = new Map<string, Set<string>>();

  for (let i = 0; i < logical.length; i++) {
    const line = logical[i]!;
    const colon = line.indexOf(":");
    if (colon < 0) {
      output.push(raw[i] ?? line);
      continue;
    }
    const baseKey = line.slice(0, colon);
    const name = fieldName(baseKey);
    if (HIDDEN_FIELDS.has(name)) {
      // PHOTO 等多行字段用 raw 保留折行；UID/REV 单行用 raw 也无害
      output.push(raw[i] ?? line);
      continue;
    }
    const index = counters.get(baseKey) ?? 0;
    counters.set(baseKey, index + 1);
    const key = `${baseKey}#${index}`;
    baseKeys.add(key);
    const value = line.slice(colon + 1);
    const values = baseValues.get(name) ?? new Set<string>();
    values.add(value);
    baseValues.set(name, values);

    if (overrideMap.has(key)) {
      const override = overrideMap.get(key)!;
      if (override === null) continue; // 用户删除
      output.push(`${baseKey}:${override}`);
    } else {
      output.push(raw[i] ?? line);
    }
  }

  const additions: FieldOverride[] = [];
  for (const o of overrides) {
    if (o.value === null) continue;
    if (o.key.startsWith("+")) {
      additions.push(o);
      continue;
    }
    // 基线里没有这个 key → 旧版本按“新增字段”存下的孤儿覆盖
    if (baseKeys.has(o.key)) continue;
    const storedKey = o.key.replace(/#\d+$/, "");
    const name = fieldName(storedKey);
    // 同名字段已有相同值（客户端改写了 TEL 参数导致的漂移）→ 不再重复输出
    if (baseValues.get(name)?.has(o.value)) continue;
    additions.push({ key: `+${stripGroup(storedKey)}`, value: o.value });
  }

  if (additions.length) {
    const endIndex = output.findIndex((l) => l.startsWith("END:VCARD"));
    const insertAt = endIndex < 0 ? output.length : endIndex;
    const lines = additions.map(
      (o) => `${stripGroup(o.key.slice(1).replace(/~\d+$/, ""))}:${o.value}`,
    );
    output.splice(insertAt, 0, ...lines);
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
    const baseKey = field.key.startsWith("+")
      ? field.key.slice(1).replace(/~\d+$/, "")
      : field.key.replace(/#\d+$/, "");
    lines.push(`${baseKey}:${field.value}`);
  }
  lines.push(`UID:${params.uid}`);
  lines.push(`REV:${params.revision ?? new Date().toISOString()}`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
};
