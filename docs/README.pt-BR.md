[English](../README.md)

# Podstr

**Dublagem mata a atuação. Legendas embutidas têm qualidade de Google Tradutor. Você merece coisa melhor.**

Podstr é uma extensão para Chrome que traduz legendas usando IA — Claude, Gemini, DeepSeek — direto no seu navegador. Você ouve as vozes originais. Você lê legendas que realmente entendem contexto, humor e gírias.

[Site](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## Como Funciona
1. Instale a extensão pela Chrome Web Store
2. Abra um vídeo no YouTube, ARTE ou qualquer site compatível
3. Escolha seu idioma no seletor de legendas acima do vídeo
4. As legendas aparecem sobre o vídeo — traduzidas por IA

Se alguém já traduziu o mesmo episódio, ele carrega de um cache compartilhado — instantaneamente e de graça.

## Por Que Não Usar as Legendas da Plataforma
| | Legendas da plataforma / Google Tradutor | Podstr |
|---|---|---|
| **Contexto** | Linha por linha, sem noção do diálogo | Tradução em lotes com contexto completo |
| **Humor e gírias** | Literal, frequentemente errado | Entende piadas, expressões idiomáticas, referências culturais |
| **Pares de idiomas** | Limitado ao que a plataforma oferece | Qualquer idioma → qualquer um de 30 idiomas |
| **Controle de qualidade** | Aceite o que vier | Escolha seu modelo: Claude para qualidade, Gemini para velocidade, DeepSeek para custo |
| **Legendas duplas** | Raramente disponível | Original + tradução na tela ao mesmo tempo |
| **Custo** | Grátis (e dá pra perceber) | A partir de $0,007 por episódio. Modelos gratuitos disponíveis |

## Plataformas Compatíveis
| Plataforma | Legendas | Status |
|------------|----------|--------|
| **YouTube** | CC manual (não gerado automaticamente) | Testado |
| **BBC iPlayer** | TTML/EBU-TT-D | Testado |
| **ARTE** | Legendas HLS | Testado |
| **Plex** | Legendas HLS | Testado |
| **Filmzie** | Legendas HLS | Testado |
| **Netflix** | — | Pode funcionar, não testado |

Outros sites com legendas HLS/VTT/TTML podem funcionar — clique em **Ativar** no popup da extensão.

## Início Rápido
**Só quer assistir** — instale pela [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih), abra um vídeo, escolha um idioma. Se o episódio estiver no cache compartilhado, ele toca imediatamente.
**Quer traduzir conteúdo novo** — cole uma [chave de API do OpenRouter](https://openrouter.ai/keys) nas configurações da extensão. Chaves gratuitas disponíveis. Escolha um modelo, abra um vídeo — a tradução começa automaticamente.

## Recursos
- **30 idiomas de tradução**, interface em 13 idiomas
- **Legendas duplas** — original + tradução simultaneamente
- **Vários modelos de IA** — Claude Sonnet para qualidade, Gemini Flash para velocidade, DeepSeek para custo. Modelos gratuitos disponíveis
- **Cache compartilhado** — uma pessoa traduz, todo mundo se beneficia
- **Custo da tradução** exibido direto no vídeo antes de começar
- **Atalhos de teclado** — `[` / `]` ajustam o timing em ±0,5s, `B` alterna posição, `\` reseta o offset
- **Personalização de estilo** — fonte, cor, opacidade, posição

## Limitações Honestas
O modelo de IA vê apenas texto — não o vídeo. Ele não sabe se quem está falando é homem ou mulher, então formas de gênero podem sair erradas. Nem sempre consegue distinguir "você" formal de informal. Neologismos podem ser traduzidos literalmente.
Esses não são bugs — são limitações inerentes à tradução baseada apenas em texto. Um tradutor humano trabalhando só com a transcrição enfrentaria os mesmos problemas.
**O que ele faz bem:** Claude Sonnet produz traduções comparáveis a boas fansubs — humor, gírias e contexto preservados. Para a maioria dos conteúdos, você vai esquecer que está lendo legendas geradas por IA.

## Privacidade
- Sua chave de API fica no seu dispositivo — nunca é enviada a nenhum servidor exceto o provedor de IA que você escolher
- Sem rastreamento ou anúncios na extensão (o site usa Yandex.Metrika para estatísticas anônimas de visitas)
- [Política de privacidade](https://podstr.cc/en/privacy/)

## Contribuindo
Relatórios de bugs, pedidos de plataformas e PRs são bem-vindos. Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença
MIT — [Anabasis Media DOO](https://podstr.cc)
