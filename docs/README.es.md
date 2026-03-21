[English](../README.md)

# Podstr

**El doblaje mata la actuación. Los subtítulos integrados tienen calidad de Google Translate. Te mereces algo mejor.**

Podstr es una extensión de Chrome que traduce subtítulos usando IA — Claude, Gemini, DeepSeek — directamente en tu navegador. Escuchas las voces originales. Lees subtítulos que realmente entienden el contexto, el humor y la jerga.

[Sitio web](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## Cómo funciona
1. Instala la extensión desde Chrome Web Store
2. Abre un vídeo en YouTube, ARTE o cualquier sitio compatible
3. Elige tu idioma en el selector de subtítulos sobre el vídeo
4. Los subtítulos aparecen sobre el vídeo — traducidos por IA

Si alguien ya tradujo el mismo episodio, se carga desde una caché compartida — al instante y gratis.

## Por qué no usar los subtítulos de la plataforma
| | Subs de la plataforma / Google Translate | Podstr |
|---|---|---|
| **Contexto** | Línea por línea, sin noción del diálogo | Traducción por lotes con contexto completo |
| **Humor y jerga** | Literal, a menudo incorrecto | Capta chistes, modismos y referencias culturales |
| **Pares de idiomas** | Limitado a lo que ofrece la plataforma | Cualquier idioma → cualquiera de 30 idiomas |
| **Control de calidad** | Lo que hay es lo que hay | Elige tu modelo: Claude para calidad, Gemini para velocidad, DeepSeek para ahorro |
| **Subtítulos duales** | Rara vez disponibles | Original + traducción en pantalla a la vez |
| **Coste** | Gratis (y se nota) | Desde $0.007 por episodio. Modelos gratuitos disponibles |

## Plataformas compatibles
| Plataforma | Subtítulos | Estado |
|------------|------------|--------|
| **YouTube** | CC manuales (no autogenerados) | Probado |
| **BBC iPlayer** | TTML/EBU-TT-D | Probado |
| **ARTE** | Subtítulos HLS | Probado |
| **Plex** | Subtítulos HLS | Probado |
| **Filmzie** | Subtítulos HLS | Probado |
| **Netflix** | — | Podría funcionar, no probado |

Otros sitios con subtítulos HLS/VTT/TTML podrían funcionar — haz clic en **Enable** en el popup de la extensión.

## Inicio rápido
**Solo quieres ver** — instala desde [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih), abre un vídeo, elige un idioma. Si el episodio está en la caché compartida, se reproduce de inmediato.
**Quieres traducir contenido nuevo** — pega una [clave API de OpenRouter](https://openrouter.ai/keys) en los ajustes de la extensión. Hay claves gratuitas disponibles. Elige un modelo, abre un vídeo — la traducción comienza automáticamente.

## Características
- **30 idiomas de traducción**, interfaz en 13 idiomas
- **Subtítulos duales** — original + traducción simultáneamente
- **Múltiples modelos de IA** — Claude Sonnet para calidad, Gemini Flash para velocidad, DeepSeek para ahorro. Modelos gratuitos disponibles
- **Caché compartida** — una persona traduce, todos se benefician
- **Coste de traducción** mostrado directamente sobre el vídeo antes de empezar
- **Atajos de teclado** — `[` / `]` ajustan el timing ±0.5s, `B` cambia la posición, `\` restablece el offset
- **Personalización de estilo** — fuente, color, opacidad, posición

## Limitaciones honestas
El modelo de IA solo ve texto — no el vídeo. No sabe si habla un hombre o una mujer, así que las formas de género pueden ser incorrectas. No siempre distingue entre el "tú" y el "usted". Los neologismos pueden traducirse literalmente.
Esto no son bugs — son limitaciones inherentes de la traducción basada solo en texto. Un traductor humano trabajando únicamente con la transcripción tendría los mismos problemas.
**Lo que hace bien:** Claude Sonnet produce traducciones comparables a buenos fansubs — humor, jerga y contexto intactos. Con la mayoría del contenido, olvidarás que estás leyendo subtítulos generados por IA.

## Privacidad
- Tu clave API se queda en tu dispositivo — nunca se envía a ningún servidor excepto al proveedor de IA que elijas
- Sin rastreo ni anuncios en la extensión (el sitio web usa analíticas anónimas de visitas)
- [Política de privacidad](https://podstr.cc/en/privacy/)

## Contribuir
Reportes de bugs, solicitudes de plataformas y PRs son bienvenidos. Consulta [docs/CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia
MIT — [Anabasis Media DOO](https://podstr.cc)
