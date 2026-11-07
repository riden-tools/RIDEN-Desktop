# 发行包

当前版本为 0.2.1，包含积木编程、多设备程序和三个内置示例。

0.2.1 修复启动弹窗遮罩未覆盖积木分类栏；电池识别在 HR33 为零时改用输出关闭时的新鲜 HR10 端电压，并显示读数来源；Linux 启动器改用图标绝对路径并在安装、升级时刷新图标缓存。本轮修复由用户人工验收，未运行自动化或设备测试。

## 安装

- Windows 10 / 11 x64：运行 `RIDEN-Desktop-0.2.1-windows-x64-setup.exe`，按向导安装。可选安装目录，默认安装到当前用户，无需提升权限；也可选择所有用户安装。向导随系统选择简体中文或英文。程序和 Core 已内置；CH340 等 USB 串口驱动需按转接器型号安装。
- Arch Linux / Manjaro x86_64：`sudo pacman -U riden-desktop-0.2.1-1-x86_64.pkg.tar.zst`，安装后从应用菜单启动 RIDEN Desktop，或运行 `riden-desktop`。包依赖由 pacman 处理。串口权限按 README 配置 `uucp` 组。
- 用户配置及程序库保存在系统用户配置目录。Windows 卸载默认保留这些数据。

Windows 包未配置代码签名证书，系统可能显示“未知发布者”。安装包内的程序图标和版本资源仍会正常写入。

## 从源码构建

需要 Node.js 22.12+、CMake 3.22+、C 编译器。Linux 上交叉构建 Windows 还需要 `x86_64-w64-mingw32-gcc`、对应 windres，以及 Wine（安装程序构建过程会运行临时卸载器）。pacman 包压缩使用 zstd。electron-builder 首次运行会下载对应平台的 Electron 和打包工具。

```bash
npm ci
npm run core:linux   # Linux 开发机；如需运行测试，先准备 Core
# npm test          # 可选，由验收人员决定是否执行
npm run dist
```

两条平台命令都会先从 `core/` 构建并安装对应平台 Core，再构建前端、打包；避免遗漏通信服务或带入旧版本。`npm run dist` 按顺序执行，以免两个前端构建覆盖同一个 `dist/`。

输出目录：

| 文件 | 用途 |
|---|---|
| `release/RIDEN-Desktop-0.2.1-windows-x64-setup.exe` | Windows NSIS 安装包 |
| `release/riden-desktop-0.2.1-1-x86_64.pkg.tar.zst` | pacman 安装包 |
| `release/SHA256SUMS` | 两个安装包的 SHA-256 校验值 |
| `release/win-unpacked/`、`release/linux-unpacked/` | 排查启动与依赖问题用的展开目录 |

## 图标与安装向导

统一源图标是 `build/icon.png`。`python3 scripts/branding.py` 可重建多尺寸 Windows ICO、Linux hicolor 图标、运行时图标、网页图标和 NSIS 高 DPI 位图；只在修改素材时需要 Python + Pillow 和 DejaVu Sans 字体，普通打包使用已提交的素材。

- Windows：electron-builder 写入 EXE / 安装程序 / 卸载器图标；窗口使用 ICO；`AppUserModelId` 固定为 `io.riden.desktop`，与安装器创建的快捷方式一致。
- Linux：菜单文件为 `io.riden.desktop.desktop`，`StartupWMClass` 与运行时身份均为 `io.riden.desktop`；hicolor 图标名为 `riden-desktop`。启动器使用已安装图标的绝对路径，避免图标主题缓存漏收录时显示缺失图标；安装和升级均强制刷新 hicolor 缓存。同时覆盖 X11 和 Wayland 的应用关联。
- NSIS：`build/installer.nsh` 保留原生可访问的向导控件，定制欢迎、完成文案及浅绿配色。侧栏和页眉沿用应用波形图标。

## 验收

本轮交由用户人工验收，不运行新的测试。建议安装 0.2.1 后检查：应用菜单 / 任务栏图标，启动弹窗是否完整遮住分类栏，输出关闭时连接 3.09 V 的 1S 电池能否读取端电压并给出 1 串候选。保持每次手动填写限流、确认串数后才开启充电。

0.2.0 开发阶段曾通过 27 项单元 / PTY 集成测试及前端构建，并辅助检查了独立配置下的 Linux 程序启动、Windows Wine 安装欢迎页和 EXE 图标。这些结果不覆盖 0.2.1 新修复，也不能替代 Windows 真机、USB 串口和驱动验收。
