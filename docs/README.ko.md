[English](../README.md)

# Podstr

**더빙은 연기를 망칩니다. 기본 자막은 Google 번역 수준입니다. 당신은 더 나은 자막을 받을 자격이 있습니다.**

Podstr는 AI — Claude, Gemini, DeepSeek — 를 사용하여 브라우저에서 바로 자막을 번역하는 Chrome 확장 프로그램입니다. 원어 음성을 그대로 듣고, 맥락과 유머, 속어까지 이해하는 자막을 읽으세요.

[웹사이트](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## 작동 방식
1. Chrome Web Store에서 확장 프로그램을 설치합니다
2. YouTube, ARTE 또는 지원되는 사이트에서 영상을 엽니다
3. 영상 위의 자막 선택기에서 원하는 언어를 선택합니다
4. AI가 번역한 자막이 영상 위에 표시됩니다

누군가 이미 같은 에피소드를 번역했다면 공유 캐시에서 즉시 무료로 로딩됩니다.

## 왜 플랫폼 자막 대신 Podstr인가
| | 플랫폼 자막 / Google 번역 | Podstr |
|---|---|---|
| **맥락** | 한 줄씩 번역, 대화 흐름 무시 | 전체 맥락을 고려한 배치 번역 |
| **유머와 속어** | 직역, 종종 오역 | 농담, 관용구, 문화적 맥락 반영 |
| **언어 조합** | 플랫폼이 제공하는 것만 가능 | 모든 언어 → 30개 언어로 번역 |
| **품질 관리** | 주어진 대로 사용 | 모델 선택 가능: Claude는 품질, Gemini는 속도, DeepSeek은 비용 |
| **이중 자막** | 거의 제공되지 않음 | 원본 + 번역 자막 동시 표시 |
| **비용** | 무료 (품질도 그 수준) | 에피소드당 $0.007부터. 무료 모델도 제공 |

## 지원 플랫폼
| 플랫폼 | 자막 형식 | 상태 |
|----------|-----------|--------|
| **YouTube** | 수동 CC (자동 생성 제외) | 테스트 완료 |
| **BBC iPlayer** | TTML/EBU-TT-D | 테스트 완료 |
| **ARTE** | HLS subtitles | 테스트 완료 |
| **Plex** | HLS subtitles | 테스트 완료 |
| **Filmzie** | HLS subtitles | 테스트 완료 |
| **Netflix** | — | 작동할 수 있으나 미테스트 |

HLS/VTT/TTML 자막이 있는 다른 사이트에서도 작동할 수 있습니다 — 확장 프로그램 팝업에서 **Enable**을 클릭하세요.

## 빠른 시작
**바로 시청하기** — [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)에서 설치하고, 영상을 열고, 언어를 선택하세요. 해당 에피소드가 공유 캐시에 있으면 즉시 재생됩니다.
**새로운 콘텐츠 번역하기** — [OpenRouter API 키](https://openrouter.ai/keys)를 확장 프로그램 설정에 입력하세요. 무료 키도 발급 가능합니다. 모델을 선택하고 영상을 열면 번역이 자동으로 시작됩니다.

## 기능
- **30개 번역 언어**, 13개 언어 인터페이스
- **이중 자막** — 원본 + 번역 동시 표시
- **다양한 AI 모델** — Claude Sonnet은 품질, Gemini Flash는 속도, DeepSeek은 비용. 무료 모델도 제공
- **공유 캐시** — 한 사람이 번역하면 모두가 혜택
- **번역 비용** 시작 전 영상에서 바로 확인
- **키보드 단축키** — `[` / `]` 타이밍 ±0.5초 조정, `B` 위치 전환, `\` 오프셋 초기화
- **스타일 커스터마이징** — 글꼴, 색상, 투명도, 위치

## 솔직한 한계
AI 모델은 텍스트만 봅니다 — 영상은 보지 않습니다. 남성인지 여성인지 알 수 없어 성별 표현이 틀릴 수 있습니다. 격식체와 비격식체를 항상 구분하지 못합니다. 신조어는 직역될 수 있습니다.
이것은 버그가 아닙니다 — 텍스트만으로 번역할 때의 본질적인 한계입니다. 대본만 보고 작업하는 인간 번역가도 같은 문제에 직면합니다.
**잘하는 것:** Claude Sonnet은 좋은 팬섭에 비견되는 번역을 생성합니다 — 유머, 속어, 맥락을 살립니다. 대부분의 콘텐츠에서 AI가 생성한 자막이라는 것을 잊게 될 것입니다.

## 개인정보 보호
- API 키는 사용자의 기기에만 저장됩니다 — 선택한 AI 제공업체 외에는 어떤 서버로도 전송되지 않습니다
- 확장 프로그램에 트래킹이나 광고가 없습니다 (웹사이트는 익명 방문 분석을 사용합니다)
- [개인정보처리방침](https://podstr.cc/en/privacy/)

## 기여
버그 리포트, 플랫폼 요청, PR을 환영합니다. [docs/CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스
MIT — [Anabasis Media DOO](https://podstr.cc)
