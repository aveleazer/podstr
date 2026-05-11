<div align="center">

# Podstr — AI-пераклад субтытраў

**Пераклад субтытраў на любую мову з дапамогай AI.**
Пашырэнне для Chrome: знаходзіць субтытры на відэаплатформах і перакладае іх у рэальным часе.

[Сайт](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Што гэта

Пашырэнне перахоплівае субтытры на відэасайтах і перакладае іх праз AI-мадэлі (Claude, Gemini, DeepSeek і інш. праз OpenRouter). Працуе з англійскімі, іспанскімі, нямецкімі, фінскімі — любымі субтытрамі. Перакладае на любую мову.

Калі хтосьці ўжо пераклаў гэты эпізод — пераклад падцягнецца з агульнага кэшу імгненна і бясплатна.

## Хачу глядзець

1. Усталюй з [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Адкрый відэа з субтытрамі → выберы мову ў пікеры → гатова

## Хачу перакладаць

### Праз OpenRouter API (платна па токенах)

1. Атрымай ключ на [openrouter.ai](https://openrouter.ai/)
2. Устаў ключ у наладах пашырэння
3. Выберы мадэль і мову → пераклад запусціцца аўтаматычна

> Кошт залежыць ад мадэлі: DeepSeek V3 — ад $0.01 за серыю, Claude Opus — $5–15 за гадзінны эпізод.

### Праз Claude CLI (бясплатна з падпіскай Max)

Падрабязная інструкцыя: [CONTRIBUTING.md](CONTRIBUTING.md)

## Правераныя платформы

| Платформа | Субтытры | Статус |
|------|------|------|
| **YouTube** | Manual CC (not auto-generated) — primary `/api/timedtext` + transcript-panel fallback | Праверана |
| **Netflix** | TTML via Cadmium player API | Праверана |
| **HBO Max** | WebVTT via DASH manifest | Праверана |
| **BBC iPlayer** | TTML/EBU-TT-D | Праверана |
| **RaiPlay** | SRT via MAIN-world fetch interceptor | Праверана |
| **kino.pub** | HLS subtitles (Vidstack player) | Праверана |
| **RTS Planeta** | Native HTML5 `<track>` | Праверана |
| **ARTE** | HLS subtitles | Праверана |
| **Plex** | HLS subtitles | Праверана |
| **Filmzie** | HLS subtitles | Праверана |

Іншыя сайты з HLS / VTT / TTML / нативным `<track>` таксама могуць працаваць — націсніце **Enable** у popup пашырэння.

## Магчымасці

- **Шматмоўнасць** — перакладае з любой мовы на любую. Беларуская па змаўчанні
- **Выбар AI-мадэлі** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama праз OpenRouter
- **Агульны кэш** — адзін пераклаў, астатнія глядзяць бясплатна
- **Кошт перакладу** — відаць колькі каштаваў пераклад прама на відэа
- **Падладка таймінгу** — `[` / `]` для зруху ±0.5с
- **Налада выгляду** — шрыфт, колер, празрыстасць, пазіцыя

## FAQ

### Ці патрэбны API-ключ?

Не, калі гэты эпізод ужо хтосьці пераклаў (агульны кэш). Для новага перакладу — патрэбны ключ OpenRouter або падпіска Claude Max.

### Гэта бясплатна?

Пашырэнне бясплатнае. Пераклады з агульнага кэшу — бясплатныя. Плаціць трэба толькі за пераклад новага кантэнту праз OpenRouter API.

### Якая якасць перакладу?

Залежыць ад мадэлі. Claude Opus — на ўзроўні добрага фансабу, з гумарам, слэнгам і кантэкстам. DeepSeek і Gemini Flash — танней, але таксама чытэльна.

## Сайт

[podstr.cc](https://podstr.cc) — параўнанне мадэляў, платформы, інструкцыя па ўсталёўцы.

## Ліцэнзія

MIT
