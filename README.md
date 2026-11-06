# Modular Workbench

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
- [插件协议](docs/PLUGIN-SPEC.md)
- [外部 AI 数据接口](docs/AI-INTERFACE.md)
- [UI 风格与交互](docs/UI-DESIGN.md)
- [实施计划与验收](docs/ROADMAP.md)
- [视觉样式变量](design/tokens.css)

当前交付为架构和规范基线，不包含可运行应用、已实现的插件沙箱或安装包。尚未选择开源许可证；公开发布前由仓库所有者决定。
