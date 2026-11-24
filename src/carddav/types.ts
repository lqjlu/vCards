/** CardDAV 静态目录清单类型定义 */

export interface CatalogContact {
  /** 稳定的 ASCII 资源 ID，用作 href 与 R2 对象名 */
  id: string;
  /** 形如 "\"sha256hex\"" 的 ETag */
  etag: string;
  /** vCard 内的 UID（机构名） */
  uid: string;
}

export interface CatalogBook {
  /** 稳定的 ASCII 地址簿 ID */
  id: string;
  /** 原始分类名 */
  name: string;
  /** 展示名，形如 "金融银行(42)" */
  displayName: string;
  /** 地址簿 CTag，任一联系人变化时更新 */
  ctag: string;
  contacts: CatalogContact[];
}

export interface Catalog {
  version: 1;
  generatedAt: string;
  /** 全局 CTag */
  ctag: string;
  /** iOS 模式：按分类的多个地址簿 */
  books: CatalogBook[];
  /** macOS 模式：合并为单个 "全部" 地址簿 */
  macosBook: CatalogBook;
}

/** 单个地址簿的聚合数据，含 vCard 正文 */
export interface BookData extends CatalogBook {
  contacts: Array<CatalogContact & { vcard: string }>;
}
