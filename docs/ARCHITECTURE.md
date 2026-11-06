# 底层架构 v0.1

状态：设计基线，尚未实现。2026-11-06。

插件发现、会话状态机、按需后台执行器、持久任务和内存策略详见 [多应用运行时](RUNTIME.md)。插件宿主是逻辑管理层，实际采用有并发上限的按需执行器，不为每个已安装插件常驻一个进程。

## 选型

采用 Electron + React + TypeScript，统一宿主、插件 SDK 与 MCP 适配层的主要语言。接受 Chromium 带来的分发体积成本，换取一致的界面运行环境。SQLite 面向单机持久化；不引入服务端数据库。MCP 是外部访问适配层，不是业务逻辑层。

Tauri 作为未来体积优化备选，但其原生插件机制不直接替代动态业务插件平台。VS Code 仅作为扩展宿主设计参考，不直接 fork；Theia 对本项目第一版过重。

## 进程与责任

```text
工作台渲染进程 ──受控 preload── Electron 主进程
隔离插件页面 ──受控消息桥─────┤
                              ├─ 数据工作进程：SQLite、迁移、查询
                              ├─ 插件宿主：可信插件后台、生命周期
                              └─ 命名管道服务 ← MCP 桥接进程 ← 外部客户端
```

主进程管理窗口、插件身份、授权和请求路由。数据工作进程持有数据库连接，统一调度写入，避免多个插件直接竞争数据库。插件宿主故障不应退出工作台；超时请求取消并呈现恢复入口。

插件页面使用独立的沙箱化渲染上下文，由宿主创建并绑定身份，禁止导航到任意远程地址。不要把动态插件 JS 直接 import 到主界面的同一 JS 上下文。具体嵌入容器在原型阶段验证焦点、缩放、窗口层级和无障碍行为后确定。

## 计划目录

```text
apps/desktop/           主进程、preload、React 工作台
apps/mcp-bridge/        stdio MCP 与命名管道适配
packages/contracts/    请求、响应、manifest 的共享 schema
packages/plugin-sdk/   插件公开 API
packages/plugin-host/  加载与生命周期
packages/data-service/ 数据库、迁移、备份
packages/ui/           公共组件、主题
plugins/notes/         示例笔记插件
plugins/tasks/         示例待办插件
```

以上是计划结构；按里程碑逐步创建代码包，不用空包假装已实现功能。

## 数据模型与路径

Electron userData 下保存数据库和设置；开发、测试和正式版使用不同目录。数据库采用 WAL 模式，事务封装写入；备份使用一致性备份机制，不能在运行中只复制主数据库文件而忽略 WAL。

宿主维护 plugin_installations、plugin_grants、settings、schema_migrations、audit_events。第一版插件数据采用宿主管理的记录存储：plugin_id、collection、record_id、schema_version、payload_json、created_at、updated_at。plugin_id 与 collection、record_id 联合唯一。SDK 暴露受限筛选和分页，不暴露任意 SQL。

附件位于宿主管理目录，使用不透明 ID 引用，校验实际解析后的路径边界。插件不得遍历其他插件目录。大体量搜索和结构化专用表需求通过后续 ADR 演进。

## 可靠性

- 单实例运行；第二次启动转交主实例。
- 启动恢复插件状态，失败插件隔离停用，允许安全模式启动。
- 更新插件先解包暂存、验证兼容性与摘要，再迁移及切换；保留旧版本和迁移前备份。
- 有数据迁移时，回滚程序版本不等于回滚数据库；必须成对恢复。
- 应用更新与插件更新分开管理；第一版允许手动更新。

## 参考

- https://www.electronjs.org/docs/latest/tutorial/security
- https://code.visualstudio.com/api/advanced-topics/extension-host
- https://github.com/alex8088/electron-vite
- https://github.com/electron-userland/electron-builder
