<div align="center">

# Podstr — Traducción de subtítulos con IA

**Traduce subtítulos a cualquier idioma con IA.**
Extensión de Chrome: detecta subtítulos en plataformas de vídeo y los traduce en tiempo real.

[Sitio web](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Qué es

Una extensión de Chrome que intercepta subtítulos en sitios de vídeo y los traduce mediante modelos de IA (Claude, Gemini, DeepSeek, etc. a través de OpenRouter). Funciona con subtítulos en inglés, español, alemán, finés o cualquier otro idioma. Traduce a cualquier idioma.

Volver a ver un episodio que ya tradujiste carga la traducción al instante desde la caché local de tu navegador.

## Quiero ver

1. Instala desde [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Abre un vídeo con subtítulos → elige el idioma en el selector → listo

## Quiero traducir

### A través de OpenRouter API (pago por tokens)

1. Obtén una clave en [openrouter.ai](https://openrouter.ai/)
2. Pega la clave en los ajustes de la extensión
3. Elige un modelo e idioma → la traducción se inicia automáticamente

> El coste depende del modelo: DeepSeek V3 — desde $0.01 por episodio, Claude Opus — $5–15 por episodio de una hora.

### A través de Claude CLI (gratis con suscripción Max)

Instrucciones detalladas: [CONTRIBUTING.md](CONTRIBUTING.md)

## Plataformas verificadas

| Plataforma | Subtítulos | Estado |
|------|------|------|
| **YouTube** | Manual CC (not auto-generated) — primary `/api/timedtext` + transcript-panel fallback | Verificado |
| **Netflix** | TTML via Cadmium player API | Verificado |
| **BBC iPlayer** | TTML/EBU-TT-D | Verificado |
| **RaiPlay** | SRT via MAIN-world fetch interceptor | Verificado |
| **kino.pub** | HLS subtitles (Vidstack player) | Verificado |
| **RTS Planeta** | Native HTML5 `<track>` | Verificado |
| **ARTE** | HLS subtitles | Verificado |
| **Plex** | HLS subtitles | Verificado |
| **Filmzie** | HLS subtitles | Verificado |

Otros sitios con subtítulos HLS / VTT / TTML / `<track>` nativo también pueden funcionar — haz clic en **Enable** en el popup de la extensión.

## Funcionalidades

- **Multilingüe** — traduce de cualquier idioma a cualquier otro. Español por defecto
- **Elección de modelo IA** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama a través de OpenRouter
- **Coste de traducción** — se muestra cuánto costó la traducción directamente sobre el vídeo
- **Ajuste de sincronización** — `[` / `]` para desplazar ±0.5s
- **Personalización visual** — fuente, color, opacidad, posición

## FAQ

### ¿Necesito una clave API?

Sí: las traducciones nuevas se hacen con tu propia clave de OpenRouter. Lo que ya tradujiste se vuelve a ver desde la caché local sin clave.

### ¿Es gratis?

La extensión es gratuita. Solo pagas al proveedor de IA por las traducciones nuevas; volver a ver tus traducciones es gratis.

### ¿Qué calidad tiene la traducción?

Depende del modelo. Claude Opus está al nivel de un buen fansub, con humor, jerga y contexto. DeepSeek y Gemini Flash son más baratos pero igualmente legibles.

## Sitio web

[podstr.cc](https://podstr.cc) — comparación de modelos, plataformas, instrucciones de instalación.

## Licencia

MIT
