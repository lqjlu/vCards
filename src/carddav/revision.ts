/**
 * 批量读取所有数据文件的最后 git 提交时间。
 *
 * 相比逐个文件调用 `git log`，这里只执行一次 git 命令，
 * 在 Windows 上可以避免数百次子进程带来的分钟级耗时。
 */

import { $ } from "bun";

/**中文路径在 git 的 --name-only 输出中会被引号转义，需要解码 */
const decodeGitPath = (line: string): string => {
  const trimmed = line.trim().replace(/^"|"$/g, "");
  if (!trimmed.includes("\\")) return trimmed;
  // git 对非 ASCII 字符使用八进制转义，如 \344\272\222
  const bytes = trimmed.replace(/\\([0-7]{3})/g, (_, oct: string) =>
    String.fromCharCode(Number.parseInt(oct, 8)),
  );
  try {
    return Buffer.from(bytes, "latin1").toString("utf8");
  } catch {
    return trimmed;
  }
};

/**
 * 返回 Map<文件路径, ISO 时间字符串>，取 YAML 与同名 PNG 中较新的提交时间。
 */
export const batchRevisions = async (yamlPaths: string[]): Promise<Map<string, string>> => {
  const output = await $`git log --pretty=format:'%ci' --name-only -- data`.text();

  // git log 输出：时间行 + 若干文件行（可能含空行）
  const latest = new Map<string, number>();
  let currentTime = 0;
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // 时间行形如 2024-05-01 12:00:00 +0800
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(line)) {
      const normalized = line.replace(/\s[+-]\d{4}$/, "");
      currentTime = new Date(normalized).getTime();
      continue;
    }

    if (currentTime === 0) continue;
    const path = decodeGitPath(line);
    const previous = latest.get(path) ?? 0;
    if (currentTime > previous) latest.set(path, currentTime);
  }

  const result = new Map<string, string>();
  for (const yamlPath of yamlPaths) {
    // Windows 下 listYamlPaths 返回反斜杠路径，git 输出用正斜杠，需统一
    const gitPath = yamlPath.replace(/\\/g, "/");
    const pngPath = gitPath.replace(/\.yaml$/, ".png");
    const yamlTime = latest.get(gitPath) ?? 0;
    const pngTime = latest.get(pngPath) ?? 0;
    const newest = Math.max(yamlTime, pngTime);
    result.set(
      yamlPath,
      new Date(newest || Date.now()).toISOString(),
    );
  }
  return result;
};
