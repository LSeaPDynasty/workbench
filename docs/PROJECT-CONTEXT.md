# 项目上下文与交接入口

更新日期：2026-11-14。新对话先读根目录 `AGENTS.md`，再读本文和对应功能协议。本文记录当前源码与发布状态；版本、远程分支和发布附件需在操作前重新核实。

## 项目与约束

- 仓库：`https://github.com/LSeaPDynasty/workbench`，当前开发目录 `D:\project\modular-workbench`。默认分支为 `main`；不要把本机路径当作其他环境的固定路径。
- Windows 桌面、本地优先、插件扩展；界面与说明默认简体中文。不得自行加入模型调用、云端依赖或遥测。
- Electron + React + TypeScript + Vite，pnpm workspace。宿主版本当前为 `0.5.1`。
- 新功能优先组合现有 SDK 并独立发布插件。只有新增宿主能力或权限才考虑升级主体，并同步协议与兼容性说明。
- 初始用户内容为空，不创建示例笔记或任务，不清除已有数据，不记录正文、查询结果、密码或令牌。
- 不提交依赖目录、构建产物、真实用户数据或凭据。插件卸载默认保留数据，删除数据必须是独立操作。

## 代码与协议入口

| 路径 | 作用 |
| --- | --- |
| `src/` | React 桌面外壳与内置页面 |
| `electron/main.cjs` | 窗口、权限、请求路由及调度 |
| `electron/plugin-preload.cjs` | 插件页面公开能力桥 |
| `electron/plugin-registry.cjs` | 包校验、安装注册、资源与后台入口解析 |
| `electron/backend-manager.cjs`、`backend-runner.cjs` | 按需独立后台进程及生命周期 |
| `plugins/<应用>/` | 插件 manifest、页面、样式及应用自己的后台 |
| `design/tokens.css` | 共享颜色、间距、字体与主题变量 |
| `scripts/package-plugins.cjs` | 插件构建与打包，生成 `.wbplugin` |
| `tests/*.test.cjs` | Node 测试；包含业务、权限、持久化及后台集成 |

实际插件与原生后台能力以 [插件运行时](PLUGIN-RUNTIME-V1.md)、[通用后台协议](PLUGIN-CAPABILITIES.md) 为准。[架构基线](ARCHITECTURE.md)、[运行时规划](RUNTIME.md) 和 README 部分早期预览说明包含规划或历史状态，不能据此认定 SQLite、MCP、任务治理等已实现；先核对代码和对应专项文档。

插件声明 `backend: "backend/index.cjs"` 及 `native.backend`，导出 `create(context)`，返回 `request(method,args)` 和 `dispose()`。页面通过 `window.workbench.backend.request(method,args)` 调用自己的后台。身份由宿主绑定；应用 SDK、数据库驱动、Git/GitHub 业务、第三方资源映射和分页均放在插件内。主体不增加业务专用 IPC。

`native.backend` 是完整本机代码信任权限，独立进程提供故障与生命周期隔离，不是操作系统沙箱。页面仍保持 Node 集成关闭、上下文隔离及沙箱开启。插件私有数据位于宿主 `userData/plugin-data/<插件 id>`。

## 当前插件与本次改动

- Git `2.0.0`：`plugins/git/`，Git、GitHub 登录和账号仓库业务均由插件后台承担。
- 影音库 `1.1.0`：`plugins/media/`，歌单、资料、SHA-256 索引与局域网播放，见 [影音库说明](MEDIA-PLUGIN.md)。
- 数据库 `1.0.0`：`plugins/database/`，插件 ID `database-workbench`。2026-11-14 已将独立包上传至正式 Release `v0.5.1`，附件显示名为“数据库”，通过主体“插件 → 在线获取”安装。使用现有后台能力，不升级主体。见 [数据库说明](DATABASE-PLUGIN.md)。
- 数据库支持 MySQL 指定数据库连接、表/视图列表、100 行分页、字段结构和单条 SQL；Redis 支持 SCAN、常见类型预览、字符串新建/编辑、有效期和键删除。
- 数据库连接元数据采用 `connections-v1.json`，临时文件写入后原子替换；损坏或未知版本保留原文件并拒绝加载。密码只用于会话，不写配置。
- 数据库驱动构建依赖锁定为 `mysql2 3.24.6`、`@redis/client 6.3.1`、`esbuild 0.28.2`。构建将驱动内联为 `plugins/database/backend/drivers.cjs`，随插件分发，运行时不下载依赖。
- 生成的数据库驱动和 `plugin-packages/database-workbench-*.wbplugin` 已加入忽略规则；重新构建即可生成安装包，不强制加入 Git。

## 开发与验证

```powershell
pnpm install --frozen-lockfile
pnpm plugins:build
pnpm test
pnpm build
pnpm desktop
```

数据库测试依赖生成的安装包，因此干净检出后先构建插件，再执行测试。`pnpm build` 会先构建插件，再执行 TypeScript 检查与 Vite 构建；`pnpm dev` 仅是浏览器外壳预览，不能替代 Electron 原生后台验证。`pnpm package` 生成 Windows NSIS 安装包，产物不提交 Git。

若 pnpm 报 store 或 virtual store 路径不一致，先核对本机 pnpm 配置及 `node_modules/.modules.yaml`；不要将某一机器的绝对缓存路径写入共享配置。当前机器曾出现此问题，验证曾直接执行以下等价构建步骤：

```powershell
node scripts/package-plugins.cjs
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --configLoader native
```

本次验证：43 项测试通过，类型检查、插件打包、Vite 构建通过。数据库页面仅检查过连接空态、表单及模拟错误反馈；真实 MySQL/Redis 服务联调、完整键盘操作/缩放/主题验收，以及 Windows 安装、启动、升级、卸载与数据保留冒烟尚未完成。不要将这些待办写成已通过。

## Git 与发布边界

提交格式遵守 `docs/feat/fix/refactor/test/chore: 简洁描述`。提交前查看工作区并避免夹带其他任务改动；推送前获取远端状态，禁止强制覆盖远端。

Git 提交/推送与发布是两步。推送源码不会让插件出现在应用的在线目录中。插件在线目录读取最新正式 Release 的有效 `.wbplugin` 附件；插件可独立上传至当前主体 Release，发布新主体时须保留仍支持的插件最新版附件。不要为插件更新创建空的主体 Release，也不要无故提升主体版本。详细步骤见 [发布说明](RELEASES.md)。

后续对话完成相关改动后应同步本文的版本、验证事实和未完成事项；具体协议仍维护在专项文档中。
