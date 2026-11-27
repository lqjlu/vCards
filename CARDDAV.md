# 自建 CardDAV 服务（Cloudflare Workers + R2）

把本项目的数据部署到 Cloudflare，用自己的域名订阅，实现自动更新、免运维、零服务器成本。

## 方案说明

- **数据生成**：沿用项目的 YAML → vCard 流程，额外产出按地址簿聚合的 JSON
- **在线服务**：Cloudflare Worker 实现 CardDAV（`PROPFIND` / `REPORT` / `GET`）与 Web 管理界面
- **存储**：R2 存上游基线数据（只读），D1 存你的编辑与新增（可写），Worker 将两者按字段合并
- **更新**：GitHub Actions 在数据或代码变更后自动重新构建、部署、上传

> CardDAV 端点仍为**只读**（写方法返回 405）；修改联系人通过 Web 管理界面完成，
> 数据存在 D1 覆盖层，与上游更新叠加而非覆盖。详见文末「双源合并与管理界面」。

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
| `CARDDAV_USER` | `cn` | 初始 CardDAV 账户名（仅首次初始化用，之后在管理页增删改） |
| `CARDDAV_PASS` | `cn` | 初始密码；也在未配置 ADMIN_* 时作为后台登录密码 |
| `ADMIN_USER` | 同 `CARDDAV_USER` | 后台管理页登录用户名（在 Cloudflare secrets 里定义/修改） |
| `ADMIN_PASS` | 同 `CARDDAV_PASS` | 后台管理页登录密码（在 Cloudflare secrets 里定义/修改） |
| `ALLOW_ANONYMOUS` | `false` | 设为 `true` 可关闭认证，不建议 |

### 3.1 单独设置后台登录账号（可选）

后台登录默认复用 CardDAV 凭据。想让后台与手机端账号彻底分开，就在 Worker 上加两个机密：

**控制台操作（推荐）**

1. 打开 <https://dash.cloudflare.com>，用管理 `585119.xyz` 的账号登录
2. 左侧栏进入 **Workers & Pages**（新版可能显示为 **Compute (Workers)**）
3. 点进 Worker **`vcards-carddav`**（不是仓库名 vCards）
4. 顶部 **Settings / 设置**
5. 左侧二级菜单 **Variables and Secrets / 变量和机密**
   （旧界面叫 **Variables / 变量**，功能相同；不要找 Bindings，那是 R2/D1 绑定）
6. 点 **+ Add / 添加**
7. 类型选 **Secret / 机密**（不要选 Text，否则明文可见），变量名填 `ADMIN_USER`，值填后台用户名
8. 再加一条 `ADMIN_PASS`，值填后台密码
9. **必须点页面底部的 Deploy / 部署**，否则不会生成新版本

**命令行操作**

```bash
npx wrangler login                                  # 浏览器授权一次
npx wrangler secret put ADMIN_USER --name vcards-carddav
npx wrangler secret put ADMIN_PASS --name vcards-carddav
```

生效后：

- 打开 `/admin` 用新的 `ADMIN_USER` / `ADMIN_PASS` 登录；改过之后所有旧会话（30 天 Cookie）立即失效
- 手机/电脑上的 CardDAV 账号不受影响，那些账号在管理页「账号与同步」里维护
- 未配置时回退顺序：`ADMIN_USER` → `CARDDAV_USER` → `cn`；`ADMIN_PASS` → `CARDDAV_PASS` → `cn`
- CI 每次部署只写入 `CARDDAV_PASS`，不会覆盖 `ADMIN_*`

> GitHub 仓库 Settings 里的 Secrets 是给 Actions 用的（`CLOUDFLARE_API_TOKEN` 等），
> 在那里加 `ADMIN_USER` / `ADMIN_PASS` 不会生效，两处不要混淆。

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
2. 服务器：`carddav.example.com`（填域名即可，不需要加路径）
3. 用户名：`mac`（**注意：不是 cn**）
4. 密码：与 iOS 相同（`CARDDAV_PASS`）
5. 描述：任意，例如 `黄页-全部`

> **为什么要用 `mac` 账号**：macOS 通讯录每个账户只同步第一个地址簿，无法像 iOS 那样管理 20 个分类。
> 服务端用账号区分：`cn` 返回 20 个分类簿，`mac` 返回单个"全部"合并簿（321 人）。
> 不能靠设备类型（User-Agent）自动判断——iOS 和 macOS 的通讯录 UA 完全相同，会互相误判。

### 账号说明

CardDAV 账户在管理页「账号管理」里增删改，每个账户可指定类型：

- **iOS（多分类簿）**：看到 20 个分类地址簿，适合 iPhone
- **macOS（合并簿）**：看到单个"全部"地址簿，适合 Mac（Apple 通讯录一个账户只同步第一个簿）

初始默认有 `cn`（iOS）和 `mac`（macOS）两个账户，密码都是 `CARDDAV_PASS`。
可以在管理页改名、改密码、换类型、新增或删除。

### 在手机上直接修改 / 新增联系人

CardDAV 已开放写权限，可以**直接在 iPhone / Mac 通讯录里改号码、新增、删除**，会自动同步回服务器：

- 改过的字段存在服务器覆盖层里，**上游 GitHub 更新时不会被覆盖**（未改的字段照常跟随更新）。
- 手机上的改动与网页管理页（`/admin`）**双向互通**，两边看到的是同一份数据。
- iPhone 新增联系人时，需先在「设置 → 通讯录 → 默认账户」里选成这个 CardDAV 账户，否则新联系人只会存到本机 iCloud。

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

> ℹ️ 自己补充/修改的联系人**不要**写进 `data/`（会被上游同步覆盖），
> 请通过 Web 管理界面录入，数据保存在 D1 覆盖层，与上游更新合并。

> ⚠️ GitHub 对超过 60 天无活动的仓库会暂停定时任务。若发现不再自动同步，
> 手动触发一次 `sync-upstream` workflow 即可恢复。

## 八、技术细节

- **ETag**：vCard 内容的 SHA-256，内容变化才变，避免无谓同步
- **CTag**：地址簿内所有联系人 ETag 的聚合哈希，客户端据此判断是否需要增量同步
- **sync-token**：与 CTag 一致
- **子请求优化**：按地址簿预聚合 JSON，一次请求只读取 1-2 个 R2 对象，规避 Workers 免费版 50 个子请求上限
- **.name 编码**：R2 对象名使用稳定哈希 ID，避免中文路径编码问题和重名覆盖
- **缓存**：catalog 在 Worker 模块内缓存 60 秒；客户端响应设置 no-store 保证同步及时

## 九、双源合并与管理界面

### 数据来源

```
GitHub 上游 data/  →  构建  →  R2 基线数据（只读）
                                    ↓
你的编辑（Web 界面）  →  D1 覆盖层（可写）  →  Worker 按字段合并  →  CardDAV 客户端
```

- **基线**：上游的 321 个联系人，由 GitHub Actions 自动更新
- **覆盖层**：你在网页上的修改、新增、删除，存在 Cloudflare D1 数据库
- **合并规则**（以 vCard 的 UID 即机构名关联）：
  - 你**改过的字段**：保留你的值，上游后续更新不影响它
  - 你**没碰的字段**：上游更新后自动并入新值
  - 你**删除的字段**：保持删除
  - 你**删除的联系人**：写入墓碑，上游再更新也不会复活
  - 你**新增的联系人**：可归入任意现有分类，或新建一个分类

### D1 初始化（首次部署）

```bash
# token 需要 Account → D1: Edit 权限
npx wrangler d1 create vcards-overlay
# 把输出的 database_id 填进 wrangler.toml 的 [[d1_databases]]

npx wrangler d1 execute vcards-overlay --remote --file=src/carddav/schema.sql
```

`wrangler.toml` 中的绑定：

```toml
[[d1_databases]]
binding = "DB"
database_name = "vcards-overlay"
database_id = "<你的 database_id>"
```

### 使用管理界面

打开 `https://card.585119.xyz/admin`，用 CardDAV 相同的账号密码登录。

| 操作 | 步骤 |
|---|---|
| 搜索 | 顶部输入框，按名称/分类/电话过滤 |
| 编辑 | 点联系人的「编辑」→ 改字段值 → 保存 |
| 加字段 | 编辑器下方输入字段类型（如 `TEL;TYPE=CELL`）和值 |
| 删字段 | 字段行右侧的 `×`，保存后生效 |
| 新增联系人 | 顶部「+ 新增联系人」→ 填名称 → 选分类或新建分类 → 创建 |
| 删除联系人 | 编辑器内「删除联系人」；基线联系人写墓碑，可在 API 恢复 |

页面上的「已修改」标记表示该字段被你覆盖过（上游更新不会改变它）。

### 同步到手机

保存后 Worker 会递增全局版本号并更新 CTag，手机上的 CardDAV 客户端下次轮询
（iOS 通常在 WiFi + 充电时）会自动拉取变化。想立即看到，可在通讯录 App 里下拉刷新，
或删除账户重新添加。

### 数据安全

- D1 数据库在 Cloudflare 控制台可直接导出备份
- 上游同步只写 `data/` 与 R2 基线，不碰 D1，你的编辑永远不会被覆盖
- 管理界面复用 `CARDDAV_PASS` 认证，与 CardDAV 同一套密码
