[English](../README.md)

# Podstr

**Sinhronizacija ubija glumu. Ugrađeni titlovi su na nivou Google Translate-a. Zaslužuješ bolje.**

Podstr je Chrome ekstenzija koja prevodi titlove pomoću AI-ja — Claude, Gemini, DeepSeek — direktno u tvom pretraživaču. Čuješ originalne glasove. Čitaš titlove koji zaista razumeju kontekst, humor i sleng.

[Sajt](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## Kako radi
1. Instaliraj ekstenziju iz Chrome Web Store
2. Otvori video na YouTube-u, ARTE-u ili bilo kom podržanom sajtu
3. Izaberi jezik u pikeru za titlove iznad videa
4. Titlovi se pojavljuju preko videa — prevedeni pomoću AI-ja

Ako je neko već preveo istu epizodu, učitava se iz zajedničkog keša — trenutno i besplatno.

## Zašto ne koristiti titlove sa platforme
| | Titlovi platforme / Google Translate | Podstr |
|---|---|---|
| **Kontekst** | Red po red, bez svesti o dijalogu | Prevod u grupama sa punim kontekstom |
| **Humor i sleng** | Doslovce, često pogrešno | Razume šale, idiome, kulturne reference |
| **Jezički parovi** | Ograničeno na ono što platforma nudi | Bilo koji jezik → bilo koji od 30 jezika |
| **Kontrola kvaliteta** | Uzmi šta dobiješ | Izaberi model: Claude za kvalitet, Gemini za brzinu, DeepSeek za cenu |
| **Dvojni titlovi** | Retko dostupno | Original + prevod zajedno na ekranu |
| **Cena** | Besplatno (i vidi se) | Od $0,007 po epizodi. Dostupni besplatni modeli |

## Podržane platforme
| Platforma | Titlovi | Status |
|-----------|---------|--------|
| **YouTube** | Ručni CC (ne automatski generisani) | Testirano |
| **BBC iPlayer** | TTML/EBU-TT-D | Testirano |
| **ARTE** | HLS titlovi | Testirano |
| **Plex** | HLS titlovi | Testirano |
| **Filmzie** | HLS titlovi | Testirano |
| **Netflix** | — | Možda radi, nije testirano |

Drugi sajtovi sa HLS/VTT/TTML titlovima mogu raditi — klikni **Enable** u popup-u ekstenzije.

## Brzi početak
**Samo želiš da gledaš** — instaliraj iz [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih), otvori video, izaberi jezik. Ako je epizoda u zajedničkom kešu, pušta se odmah.
**Želiš da prevodiš novi sadržaj** — unesi [OpenRouter API ključ](https://openrouter.ai/keys) u podešavanja ekstenzije. Dostupni su besplatni ključevi. Izaberi model, otvori video — prevod počinje automatski.

## Mogućnosti
- **30 jezika za prevod**, interfejs na 13 jezika
- **Dvojni titlovi** — original + prevod istovremeno
- **Više AI modela** — Claude Sonnet za kvalitet, Gemini Flash za brzinu, DeepSeek za cenu. Dostupni besplatni modeli
- **Zajednički keš** — jedan prevede, svi imaju korist
- **Cena prevoda** se prikazuje direktno na videu pre nego što počneš
- **Prečice na tastaturi** — `[` / `]` pomeranje tajminga ±0,5s, `B` promena pozicije, `\` resetovanje ofseta
- **Podešavanje izgleda** — font, boja, providnost, pozicija

## Iskrena ograničenja
AI model vidi samo tekst — ne i video. Ne zna da li govori muškarac ili žena, pa mogu da pogreše rodni oblici. Ne može uvek da razlikuje formalno „Vi" od neformalnog „ti". Neologizmi mogu biti prevedeni doslovno.
To nisu bagovi — to su inherentna ograničenja prevoda samo na osnovu teksta. Ljudski prevodilac koji radi samo sa transkriptom suočio bi se sa istim problemima.
**U čemu je dobar:** Claude Sonnet proizvodi prevode uporedive sa dobrim fansabovima — humor, sleng i kontekst su sačuvani. Za većinu sadržaja, zaboravićeš da čitaš titlove koje je generisao AI.

## Privatnost
- Tvoj API ključ ostaje na tvom uređaju — nikada se ne šalje ni na jedan server osim AI provajderu koji izabereš
- Bez praćenja i reklama u ekstenziji (sajt koristi anonimnu analitiku poseta)
- [Politika privatnosti](https://podstr.cc/en/privacy/)

## Doprinos
Prijave bagova, zahtevi za platforme i PR-ovi su dobrodošli. Pogledaj [docs/CONTRIBUTING.md](CONTRIBUTING.md).

## Licenca
MIT — [Anabasis Media DOO](https://podstr.cc)
