<div align="center">

# Podstr — AI 字幕翻訳

**AIで字幕をあらゆる言語に翻訳。**
Chrome拡張機能：動画プラットフォームの字幕を検出し、リアルタイムで翻訳します。

[ウェブサイト](https://podstr.cc) · [Chrome ウェブストア](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## これは何？

動画サイトの字幕をインターセプトし、AIモデル（Claude、Gemini、DeepSeekなど、OpenRouter経由）で翻訳するChrome拡張機能です。英語、スペイン語、ドイツ語、フィンランド語など、あらゆる言語の字幕に対応。任意の言語に翻訳できます。

同じエピソードを誰かが既に翻訳済みなら、共有キャッシュから即座に無料で読み込まれます。

## クイックスタート

1. [Chrome ウェブストア](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)からインストール
2. 字幕付きの動画を開く → 言語を選択 → 完了

新しいコンテンツを翻訳するには、[OpenRouter APIキー](https://openrouter.ai/keys)が必要です（無料キーあり）。

## 対応プラットフォーム

| プラットフォーム | 字幕形式 | 状態 |
|-----------------|----------|------|
| **YouTube** | 手動CC（自動生成は非対応） | テスト済み |
| **BBC iPlayer** | TTML/EBU-TT-D | テスト済み |
| **ARTE** | HLS字幕 | テスト済み |
| **Plex** | HLS字幕 | テスト済み |
| **Filmzie** | HLS字幕 | テスト済み |

HLS/VTT/TTML字幕のある他のサイトでも動作する場合があります。拡張機能のポップアップで **Enable** をクリックしてお試しください。

## 機能

- **あらゆる言語に対応** — 任意の字幕言語から任意のターゲット言語へ翻訳
- **複数のAIモデル** — 品質と価格で選択可能。無料モデルあり
- **翻訳コスト表示** — 動画上で各翻訳のコストを確認
- **共有キャッシュ** — 一人が翻訳すれば、他の全員が無料で視聴
- **スマートローカルキャッシュ** — 再視聴時は翻訳済み字幕が瞬時に読み込み
- **タイミング調整** — `[` / `]` で±0.5秒シフト
- **スタイルカスタマイズ** — フォント、色、透明度、位置
- **キーボードショートカット** — `B` で位置切り替え、`\` でオフセットリセット
- **13のインターフェース言語** — EN、RU、UK、BE、SR、ES、FR、DE、PT、ZH、JA、KO、TR

## 仕組み

1. **検出** — Service Workerが `chrome.webRequest` で字幕リクエストをインターセプト
2. **ダウンロード** — バックグラウンドスクリプトがCORSを回避して字幕を取得
3. **翻訳** — OpenRouter API経由でバッチ処理（あなたのキー、あなたが選んだモデル）
4. **キャッシュ** — 翻訳済みVTTをgzip圧縮し、ローカル＋共有キャッシュに保存
5. **レンダリング** — コンテンツスクリプトが動画再生に同期して字幕を表示

## FAQ

**APIキーは必要？** そのエピソードが共有キャッシュにあれば不要です。新規翻訳にはOpenRouterキーが必要です。

**無料？** 拡張機能は無料です。キャッシュ済みの翻訳も無料です。新しいコンテンツをAIプロバイダー経由で翻訳する場合のみ料金が発生します。

**翻訳の品質は？** モデルによります。Claude Opusは質の高いファンサブと同等です。DeepSeekやGemini Flashはより安価ですが、十分に読めます。

**一般的なコストは？** モデルによって1エピソードあたり$0.005〜0.05。無料モデルもあります。

## プライバシー

- APIキーはあなたのデバイスに保存 — サーバーに送信されることはありません
- トラッキング、アナリティクス、広告なし
- 字幕テキストはあなたが選んだAIプロバイダーにのみ送信
- [プライバシーポリシー](https://podstr.cc/en/privacy/)

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md)をご覧ください

## ライセンス

MIT

## リンク

- [podstr.cc](https://podstr.cc) — ウェブサイト
- [Chrome ウェブストア](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
- [GitHub](https://github.com/aveleazer/podstr)
- [Telegram](https://t.me/podstrcc)
