[English](../README.md)

# Podstr

**Jälkiäänitys tuhoaa näyttelijäsuorituksen. Alustojen tekstitykset ovat Google Translate -tasoa. Ansaitset parempaa.**

Podstr on Chrome-laajennus, joka kääntää tekstitykset tekoälyllä — Claude, Gemini, DeepSeek — suoraan selaimessasi. Kuulet alkuperäiset äänet. Luet tekstityksiä, jotka ymmärtävät kontekstin, huumorin ja slangin.

[Verkkosivu](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## Miten se toimii
1. Asenna laajennus Chrome Web Storesta
2. Avaa video YouTubessa, ARTEssa tai millä tahansa tuetulla sivustolla
3. Valitse kielesi tekstitysvalitsimesta videon yläpuolelta
4. Tekstitykset ilmestyvät videon päälle — tekoälyn kääntäminä

Jos joku on jo kääntänyt saman jakson, se latautuu jaetusta välimuistista — välittömästi ja ilmaiseksi.

## Miksi alustan omat tekstitykset eivät riitä
| | Alustan tekstitykset / Google Translate | Podstr |
|---|---|---|
| **Konteksti** | Rivi kerrallaan, ei tietoisuutta dialogista | Eräkäännös täydellä kontekstilla |
| **Huumori ja slangi** | Kirjaimellinen, usein väärä | Ymmärtää vitsit, idiomit ja kulttuuriviittaukset |
| **Kieliparit** | Rajoitettu alustan tarjontaan | Mikä tahansa kieli → mikä tahansa 30 kielestä |
| **Laadunhallinta** | Ota mitä saat | Valitse mallisi: Claude laatuun, Gemini nopeuteen, DeepSeek hintaan |
| **Kaksoistekstitykset** | Harvoin saatavilla | Alkuperäinen + käännös näytöllä yhtä aikaa |
| **Hinta** | Ilmainen (ja se näkyy) | Alkaen 0,007 $ per jakso. Ilmaisia malleja saatavilla |

## Tuetut alustat
| Alusta | Tekstitykset | Tila |
|--------|-------------|------|
| **YouTube** | Manuaaliset CC-tekstitykset (ei automaattisesti luodut) | Testattu |
| **BBC iPlayer** | TTML/EBU-TT-D | Testattu |
| **ARTE** | HLS-tekstitykset | Testattu |
| **Plex** | HLS-tekstitykset | Testattu |
| **Filmzie** | HLS-tekstitykset | Testattu |
| **Netflix** | — | Saattaa toimia, ei testattu |

Muut sivustot, joilla on HLS/VTT/TTML-tekstitykset, saattavat toimia — napsauta **Enable** laajennuksen ponnahdusikkunassa.

## Pikaopas
**Haluat vain katsoa** — asenna [Chrome Web Storesta](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih), avaa video, valitse kieli. Jos jakso on jaetussa välimuistissa, toisto alkaa välittömästi.
**Haluat kääntää uutta sisältöä** — liitä [OpenRouter API -avain](https://openrouter.ai/keys) laajennuksen asetuksiin. Ilmaisia avaimia saatavilla. Valitse malli, avaa video — käännös alkaa automaattisesti.

## Ominaisuudet
- **30 käännöskieltä**, käyttöliittymä 13 kielellä
- **Kaksoistekstitykset** — alkuperäinen + käännös samanaikaisesti
- **Useita tekoälymalleja** — Claude Sonnet laatuun, Gemini Flash nopeuteen, DeepSeek hintaan. Ilmaisia malleja saatavilla
- **Jaettu välimuisti** — yksi kääntää, kaikki hyötyvät
- **Käännöksen hinta** näytetään suoraan videolla ennen aloitusta
- **Pikanäppäimet** — `[` / `]` ajoituksen siirto ±0,5 s, `B` sijainnin vaihto, `\` offsetin nollaus
- **Tyylin muokkaus** — fontti, väri, läpinäkyvyys, sijainti

## Rehelliset rajoitukset
Tekoälymalli näkee vain tekstin — ei videota. Se ei tiedä, puhuuko mies vai nainen, joten sukupuolitetut muodot voivat mennä väärin. Se ei aina erota teitittelyä sinuttelusta. Uudissanat saatetaan kääntää kirjaimellisesti.
Nämä eivät ole bugeja — ne ovat pelkän tekstin käännöksen luontaisia rajoituksia. Ihmiskääntäjä, joka työskentelisi pelkän tekstin pohjalta, kohtaisi samat ongelmat.
**Missä se loistaa:** Claude Sonnet tuottaa käännöksiä, jotka ovat verrattavissa hyviin fansubeihin — huumori, slangi ja konteksti säilyvät. Useimmissa sisällöissä unohdat lukevasi tekoälyn tekemiä tekstityksiä.

## Yksityisyys
- API-avaimesi pysyy laitteellasi — sitä ei koskaan lähetetä mihinkään palvelimeen paitsi valitsemallesi tekoälypalveluntarjoajalle
- Ei seurantaa tai mainoksia laajennuksessa (verkkosivusto käyttää Yandex.Metrikaa anonyymeissä kävijätilastoissa)
- [Tietosuojakäytäntö](https://podstr.cc/en/privacy/)

## Osallistuminen
Bugi-ilmoitukset, alustapyynnöt ja pull requestit ovat tervetulleita. Katso [docs/CONTRIBUTING.md](CONTRIBUTING.md).

## Lisenssi
MIT — [Anabasis Media DOO](https://podstr.cc)
