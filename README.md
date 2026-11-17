# 选题 58：内部排序算法可视化与性能对比平台（第一版）

## 项目简介

本项目为《数据结构》课程设计（选题 58）第一版实现。八种内部排序算法全部由 C 语言（`sort_core.c`）实现，并通过 Zig 编译为 WebAssembly 模块 `sort_core.wasm`，统一入口为 `void sort(int a[], int n)`（配合 `set_algorithm` 选择具体算法）。网页前端（HTML / CSS / JavaScript）仅负责界面展示与调用 WASM，不另行实现排序算法。

## 当前已实现功能（第 1–3 周）

- 在 `sort_core.c` 中实现 **8 种内部排序算法**：直接插入、折半插入、希尔、冒泡、快速、简单选择、堆排序、归并排序。
- 统一 `void sort(int a[], int n)` 调用入口与算法编号选择。
- 统计关键字比较次数、元素移动次数与运行耗时，并基于 `Record { key, id }` 结构支持稳定性检查。
- 提供基础网页界面（`index.html`），支持选择算法、输入/生成测试数据并查看排序结果与柱状图演示（动画规模 `n ≤ 50`）。

## 本地运行方式

由于浏览器通过 `fetch` 加载 `sort_core.wasm`，需使用本地静态服务器访问（不能直接用 `file://` 打开）：

```powershell
npx --yes http-server . -p 4173
```

启动后在浏览器访问 `http://localhost:4173`。

## 编译说明（可选）

仓库已包含编译好的 `sort_core.wasm`，直接运行网页无需安装编译器。如需从 `sort_core.c` 重新编译，可执行 `build.bat`（需安装 Zig）：

```powershell
zig cc -target wasm32-freestanding -O2 -nostdlib sort_core.c -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=16777216 -Wl,--max-memory=16777216 -Wl,--strip-all -o sort_core.wasm
```
