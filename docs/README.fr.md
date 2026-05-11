<div align="center">

# Podstr — Traduction de sous-titres par IA

**Traduisez les sous-titres dans n'importe quelle langue grâce à l'IA.**
Extension Chrome : détecte les sous-titres sur les plateformes vidéo et les traduit en temps réel.

[Site web](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

</div>

---

## Qu'est-ce que c'est

Une extension Chrome qui intercepte les sous-titres sur les sites vidéo et les traduit via des modèles d'IA (Claude, Gemini, DeepSeek, etc. via OpenRouter). Fonctionne avec des sous-titres en anglais, espagnol, allemand, finnois — dans n'importe quelle langue. Traduit vers n'importe quelle langue.

Si quelqu'un a déjà traduit le même épisode, la traduction se charge depuis le cache partagé instantanément et gratuitement.

## Je veux regarder

1. Installez depuis le [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Ouvrez une vidéo avec des sous-titres → choisissez la langue dans le sélecteur → c'est prêt

## Je veux traduire

### Via OpenRouter API (paiement par tokens)

1. Obtenez une clé sur [openrouter.ai](https://openrouter.ai/)
2. Collez la clé dans les paramètres de l'extension
3. Choisissez un modèle et une langue → la traduction se lance automatiquement

> Le coût dépend du modèle : DeepSeek V3 — à partir de 0,01 $ par épisode, Claude Opus — 5–15 $ par épisode d'une heure.

### Via Claude CLI (gratuit avec l'abonnement Max)

Instructions détaillées : [CONTRIBUTING.md](CONTRIBUTING.md)

## Plateformes vérifiées

| Plateforme | Sous-titres | Statut |
|------|------|------|
| **YouTube** | Manual CC (not auto-generated) — primary `/api/timedtext` + transcript-panel fallback | Vérifié |
| **Netflix** | TTML via Cadmium player API | Vérifié |
| **HBO Max** | WebVTT via DASH manifest | Vérifié |
| **BBC iPlayer** | TTML/EBU-TT-D | Vérifié |
| **RaiPlay** | SRT via MAIN-world fetch interceptor | Vérifié |
| **kino.pub** | HLS subtitles (Vidstack player) | Vérifié |
| **RTS Planeta** | Native HTML5 `<track>` | Vérifié |
| **ARTE** | HLS subtitles | Vérifié |
| **Plex** | HLS subtitles | Vérifié |
| **Filmzie** | HLS subtitles | Vérifié |

D'autres sites avec sous-titres HLS / VTT / TTML / `<track>` natifs peuvent fonctionner — cliquez sur **Enable** dans le popup de l'extension.

## Fonctionnalités

- **Multilingue** — traduit de n'importe quelle langue vers n'importe quelle autre. Français par défaut
- **Choix du modèle IA** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama via OpenRouter
- **Cache partagé** — une personne traduit, tout le monde en profite gratuitement
- **Coût de traduction** — le prix de la traduction s'affiche directement sur la vidéo
- **Réglage du timing** — `[` / `]` pour décaler de ±0,5s
- **Personnalisation visuelle** — police, couleur, opacité, position

## FAQ

### Ai-je besoin d'une clé API ?

Non, si l'épisode a déjà été traduit par quelqu'un (cache partagé). Pour une nouvelle traduction, il faut une clé OpenRouter ou un abonnement Claude Max.

### C'est gratuit ?

L'extension est gratuite. Les traductions du cache partagé sont gratuites. On ne paie que pour traduire du nouveau contenu via OpenRouter API.

### Quelle est la qualité de traduction ?

Ça dépend du modèle. Claude Opus est au niveau d'un bon fansub, avec l'humour, l'argot et le contexte. DeepSeek et Gemini Flash sont moins chers mais restent tout à fait lisibles.

## Site web

[podstr.cc](https://podstr.cc) — comparaison des modèles, plateformes, instructions d'installation.

## Licence

MIT
