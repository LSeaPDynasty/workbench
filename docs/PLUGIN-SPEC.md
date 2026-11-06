# 插件协议 v0.1

## 安装包

第一版采用包含 manifest.json、界面静态资源和可选后台入口的 ZIP 包。运行时安装无需重新构建主程序；第一版允许安装后重启插件宿主，不承诺热更新。

```json
{
  "id": "local.notes",
  "name": "笔记",
  "version": "0.1.0",
  "apiVersion": "1",
  "entry": { "ui": "ui/index.html" },
  "permissions": ["storage.own"],
  "contributes": {
    "navigation": [{ "id": "notes", "title": "笔记", "icon": "notebook" }],
    "queries": [{ "id": "notes.search", "schema": "schemas/search.json", "aiReadable": true }]
  }
}
```

apiVersion 为精确主版本匹配，插件 version 使用语义化版本。第一版不支持插件之间的安装依赖。

## SDK 边界

- storage：本插件命名空间内的记录 CRUD、事务及分页。
- files：通过宿主选择器授权的文件读取和附件保存。
- commands：注册并调用已公开命令，不允许任意代码执行。
- views：打开页面、更新标题、关闭页面。
- notifications：展示操作结果，避免长期阻塞提示。
- queries：注册带输入输出 schema 的只读查询。

默认只授予自身存储。网络、外部文件和跨插件读取单独声明、单独授权；不支持的权限应拒绝安装，不能静默忽略。

## 生命周期

install → validate → grant → migrate → activate → deactivate → uninstall。activate/deactivate 应可重复调用且清理监听器和后台任务。停用后拒绝新增请求，终止或等待在途任务，取消注册命令和 AI 查询。

安装必须校验路径穿越、符号链接、包大小、文件数量、入口路径和重复 ID。摘要校验只证明完整性，不证明发布者可信。第三方签名、撤销和完整沙箱属于后续独立阶段。

## 错误协议

统一响应包含 requestId、ok 和 data 或 error；error 使用稳定 code 与可展示 message。至少覆盖 INVALID_INPUT、PERMISSION_DENIED、PLUGIN_DISABLED、NOT_FOUND、TIMEOUT、INTERNAL_ERROR。错误详情只进入脱敏日志。
