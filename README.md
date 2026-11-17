# Interview_Assistant

面试时按全局快捷键收声，把面试官的问题转成文字，再由 **MiniMax** 生成可扫读的答案并显示在置顶窗口里。

## 基本能力

- 全局快捷键开始 / 停止收声（默认 `Ctrl + Shift + Space`）
- 支持麦克风，或捕获系统声音（耳机开视频会议时用）
- MiniMax 流式返回答案，窗口始终置顶

## 准备

1. 安装 [Node.js 20+](https://nodejs.org/)
2. 在 [MiniMax 开放平台](https://platform.minimaxi.com/user-center/payment/token-plan) 创建 API Key  
   - 国内：`https://api.minimaxi.com/v1`  
   - 国际：`https://api.minimax.io/v1`（Key 与区域必须配套）

## 启动

```bash
npm install
npm run dev
```

首次打开会进入设置页，填入 API Key 后保存即可。

打包：

```bash
npm run dist
```

## 使用

1. 把窗口拖到不会挡住自己摄像头的位置
2. 面试官开始提问时按快捷键，状态变为「正在收声」
3. 问题说完再按一次，助手会识别问题并流式显示答案
4. 也可以点窗口里的「开始收声 / 停止并作答」

## 语音识别说明

答题走 MiniMax Chat Completions，语音识别默认走 MiniMax 官方接口（`asr-1.0`，`POST /v1/speech_to_text`），两者共用同一个 API Key。**语音识别需要付费账号，免费 Key 不可用。**

- **系统声音**：直接走 MiniMax 语音识别，无需额外配置（耳机开会推荐）
- **麦克风 + 自动**：有浏览器中文语音识别时优先用实时识别，失败再回退到 MiniMax 语音识别
- **自定义转写**：要用自建或第三方 Whisper 兼容服务时，在设置里填「自定义转写地址」，会覆盖默认的 MiniMax 语音识别

## 快捷键

可在设置中切换：`Ctrl + Shift + Space`、`Ctrl + Shift + Q`、`Alt + Space`、`F8`、`F9`
