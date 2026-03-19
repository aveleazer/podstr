<div align="center">

# Podstr — Traducción de subtítulos con IA

**Traduce subtítulos a cualquier idioma con IA.**
Extensión de Chrome: detecta subtítulos en plataformas de vídeo y los traduce en tiempo real.

[Sitio web](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Qué es

Una extensión de Chrome que intercepta subtítulos en sitios de vídeo y los traduce mediante modelos de IA (Claude, Gemini, DeepSeek, etc. a través de OpenRouter). Funciona con subtítulos en inglés, español, alemán, finés o cualquier otro idioma. Traduce a cualquier idioma.

Si alguien ya tradujo el mismo episodio, la traducción se carga desde la caché compartida de forma instantánea y gratuita.

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
|------------|------------|--------|
| **YouTube** | CC manuales (no autogenerados) | Verificado |
| **Kinopab** | Subtítulos HLS | Verificado |
| **ARTE** | Subtítulos HLS | Verificado |
| **Filmzie** | Subtítulos HLS | Verificado |
| **BBC iPlayer** | TTML/EBU-TT-D | Verificado |

Otros sitios con subtítulos HLS pueden funcionar — haz clic en **Enable** en el popup de la extensión.

## Funcionalidades

- **Multilingüe** — traduce de cualquier idioma a cualquier otro. Español por defecto
- **Elección de modelo IA** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama a través de OpenRouter
- **Caché compartida** — una persona traduce, el resto lo ve gratis
- **Coste de traducción** — se muestra cuánto costó la traducción directamente sobre el vídeo
- **Ajuste de sincronización** — `[` / `]` para desplazar ±0.5s
- **Personalización visual** — fuente, color, opacidad, posición

## FAQ

### ¿Necesito una clave API?

No, si el episodio ya fue traducido por alguien (caché compartida). Para una traducción nueva necesitas una clave de OpenRouter o una suscripción a Claude Max.

### ¿Es gratis?

La extensión es gratuita. Las traducciones de la caché compartida son gratuitas. Solo se paga por traducir contenido nuevo a través de OpenRouter API.

### ¿Qué calidad tiene la traducción?

Depende del modelo. Claude Opus está al nivel de un buen fansub, con humor, jerga y contexto. DeepSeek y Gemini Flash son más baratos pero igualmente legibles.

## Sitio web

[podstr.cc](https://podstr.cc) — comparación de modelos, plataformas, instrucciones de instalación.

## Licencia

MIT
