; Keep native accessible wizard controls; add RIDEN branding and bilingual copy.
!define MUI_BGCOLOR "F1F3E8"
!define MUI_TEXTCOLOR "1B2118"
!define MUI_ABORTWARNING

LangString RidenWelcomeTitle 2052 "欢迎安装$\r$\nRIDEN Desktop"
LangString RidenWelcomeText 2052 "让每一次输出，尽在掌握。$\r$\n$\r$\n连接多台电源，查看实时曲线，用 Scratch 风格积木编排输出。$\r$\n$\r$\n安装包已包含 RIDEN Core，无需另外安装通信服务。$\r$\n$\r$\n点击“下一步”开始安装。"
LangString RidenFinishTitle 2052 "准备就绪"
LangString RidenFinishText 2052 "RIDEN Desktop 已安装完成。$\r$\n$\r$\n连接电源后，从“添加设备”开始。你也可以先打开“编程输出”，探索积木和示例。$\r$\n$\r$\n使用 CH340 转接器时，请确保已安装对应的串口驱动。"
LangString RidenWelcomeTitle 1033 "Welcome to$\r$\nRIDEN Desktop"
LangString RidenWelcomeText 1033 "Every output, under control.$\r$\n$\r$\nConnect your supplies, watch live measurements, and build output programs with Scratch-style blocks.$\r$\n$\r$\nRIDEN Core is included. No separate communication service is needed.$\r$\n$\r$\nClick Next to begin."
LangString RidenFinishTitle 1033 "Ready when you are"
LangString RidenFinishText 1033 "RIDEN Desktop has been installed.$\r$\n$\r$\nConnect a power supply and choose Add device, or explore the blocks and examples in Programming.$\r$\n$\r$\nCH340 adapters require the corresponding serial driver."

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(RidenWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(RidenWelcomeText)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!define MUI_FINISHPAGE_TITLE "$(RidenFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(RidenFinishText)"

!macro customHeader
  BrandingText "RIDEN Desktop · ${VERSION}"
!macroend
