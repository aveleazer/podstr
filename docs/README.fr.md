[English](../README.md)

# Podstr

**Le doublage tue le jeu d'acteur. Les sous-titres intégrés sont de la qualité Google Translate. Vous méritez mieux.**

Podstr est une extension Chrome qui traduit les sous-titres grâce à l'IA — Claude, Gemini, DeepSeek — directement dans votre navigateur. Vous entendez les voix originales. Vous lisez des sous-titres qui comprennent vraiment le contexte, l'humour et l'argot.

[Site web](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](README.ru.md) · 🇺🇦 [Українська](README.uk.md) · 🇧🇾 [Беларуская](README.be.md) · 🇷🇸 [Srpski](README.sr.md) · 🇪🇸 [Español](README.es.md) · 🇫🇷 [Français](README.fr.md) · 🇩🇪 [Deutsch](README.de.md) · 🇧🇷 [Português](README.pt-BR.md) · 🇨🇳 [中文](README.zh-CN.md) · 🇯🇵 [日本語](README.ja.md) · 🇰🇷 [한국어](README.ko.md) · 🇹🇷 [Türkçe](README.tr.md)

---

## Comment ça marche
1. Installez l'extension depuis le Chrome Web Store
2. Ouvrez une vidéo sur YouTube, ARTE ou tout autre site compatible
3. Choisissez votre langue dans le sélecteur de sous-titres au-dessus de la vidéo
4. Les sous-titres apparaissent sur la vidéo — traduits par l'IA

Si quelqu'un a déjà traduit le même épisode, il se charge depuis un cache partagé — instantanément et gratuitement.

## Pourquoi ne pas utiliser les sous-titres de la plateforme
| | Sous-titres de la plateforme / Google Translate | Podstr |
|---|---|---|
| **Contexte** | Ligne par ligne, sans conscience du dialogue | Traduction par lots avec le contexte complet |
| **Humour et argot** | Littéral, souvent faux | Comprend les blagues, les expressions idiomatiques, les références culturelles |
| **Paires de langues** | Limité à ce que propose la plateforme | N'importe quelle langue → 30 langues au choix |
| **Contrôle qualité** | Prenez ce qu'on vous donne | Choisissez votre modèle : Claude pour la qualité, Gemini pour la vitesse, DeepSeek pour le coût |
| **Sous-titres doubles** | Rarement disponibles | Original + traduction affichés ensemble |
| **Coût** | Gratuit (et ça se voit) | À partir de 0,007 $ par épisode. Modèles gratuits disponibles |

## Plateformes compatibles
| Plateforme | Sous-titres | Statut |
|------------|-------------|--------|
| **YouTube** | CC manuels (pas les sous-titres auto-générés) | Testé |
| **BBC iPlayer** | TTML/EBU-TT-D | Testé |
| **ARTE** | Sous-titres HLS | Testé |
| **Plex** | Sous-titres HLS | Testé |
| **Filmzie** | Sous-titres HLS | Testé |
| **Netflix** | — | Peut fonctionner, non testé |

D'autres sites avec des sous-titres HLS/VTT/TTML peuvent fonctionner — cliquez sur **Enable** dans le popup de l'extension.

## Démarrage rapide
**Vous voulez juste regarder** — installez depuis le [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih), ouvrez une vidéo, choisissez une langue. Si l'épisode est dans le cache partagé, il se lance immédiatement.
**Vous voulez traduire du nouveau contenu** — collez une [clé API OpenRouter](https://openrouter.ai/keys) dans les paramètres de l'extension. Des clés gratuites sont disponibles. Choisissez un modèle, ouvrez une vidéo — la traduction démarre automatiquement.

## Fonctionnalités
- **30 langues de traduction**, interface en 13 langues
- **Sous-titres doubles** — original + traduction simultanément
- **Plusieurs modèles d'IA** — Claude Sonnet pour la qualité, Gemini Flash pour la vitesse, DeepSeek pour le coût. Modèles gratuits disponibles
- **Cache partagé** — une personne traduit, tout le monde en profite
- **Coût de traduction** affiché directement sur la vidéo avant de commencer
- **Raccourcis clavier** — `[` / `]` décalage ±0,5s, `B` changer la position, `\` réinitialiser le décalage
- **Personnalisation du style** — police, couleur, opacité, position

## Limites honnêtes
Le modèle d'IA ne voit que le texte — pas la vidéo. Il ne sait pas si c'est un homme ou une femme qui parle, donc les formes genrées peuvent être incorrectes. Il ne distingue pas toujours le vouvoiement du tutoiement. Les néologismes peuvent être traduits littéralement.
Ce ne sont pas des bugs — ce sont des limites inhérentes à la traduction textuelle uniquement. Un traducteur humain travaillant à partir d'une transcription seule rencontrerait les mêmes problèmes.
**Ce qu'il fait bien :** Claude Sonnet produit des traductions comparables à de bons fansubs — humour, argot et contexte préservés. Pour la plupart des contenus, vous oublierez que vous lisez des sous-titres générés par l'IA.

## Confidentialité
- Votre clé API reste sur votre appareil — jamais envoyée à aucun serveur autre que le fournisseur d'IA que vous choisissez
- Aucun tracking ni publicité dans l'extension (le site utilise des statistiques de visite anonymes)
- [Politique de confidentialité](https://podstr.cc/en/privacy/)

## Contribuer
Les signalements de bugs, demandes de plateformes et pull requests sont les bienvenus. Voir [docs/CONTRIBUTING.md](CONTRIBUTING.md).

## Licence
MIT — [Anabasis Media DOO](https://podstr.cc)
