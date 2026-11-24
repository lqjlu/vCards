# 自建 CardDAV 服务（Cloudflare Workers + R2）

把本项目的数据部署到 Cloudflare，用自己的域名订阅，实现自动更新、免运维、零服务器成本。

## 方案说明

- **数据生成**：沿用项目的 YAML → vCard 流程，额外产出按地址簿聚合的 JSON
- **在线服务**：Cloudflare Worker 实现只读 CardDAV（`PROPFIND` / `REPORT` / `GET`）
- **存储**：R2 对象存储，只存放 `catalog.json` 与聚合 JSON
- **更新**：GitHub Actions 在数据或代码变更后自动重新构建、部署、上传

> 服务为**只读**：不支持新增/修改/删除联系人，写方法一律返回 405。

## 前置准备

1. Cloudflare 账户，开通 Workers 与 R2
2. 一个托管在 Cloudflare 的域名（用于绑定自定义域名）
3. GitHub 仓库 `lqjlu/vCards` 的 Secrets 配置权限

## 一、Cloudflare 侧初始化

### 1. 创建 R2 存储桶

```bash
npx wrangler r2 bucket create vcards-carddav
```

或用控制台创建同名 bucket。桶名可按喜好修改，但需同步修改 `wrangler.toml` 与上传脚本。

### 2. 登录 wrangler（本地部署时需要）

```bash
npx wrangler login
```

### 3. 设置访问密码

**必须设置**，否则任何人都能读取你的服务地址（虽然数据是公开的黄页，但建议加一层保护）。

```bash
npx wrangler secret put CARDDAV_PASS
# 输入你的密码，例如一个随机字符串
```

可选环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CARDDAV_USER` | `cn` | Basic Auth 用户名 |
| `CARDDAV_PASS` | `cn` | Basic Auth 密码，务必修改 |
| `ALLOW_ANONYMOUS` | `false` | 设为 `true` 可关闭认证，不建议 |

### 4. 绑定自定义域名

在 `wrangler.toml` 中取消注释 routes 段，替换为你自己的域名：

```toml
[[routes]]
pattern = "carddav.example.com/*"
zone_name = "example.com"
```

或在 Cloudflare 控制台：Workers → 你的 Worker → 设置 → 触发器 → 自定义域。

建议再开启 DNS 记录（`carddav` CNAME 到 Worker），Cloudflare 会自动配置。

## 二、本地构建与部署

```bash
bun install
bun run build:carddav
npx wrangler secret put CARDDAV_PASS
npx wrangler deploy
bash scripts/upload-carddav.sh
```

一键执行（已登录时）：

```bash
bun run deploy:carddav
```

## 三、GitHub Actions 自动部署

在仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 具有 Workers Scripts:Edit、R2:Edit 权限的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `CARDDAV_PASS` | 订阅密码（见下方说明） |
| `R2_BUCKET` | 可选，桶名，默认 `vcards-carddav` |

部署工作流在 `master` 分支且 `data/`、`src/` 等目录变更时自动触发，也可在 Actions 页面手动触发。

workflow 会自动把 `CARDDAV_PASS` 写入 Worker secret（每次部署时同步）。
如果未配置该 secret，Worker 会使用默认值 `cn`，建议务必配置。

## 四、客户端订阅

服务地址：`https://carddav.example.com`（你的自定义域名）

### iOS

1. 设置 → 通讯录 → 账户 → 添加账户 → 其他 → 添加 CardDAV 账户
2. 服务器：`carddav.example.com`
3. 用户名：`cn`
4. 密码：你在 `CARDDAV_PASS` 设置的密码
5. 描述：任意，例如 `黄页`

### macOS

1. 通讯录 → 设置 → 账户 → 其他通讯录账户 → 添加 CardDAV 账户
2. 服务器：`https://carddav.example.com/cn/macos/`
3. 用户名密码同上

> iOS 使用按分类的多个地址簿，macOS 使用合并为"全部"的单个地址簿。
> 这样 iOS 可以分组管理，macOS 只有一个通讯录。

### Android（DAVx⁵）

1. 新建账户 → 登录 URL 与用户名
2. 基础 URL：`https://carddav.example.com/cn/addressbooks/`
3. 用户名密码同上

## 五、验证

```bash
# 服务发现
curl -i https://carddav.example.com/.well-known/carddav

# PROPFIND principal
curl -i -u cn:你的密码 -X PROPFIND \
  -H "Depth: 0" https://carddav.example.com/cn/

# 列出地址簿
curl -i -u cn:你的密码 -X PROPFIND \
  -H "Depth: 1" https://carddav.example.com/cn/addressbooks/

# REPORT 查询联系人
curl -i -u cn:你的密码 -X REPORT \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop></C:addressbook-query>' \
  https://carddav.example.com/cn/addressbooks/<bookId>/
```

## 六、目录结构

```
dist/carddav/
├── catalog.json                  全局清单（分类、CTag、联系人元数据）
├── books/
│   ├── ios/<bookId>.json         按分类的地址簿（iOS 用）
│   └── macos/<bookId>.json       合并地址簿（macOS 用）
```

## 七、上游数据自动同步

`.github/workflows/sync-upstream.yml` 会每天自动同步 `metowolf/vCards` 上游的数据：

- **触发**：每天北京时间 06:00（UTC 22:00），也可在 Actions 页面手动触发
- **范围**：仅同步 `data/` 目录，**不会覆盖**你在 fork 中的 CardDAV 代码与配置
- **策略**：以 `upstream/master` 的 `data/` 为准（上游删除的文件也会在本地删除）
- **联动**：检测到变更后自动 commit、push，并显式触发 `deploy-carddav.yml` 重新部署
  - 说明：GitHub 用 `GITHUB_TOKEN` 的 push **不会**自动触发其他 workflow，所以这里用 `gh workflow run` 显式触发

> ⚠️ 如果你在 fork 的 `data/` 里手动添加过独有数据，会被上游同步覆盖。
> 需要保留的数据请放到自定义地址簿或另建目录。

> ⚠️ GitHub 对超过 60 天无活动的仓库会暂停定时任务。若发现不再自动同步，
> 手动触发一次 `sync-upstream` workflow 即可恢复。

## 八、技术细节

- **ETag**：vCard 内容的 SHA-256，内容变化才变，避免无谓同步
- **CTag**：地址簿内所有联系人 ETag 的聚合哈希，客户端据此判断是否需要增量同步
- **sync-token**：与 CTag 一致
- **子请求优化**：按地址簿预聚合 JSON，一次请求只读取 1-2 个 R2 对象，规避 Workers 免费版 50 个子请求上限
- **.name 编码**：R2 对象名使用稳定哈希 ID，避免中文路径编码问题和重名覆盖
- **缓存**：catalog 在 Worker 模块内缓存 60 秒；客户端响应设置 no-store 保证同步及时
