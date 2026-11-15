<div align="center">

# Podstr — KI-Untertitelübersetzung

**Übersetze Untertitel in jede Sprache mit KI.**
Chrome-Erweiterung: erkennt Untertitel auf Videoplattformen und übersetzt sie in Echtzeit.

[Website](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Was ist das

Eine Chrome-Erweiterung, die Untertitel auf Videoseiten abfängt und sie mithilfe von KI-Modellen übersetzt (Claude, Gemini, DeepSeek u.a. über OpenRouter). Funktioniert mit englischen, spanischen, deutschen, finnischen — beliebigen Untertiteln. Übersetzt in jede Sprache.

Eine Episode, die du schon übersetzt hast, lädt beim erneuten Ansehen sofort aus dem lokalen Cache deines Browsers.

## Ich will schauen

1. Installiere aus dem [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Öffne ein Video mit Untertiteln → wähle die Sprache im Picker → fertig

## Ich will übersetzen

### Über OpenRouter API (Bezahlung pro Token)

1. Hol dir einen Schlüssel auf [openrouter.ai](https://openrouter.ai/)
2. Füge den Schlüssel in den Erweiterungseinstellungen ein
3. Wähle ein Modell und eine Sprache → die Übersetzung startet automatisch

> Die Kosten hängen vom Modell ab: DeepSeek V3 — ab $0,01 pro Episode, Claude Opus — $5–15 pro Stunden-Episode.

### Über Claude CLI (kostenlos mit Max-Abo)

Ausführliche Anleitung: [CONTRIBUTING.md](CONTRIBUTING.md)

## Getestete Plattformen

| Plattform | Untertitel | Status |
|------|------|------|
| **YouTube** | Manual CC (not auto-generated) — primary `/api/timedtext` + transcript-panel fallback | Getestet |
| **Netflix** | TTML via Cadmium player API | Getestet |
| **BBC iPlayer** | TTML/EBU-TT-D | Getestet |
| **RaiPlay** | SRT via MAIN-world fetch interceptor | Getestet |
| **kino.pub** | HLS subtitles (Vidstack player) | Getestet |
| **RTS Planeta** | Native HTML5 `<track>` | Getestet |
| **ARTE** | HLS subtitles | Getestet |
| **Plex** | HLS subtitles | Getestet |
| **Filmzie** | HLS subtitles | Getestet |

Andere Websites mit HLS / VTT / TTML / nativen `<track>`-Untertiteln können ebenfalls funktionieren — klicke **Enable** im Popup der Erweiterung.

## Funktionen

- **Mehrsprachig** — übersetzt von jeder Sprache in jede andere. Deutsch als Standard
- **Auswahl des KI-Modells** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama über OpenRouter
- **Übersetzungskosten** — die Kosten werden direkt im Video angezeigt
- **Timing-Anpassung** — `[` / `]` zum Verschieben um ±0,5s
- **Darstellung anpassen** — Schriftart, Farbe, Deckkraft, Position

## FAQ

### Brauche ich einen API-Schlüssel?

Ja — neue Übersetzungen laufen über deinen eigenen OpenRouter-Schlüssel. Was du schon übersetzt hast, kommt beim erneuten Ansehen ohne Schlüssel aus dem lokalen Cache.

### Ist es kostenlos?

Die Erweiterung ist kostenlos. Bezahlt wird nur der KI-Anbieter für neue Übersetzungen; erneutes Ansehen deiner Übersetzungen ist kostenlos.

### Wie ist die Übersetzungsqualität?

Hängt vom Modell ab. Claude Opus ist auf dem Niveau guter Fansubs — mit Humor, Slang und Kontext. DeepSeek und Gemini Flash sind günstiger, aber trotzdem gut lesbar.

## Website

[podstr.cc](https://podstr.cc) — Modellvergleich, Plattformen, Installationsanleitung.

## Lizenz

MIT
