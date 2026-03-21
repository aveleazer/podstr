[English](../README.md)

# Podstr

**配音毁掉了表演。内置字幕不过是谷歌翻译的水平。你值得更好的。**

Podstr 是一款 Chrome 扩展，使用 AI（Claude、Gemini、DeepSeek）直接在浏览器中翻译字幕。你听到的是原声。你读到的字幕真正理解上下文、幽默和俚语。

[官网](https://podstr.cc) · [Chrome 应用商店](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](docs/README.ru.md) · 🇺🇦 [Українська](docs/README.uk.md) · 🇧🇾 [Беларуская](docs/README.be.md) · 🇷🇸 [Srpski](docs/README.sr.md) · 🇪🇸 [Español](docs/README.es.md) · 🇫🇷 [Français](docs/README.fr.md) · 🇩🇪 [Deutsch](docs/README.de.md) · 🇧🇷 [Português](docs/README.pt-BR.md) · 🇨🇳 [中文](docs/README.zh-CN.md) · 🇯🇵 [日本語](docs/README.ja.md) · 🇰🇷 [한국어](docs/README.ko.md) · 🇹🇷 [Türkçe](docs/README.tr.md)

---

## 工作原理
1. 从 Chrome 应用商店安装扩展
2. 在 YouTube、ARTE 或任何支持的网站上打开视频
3. 从视频上方的字幕选择器中选择你的语言
4. AI 翻译的字幕出现在视频上

如果已经有人翻译过同一集，会从共享缓存中即时免费加载。

## 为什么不直接用平台自带字幕
| | 平台字幕 / 谷歌翻译 | Podstr |
|---|---|---|
| **上下文** | 逐行翻译，不理解对话 | 批量翻译，完整上下文 |
| **幽默和俚语** | 直译，经常出错 | 理解笑话、习语和文化梗 |
| **语言对** | 受限于平台提供的选项 | 任意语言 → 30 种语言 |
| **质量控制** | 给什么用什么 | 自选模型：Claude 重质量，Gemini 重速度，DeepSeek 重性价比 |
| **双语字幕** | 很少提供 | 原文 + 译文同时显示 |
| **费用** | 免费（一分钱一分货） | 每集低至 $0.007，也有免费模型可用 |

## 支持的平台
| 平台 | 字幕格式 | 状态 |
|----------|-----------|--------|
| **YouTube** | 手动 CC 字幕（非自动生成） | 已测试 |
| **BBC iPlayer** | TTML/EBU-TT-D | 已测试 |
| **ARTE** | HLS 字幕 | 已测试 |
| **Plex** | HLS 字幕 | 已测试 |
| **Filmzie** | HLS 字幕 | 已测试 |
| **Netflix** | — | 可能可用，未测试 |

其他使用 HLS/VTT/TTML 字幕的网站也可能支持——在扩展弹窗中点击 **Enable** 即可。

## 快速开始
**只想看字幕** — 从 [Chrome 应用商店](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)安装，打开视频，选择语言。如果该集已在共享缓存中，立即播放。
**想翻译新内容** — 在扩展设置中粘贴 [OpenRouter API key](https://openrouter.ai/keys)。可申请免费 key。选择模型，打开视频——翻译自动开始。

## 功能特性
- **30 种翻译语言**，界面支持 13 种语言
- **双语字幕** — 原文 + 译文同时显示
- **多种 AI 模型** — Claude Sonnet 重质量，Gemini Flash 重速度，DeepSeek 重性价比。也有免费模型
- **共享缓存** — 一人翻译，所有人受益
- **翻译费用**在开始前直接显示在视频上
- **快捷键** — `[` / `]` 调整时间轴 ±0.5 秒，`B` 切换位置，`\` 重置偏移
- **样式自定义** — 字体、颜色、透明度、位置

## 坦诚的局限性
AI 模型只能看到文本，看不到视频画面。它不知道说话的是男是女，因此涉及性别的表达可能有误。它也不一定能区分敬语和非敬语。新词可能被直译。
这些不是 bug，而是纯文本翻译固有的局限。即使是人工译者仅凭文稿翻译，也会遇到同样的问题。
**它的优势：** Claude Sonnet 的翻译质量堪比优秀的字幕组——幽默、俚语和上下文都能拿捏到位。对于大多数内容，你会忘了自己在看 AI 生成的字幕。

## 隐私
- 你的 API key 保留在本地设备上，绝不会发送到你选择的 AI 提供商之外的任何服务器
- 扩展中没有跟踪或广告（网站使用匿名访问分析）
- [隐私政策](https://podstr.cc/en/privacy/)

## 参与贡献
欢迎提交 bug 报告、平台适配请求和 PR。详见 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)。

## 许可证
MIT — [Anabasis Media DOO](https://podstr.cc)
