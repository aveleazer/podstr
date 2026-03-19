<div align="center">

# Podstr — AI prevod titlova

**Prevod titlova na bilo koji jezik pomoću AI.**
Chrome ekstenzija: pronalazi titlove na video platformama i prevodi ih u realnom vremenu.

[Sajt](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Šta je ovo

Ekstenzija presreće titlove na video sajtovima i prevodi ih kroz AI modele (Claude, Gemini, DeepSeek i dr. preko OpenRouter-a). Radi sa engleskim, španskim, nemačkim, finskim — bilo kojim titlovima. Prevodi na bilo koji jezik.

Ako je neko već preveo ovu epizodu — prevod se povlači iz zajedničkog keša trenutno i besplatno.

## Hoću da gledam

1. Instaliraj iz [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Otvori video sa titlovima → izaberi jezik u pikeru → gotovo

## Hoću da prevodim

### Preko OpenRouter API (plaćanje po tokenima)

1. Uzmi ključ na [openrouter.ai](https://openrouter.ai/)
2. Unesi ključ u podešavanjima ekstenzije
3. Izaberi model i jezik → prevod se pokreće automatski

> Cena zavisi od modela: DeepSeek V3 — od $0.01 po seriji, Claude Opus — $5–15 po jednosatnoj epizodi.

### Preko Claude CLI (besplatno sa Max pretplatom)

Detaljna uputstva: [CONTRIBUTING.md](CONTRIBUTING.md)

## Testirane platforme

| Platforma | Titlovi | Status |
|-----------|---------|--------|
| **YouTube** | Ručni CC (ne automatski generisani) | Testirano |
| **Kinopab** | HLS titlovi | Testirano |
| **ARTE** | HLS titlovi | Testirano |
| **Filmzie** | HLS titlovi | Testirano |
| **BBC iPlayer** | TTML/EBU-TT-D | Testirano |

Drugi sajtovi sa HLS titlovima mogu raditi — kliknite **Enable** u popup-u ekstenzije.

## Mogućnosti

- **Višejezičnost** — prevodi sa bilo kog jezika na bilo koji. Srpski podrazumevano
- **Izbor AI modela** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama preko OpenRouter-a
- **Zajednički keš** — jedan prevede, ostali gledaju besplatno
- **Cena prevoda** — vidljivo koliko je prevod koštao direktno na videu
- **Podešavanje tajminga** — `[` / `]` za pomeranje ±0.5s
- **Podešavanje izgleda** — font, boja, providnost, pozicija

## FAQ

### Da li mi treba API ključ?

Ne, ako je ovu epizodu već neko preveo (zajednički keš). Za novi prevod — potreban je ključ za OpenRouter ili pretplata na Claude Max.

### Da li je besplatno?

Ekstenzija je besplatna. Prevodi iz zajedničkog keša — besplatni. Plaća se samo za prevod novog sadržaja preko OpenRouter API.

### Kakav je kvalitet prevoda?

Zavisi od modela. Claude Opus — na nivou dobrog fansaba, sa humorom, slengom i kontekstom. DeepSeek i Gemini Flash — jeftiniji, ali i dalje čitljivi.

## Sajt

[podstr.cc](https://podstr.cc) — poređenje modela, platforme, uputstvo za instalaciju.

## Licenca

MIT
