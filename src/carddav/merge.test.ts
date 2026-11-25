import { describe, expect, test } from "bun:test";
import { buildVCard, mergeVCard, parseVCard } from "./merge";

const BASE = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:",
  "N:;;;;",
  "UID:测试公司",
  "ORG:测试公司",
  "URL:https://example.com",
  "TEL;TYPE=CELL:13800000000",
  "TEL;TYPE=CELL:13900000000",
  "EMAIL;TYPE=WORK,INTERNET:a@example.com",
  "REV:2024-11-25T00:00:00Z",
  "PHOTO;ENCODING=b;TYPE=PNG:iVBORw0KGgo",
  " XNSR0IB2cksfwAAA",
  "END:VCARD",
].join("\r\n") + "\r\n";

describe("parseVCard", () => {
  test("只返回可编辑字段，跳过 UID/REV/PHOTO 等", () => {
    const fields = parseVCard(BASE);
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("ORG#0");
    expect(keys).toContain("URL#0");
    expect(keys).toContain("TEL;TYPE=CELL#0");
    expect(keys).toContain("TEL;TYPE=CELL#1");
    expect(keys).not.toContain("UID#0");
    expect(keys).not.toContain("PHOTO;ENCODING=b;TYPE=PNG#0");
  });

  test("值正确解析", () => {
    const fields = parseVCard(BASE);
    expect(fields.find((f) => f.key === "ORG#0")!.value).toBe("测试公司");
    expect(fields.find((f) => f.key === "TEL;TYPE=CELL#1")!.value).toBe("13900000000");
  });
});

describe("mergeVCard", () => {
  test("无覆盖时原样保留（含 PHOTO 折行）", () => {
    const merged = mergeVCard(BASE, []);
    expect(merged).toContain("PHOTO;ENCODING=b;TYPE=PNG:iVBORw0KGgo\n XNSR0IB2cksfwAAA");
    expect(merged).toContain("UID:测试公司");
    expect(merged).toContain("TEL;TYPE=CELL:13800000000");
  });

  test("用户改过的字段用用户值，其余保留", () => {
    const merged = mergeVCard(BASE, [{ key: "ORG#0", value: "测试公司（ updated ）" }]);
    expect(merged).toContain("ORG:测试公司（ updated ）");
    expect(merged).toContain("URL:https://example.com");
    expect(merged).toContain("TEL;TYPE=CELL:13800000000");
  });

  test("上游新增字段自动并入（基线里没有覆盖的字段就保留基线值）", () => {
    const upstreamUpdated = BASE.replace(
      "URL:https://example.com",
      "URL:https://example.com/new\r\nNOTE:上游新加的字段",
    );
    const merged = mergeVCard(upstreamUpdated, [{ key: "ORG#0", value: "我的公司" }]);
    expect(merged).toContain("ORG:我的公司");
    expect(merged).toContain("NOTE:上游新加的字段");
  });

  test("用户删除的字段不再出现", () => {
    const merged = mergeVCard(BASE, [{ key: "TEL;TYPE=CELL#0", value: null }]);
    expect(merged).not.toContain("13800000000");
    expect(merged).toContain("13900000000");
  });

  test("用户追加的新字段出现在 END 之前", () => {
    const merged = mergeVCard(BASE, [
      { key: "+TEL;TYPE=CELL", value: "13700000000" },
      { key: "+NOTE", value: "我自己加的备注" },
    ]);
    expect(merged).toContain("TEL;TYPE=CELL:13700000000");
    expect(merged).toContain("NOTE:我自己加的备注");
    const endIndex = merged.indexOf("END:VCARD");
    expect(merged.indexOf("我自己加的备注")).toBeLessThan(endIndex);
  });

  test("连续添加多个电话：~N 去重后缀不会写进 vCard", () => {
    const merged = mergeVCard(BASE, [
      { key: "+TEL;TYPE=CELL", value: "13700000000" },
      { key: "+TEL;TYPE=CELL~2", value: "13700000001" },
      { key: "+TEL;TYPE=CELL~3", value: "13700000002" },
    ]);
    expect(merged).toContain("TEL;TYPE=CELL:13700000000");
    expect(merged).toContain("TEL;TYPE=CELL:13700000001");
    expect(merged).toContain("TEL;TYPE=CELL:13700000002");
    expect(merged).not.toContain("~");
  });

  test("上游改了用户没碰的字段，用上游新值", () => {
    const upstreamUpdated = BASE.replace("URL:https://example.com", "URL:https://new.example.com");
    const merged = mergeVCard(upstreamUpdated, [{ key: "ORG#0", value: "我的公司" }]);
    expect(merged).toContain("URL:https://new.example.com");
  });
});

describe("buildVCard", () => {
  test("生成合法的新 vCard", () => {
    const card = buildVCard({
      uid: "自定义联系人",
      fields: [
        { key: "FN#0", value: "自定义联系人" },
        { key: "ORG#0", value: "自定义联系人" },
        { key: "TEL;TYPE=CELL#0", value: "13600000000" },
      ],
      revision: "2026-11-25T00:00:00Z",
    });
    expect(card).toContain("BEGIN:VCARD");
    expect(card).toContain("UID:自定义联系人");
    expect(card).toContain("TEL;TYPE=CELL:13600000000");
    expect(card).toContain("REV:2026-11-25T00:00:00Z");
    expect(card).toContain("END:VCARD");
  });
});
