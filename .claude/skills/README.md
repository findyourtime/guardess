# Skills installés dans ce projet

Ces skills viennent de dépôts tiers. Claude Code les charge dans chaque
session ouverte sur ce dépôt. Ce dossier est de l'outillage de
développement : il n'est pas publié, les workflows `pages.yml` et
`netlify.yml` ne copient que `*.html` et `assets/`.

| Skill | Origine | Version |
|---|---|---|
| `ui-ux-pro-max`, `ui-styling`, `design`, `design-system`, `brand`, `banner-design`, `slides` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT), commit `28b3b8d` | 2.15.0 |
| `design-taste` | [h3nryprod01/design-taste](https://github.com/h3nryprod01/design-taste) | 2.1.0 |

La charte Guardess (couleurs, polices, ton) est définie dans `index.html`
et prime sur les palettes génériques que proposent ces skills.

## Seule modification locale

Le dépôt d'origine contient deux versions du `SKILL.md` de
`ui-ux-pro-max` : celle du plugin, copiée ici (plus courte, règles
détaillées dans `references/`), et celle que génère l'installeur `uipro`.
La version plugin appelle son script par
`${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py`,
une variable qui n'existe que dans une installation en plugin. Ce préfixe
a été remplacé par `${CLAUDE_SKILL_DIR}/`, que Claude Code remplace par le
dossier du skill. Tout le reste est copié tel quel, sauf
`ui-styling/scripts/.coverage`, un résidu de tests.

## Prérequis

- Recherche (`ui-ux-pro-max/scripts/search.py`) : Python 3, bibliothèque
  standard seulement, aucun accès réseau.
- Génération de logos, d'icônes et de mockups (`design/scripts/`) : une clé
  `GEMINI_API_KEY` (ou `ATLASCLOUD_API_KEY`, `MUAPI_API_KEY`), le paquet
  `google-genai` et un accès réseau à ces services. Sans clé, ces scripts
  s'arrêtent sans rien faire.
- `ui-styling/scripts/shadcn_add.py` lance `npx shadcn` : sans objet ici,
  le site est en HTML, CSS et JavaScript natifs.

## Mettre à jour

Recopier `.claude/skills/` depuis le dépôt d'origine, puis refaire le
remplacement dans `ui-ux-pro-max/SKILL.md` :

```bash
f=.claude/skills/ui-ux-pro-max/SKILL.md
sed -i.bak 's|${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/|${CLAUDE_SKILL_DIR}/|g' "$f" && rm "$f.bak"
```

L'installeur officiel (`npm install -g ui-ux-pro-max-cli && uipro init
--ai claude`) fonctionne aussi, mais il écrit l'autre version du
`SKILL.md`, et il saute les skills déjà présents sauf avec `--force`.
