# RIDEN Desktop

RIDEN 可调电源（RD6006 / RD6006P / RD6012 / RD6018 / RD6024 / RD6030 / RK8009）的桌面上位机，基于 Electron + Vue，支持 Linux 和 Windows。设备通信由 [RIDEN-Core](https://github.com/beilusm/RIDEN-Core) 负责，作为 git 子模块放在 `core/`。

## 功能

- 多设备：每台设备由独立的 `riden-cored` 进程负责串口通信，互不影响；也可以连接已经在运行的 Core 服务。
- 实时曲线：电压 / 电流 / 功率三通道堆叠显示，时间窗口从 30 秒到全部历史；暂停后可滚轮缩放、拖动平移；可导出 CSV。
- 控制：输出开关、设定电压和电流（回车应用，↑↓ 或滚轮微调）、M1–M9 预设调用与保存、OVP/OCP、背光、一键关闭全部输出。
- 未知型号：寄存器布局与 RD60xx 相同的设备，可以在界面里设置电压/电流精度和量程，与设备屏幕核对读数后再启用控制。
- 统计：累计容量 Ah、能量 Wh、输出时长，以及当前窗口内的最小 / 最大 / 平均值。
- 配色：Material 3 动态配色，可切换深浅色和主题色。

## 获取源码

```bash
git clone --recurse-submodules https://github.com/beilusm/RIDEN-Desktop.git
cd RIDEN-Desktop
```

已经克隆但没有子模块时，运行 `git submodule update --init`。

## 构建与运行

依赖：Node.js 20.19+、CMake ≥ 3.22、C 编译器；交叉编译 Windows 版需要 MinGW-w64。

```bash
npm install
npm run core:linux   # 构建 Core，输出到 core/dist/linux
npm run dev          # 开发模式（Vite 热更新）
npm start            # 构建前端后启动
```

打包：

```bash
npm run dist:linux                       # AppImage 和 deb
npm run core:win && npm run dist:win     # NSIS 安装包（可在 Linux 上交叉构建）
```

安装包输出到 `release/`，其中已包含 `riden-cored`。

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

在「添加设备」中手动填入打印出的路径（例如 `/dev/pts/3`）。可以同时运行多个模拟器测试多设备。模拟器只支持 Linux 和 macOS。

## 目录结构

| 路径 | 说明 |
|---|---|
| `core/` | RIDEN-Core 子模块 |
| `electron/main.cjs` | 主进程：窗口、IPC、设备配置持久化（`userData/devices.json`） |
| `electron/device.cjs` | 单台设备：启动和重连 `riden-cored`、订阅快照、单位换算、写入 |
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
- 调用预设时直接写入该预设的电压和电流（部分固件写 HR19 不会真正载入预设），不改变当前 OVP/OCP。
- 只在 Linux 和 RD6006（型号代码 60067）真机上验证过；Windows 版尚未在真机上验证。

## 许可证

[GPL-3.0](LICENSE)。本项目与 RIDEN 官方无关。
