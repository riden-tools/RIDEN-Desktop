# RIDEN Desktop

RIDEN 可调电源（RD6006 / RD6006P / RD6012 / RD6018 / RD6024 / RD6030 / RK8009）的桌面上位机，基于 Electron + Vue，支持 Linux 和 Windows。设备通信由 [RIDEN-Core](https://github.com/riden-tools/RIDEN-Core) 负责，作为 git 子模块放在 `core/`。

## 功能

- 多设备：每台设备由独立的 `riden-cored` 进程负责串口通信，互不影响；也可以连接已经在运行的 Core 服务。
- 实时曲线：电压 / 电流 / 功率三通道堆叠显示，时间窗口从 30 秒到全部历史；暂停后可滚轮缩放、拖动平移；可导出 CSV。
- 控制：输出开关、设定电压和电流（回车应用，↑↓ 或滚轮微调）、M1–M9 数据组切换与四项参数保存（设定电压、电流、OVP、OCP）、各组 OVP/OCP 显示；即时保护值设置位于电压、电流设定下方、背光、一键关闭全部输出。
- 编程输出：Scratch 风格自由画布、吸附积木与嵌套条件 / 循环，63 种积木，支持实时数据、计时器、数学 / 逻辑 / 文字、数值列表统计、自定义积木、渐变和多设备并行；内置 4.2 V / 串锂电池充电示例，限流每次填写，串数估算后确认，低于 0.1 A 连续超过 10 s 后结束。另有阶梯扫描和双设备跟随示例。详见 [编程输出使用说明](docs/PROGRAMMING.md)。
- 未知型号：寄存器布局与 RD60xx 相同的设备，可以在界面里设置电压/电流精度和量程，与设备屏幕核对读数后再启用控制。
- 统计：累计容量 Ah、能量 Wh、输出时长，以及当前窗口内的最小 / 最大 / 平均值。
- 配色：Material 3 动态配色，可切换深浅色和主题色。

## 获取源码

```bash
git clone --recurse-submodules https://github.com/riden-tools/RIDEN-Desktop.git
cd RIDEN-Desktop
```

已经克隆但没有子模块时，运行 `git submodule update --init`。

## 当前版本

0.2.1 包含 Scratch 风格编程输出和 Windows / Linux 安装包，并修复启动弹窗遮罩、电池 HR33 零读数时的 HR10 回退识别、Linux 启动器图标关联。升级及变更说明见 [更新记录](docs/CHANGELOG.md)，安装步骤见 [发行包说明](docs/RELEASE.md)。本轮修复按用户要求交由人工验收，未运行新的自动化或设备测试。

## 构建与运行

依赖：Node.js 22.12+、CMake ≥ 3.22、C 编译器；交叉编译 Windows 版需要 MinGW-w64。

```bash
npm install
npm run core:linux   # 构建 Core，输出到 core/dist/linux
npm run dev          # 开发模式（Vite 热更新）
npm start            # 构建前端后启动
```

打包：

```bash
npm run dist:linux   # x86_64 pacman 包，自动构建 Linux Core
npm run dist:win     # x64 NSIS 安装向导，自动交叉构建 Windows Core
npm run dist         # 依次构建两种安装包
```

安装包输出到 `release/`，其中已包含 `riden-cored` 和对应的动态库。Windows 安装向导支持中英文、自选目录、桌面和开始菜单快捷方式；卸载保留用户配置。应用文件、窗口、任务栏、快捷方式和 Linux 应用菜单均使用 RIDEN 图标。构建及验收说明见 [发行包说明](docs/RELEASE.md)。

Arch Linux / Manjaro 安装：

```bash
sudo pacman -U release/riden-desktop-0.2.1-1-x86_64.pkg.tar.zst
```

`riden-cored` 的查找顺序：

1. 环境变量 `RIDEN_CORED` 指定的可执行文件；
2. 安装包内的 `resources/core`；
3. `RIDEN_CORE_DIR`（默认为 `core/` 子模块）下的 `dist/linux`、`dist/windows` 或 `build/`。

在 VS Code 等基于 Electron 的终端里，`ELECTRON_RUN_AS_NODE=1` 会让 `npx electron .` 以纯 Node 方式启动。`npm run dev` 已经处理了这个变量，其他方式启动前请先 `unset ELECTRON_RUN_AS_NODE`。

## 串口权限

- Linux：把用户加入 `dialout`（Debian/Ubuntu）或 `uucp`（Arch）组，重新登录后生效。
- Windows：CH340 需要安装驱动，设备在「添加设备」中显示为 `COMx`。

## 无真机测试

```bash
npm run mock -- 8   # 创建模拟 RD6006（8 Ω 负载），打印伪终端路径
```

在「添加设备」中手动填入打印出的路径（例如 `/dev/pts/3`）。可以同时运行多个模拟器测试多设备。模拟器只支持 Linux 和 macOS。构建 Core 后运行 `npm test`，可验证 HR19 数据组切换、编号范围、即时保护与数据组保存，以及画布程序转换、充电、多设备并行、取消及故障关闭（无需真机）。

## 与 AI agent 共用设备

RIDEN-Core 附带 MCP server [riden-mcp](https://github.com/riden-tools/RIDEN-Core/tree/main/mcp)，Claude Code、Codex 等 agent 可以通过它读取和控制电源。要让 Desktop 和 agent 同时使用同一台设备，先单独运行 `riden-cored`，再在「添加设备」中选择连接已在运行的 Core 服务。一个串口只能由一个 `riden-cored` 打开。

## 目录结构

| 路径 | 说明 |
|---|---|
| `core/` | RIDEN-Core 子模块 |
| `electron/main.cjs` | 主进程：窗口、IPC、设备配置持久化（`userData/devices.json`） |
| `electron/device.cjs` | 单台设备：启动和重连 `riden-cored`、订阅快照、单位换算、写入 |
| `electron/program-engine.cjs` | 程序校验、主进程解释器、多设备占用及停止处理 |
| `electron/program-library.cjs` | 程序库持久化 |
| `src/program/` | Scratch 风格 Blockly 积木及 AST 转换 |
| `electron/ports.cjs` | 串口枚举（Linux sysfs / Windows 注册表） |
| `electron/core-path.cjs` | 查找 `riden-cored` |
| `src/store.js` | 渲染进程状态与曲线历史缓存 |
| `src/theme.js` | Material 3 配色生成 |
| `src/components/` | 界面组件 |
| `scripts/` | 开发启动脚本、设备模拟器 |
| `build/` | 应用图标（electron-builder 使用） |

## 已知限制

- 曲线历史只保存在内存中（每台设备约 40 万点），重启后清空；需要保留请导出 CSV。
- RD6006 固件 1.15 在串口通信期间保持面板锁定，写入解锁会被确认但不生效，界面会给出提示。
- 数据组切换写入 HR19（仅 1–9），等待 600 ms 后回读；M0 为上电默认组。“应用”写 HR82/83 更新即时保护（同时改变 M0 存储），不会修改 M1–M9。保存数据组才将当前电压、电流及已应用的 OVP/OCP 写入该组四个存储寄存器；切换数据组会载入该组保存的保护值。固件未提供独立的即时保护回读，连接时以当前组存储值初始化显示，之后跟踪本软件的应用和载入结果。
- 只在 Linux 和 RD6006（型号代码 60067）真机上验证过；Windows 版尚未在真机上验证。

## 许可证

[GPL-3.0](LICENSE)。本项目与 RIDEN 官方无关。
