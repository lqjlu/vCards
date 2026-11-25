/** Worker 环境类型，独立成文件避免 admin.ts 与 worker.ts 循环依赖 */
export interface Env {
  R2: R2Bucket;
  DB?: D1Database;
  CARDDAV_USER?: string;
  CARDDAV_PASS?: string;
  ALLOW_ANONYMOUS?: string;
}
