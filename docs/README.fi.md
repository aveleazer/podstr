<div align="center">

# Podstr — Tekstitykset tekoälykäännöksenä

**Käännä tekstitykset mille tahansa kielelle tekoälyllä.**
Chrome-laajennus: tunnistaa tekstitykset videoalustoilla ja kääntää ne reaaliajassa.

[Verkkosivusto](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Mikä tämä on?

Chrome-laajennus, joka kaappaa tekstitykset videosivustoilta ja kääntää ne tekoälymalleilla (Claude, Gemini, DeepSeek ym. OpenRouterin kautta). Toimii englannin-, espanjan-, saksan-, suomenkielisillä — millä tahansa tekstityksillä. Kääntää mille tahansa kielelle.

Jos joku on jo kääntänyt saman jakson, käännös latautuu jaetusta välimuistista välittömästi ja ilmaiseksi.

## Pika-aloitus

1. Asenna [Chrome Web Storesta](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Avaa video, jossa on tekstitykset → valitse kieli → valmista

Uuden sisällön kääntämiseen tarvitset [OpenRouter API -avaimen](https://openrouter.ai/keys) (ilmaisia avaimia saatavilla).

## Tuetut alustat

| Alusta | Tekstitykset | Tila |
|--------|-------------|------|
| **YouTube** | Manuaaliset CC (ei automaattisesti luodut) | Testattu |
| **BBC iPlayer** | TTML/EBU-TT-D | Testattu |
| **ARTE** | HLS-tekstitykset | Testattu |
| **Plex** | HLS-tekstitykset | Testattu |
| **Filmzie** | HLS-tekstitykset | Testattu |

Muut sivustot, joilla on HLS/VTT/TTML-tekstitykset, saattavat myös toimia — napsauta **Enable** laajennuksen ponnahdusikkunassa.

## Ominaisuudet

- **Mikä tahansa kieli** — kääntää mistä tahansa tekstityskielestä mille tahansa kohdekielelle
- **Useita tekoälymalleja** — valitse laadun ja hinnan mukaan. Ilmaisia malleja saatavilla
- **Käännöksen hinta** — näe kunkin käännöksen kustannus suoraan videolla
- **Jaettu välimuisti** — yksi kääntää, kaikki muut katsovat ilmaiseksi
- **Älykäs paikallinen välimuisti** — käännetyt tekstitykset latautuvat välittömästi uudelleenkatselussa
- **Ajoituksen säätö** — `[` / `]` siirtää ±0,5 sekuntia
- **Tyylin muokkaus** — fontti, väri, läpinäkyvyys, sijainti
- **Pikanäppäimet** — `B` vaihda sijaintia, `\` nollaa siirtymä
- **13 käyttöliittymäkieltä** — EN, RU, UK, BE, SR, ES, FR, DE, PT, ZH, JA, KO, TR

## Miten se toimii

1. **Tunnistus** — Service Worker kaappaa tekstityspyynnöt `chrome.webRequest`-rajapinnalla
2. **Lataus** — taustaskripti hakee tekstitykset ohittaen CORS-rajoitukset
3. **Käännös** — erissä OpenRouter API:n kautta (sinun avaimesi, sinun mallivalintasi)
4. **Välimuisti** — käännetty VTT pakataan gzip-muotoon, tallennetaan paikallisesti + jaettuun välimuistiin
5. **Renderöinti** — sisältöskripti näyttää tekstitykset synkronoituna videon toistoon

## UKK

**Tarvitsenko API-avaimen?** Ei, jos jakso on jo jaetussa välimuistissa. Uusiin käännöksiin tarvitset OpenRouter-avaimen.

**Onko se ilmainen?** Laajennus on ilmainen. Välimuistissa olevat käännökset ovat ilmaisia. Maksat vain uuden sisällön kääntämisestä tekoälypalveluntarjoajan kautta.

**Käännöksen laatu?** Riippuu mallista. Claude Opus on hyvien fanikäännösten tasolla. DeepSeek ja Gemini Flash ovat edullisempia mutta silti luettavia.

**Tyypillinen hinta?** $0,005–0,05 per jakso mallista riippuen. Ilmaisia malleja saatavilla.

## Yksityisyys

- API-avaimesi pysyy laitteellasi — sitä ei koskaan lähetetä millekään palvelimelle
- Ei seurantaa, ei analytiikkaa, ei mainoksia
- Tekstitysteksti lähetetään vain valitsemallesi tekoälypalveluntarjoajalle
- [Tietosuojakäytäntö](https://podstr.cc/en/privacy/)

## Osallistuminen

Katso [CONTRIBUTING.md](CONTRIBUTING.md)

## Lisenssi

MIT

## Linkit

- [podstr.cc](https://podstr.cc) — verkkosivusto
- [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
- [GitHub](https://github.com/aveleazer/podstr)
- [Telegram](https://t.me/podstrcc)
