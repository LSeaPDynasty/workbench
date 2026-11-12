# Modular Workbench

当前版本：0.3.0。已接入动态插件运行时、内置文件管理器和只读文本阅读器；日志、图片和 Git 为独立安装包。Windows 安装版会检查 GitHub Releases 中的新版本。使用方式与实际限制见 [插件运行时](docs/PLUGIN-RUNTIME-V1.md) 和 [发布说明](docs/RELEASES.md)。此前预览说明保留作为演进记录，以本节链接的实现状态为准。

面向 Windows 的本地优先、可扩展桌面工作台。项目暂定名，尚未连接远程仓库。

## 产品边界

- EXE 桌面应用；主程序自主开发。
- 通过安装插件增加应用，统一导航、主题、数据服务和任务状态。
- 不内置模型调用、聊天助手或模型密钥管理。
- 为外部 AI 提供经过授权的只读 MCP 数据接口。
- 第一阶段为单用户、单机、可信自研插件；第三方不可信插件另行设计安全运行时。

## 技术决策

Electron + React + TypeScript + Vite；SQLite 保存本地结构化数据；electron-builder 负责 Windows 分发。第一版采用侧栏和标签页，暂不引入复杂分屏框架。

## 文档入口

- [开发规范](AGENTS.md)
- [底层架构](docs/ARCHITECTURE.md)
- [多应用运行时、后台任务与内存治理](docs/RUNTIME.md)
- [插件协议](docs/PLUGIN-SPEC.md)
- [外部 AI 数据接口](docs/AI-INTERFACE.md)
- [UI 风格与交互](docs/UI-DESIGN.md)
- [UI 库选型与自建边界](docs/UI-LIBRARY.md)
- [实施计划与验收](docs/ROADMAP.md)
- [视觉样式变量](design/tokens.css)

## 运行桌面外壳预览

```sh
pnpm install
pnpm desktop
```

浏览器开发预览：`pnpm dev`。类型检查并构建：`pnpm build`。生成 Windows 便携 EXE：`pnpm package`。

预览包含概览、标签切换、笔记编辑、待办、示例模块启停和深浅主题。预览数据存储在 localStorage，正式版本将迁移到 SQLite；浏览器预览和桌面预览的数据不共享。文件服务、插件包安装、独立插件运行时、挂起回收和 MCP 均未接入，不应将内置演示模块当作隔离插件。

当前 UI 用 React 和项目样式实现了基础页面；尚未引入 shadcn/Radix 的复杂交互组件。界面只使用原生控件和简单页面交互。尚未选择开源许可证；公开发布前由仓库所有者决定。

第二版界面为暂名‘栖桌’的视觉实验：底部应用托盘、纸面笔记和完整工作面，替换第一版固定侧栏和标签栏。当前浏览器预览可审阅；EXE 启动问题仍见验证说明。
