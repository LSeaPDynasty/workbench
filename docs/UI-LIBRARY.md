# UI 库选型与自建边界

调研日期：2026-11-06。结论：采用 shadcn/ui 的组件源码分发方式，以 Radix Primitives 承担复杂交互基础，在 packages/ui 建立项目自己的 Workbench UI。当前完成选型，尚未安装依赖或实现组件。

## 候选比较

以下适配评价为项目工程判断，不是性能实测排名。

| 候选 | 适合之处 | 项目代价 | 决策 |
| --- | --- | --- | --- |
| shadcn/ui | 可持有并修改组件源码，适合自定义主题与插件 SDK | 源码升级和本地改动需要自行维护；不等于安装一个包后自动升级 | 选用，逐组件引入 |
| Radix Primitives | 无预设视觉的交互原语，提供弹窗、菜单等可访问交互基础 | 需要自行提供样式与业务组合 | 选用作统一交互原语 |
| Fluent UI React v9 | 微软设计语言，React 组件适合生产力工具 | 自有 token、Provider 和样式体系，需要与工作台风格协调 | Windows 视觉优先时的备选，不同时引入 |
| Ant Design | 企业表单、表格及管理界面组件体系完整 | 与自建组件体系并存会扩大主题与交互一致性成本 | 暂不采用；数据密集型需求显著增加时重新评估 |
| Dockview | 多标签、分组、网格和分屏布局 | 是布局管理器，不是完整 UI 库；插件隔离页面需验证适配 | 第二阶段按需引入 |
| 全部从零编写 | 最大实现自由 | 需要自担焦点管理、键盘导航、弹层和辅助技术兼容成本 | 不作为基础交互路线 |

## 组合规则

shadcn/ui 不是必须原样保留的视觉风格。引入的基础组件统一映射到 design/tokens.css，再通过项目包导出。选择 Radix 实现的一套组件；导入前检查实际实现和依赖，避免混用不同原语造成行为差异。

不同时安装多个完整组件库。图标另行采用一套统一线性图标，落地时核对版本和许可证。复杂表格、编辑器和拖拽布局按实际需求独立选型，不提前装入所有插件。

## Workbench UI 的三层设计

### 1. 主题基础

沿用 design/tokens.css 作为唯一语义颜色、间距和圆角来源。组件内部使用 --wb-* 命名空间或局部样式，避免污染插件页面。若接入 Tailwind，映射现有 token，不再建立独立颜色来源。

### 2. 通用组件：复用后统一封装

首批：Button、Input、Textarea、Checkbox、Select、Dialog、DropdownMenu、ContextMenu、Tooltip、Tabs、ScrollArea、Separator、Skeleton。

复杂控件的焦点约束、Escape、方向键、aria 属性与弹层行为依赖成熟原语；封装后仍须实际验证。不能因上游声称可访问就宣称整个应用通过无障碍测试。

### 3. 工作台组件：自主实现

| 组件 | 职责 |
| --- | --- |
| WorkbenchShell | 工具栏、侧栏、内容区布局，不处理权限逻辑 |
| AppSidebar | 应用列表、当前应用标记、折叠态 |
| DocumentTabs | 多文档标题、关闭、未保存状态 |
| PageHeader | 页面标题、说明、主要操作 |
| EmptyState / ErrorState | 一致的空态、失败态和重试入口 |
| SettingsRow | 设置项描述、控件和辅助说明 |
| PluginInstallSummary | 版本、来源、请求权限、兼容状态 |
| PermissionSummary | 人可读的授权范围展示 |
| TaskStatus | 长任务进度、取消和重试 |

权限展示组件不执行授权；授权必须走宿主 API。Dialog 等宿主全局弹层由 SDK 请求宿主显示，避免插件各自模拟系统确认。

## 插件消费规范

- 自研 React 插件通过 @workbench/ui 导入公开组件，不引用内部文件路径。
- 插件安装包自行包含 UI 运行依赖，宿主与插件不共享可执行 React 实例；不能把主题共享误认为共享 JS 上下文。
- 跨隔离边界传递主题 ID 和允许的 token 值；静态 token 包是唯一源，主题变化通过 SDK 通知。
- 不同技术栈插件可以只采用 token 和交互规范，不强制 React。
- 样式与字体随应用分发，不依赖运行时 CDN。
- 维护 UI 包语义化版本；破坏性更改提升主版本，与 plugin API 版本分别管理。

## 首次实施验收

建立组件展示页，覆盖按钮状态、表单校验、弹窗、菜单、空态、插件安装摘要和侧栏布局。必须验证浅深主题、键盘操作、焦点恢复、中文长文本和 100/125/150% 缩放。先完成一页笔记插件和一页插件管理，确认体系有效后再增加组件。

## 许可与更新

保留引入组件源码和图标的许可证及版权说明。版本和确切许可证在真正安装时以对应 tag 的文件为准，不用本次文档代替依赖审计。将原始上游版本、引入文件和本地修改记录在第三方清单中，更新时按差异合并，不覆盖自定义源码。

## 官方来源

- shadcn/ui：https://ui.shadcn.com/docs
- shadcn/ui 仓库：https://github.com/shadcn-ui/ui
- Radix：https://github.com/radix-ui/primitives
- Fluent UI：https://github.com/microsoft/fluentui
- Fluent React：https://react.fluentui.dev/
- Ant Design：https://ant.design/docs/react/introduce
- Dockview：https://github.com/dockview/dockview
