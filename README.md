# Guardess

Site de Guardess : verre de confidentialité trempé 9H et bumper rigide d'une
seule pièce pour Apple Watch (40, 41, 44, 45 et 49 mm, quatre finitions).
Direction visuelle : interface HUD futuriste sur verre dépoli (« Liquid Glass »),
sombre par défaut avec une variante claire.

## Structure

```
index.html              La page : styles, intro, sections, boutique, pilotage 3D
assets/js/scene.js      Scène three.js : montre 45 mm, coque Guardess, chargeur, studio
assets/img/still-*.webp Images de repli rendues depuis la scène (sans WebGL ou mouvement réduit)
assets/img/og.jpg       Image de partage (1200 × 630)
assets/vendor/          three.js r170 et Shopify Buy Button, servis en local
assets/css/, fonts/     Polices auto-hébergées (Space Grotesk, Manrope, IBM Plex Mono)
terms.html, privacy.html Conditions de vente et confidentialité
preview.html            Planche de validation de la palette
```

HTML, CSS et JS statiques, sans étape de build.

## La montre qui suit le défilement

Une seule montre 3D, dans un canevas fixé derrière la page. Chaque scène contient
un emplacement (`data-station`) : la montre se cale sur l'emplacement le plus
proche du centre de l'écran et passe d'une scène à l'autre en glissant. Dans
chaque scène épinglée (`data-pin`), sa pose dépend de la progression du défilement :

- **Intro** : le logo se dessine puis rejoint la barre de navigation, la montre
  s'allume (logo à l'écran, puis l'heure). Une fois par session, désactivable.
- **Hero** : la montre tourne de 10° à 72°, le verre de confidentialité assombrit
  l'écran selon l'angle réel (shader), la jauge suit.
- **Une seule pièce** : la coque se détache (vue éclatée, légendes), puis se remet en place.
- **Le filtre** : le curseur du schéma fait tourner la montre.
- **Recharge** : la montre se retourne, le chargeur se fixe, l'écran passe en charge.
- **Finitions** : Black, Transparent, Starlight, Silver ; le choix est repris dans
  le formulaire de commande, et l'inverse.
- **Pose** : nettoyage, alignement, emboîtement.

Sans WebGL, les images de repli remplacent la montre 3D. Avec
`prefers-reduced-motion`, en plus, l'intro disparaît et aucune scène n'est épinglée.
Le paramètre `?snap` (tests) supprime l'amortissement.

Pour régénérer les images de repli après une modification de la scène : rendre
chaque pose avec `canvas.toDataURL('image/webp')` (fond transparent, 900 × 900).

## Tester en local

```sh
python3 -m http.server 8000
# puis http://localhost:8000
```

## Serveur MCP 21st.dev (composants d'interface)

`.mcp.json` déclare le serveur MCP de [21st.dev](https://21st.dev/mcp) pour Claude Code.
La clé n'est pas dans le dépôt : elle est lue dans la variable d'environnement
`API_KEY_21ST` (clé gratuite sur https://21st.dev/mcp). Dans une session Claude Code
sur le web, ajoute cette variable dans les réglages de l'environnement et autorise
le domaine `21st.dev` dans l'accès réseau.

## Skills Claude Code

`.claude/skills/` contient des skills de design (ui-ux-pro-max et ses six
compagnons, design-taste), chargés dans chaque session Claude Code sur ce dépôt.
Origine, versions et mise à jour : `.claude/skills/README.md`.
