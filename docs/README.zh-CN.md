<div align="center">

# Podstr — AI 字幕翻译

**用 AI 将字幕翻译成任何语言。**
Chrome 扩展程序：自动检测视频平台上的字幕并实时翻译。

[网站](https://podstr.cc) · [Chrome 应用商店](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## 这是什么

一个 Chrome 扩展程序，能拦截视频网站上的字幕，并通过 AI 模型（Claude、Gemini、DeepSeek 等，经由 OpenRouter）进行翻译。支持英语、西班牙语、德语、芬兰语等任何语言的字幕，可翻译成任意目标语言。

如果有人已经翻译过同一集，翻译会从共享缓存中即时免费加载。

## 快速开始

1. 从 [Chrome 应用商店](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) 安装
2. 打开有字幕的视频 → 选择语言 → 完成

要翻译新内容，需要一个 [OpenRouter API 密钥](https://openrouter.ai/keys)（有免费密钥可用）。

## 支持的平台

| 平台 | 字幕类型 | 状态 |
|------|----------|------|
| **YouTube** | 手动 CC（非自动生成） | 已测试 |
| **BBC iPlayer** | TTML/EBU-TT-D | 已测试 |
| **ARTE** | HLS 字幕 | 已测试 |
| **Plex** | HLS 字幕 | 已测试 |
| **Filmzie** | HLS 字幕 | 已测试 |

其他提供 HLS/VTT/TTML 字幕的网站也可能支持——在扩展弹窗中点击 **Enable** 即可尝试。

## 功能特性

- **任意语言** — 支持任何字幕语言到任何目标语言的翻译
- **多种 AI 模型** — 按质量和价格自由选择，有免费模型可用
- **翻译费用** — 直接在视频上查看每次翻译的花费
- **共享缓存** — 一人翻译，所有人免费观看
- **智能本地缓存** — 重复观看时字幕即时加载
- **时间轴调整** — `[` / `]` 前后偏移 ±0.5 秒
- **样式自定义** — 字体、颜色、透明度、位置
- **快捷键** — `B` 切换位置，`\` 重置偏移
- **13 种界面语言** — EN、RU、UK、BE、SR、ES、FR、DE、PT、ZH、JA、KO、TR

## 工作原理

1. **检测** — Service Worker 通过 `chrome.webRequest` 拦截字幕请求
2. **下载** — 后台脚本绕过 CORS 获取字幕
3. **翻译** — 通过 OpenRouter API 批量翻译（使用你的密钥和你选择的模型）
4. **缓存** — 翻译后的 VTT 经 gzip 压缩，同时保存到本地和共享缓存
5. **渲染** — 内容脚本将字幕与视频播放同步显示

## 常见问题

**需要 API 密钥吗？** 如果该集已在共享缓存中，则不需要。翻译新内容需要 OpenRouter 密钥。

**免费吗？** 扩展本身免费。缓存中的翻译免费。仅在通过 AI 服务商翻译新内容时需要付费。

**翻译质量如何？** 取决于模型。Claude Opus 的水平堪比优质字幕组。DeepSeek 和 Gemini Flash 更便宜，但仍然可读。

**一般要花多少钱？** 每集 $0.005–0.05 不等，取决于所选模型。有免费模型可用。

## 隐私

- API 密钥仅保存在你的设备上——从不发送到任何服务器
- 无追踪、无数据分析、无广告
- 字幕文本仅发送给你选择的 AI 服务商
- [隐私政策](https://podstr.cc/en/privacy/)

## 参与贡献

请查看 [CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

MIT

## 链接

- [podstr.cc](https://podstr.cc) — 网站
- [Chrome 应用商店](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
- [GitHub](https://github.com/aveleazer/podstr)
- [Telegram](https://t.me/podstrcc)
