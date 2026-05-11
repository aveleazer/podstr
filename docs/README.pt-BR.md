<div align="center">

# Podstr — Tradução de Legendas com IA

**Traduza legendas para qualquer idioma com IA.**
Extensão para Chrome: detecta legendas em plataformas de vídeo e traduz em tempo real.

[Site](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## O que é

Uma extensão para Chrome que intercepta legendas em sites de vídeo e as traduz usando modelos de IA (Claude, Gemini, DeepSeek, etc. via OpenRouter). Funciona com legendas em inglês, espanhol, alemão, finlandês — qualquer idioma. Traduz para qualquer idioma.

Se alguém já traduziu o mesmo episódio, a tradução é carregada do cache compartilhado — instantaneamente e de graça.

## Início Rápido

1. Instale pela [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Abra um vídeo com legendas → escolha o idioma → pronto

Para traduzir conteúdo novo, você precisa de uma [chave de API do OpenRouter](https://openrouter.ai/keys) (chaves gratuitas disponíveis).

## Plataformas Suportadas

| Plataforma | Legendas | Status |
|------|------|------|
| **YouTube** | Manual CC (not auto-generated) — primary `/api/timedtext` + transcript-panel fallback | Testado |
| **Netflix** | TTML via Cadmium player API | Testado |
| **HBO Max** | WebVTT via DASH manifest | Testado |
| **BBC iPlayer** | TTML/EBU-TT-D | Testado |
| **RaiPlay** | SRT via MAIN-world fetch interceptor | Testado |
| **kino.pub** | HLS subtitles (Vidstack player) | Testado |
| **RTS Planeta** | Native HTML5 `<track>` | Testado |
| **ARTE** | HLS subtitles | Testado |
| **Plex** | HLS subtitles | Testado |
| **Filmzie** | HLS subtitles | Testado |

Outros sites com legendas HLS / VTT / TTML / `<track>` nativos também podem funcionar — clique em **Enable** no popup da extensão.

## Funcionalidades

- **Qualquer idioma** — traduz de qualquer idioma de legenda para qualquer idioma de destino
- **Vários modelos de IA** — escolha por qualidade e preço. Modelos gratuitos disponíveis
- **Custo da tradução** — veja quanto cada tradução custou diretamente no vídeo
- **Cache compartilhado** — uma pessoa traduz, todos os outros assistem de graça
- **Cache local inteligente** — legendas traduzidas carregam instantaneamente ao rever
- **Ajuste de timing** — `[` / `]` para deslocar ±0,5s
- **Personalização visual** — fonte, cor, opacidade, posição
- **Atalhos de teclado** — `B` alterna posição, `\` reseta offset
- **13 idiomas de interface** — EN, RU, UK, BE, SR, ES, FR, DE, PT, ZH, JA, KO, TR

## Como funciona

1. **Detecção** — o service worker intercepta requisições de legendas via `chrome.webRequest`
2. **Download** — o background script baixa as legendas, contornando CORS
3. **Tradução** — em lotes via API do OpenRouter (sua chave, sua escolha de modelo)
4. **Cache** — VTT traduzido comprimido com gzip, armazenado localmente + cache compartilhado
5. **Renderização** — o content script exibe as legendas sincronizadas com a reprodução do vídeo

## FAQ

**Preciso de uma chave de API?** Não, se o episódio já estiver no cache compartilhado. Para novas traduções — você precisa de uma chave OpenRouter.

**É gratuito?** A extensão é gratuita. Traduções em cache são gratuitas. Você só paga para traduzir conteúdo novo pelo provedor de IA.

**Qualidade da tradução?** Depende do modelo. Claude Opus está no nível de bons fansubs. DeepSeek e Gemini Flash são mais baratos, mas ainda legíveis.

**Custo típico?** $0,005–0,05 por episódio dependendo do modelo. Modelos gratuitos disponíveis.

## Privacidade

- Sua chave de API fica no seu dispositivo — nunca é enviada a nenhum servidor
- Sem rastreamento, sem analytics, sem anúncios
- O texto das legendas é enviado apenas ao provedor de IA que você escolher
- [Política de privacidade](https://podstr.cc/en/privacy/)

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md)

## Licença

MIT

## Links

- [podstr.cc](https://podstr.cc) — site
- [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
- [GitHub](https://github.com/aveleazer/podstr)
- [Telegram](https://t.me/podstrcc)
