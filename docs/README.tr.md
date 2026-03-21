[English](../README.md)

# Podstr

**Dublaj performansı öldürür. Yerleşik altyazılar Google Translate kalitesinde. Daha iyisini hak ediyorsunuz.**

Podstr, altyazıları yapay zeka ile — Claude, Gemini, DeepSeek — doğrudan tarayıcınızda çeviren bir Chrome uzantısıdır. Orijinal sesleri duyarsınız. Bağlamı, espriyi ve argo ifadeleri gerçekten anlayan altyazılar okursunuz.

[Web Sitesi](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

---

## Nasıl Çalışır
1. Uzantıyı Chrome Web Store'dan yükleyin
2. YouTube, ARTE veya desteklenen herhangi bir sitede bir video açın
3. Videonun üzerindeki altyazı seçicisinden dilinizi seçin
4. Altyazılar videonun üzerinde görünür — yapay zeka tarafından çevrilmiş olarak

Aynı bölümü daha önce biri çevirdiyse, ortak önbellekten anında ve ücretsiz olarak yüklenir.

## Neden Platform Altyazılarını Kullanmayalım
| | Platform altyazıları / Google Translate | Podstr |
|---|---|---|
| **Bağlam** | Satır satır, diyalog bilinci yok | Tam bağlamla toplu çeviri |
| **Espri ve argo** | Kelimesi kelimesine, çoğu zaman yanlış | Şakaları, deyimleri, kültürel referansları yakalar |
| **Dil çiftleri** | Platformun sunduğuyla sınırlı | Herhangi bir dil → 30 dilden herhangi birine |
| **Kalite kontrolü** | Ne verildiyse o | Modelinizi seçin: kalite için Claude, hız için Gemini, maliyet için DeepSeek |
| **Çift altyazı** | Nadiren mevcut | Orijinal + çeviri ekranda birlikte |
| **Maliyet** | Ücretsiz (ve belli oluyor) | Bölüm başına $0,007'den başlayan fiyatlar. Ücretsiz modeller mevcut |

## Desteklenen Platformlar
| Platform | Altyazılar | Durum |
|----------|-----------|--------|
| **YouTube** | Manuel CC (otomatik oluşturulan değil) | Test edildi |
| **BBC iPlayer** | TTML/EBU-TT-D | Test edildi |
| **ARTE** | HLS altyazıları | Test edildi |
| **Plex** | HLS altyazıları | Test edildi |
| **Filmzie** | HLS altyazıları | Test edildi |
| **Netflix** | — | Çalışabilir, test edilmedi |

HLS/VTT/TTML altyazılı diğer siteler de çalışabilir — uzantı açılır penceresinde **Enable**'a tıklayın.

## Hızlı Başlangıç
**Sadece izlemek istiyorsanız** — [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)'dan yükleyin, bir video açın, dil seçin. Bölüm ortak önbellekteyse anında oynatılır.
**Yeni içerik çevirmek istiyorsanız** — uzantı ayarlarına bir [OpenRouter API anahtarı](https://openrouter.ai/keys) yapıştırın. Ücretsiz anahtarlar mevcut. Bir model seçin, video açın — çeviri otomatik olarak başlar.

## Özellikler
- **30 çeviri dili**, 13 dilde arayüz
- **Çift altyazı** — orijinal + çeviri aynı anda
- **Birden fazla yapay zeka modeli** — kalite için Claude Sonnet, hız için Gemini Flash, maliyet için DeepSeek. Ücretsiz modeller mevcut
- **Ortak önbellek** — bir kişi çevirir, herkes faydalanır
- **Çeviri maliyeti** başlamadan önce doğrudan video üzerinde gösterilir
- **Klavye kısayolları** — `[` / `]` zamanlamayı ±0,5 saniye kaydırır, `B` konumu değiştirir, `\` ofseti sıfırlar
- **Stil özelleştirme** — yazı tipi, renk, saydamlık, konum

## Dürüst Sınırlamalar
Yapay zeka modeli yalnızca metni görür — videoyu değil. Konuşanın kadın mı erkek mi olduğunu bilemez, bu yüzden cinsiyete bağlı ifadeler yanlış olabilir. Resmi "siz" ile samimi "sen" arasındaki farkı her zaman ayırt edemez. Neolojizmler kelimesi kelimesine çevrilebilir.
Bunlar hata değildir — yalnızca metne dayalı çevirinin doğal sınırlarıdır. Sadece transkriptten çalışan bir insan çevirmen de aynı sorunlarla karşılaşırdı.
**İyi yaptığı şey:** Claude Sonnet, iyi fansub'larla karşılaştırılabilir çeviriler üretir — espri, argo ve bağlam korunur. Çoğu içerikte yapay zeka tarafından oluşturulmuş altyazı okuduğunuzu unutursunuz.

## Gizlilik
- API anahtarınız cihazınızda kalır — seçtiğiniz yapay zeka sağlayıcısı dışında hiçbir sunucuya gönderilmez
- Uzantıda izleme veya reklam yoktur (web sitesi anonim ziyaret analizleri kullanır)
- [Gizlilik politikası](https://podstr.cc/en/privacy/)

## Katkıda Bulunma
Hata raporları, platform talepleri ve PR'lar memnuniyetle karşılanır. [docs/CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bakın.

## Lisans
MIT — [Anabasis Media DOO](https://podstr.cc)
