<div align="center">

# Podstr — AI 자막 번역

**AI로 자막을 원하는 언어로 번역하세요.**
Chrome 확장 프로그램: 동영상 플랫폼의 자막을 감지하고 실시간으로 번역합니다.

[웹사이트](https://podstr.cc) · [Chrome 웹 스토어](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## 소개

동영상 사이트의 자막을 가로채서 AI 모델(Claude, Gemini, DeepSeek 등, OpenRouter 경유)로 번역하는 Chrome 확장 프로그램입니다. 영어, 스페인어, 독일어, 핀란드어 등 모든 언어의 자막을 지원하며, 원하는 언어로 번역할 수 있습니다.

같은 에피소드를 누군가 이미 번역했다면, 공유 캐시에서 즉시 무료로 불러옵니다.

## 빠른 시작

1. [Chrome 웹 스토어](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)에서 설치
2. 자막이 있는 동영상 열기 → 언어 선택 → 완료

새로운 콘텐츠를 번역하려면 [OpenRouter API 키](https://openrouter.ai/keys)가 필요합니다 (무료 키 이용 가능).

## 지원 플랫폼

| 플랫폼 | 자막 형식 | 상태 |
|--------|-----------|------|
| **YouTube** | 수동 CC (자동 생성 제외) | 테스트 완료 |
| **BBC iPlayer** | TTML/EBU-TT-D | 테스트 완료 |
| **ARTE** | HLS 자막 | 테스트 완료 |
| **Plex** | HLS 자막 | 테스트 완료 |
| **Filmzie** | HLS 자막 | 테스트 완료 |

HLS/VTT/TTML 자막이 있는 다른 사이트에서도 작동할 수 있습니다. 확장 프로그램 팝업에서 **Enable**을 클릭하세요.

## 기능

- **모든 언어 지원** — 모든 자막 언어에서 모든 대상 언어로 번역
- **다양한 AI 모델** — 품질과 가격에 따라 선택 가능. 무료 모델 이용 가능
- **번역 비용 표시** — 동영상에서 각 번역 비용을 바로 확인
- **공유 캐시** — 한 사람이 번역하면 나머지는 무료로 시청
- **스마트 로컬 캐시** — 재시청 시 번역된 자막이 즉시 로드
- **타이밍 조정** — `[` / `]`로 ±0.5초 조절
- **스타일 커스터마이징** — 글꼴, 색상, 투명도, 위치
- **키보드 단축키** — `B` 위치 전환, `\` 오프셋 초기화
- **13개 인터페이스 언어** — EN, RU, UK, BE, SR, ES, FR, DE, PT, ZH, JA, KO, TR

## 작동 방식

1. **감지** — Service Worker가 `chrome.webRequest`를 통해 자막 요청을 가로챔
2. **다운로드** — 백그라운드 스크립트가 CORS를 우회하여 자막 다운로드
3. **번역** — OpenRouter API를 통해 일괄 번역 (사용자의 키, 사용자가 선택한 모델)
4. **캐시** — 번역된 VTT를 gzip으로 압축, 로컬 + 공유 캐시에 저장
5. **렌더링** — 콘텐츠 스크립트가 동영상 재생에 맞춰 자막 표시

## FAQ

**API 키가 필요한가요?** 해당 에피소드가 공유 캐시에 있으면 필요 없습니다. 새로운 번역에는 OpenRouter 키가 필요합니다.

**무료인가요?** 확장 프로그램은 무료입니다. 캐시된 번역도 무료입니다. AI 제공업체를 통해 새 콘텐츠를 번역할 때만 비용이 발생합니다.

**번역 품질은?** 모델에 따라 다릅니다. Claude Opus는 수준 높은 팬 자막에 버금갑니다. DeepSeek와 Gemini Flash는 더 저렴하지만 충분히 읽을 수 있습니다.

**보통 얼마나 드나요?** 모델에 따라 에피소드당 $0.005~0.05. 무료 모델도 이용 가능합니다.

## 개인정보 보호

- API 키는 사용자의 기기에만 저장 — 어떤 서버에도 전송되지 않음
- 추적, 분석, 광고 없음
- 자막 텍스트는 사용자가 선택한 AI 제공업체에만 전송
- [개인정보처리방침](https://podstr.cc/en/privacy/)

## 기여하기

[CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요

## 라이선스

MIT

## 링크

- [podstr.cc](https://podstr.cc) — 웹사이트
- [Chrome 웹 스토어](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
- [GitHub](https://github.com/aveleazer/podstr)
- [Telegram](https://t.me/podstrcc)
