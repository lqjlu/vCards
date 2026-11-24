#!/usr/bin/env bash
# 将 dist/carddav 构建产物上传到 R2 存储桶
# 用法：./scripts/upload-carddav.sh [bucket-name]
# 需要 wrangler 已登录，或设置 CLOUDFLARE_API_TOKEN

set -euo pipefail

BUCKET="${1:-${R2_BUCKET:-vcards-carddav}}"
DIST_DIR="dist/carddav"

if [ ! -d "$DIST_DIR" ]; then
  echo "错误: $DIST_DIR 不存在，请先运行 bun run build:carddav" >&2
  exit 1
fi

echo "上传 $DIST_DIR -> R2 bucket $BUCKET"

# catalog.json
npx wrangler r2 object put "$BUCKET/catalog.json" \
  --file="$DIST_DIR/catalog.json" --remote

# books/ios/*.json
for file in "$DIST_DIR"/books/ios/*.json; do
  [ -e "$file" ] || continue
  name=$(basename "$file")
  npx wrangler r2 object put "$BUCKET/books/ios/$name" \
    --file="$file" --remote
done

# books/macos/*.json
for file in "$DIST_DIR"/books/macos/*.json; do
  [ -e "$file" ] || continue
  name=$(basename "$file")
  npx wrangler r2 object put "$BUCKET/books/macos/$name" \
    --file="$file" --remote
done

echo "上传完成"
