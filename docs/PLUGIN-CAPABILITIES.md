# 通用后台插件协议

主体只管理页面、注册表、权限、独立后台进程和通用通信，不导入任何应用业务模块。发行更新仍使用配置的 GitHub Release 通道及其认证适配，这与 Git 应用后台无关；删除 Git 插件不会影响主体启动或插件管理。

## 在线安装（主体 0.5.1）

主体页面使用 `desktop.plugins.catalog()` 获取当前最新正式 Release 中有效 `.wbplugin` 资源，按插件 ID 选择最高版本。返回 ID、名称（资源 label，缺省为 ID）、版本和大小，不将认证凭据、下载地址或摘要暴露给插件页面。`desktop.plugins.installOnline(id)` 只接受已发现且尚未安装的插件，后台下载校验后显示系统权限确认，再注册插件；取消不写注册表、不执行插件代码。已有插件继续使用检查更新及 `update(id)`，不通过新安装覆盖。

来源固定为 LSeaPDynasty/workbench，使用发行通道已有的 GitHub CLI 凭据，与 Git 应用登录独立。不是任意 URL 下载器。只识别具有有效 SHA-256 摘要、大小不超过 6 MiB、符合 ID/版本命名的资源。下载流有大小及时间限制；校验真实大小/摘要、manifest 身份版本与资源路径后安装。摘要用于检测传输及内容不一致，不代表第三方签名。

发布插件时上传独立包到最新正式 Release 即可出现，无需改主体；资源 label 可填写应用显示名。以后发布新主体 Release 时，须同时附带当前插件包，才能在同一最新发行通道继续被发现。首次下载后的权限确认是必要的安装步骤，特别是完整本机代码信任权限。

## 声明与入口

manifest 可声明 `"backend":"backend/index.cjs"`，同时必须声明 `native.backend` 权限。该入口及依赖作为 UTF-8 资源放入插件包，递归打包。安装及升级会提示本机代码权限，后台资源不可通过页面协议读取。

入口导出 `create(context)`，返回 `{request(method,args),dispose()}`。context 包含插件 id、专属 dataDir 和通用 host(method,...args) 回调。页面通过 `workbench.backend.request(method,args)` 调用自己后台，不能指定其他插件身份。应用自己的 SDK 封装随插件包发布。

## 运行与权限

- 首次请求时创建独立 Electron utility process；没有后台插件时不启动后台进程。
- 请求最多 64 KiB，最长 150 秒；启动限时 15 秒。进程退出会拒绝未完成请求，下一次请求可重新启动。
- 更新、停用、卸载、关闭页面或退出会调用 dispose；两秒内未停止则终止进程。只隐藏页面时继续保留。
- 数据放在 userData/plugin-data/<id>；更新后台代码保留数据，迁移由插件自己实现，卸载不删除数据。
- host 回调仅支持 folders.list、folders.resolve、dialog.directory、browser.open、network.proxy，身份由运行时固定。打开目录和浏览器要求页面在前台。

**native.backend 是完整本机代码信任权限。** Node 后台可直接访问当前用户的文件、网络和子进程，独立进程只用于故障与生命周期隔离，不是恶意代码安全沙箱。只能安装可信来源的这类插件；不能把 host 回调权限描述成原生后台的强制 OS 沙箱。

## Git 应用

Git 的命令调度、GitHub 认证、账号管理、凭据处理和数据迁移均位于 plugins/git/backend，随 Git 2.0.0 插件发布。主体不导入 Git 代码，没有 Git 业务 IPC，也不再在 preload 暴露 Git API。Git 插件使用系统已安装的 Git 和 GitHub CLI，这些外部程序不打入主体。

以后新增 Git 命令、接口、依赖和页面，可在插件自己的后台修改并独立发布；新增平台窗口或系统授权能力才需要扩展主体。Git 老配置由该插件迁至自己的数据目录，旧文件保留。

## 已验证

真实 Node 子进程测试覆盖独立后台安装、升级、数据保留、崩溃、停用和旧数据迁移；真实 Electron utility process 验证了无插件零后台、无关插件 1.0 到 1.1 的独立升级，以及 Git 插件在已安装包中迁移账号并完成 GitHub 请求。原生 UI 安装升级的数据保留验收仍需后续执行。
