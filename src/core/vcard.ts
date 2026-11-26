import sharp from "sharp";
import vCardsJS from "vcards-js";
import { isEmailEntry, isPhoneEntry } from "../const/schema";
import { appendABLabel, appendPhonetic } from "../utils/line";
import { readVCardData } from "./data";

/**
 * CardDAV 场景下的头像边长：通讯录头像 128px 足够清晰。
 * 原图 512x512 内嵌后单张约 31KB base64，321 张让合并地址簿高达 10MB，
 * 超过客户端单次同步的响应上限。缩到 128px 后单张约 6KB，总量降到约 2MB。
 */
const CARDDAV_PHOTO_SIZE = 128;
const photoCache = new Map<string, string>();

/** 读取 logo 并按需缩小，返回 { base64, mediaType } */
const loadPhoto = async (
  pngPath: string,
  shrink: boolean,
): Promise<{ base64: string; mediaType: string }> => {
  if (!shrink) {
    const { readFileSync } = await import("node:fs");
    return { base64: readFileSync(pngPath).toString("base64"), mediaType: "png" };
  }
  const cached = photoCache.get(pngPath);
  if (cached) return { base64: cached, mediaType: "png" };
  const buffer = await sharp(pngPath)
    .resize(CARDDAV_PHOTO_SIZE, CARDDAV_PHOTO_SIZE, { fit: "cover" })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  const base64 = buffer.toString("base64");
  photoCache.set(pngPath, base64);
  return { base64, mediaType: "png" };
};

export interface RenderOptions {
  /**
   * CardDAV 模式：补充稳定的 UID 与基于 git 提交时间的 REV，
   * 便于客户端识别联系人的增量更新（对应原来的 vcard-ext 插件）。
   */
  carddav?: { revision: string };
}

/** 将单个 YAML 数据渲染为 vCard 3.0 文本 */
export const renderVCard = async (
  yamlPath: string,
  options: RenderOptions = {},
): Promise<string> => {
  const { basic } = await readVCardData(yamlPath);
  const { carddav } = options;

  const labeledPhones = (basic.cellPhone ?? []).filter(isPhoneEntry);
  const labeledEmails = (basic.workEmail ?? []).filter(isEmailEntry);

  const vcard = vCardsJS();
  vcard.isOrganization = true;

  // 字段名与 vcards-js 的 setter 同名，按 YAML 中的键顺序赋值；带标签的条目单独拼接
  const fields: Record<string, unknown> = {
    ...basic,
    cellPhone: (basic.cellPhone ?? []).filter((phone) => !isPhoneEntry(phone)),
    workEmail: (basic.workEmail ?? []).filter((email) => !isEmailEntry(email)),
  };
  const setters = vcard as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    setters[key] = value;
  }

  if (carddav && !vcard.uid) {
    vcard.uid = vcard.organization;
  }

  // 内嵌机构 logo：CardDAV 与静态构建都需要保留头像。
  // CardDAV 模式下缩小到 128px，避免合并地址簿体积超限导致客户端只同步到前几个联系人。
  const pngPath = yamlPath.replace(/\.yaml$/, ".png");
  const photo = await loadPhoto(pngPath, Boolean(carddav));
  vcard.photo.embedFromString(photo.base64, photo.mediaType);

  let formatted = vcard.getFormattedString();

  if (carddav) {
    formatted = formatted.replace(
      /REV:[\d\-:T\.Z]+/,
      `REV:${carddav.revision}`,
    );
  }

  // 为中文机构名补充拼音字段，便于通讯录排序
  formatted = appendPhonetic(formatted, "ORG", basic.organization);

  formatted = appendABLabel(formatted, labeledPhones, "TEL;TYPE=CELL");
  formatted = appendABLabel(formatted, labeledEmails, "EMAIL;TYPE=WORK");

  return formatted;
};
