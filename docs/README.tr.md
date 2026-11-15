<div align="center">

# Podstr — Yapay Zeka ile Altyazı Çevirisi

**Altyazıları yapay zeka ile istediğiniz dile çevirin.**
Chrome uzantısı: Video platformlarındaki altyazıları algılar ve gerçek zamanlı olarak çevirir.

[Web Sitesi](https://podstr.cc) · [Chrome Web Mağazası](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Nedir?

Video sitelerindeki altyazıları yakalayıp yapay zeka modelleri (Claude, Gemini, DeepSeek vb., OpenRouter üzerinden) ile çeviren bir Chrome uzantısı. İngilizce, İspanyolca, Almanca, Fince — her dildeki altyazıyla çalışır. İstediğiniz dile çevirir.

Daha önce çevirdiğiniz bir bölüm, tekrar izlerken tarayıcınızın yerel önbelleğinden anında yüklenir.

## Hızlı Başlangıç

1. [Chrome Web Mağazası](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)'ndan yükleyin
2. Altyazılı bir video açın → dil seçin → hazır

Yeni içerik çevirmek için bir [OpenRouter API anahtarı](https://openrouter.ai/keys) gerekir (ücretsiz anahtarlar mevcut).

## Desteklenen Platformlar

| Platform | Altyazılar | Durum |
|------|------|------|
| **YouTube** | Manual CC (not auto-generated) — primary `/api/timedtext` + transcript-panel fallback | Test edildi |
| **Netflix** | TTML via Cadmium player API | Test edildi |
| **BBC iPlayer** | TTML/EBU-TT-D | Test edildi |
| **RaiPlay** | SRT via MAIN-world fetch interceptor | Test edildi |
| **kino.pub** | HLS subtitles (Vidstack player) | Test edildi |
| **RTS Planeta** | Native HTML5 `<track>` | Test edildi |
| **ARTE** | HLS subtitles | Test edildi |
| **Plex** | HLS subtitles | Test edildi |
| **Filmzie** | HLS subtitles | Test edildi |

HLS / VTT / TTML / yerel `<track>` altyazılı diğer siteler de çalışabilir — uzantı açılır penceresinde **Enable**'a tıklayın.

## Özellikler

- **Her dil** — herhangi bir altyazı dilinden herhangi bir hedef dile çeviri
- **Birden fazla yapay zeka modeli** — kalite ve fiyata göre seçin. Ücretsiz modeller mevcut
- **Çeviri maliyeti** — her çevirinin ne kadara mal olduğunu doğrudan video üzerinde görün
- **Akıllı yerel önbellek** — tekrar izlemede çevrilmiş altyazılar anında yüklenir
- **Zamanlama ayarı** — `[` / `]` ile ±0,5 saniye kaydırma
- **Stil özelleştirme** — yazı tipi, renk, saydamlık, konum
- **Klavye kısayolları** — `B` konum değiştir, `\` ofseti sıfırla
- **13 arayüz dili** — EN, RU, UK, BE, SR, ES, FR, DE, PT, ZH, JA, KO, TR

## Nasıl Çalışır

1. **Algılama** — Service Worker, `chrome.webRequest` ile altyazı isteklerini yakalar
2. **İndirme** — Arka plan betiği CORS'u atlayarak altyazıları indirir
3. **Çeviri** — OpenRouter API üzerinden toplu çeviri (sizin anahtarınız, sizin model seçiminiz)
4. **Önbellek** — Çevrilmiş VTT gzip ile sıkıştırılıp tarayıcıda yerel olarak saklanır
5. **Görüntüleme** — İçerik betiği, altyazıları video oynatımıyla senkronize gösterir

## SSS

**API anahtarı gerekli mi?** Evet — yeni çeviriler kendi OpenRouter anahtarınızla yapılır. Çevirdikleriniz tekrar izlemede anahtarsız olarak yerel önbellekten gelir.

**Ücretsiz mi?** Uzantı ücretsiz. Yalnızca yeni çeviriler için yapay zeka sağlayıcısına ödeme yaparsınız; kendi çevirilerinizi tekrar izlemek ücretsizdir.

**Çeviri kalitesi nasıl?** Modele bağlı. Claude Opus, kaliteli hayran altyazıları seviyesinde. DeepSeek ve Gemini Flash daha ucuz ama yine de okunabilir.

**Tipik maliyet ne kadar?** Modele göre bölüm başına $0,005–0,05. Ücretsiz modeller mevcut.

## Gizlilik

- API anahtarınız cihazınızda kalır — hiçbir sunucuya gönderilmez
- İzleme, analitik veya reklam yok
- Altyazı metni yalnızca seçtiğiniz yapay zeka sağlayıcısına gönderilir
- [Gizlilik politikası](https://podstr.cc/en/privacy/)

## Katkıda Bulunma

[CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bakın

## Lisans

MIT

## Bağlantılar

- [podstr.cc](https://podstr.cc) — web sitesi
- [Chrome Web Mağazası](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
- [GitHub](https://github.com/aveleazer/podstr)
- [Telegram](https://t.me/podstrcc)
