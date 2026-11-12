# 已实现的插件运行时与文件应用

2026-11-12，宿主 0.3.1 / API 1。本文件描述当前实现，优先于此前路线图中的未实现规划。

## 主体与插件边界

主体只负责安装注册表、权限、沙箱页面、文件服务及跨应用调度。插件为独立 `.wbplugin` 文件，包含 manifest 和 UTF-8 页面资源，通过应用管理安装即可出现入口。文件夹列表、阅读器和日志界面均不编译进主体 React 页面。

安装包目前采用有大小上限的 JSON 资源容器，**不是之前规划的 ZIP**。结构为 `{manifest, files: {"index.html": "..."}}`，最大 6 MiB 输入、5 MiB 资源、100 个文件；禁止路径穿越、非法 Windows 路径及大小写重复名。无原生代码、后台 Node 入口和安装脚本。包格式便于独立安装并减少解压攻击面；ZIP 支持以后单独版本化。

manifest 字段：id（小写字母数字连字符）、name、version（语义版本三段）、apiVersion（数字 1）、entry、permissions、fileTypes（扩展名列表）。例子见 plugins/*/manifest.json。新增支持现有 SDK 的插件，只更新插件包；扩展宿主 SDK 仍需要升级主体。

API 1 的权限还包括 `git.manage`。获得用户安装确认的 Git 插件只能在该插件通过 `folders.read` 明确选择的目录中执行固定的 `git` 子命令（初始化、克隆、状态、暂存、提交、拉取、推送和只读记录）。插件不获得 shell、任意命令、令牌或系统凭据访问权；Git 进程在 Worker 线程运行，30 秒超时且关闭终端交互。账号资料只对所属插件可见，仅保存显示名称、服务地址和“系统凭据/SSH”认证方式；实际凭据继续由 Git Credential Manager 或 SSH 管理。GitHub 账号可通过本机 GitHub CLI 拉起浏览器登录，并在拉取、推送前切换对应账号；GitHub CLI 未安装时会返回明确提示。GitLab 和私服使用同一远端地址模型；私服不依赖预设域名。

## 页面与授权

每插件独立 WebContentsView、session 和 `wb-plugin://<id>/` 源；关闭 Node 集成，开启 contextIsolation/sandbox。插件通过专用 preload 调固定 SDK，宿主根据发送方 webContents/mainFrame/源绑定身份。插件不可调用宿主安装接口。

禁止页面外部导航、新窗口、浏览器权限、网络请求和子框架；CSP 限定本地脚本及资源。自研插件原型已具备这些约束，但未完成第三方安全审计，不宣称是任意恶意代码的完整安全边界。

已打开页面暂留内存；关闭会话、禁用或卸载会销毁页面。此前规划的 LRU 挂起、自动内存预算和持久后台任务尚未实现。笔记/待办仍是旧版演示页，旧数据保留；本轮新增文件应用全部走插件运行时。

## SDK 与文件流

- `folders.list/choose/enable/remove`：仅 `folders.read` 插件可用；choose 打开系统目录选择器。多个文件夹可独立勾选加载；移除只撤销授权，绝不删除磁盘文件。
- `files.list(rootId, relative, offset)`：只读当前目录，一次最多 200 项，不递归扫描。符号链接不提供进入操作，并校验最终 realpath 边界。目录修改期间分页为非快照，刷新可重新读取。
- `files.menu(token)`：原生右键菜单。宿主扫描已启用插件的 fileTypes，动态生成打开方式，不硬编码应用 ID。
- `files.readText(token)` / `readImage(token)`：转交时给接收插件创建专属令牌，只能读指定文件。停用来源、停用接收应用或移除目录时撤销相应引用。
- `initial()` / `onOpen()` / `onTheme()`：接收文件和主题。再次打开文件会更新既有插件页面。

文件 I/O 在 Worker 线程执行。文件夹配置和插件注册表保存在应用 userData 下，目前为原子替换 JSON；SQLite 尚未接入。程序只读用户文件，不更改原文件。

## 随附插件与独立包

- 内置：文件管理器 1.0.0、文本阅读器 1.1.0。
- 独立安装：日志查看器 1.0.0、图片查看器 1.0.0、Git 1.0.0。Git 可管理多个账号资料、已有仓库、初始化与克隆、选择性暂存、提交、拉取和推送。
- `node scripts/package-plugins.cjs` 只生成插件包，不生成主体 EXE。
- `plugin-packages/` 保存可安装包，`bundled-plugins/` 仅在新用户首次启动时安装内置包。已有插件不会被重启时强制覆盖，升级走安装按钮。

## 阅读器能力和限制

文本：JS/TS、Python、Java、C/C++/C#、Go、Rust、Shell、SQL、JSON/YAML/TOML/INI、HTML/XML/Vue、CSS、Markdown 等基本词法着色。字符串、注释、数字、关键字、函数和键分别着色。不是语言服务器或完整语法解析器；正则字面量、模板字符串插值、混合语言等可能不能精确着色，可手动切换为纯文本。

支持行号、自动/手动语言、匹配行查找、折行、只读刷新，每页最多 300 行。文本/日志读取限制为 **2 MiB，UTF-8**；其他编码和更大文件明确报错，不静默截断。

日志：`.log/.txt/.out/.jsonl/.ndjson`；识别常见 TRACE/DEBUG/INFO/NOTICE/WARN/ERROR/FATAL 标记和 JSON 字符串 level/severity/log_level。筛选、搜索、关键词标色、保留匹配条目的后续堆栈、跳到末尾、手动刷新、折行、300 行分页。不支持实时 tail、轮转追踪、结构化字段查询或 GB 级文件。日志格式识别采用启发规则，未知内容归为 UNKNOWN。

图片：PNG/JPEG/GIF/WebP，只读，8 MiB 上限。

## 验证

`node --test tests/*.test.cjs` 覆盖注册表安装/更新/禁用/重启/卸载、路径逃逸、跨插件令牌、撤销、分页、编码、着色转义和日志堆栈。host.test.cjs 用模拟 Electron 窗口/原生菜单及真实 Worker/文件服务验证运行时安装日志插件后可转交文件，且主体代码不变；它不等同于真实桌面 UI 测试。

浏览器插件页面检查使用真实插件资源和模拟 preload SDK：语法色、语言切换、搜索、折行、主题、日志级别/堆栈筛选、刷新、1500 行文件分页。检查页面截图。桌面自动化工具没有获准访问该应用，真实窗口、选择器及原生菜单人工验收仍待完成。
