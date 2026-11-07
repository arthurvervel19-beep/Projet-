# Aube des Royaumes

Jeu de **stratégie en temps réel** (RTS) dans le navigateur, servi par **Node.js**.
Il s'inspire des mécaniques des grands jeux de stratégie médiévale : économie à quatre
ressources, villageois, passage d'âges, technologies et armées. L'univers, les noms et
les graphismes sont originaux et dessinés par le code, sans image externe.

## Lancer le jeu

**Sous Windows** : double-cliquez sur `lancer-le-jeu.bat`. Le navigateur s'ouvre tout seul
sur le jeu (Node.js doit être installé).

**Autres systèmes, ou en ligne de commande** :

Il faut Node.js 18 ou plus récent. Le projet n'a aucune dépendance à installer.

```bash
npm start
```

Ouvrez ensuite <http://localhost:3000> dans votre navigateur. Pour changer de port :
`PORT=8080 npm start`.

## Contenu

- **Rendu 3D temps réel (WebGL, Three.js)** : lumière du soleil et ombres douces, occlusion
  ambiante (GTAO), étalonnage colorimétrique, anticrénelage. Terrain en relief avec mélange
  de sols (herbe, terre, sable, sous-bois), eau animée avec écume et reflets, herbe et arbres
  qui ondulent au vent, ombres de nuages, brouillard de guerre adouci. Particules : fumée des
  cheminées, forge, incendies des bâtiments endommagés, poussière, explosions.
- **Modèles 3D procéduraux** texturés (pierre, colombages, tuiles, ardoise, chaume, planches)
  avec bandes et bannières aux couleurs du joueur. Unités animées (marche, attaque,
  récolte) : fantassins, archers, cavaliers, engins de siège. Portraits 3D dans l'interface.
- **4 qualités graphiques** : Ultra, Équilibrée, Performance (3D) et Classique (2D, utilisée
  automatiquement si WebGL 2 n'est pas disponible).
- **Carte procédurale** : lacs, plages, forêts, filons d'or et de pierre, baies, moutons.
- **4 ressources**, **4 âges**, **16 bâtiments** (dont palissade et muraille de pierre à
  tracer en cliquant-glissant, avec tours automatiques aux angles), **15 unités**,
  **18 technologies**, marché à cours variables.
- **Combat** : armures de mêlée et de perçage, bonus d'unités, projectiles, tours qui tirent.
- **Musique rock / électro générée en temps réel** : batterie, guitares saturées doublées,
  basse, nappes et arpèges de synthés, montées et impacts. Le style suit la partie
  (économie, développement, bataille, victoire).
- **Voix des unités** (synthèse vocale française du navigateur) à la sélection et aux ordres,
  cris de combat et de mort, hennissements, bêlements, bruitages spatialisés.
- **Interface moderne** : panneaux translucides, icônes vectorielles, info-bulles détaillées,
  minicarte, alertes, groupes de contrôle, attaque-mouvement, points de ralliement.
- **IA adverse** en 3 niveaux (facile, normal, difficile).

## Commandes

| Action | Contrôle |
|---|---|
| Sélectionner | Clic gauche, ou glisser pour une zone (double-clic : toutes les unités du même type) |
| Ordre contextuel | Clic droit : déplacer, récolter, attaquer, construire, réparer, ralliement |
| Caméra | Flèches, bords de l'écran, clic molette ; molette pour zoomer ; clic sur la minicarte |
| Groupes | Ctrl + 1-9 pour créer, 1-9 pour rappeler (deux fois pour centrer la vue) |
| Raccourcis | H : hôtel de ville, `.` : villageois inactif, Suppr : détruire, Échap : annuler / pause |
| Production | Maj + clic sur une unité : en former 5 |

**Victoire** : détruire toutes les unités et tous les bâtiments principaux de l'adversaire.

## Architecture

```
server.js            serveur HTTP Node.js sans dépendance
public/index.html    page du jeu
public/style.css     interface
public/js/config.js  données : unités, bâtiments, technologies, âges
public/js/map.js     génération procédurale de la carte
public/js/pathfinding.js  A* 8 directions avec lissage des trajets
public/js/game.js    moteur de simulation (sans DOM, testable dans Node)
public/js/ai.js      intelligence artificielle
public/js/r3d/       rendu 3D : moteur, shaders, modèles, textures procédurales
public/js/render.js  rendu 2D « classique » (repli sans WebGL)
public/js/terrain.js champs du terrain et couleurs (minicarte, rendu 2D)
public/js/sprites.js sprites du rendu 2D
public/js/icons.js   icônes vectorielles de l'interface
public/js/audio.js   musique rock / électro, voix et bruitages (Web Audio API)
public/vendor/       Three.js et modules de post-traitement (licence MIT)
public/fonts/        polices Cinzel et Inter (licence SIL OFL)
public/js/ui.js      souris, clavier, interface
public/js/main.js    menu et boucle de jeu
test/                tests (node --test)
```

Le moteur tourne à pas fixe (20 mises à jour par seconde) et l'affichage interpole les
positions. Le joueur et l'IA passent par la même fonction `game.issue()`, ce qui garantit
qu'ils suivent les mêmes règles.

## Tests

```bash
npm test
```

Les tests génèrent des cartes, vérifient la récolte et font jouer l'IA contre elle-même
pendant 16 minutes de jeu simulé.

## Performances

La qualité **Ultra** est prévue pour une carte graphique récente. Sur un ordinateur portable
ou une carte graphique intégrée, choisissez **Équilibrée** ou **Performance** dans le menu.

## Crédits

- [Three.js](https://threejs.org) (licence MIT, voir `public/vendor/THREE-LICENSE.txt`)
- Polices Cinzel et Inter (licence SIL Open Font License, voir `public/fonts/`)
- Graphismes, musiques et sons : générés par le code du jeu (créations originales)

## Pistes d'évolution

- Plusieurs civilisations avec des bonus et des unités uniques
- Mode multijoueur en réseau (WebSocket via le serveur Node)
- Sauvegarde et chargement des parties
- Unités navales, moines et conversion, merveilles
