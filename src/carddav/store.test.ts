/**
 * mergedEtag 稳定性回归测试：412 连锁冲突修复
 *
 * 旧实现把全局 version 编进 ETag，任何写操作都会让所有被覆盖联系人的 ETag
 * 同时失效，iOS 批量 PUT 时连锁 412、号码写不进去。新实现只依赖该联系人
 * 自身的覆盖内容指纹。运行：bun test src/carddav/store.test.ts
 */
import { describe, expect, test } from "bun:test";
import { mergedEtag, type UserState } from "./store";

const hash = (value: string): string => {
  // 与 worker 一致的简易确定性 hash，仅用于断言 ETag 变化与否
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
};

const makeState = (version: number, overrides: UserState["overrides"]): UserState => ({
  version,
  overrides,
  extraContacts: [],
  extraByBook: new Map(),
  tombstones: new Set(),
  customBooks: [],
  accounts: [],
});

describe("mergedEtag 稳定性（412 连锁冲突修复）", () => {
  const baseEtag = '"base-etag"';

  test("无覆盖时沿用基线 ETag，不受 version 影响", () => {
    expect(mergedEtag(baseEtag, "甲", makeState(1, new Map()), hash)).toBe(baseEtag);
    expect(mergedEtag(baseEtag, "甲", makeState(99, new Map()), hash)).toBe(baseEtag);
  });

  test("改其他联系人的覆盖 / version 递增，不改变本联系人 ETag", () => {
    const overrides = new Map<string, Array<{ key: string; value: string | null }>>([
      ["甲", [{ key: "TEL;TYPE=CELL#0", value: "13800000000" }]],
      ["乙", [{ key: "TEL;TYPE=CELL#0", value: "13900000000" }]],
    ]);
    const e1 = mergedEtag(baseEtag, "甲", makeState(10, overrides), hash);
    // 只有 version 变了（例如后台保存账号 / 其他联系人写操作）
    const e2 = mergedEtag(baseEtag, "甲", makeState(11, overrides), hash);
    expect(e2).toBe(e1);
  });

  test("本联系人覆盖内容变化，ETag 必须变化", () => {
    const before = makeState(10, new Map([["甲", [{ key: "TEL;TYPE=CELL#0", value: "13800000000" }]]]));
    const after = makeState(10, new Map([["甲", [{ key: "TEL;TYPE=CELL#0", value: "13999999999" }]]]));
    expect(mergedEtag(baseEtag, "甲", after, hash)).not.toBe(
      mergedEtag(baseEtag, "甲", before, hash),
    );
  });

  test("覆盖顺序不同不影响 ETag（指纹排序稳定）", () => {
    const a = makeState(10, new Map([["甲", [
      { key: "ORG#0", value: "A" },
      { key: "TEL;TYPE=CELL#0", value: "13800000000" },
    ]]]));
    const b = makeState(10, new Map([["甲", [
      { key: "TEL;TYPE=CELL#0", value: "13800000000" },
      { key: "ORG#0", value: "A" },
    ]]]));
    expect(mergedEtag(baseEtag, "甲", b, hash)).toBe(mergedEtag(baseEtag, "甲", a, hash));
  });
});
