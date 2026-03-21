[English](../README.md)

# Podstr

**吹き替えは演技を殺す。内蔵字幕はGoogle翻訳レベル。もっと良いものがあるはず。**

Podstrは、AI（Claude、Gemini、DeepSeek）を使って字幕を翻訳するChrome拡張機能です。ブラウザ上でそのまま動作します。オリジナルの声を聴きながら、文脈・ユーモア・スラングをちゃんと理解した字幕を読めます。

[ウェブサイト](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## 仕組み
1. Chrome Web Storeから拡張機能をインストール
2. YouTube、ARTE、その他の対応サイトで動画を開く
3. 動画の上に表示される字幕ピッカーから言語を選択
4. AIが翻訳した字幕が動画の上に表示される

同じエピソードを既に誰かが翻訳していれば、共有キャッシュから即座に無料で読み込まれます。

## プラットフォームの字幕ではダメな理由
| | プラットフォーム字幕 / Google翻訳 | Podstr |
|---|---|---|
| **文脈** | 一行ずつ、会話の流れを無視 | 文脈を把握したバッチ翻訳 |
| **ユーモアとスラング** | 直訳、誤訳が多い | ジョーク、慣用句、文化的な表現を理解 |
| **言語ペア** | プラットフォームが提供するものに限定 | あらゆる言語から30言語へ翻訳可能 |
| **品質管理** | 出されたものをそのまま使う | モデルを選択可能：品質ならClaude、速度ならGemini、コストならDeepSeek |
| **二言語字幕** | ほとんど利用不可 | 原文と翻訳を同時に画面表示 |
| **コスト** | 無料（品質相応） | 1エピソードあたり$0.007から。無料モデルもあり |

## 対応プラットフォーム
| プラットフォーム | 字幕形式 | ステータス |
|----------|-----------|--------|
| **YouTube** | 手動CC（自動生成ではない） | テスト済み |
| **BBC iPlayer** | TTML/EBU-TT-D | テスト済み |
| **ARTE** | HLS字幕 | テスト済み |
| **Plex** | HLS字幕 | テスト済み |
| **Filmzie** | HLS字幕 | テスト済み |
| **Netflix** | — | 動作する可能性あり、未テスト |

HLS/VTT/TTML字幕のある他のサイトでも動作する場合があります。拡張機能のポップアップで**Enable**をクリックしてください。

## クイックスタート
**ただ観たいだけなら** — [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)からインストールし、動画を開いて言語を選択。そのエピソードが共有キャッシュにあれば、すぐに再生されます。
**新しいコンテンツを翻訳したいなら** — [OpenRouter APIキー](https://openrouter.ai/keys)を拡張機能の設定に貼り付けてください。無料キーも利用可能です。モデルを選んで動画を開けば、翻訳が自動的に始まります。

## 機能
- **30の翻訳言語**、13言語のインターフェース
- **二言語字幕** — 原文と翻訳を同時表示
- **複数のAIモデル** — 品質重視ならClaude Sonnet、速度重視ならGemini Flash、コスト重視ならDeepSeek。無料モデルもあり
- **共有キャッシュ** — 一人が翻訳すれば、みんなが恩恵を受ける
- **翻訳コスト** が開始前に動画上に表示
- **キーボードショートカット** — `[` / `]` でタイミングを±0.5秒調整、`B` で位置切替、`\` でオフセットリセット
- **スタイルカスタマイズ** — フォント、色、透明度、位置

## 正直な制限事項
AIモデルはテキストのみを処理し、映像は見ていません。話しているのが男性か女性かわからないため、性別に依存する表現が間違うことがあります。敬語とカジュアルな表現の区別が常に正しいとは限りません。新語がそのまま直訳されることもあります。
これらはバグではなく、テキストのみの翻訳に固有の限界です。台本だけで作業する人間の翻訳者でも同じ問題に直面します。
**得意なこと：** Claude Sonnetは、良質なファンサブに匹敵する翻訳を生成します。ユーモア、スラング、文脈がしっかり保たれます。ほとんどのコンテンツで、AI生成の字幕を読んでいることを忘れるでしょう。

## プライバシー
- APIキーはお使いのデバイスに保存され、選択したAIプロバイダー以外のサーバーには一切送信されません
- 拡張機能にトラッキングや広告はありません（ウェブサイトでは匿名のアクセス分析を使用）
- [プライバシーポリシー](https://podstr.cc/en/privacy/)

## コントリビュート
バグ報告、プラットフォーム対応リクエスト、PRを歓迎します。[docs/CONTRIBUTING.md](CONTRIBUTING.md)をご覧ください。

## ライセンス
MIT — [Anabasis Media DOO](https://podstr.cc)
