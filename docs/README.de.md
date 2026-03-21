[English](../README.md)

# Podstr

**Synchronisation zerstört die schauspielerische Leistung. Eingebaute Untertitel haben Google-Translate-Qualität. Du verdienst Besseres.**

Podstr ist eine Chrome-Erweiterung, die Untertitel mit KI übersetzt — Claude, Gemini, DeepSeek — direkt in deinem Browser. Du hörst die Originalstimmen. Du liest Untertitel, die Kontext, Humor und Slang tatsächlich verstehen.

[Website](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## So funktioniert es
1. Installiere die Erweiterung aus dem Chrome Web Store
2. Öffne ein Video auf YouTube, ARTE oder einer anderen unterstützten Seite
3. Wähle deine Sprache im Untertitel-Picker über dem Video
4. Untertitel erscheinen über dem Video — von KI übersetzt

Wenn jemand dieselbe Folge bereits übersetzt hat, wird sie aus einem gemeinsamen Cache geladen — sofort und kostenlos.

## Warum nicht einfach die Plattform-Untertitel nutzen
| | Plattform-Untertitel / Google Translate | Podstr |
|---|---|---|
| **Kontext** | Zeile für Zeile, kein Bewusstsein für den Dialog | Batch-Übersetzung mit vollständigem Kontext |
| **Humor & Slang** | Wörtlich, oft falsch | Versteht Witze, Redewendungen, kulturelle Anspielungen |
| **Sprachpaare** | Begrenzt auf das Angebot der Plattform | Jede Sprache → jede von 30 Sprachen |
| **Qualitätskontrolle** | Nimm, was du kriegst | Wähle dein Modell: Claude für Qualität, Gemini für Geschwindigkeit, DeepSeek für niedrige Kosten |
| **Zweisprachige Untertitel** | Selten verfügbar | Original + Übersetzung gleichzeitig auf dem Bildschirm |
| **Kosten** | Kostenlos (und das merkt man) | Ab $0,007 pro Folge. Kostenlose Modelle verfügbar |

## Unterstützte Plattformen
| Plattform | Untertitel | Status |
|-----------|------------|--------|
| **YouTube** | Manuelle CC (nicht automatisch generiert) | Getestet |
| **BBC iPlayer** | TTML/EBU-TT-D | Getestet |
| **ARTE** | HLS-Untertitel | Getestet |
| **Plex** | HLS-Untertitel | Getestet |
| **Filmzie** | HLS-Untertitel | Getestet |
| **Netflix** | — | Funktioniert möglicherweise, nicht getestet |

Andere Seiten mit HLS/VTT/TTML-Untertiteln könnten funktionieren — klicke auf **Aktivieren** im Erweiterungs-Popup.

## Schnellstart
**Einfach nur schauen** — installiere aus dem [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih), öffne ein Video, wähle eine Sprache. Wenn die Folge im gemeinsamen Cache ist, wird sie sofort abgespielt.
**Neue Inhalte übersetzen** — füge einen [OpenRouter API-Key](https://openrouter.ai/keys) in den Erweiterungseinstellungen ein. Kostenlose Keys verfügbar. Wähle ein Modell, öffne ein Video — die Übersetzung startet automatisch.

## Funktionen
- **30 Übersetzungssprachen**, Oberfläche in 13 Sprachen
- **Zweisprachige Untertitel** — Original + Übersetzung gleichzeitig
- **Mehrere KI-Modelle** — Claude Sonnet für Qualität, Gemini Flash für Geschwindigkeit, DeepSeek für niedrige Kosten. Kostenlose Modelle verfügbar
- **Gemeinsamer Cache** — einer übersetzt, alle profitieren
- **Übersetzungskosten** werden direkt auf dem Video angezeigt, bevor du startest
- **Tastenkürzel** — `[` / `]` Timing ±0,5s verschieben, `B` Position umschalten, `\` Offset zurücksetzen
- **Stil-Anpassung** — Schriftart, Farbe, Transparenz, Position

## Ehrliche Einschränkungen
Das KI-Modell sieht nur Text — nicht das Video. Es weiß nicht, ob ein Mann oder eine Frau spricht, daher können geschlechtsspezifische Formen falsch sein. Es kann nicht immer zwischen formellem „Sie" und informellem „du" unterscheiden. Neologismen werden möglicherweise wörtlich übersetzt.
Das sind keine Fehler — das sind inhärente Grenzen einer reinen Text-Übersetzung. Ein menschlicher Übersetzer, der nur mit einem Transkript arbeitet, hätte dieselben Probleme.
**Was es gut kann:** Claude Sonnet liefert Übersetzungen, die mit guten Fansubs vergleichbar sind — Humor, Slang und Kontext bleiben erhalten. Bei den meisten Inhalten wirst du vergessen, dass du KI-generierte Untertitel liest.

## Datenschutz
- Dein API-Key bleibt auf deinem Gerät — wird niemals an einen Server gesendet, außer an den KI-Anbieter deiner Wahl
- Kein Tracking und keine Werbung in der Erweiterung (die Website verwendet anonyme Besuchsanalysen)
- [Datenschutzerklärung](https://podstr.cc/en/privacy/)

## Mitwirken
Fehlerberichte, Plattform-Anfragen und Pull Requests sind willkommen. Siehe [docs/CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz
MIT — [Anabasis Media DOO](https://podstr.cc)
