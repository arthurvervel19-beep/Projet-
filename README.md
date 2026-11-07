# Aube des Royaumes

Jeu de **stratégie en temps réel** (RTS) dans le navigateur, servi par **Node.js**.
Il s'inspire des mécaniques des grands jeux de stratégie médiévale : économie à quatre
ressources, villageois, passage d'âges, technologies et armées. L'univers, les noms et
les graphismes sont originaux et dessinés par le code, sans image externe.

## Lancer le jeu

Il faut Node.js 18 ou plus récent. Le projet n'a aucune dépendance à installer.

```bash
npm start
```

Ouvrez ensuite <http://localhost:3000> dans votre navigateur. Pour changer de port :
`PORT=8080 npm start`.

## Contenu

- **Carte procédurale isométrique** : lacs, plages, forêts, filons d'or et de pierre,
  baies, moutons. Une graine permet de rejouer la même carte.
- **4 ressources** : nourriture, bois, or et pierre, plus la population (maisons).
- **4 âges** : Tribal, Féodal, Châteaux et Impérial. Chacun débloque des unités, des
  bâtiments et des technologies.
- **15 bâtiments** : hôtel de ville, maison, moulin, camps de bûcherons et de mineurs,
  ferme (qui se ressème toute seule), palissade (tracée en cliquant-glissant), caserne,
  camp de tir à l'arc, écurie, forge, marché, tour de guet, atelier de siège et forteresse.
- **15 unités** : villageois, milicien, piquier, épéiste, champion, archer, tirailleur,
  arbalétrier, éclaireur, chevalier, paladin, bélier, catapulte (dégâts de zone),
  bombarde et garde royale.
- **Combat** : armure de mêlée et de perçage, bonus d'unités (les piquiers contre la
  cavalerie, les tirailleurs contre les archers, le siège contre les bâtiments),
  projectiles et tours qui tirent.
- **18 technologies** : récolte, brouette, forge, armures, empennage, maçonnerie…
- **Marché** avec des cours qui évoluent selon les achats et les ventes.
- **Brouillard de guerre**, minicarte, alertes d'attaque, groupes de contrôle,
  attaque-mouvement, points de ralliement et file de production.
- **IA adverse** en 3 niveaux (facile, normal, difficile). Elle gère son économie, change
  d'âge, recherche des technologies, adapte la composition de son armée, se défend et
  lance des vagues d'attaque.

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
public/js/render.js  rendu isométrique sur canvas
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

## Pistes d'évolution

- Plusieurs civilisations avec des bonus et des unités uniques
- Mode multijoueur en réseau (WebSocket via le serveur Node)
- Sauvegarde et chargement des parties
- Sons et musique
- Unités navales, moines et conversion, merveilles
