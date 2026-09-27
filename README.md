# Guardess

Site vitrine de Guardess : vitre anti-espion 9H et coque rigide pour Apple Watch.
Direction visuelle « Liquid Glass » : panneaux de verre dépoli sur un fond mesh animé,
avec des animations 3D pilotées par le scroll.

## Structure

```
index.html            La page (8 sections)
assets/css/style.css  Styles : tokens clair/sombre, verre, 3D, sections
assets/js/main.js     Nav mobile, 3D au scroll, schéma interactif, images optionnelles
preview.html          Planche de validation : palette du fond et panneau en verre
```

HTML, CSS et JS statiques, sans dépendance ni étape de build. Les polices
(Space Grotesk, Manrope) viennent de Google Fonts.

## Images à ajouter

Dépose ces fichiers dans `assets/`. Ils s'affichent automatiquement dès qu'ils existent :

| Fichier            | Où                        | En attendant                          |
|--------------------|---------------------------|---------------------------------------|
| `assets/logo.svg`  | Barre de navigation       | Pictogramme bouclier + « Guardess »   |
| `assets/pack.jpg`  | Section « Le pack »       | Vue éclatée 3D vitre / montre / coque |

## Animations 3D

- **Hero** : Apple Watch modélisée en 3D temps réel (three.js r170 servi en local,
  `assets/js/watch3d.js`) : boîtier aluminium, bracelet sport gris clair en boucle,
  couronne crantée, bouton latéral, micro, tenon. Le scroll la fait pivoter de 0° à 66°.
  L'écran est un shader : sa luminosité suit l'angle réel entre l'écran et la caméra
  (net sous 18°, noir au-delà de 32°), comme le filtre à micro-lamelles. Si WebGL est
  indisponible, la photo `assets/img/turn-000.webp` s'affiche à la place.
- **Le pack** : vue éclatée. La vitre et la coque s'écartent de la montre au scroll.
- **La technologie** : coupe de la grille optique. L'angle de vue suit le scroll,
  ou le curseur si on le manipule. Les rayons passent sous 30° et sont bloqués au-delà.
- **Toutes les sections** : les panneaux entrent en s'inclinant en 3D. Au survol
  (souris), les cartes suivent le pointeur et leur reflet se déplace.

Avec `prefers-reduced-motion`, le fond reste fixe et les animations au scroll
sont coupées. Le curseur du schéma reste utilisable.

## Tester en local

```sh
python3 -m http.server 8000
# puis http://localhost:8000
```
