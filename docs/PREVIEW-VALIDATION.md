# 外壳预览验证

2026-11-06，Windows 本地构建。

已通过：TypeScript strict 类型检查；Vite 生产构建；Chrome 自动交互检查（导航、笔记编辑及刷新后保留、待办勾选、示例入口启停、深浅主题）；960px 视口无文档水平溢出；检查期间无 pageerror。已检查浅色和深色截图。

Electron 解压分发已生成。当前沙箱中桌面启动验证遇到 GPU 子进程退出及 renderer launch-failed，不能宣称 EXE 已通过真实桌面运行验收。浏览器预览可用于审阅本次界面。正式插件隔离、SQLite、后台任务、MCP 及资源回收不在本轮实现范围。

开发环境的 esbuild 配置打包受祖先目录访问限制，构建脚本采用 Vite native config loader。生产构建已通过；受限环境优先使用 `vite preview --configLoader native` 查看构建结果。
