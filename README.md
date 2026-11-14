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

## Sur téléphone et tablette

Le jeu se joue au doigt, en mode paysage : interface compacte, boutons larges, qualité
graphique « Mobile » choisie automatiquement (elle s'allège toute seule si le téléphone peine).

**Application Android (hors connexion)** : le script `android/build-apk.sh` fabrique
`android/build/aube-des-royaumes.apk`. Copiez ce fichier sur le téléphone, ouvrez-le et
acceptez l'installation (Android demande d'autoriser l'installation depuis cette source).
Le jeu est entièrement contenu dans l'application : il ne télécharge rien et ne se connecte
à rien. Android 7 ou plus récent.

```bash
bash android/build-apk.sh
```

Le script demande un JDK 17 ou plus récent, `curl`, `zip` et `unzip` ; il télécharge une fois
les outils Android nécessaires (vérifiés par empreinte) dans `android/.cache`. La clé de
signature est créée sur la machine et n'est pas enregistrée dans le dépôt : pour installer
une version fabriquée sur une autre machine, désinstallez d'abord l'ancienne.

**Sans installer d'application** : lancez le jeu sur l'ordinateur (`npm start`). Le terminal
affiche une adresse du type `http://192.168.1.20:3000` : ouvrez-la dans le navigateur du
téléphone, branché sur le même Wi-Fi. Fonctionne aussi sur iPhone et iPad.

| Geste | Action |
|---|---|
| Toucher une unité ou un bâtiment | Sélectionner (deux fois : toutes les unités du même type) |
| Toucher le sol, une ressource, un chantier, un ennemi | Ordre aux unités sélectionnées : aller, récolter, construire, attaquer |
| Glisser un doigt | Déplacer la vue |
| Pincer à deux doigts | Zoomer |
| Appui long puis glisser | Sélectionner une zone |
| Boutons ronds à droite | Annuler ou désélectionner, sélection par zone, toute l'armée |
| Construire | Choisir le bâtiment, toucher ou glisser pour le placer, valider avec le bouton vert ; pour un mur, glisser le long du tracé |
| Touche « retour » d'Android | Annuler, puis pause ; quitte depuis le menu |

## Sauvegarder une partie solo

- **Sauvegarde automatique** toutes les minutes, à l'ouverture du menu pause et quand le jeu passe
  en arrière-plan. Bouton **Sauvegarder** et **Sauvegarder et quitter** dans le menu pause.
- Au menu principal, **Reprendre** relance la partie en cours (une seule partie en cours par
  appareil ; « Nouvelle partie » la remplace). Une partie terminée ou abandonnée est effacée.
- **Changer d'appareil** : dans le menu pause, **Envoyer vers un autre appareil** donne un code de
  6 caractères. Sur l'autre appareil : menu, « Reprendre une partie commencée sur un autre
  appareil », taper le code. Les envois suivants mettent à jour le même code, pour passer du PC au
  téléphone et inversement. Quiconque connaît le code peut récupérer la partie ; les sauvegardes
  non mises à jour depuis 60 jours sont effacées du serveur.
- La sauvegarde contient tout l'état de la partie et de l'IA ; une partie reprise continue
  exactement comme si elle n'avait pas été interrompue (vérifié par les tests). Elle pèse
  environ 50 à 70 Ko une fois compressée.

## Jouer en ligne à deux

Le jeu est publié sur **Vercel** (offre gratuite) à chaque mise à jour de la branche `main`.
Dans le menu, onglet **En ligne** :

1. Choisissez un pseudo et une civilisation.
2. L'un des joueurs clique sur **Créer un salon** : un code de 5 caractères s'affiche (bouton
   **Partager** pour l'envoyer par message).
3. L'autre joueur tape ce code puis **Rejoindre**.
4. L'hôte choisit la taille de la carte et les ressources, puis **Lancer la partie**.

**Fonctionnement** : chaque navigateur calcule toute la partie ; les joueurs n'échangent que leurs
ordres (« ces unités vont là »), par tours de 200 ms, exécutés au même moment chez tous
(technique dite *lockstep*). Cela représente environ 5 petits messages par seconde et par joueur,
ce qui tient largement dans l'offre gratuite de Supabase. Une empreinte de l'état de la partie est
comparée chaque seconde : si les deux parties divergent, un avertissement s'affiche.

**Serveur** : un projet Supabase dédié au jeu gère les salons et le
canal temps réel. Les joueurs reçoivent un compte invité anonyme ; seuls les membres d'un salon
peuvent lire ses informations et parler sur son canal ; un salon est fermé aux nouveaux venus dès
le lancement. La structure de la base est dans `supabase/salons.sql`. La clé écrite dans
`public/js/online-config.js` est la clé *publishable*, prévue pour être publique ; la clé secrète
ne doit jamais apparaître dans le dépôt.

**Limites actuelles** : deux joueurs par partie ; une page rechargée en cours de partie ne peut
pas revenir dans la partie ; si un joueur ferme le jeu, l'autre peut terminer la partie après
quelques secondes d'attente. Le mode solo, lui, fonctionne toujours sans connexion.

## Contenu

- **Rendu 3D temps réel (WebGL, Three.js)** : lumière dorée et ombres douces, occlusion
  ambiante (GTAO), halo lumineux (bloom), léger flou de profondeur, brume de distance,
  étalonnage colorimétrique, anticrénelage. Liseré de lumière sur les unités et les
  feuillages, ombres de contact sous les unités et au pied des bâtiments, patine des murs
  (mousse, salissures). Particules : fumée des cheminées, forge, incendies, poussière, explosions.
- **Paysage vivant** : cinq essences d'arbres (chênes, hêtres, bouleaux, sapins) regroupées en
  bois de feuillus ou de résineux, feuillage détaillé qui ondule au vent, prairies fleuries
  (marguerites, boutons d'or, coquelicots, campanules), fougères et souches en sous-bois,
  roseaux et nénuphars sur les rives, galets, vols d'oiseaux. Terrain en relief avec mélange
  de sols et micro-relief, eau turquoise avec écume, reflets du fond et scintillement du soleil,
  ombres de nuages, brouillard de guerre adouci.
- **Modèles 3D procéduraux** texturés (pierre, colombages, tuiles, ardoise, chaume, planches)
  avec bandes et bannières aux couleurs du joueur. Portraits 3D dans l'interface.
- **Unités détaillées** : squelette articulé (épaules, coudes, poignets, hanches, genoux,
  chevilles), visages (yeux, sourcils, nez, oreilles, bouche), coiffures, barbes et teints
  variés d'un soldat à l'autre. Équipement propre à chaque civilisation : cottes de mailles,
  armures de plates, cuirasses, heaumes à visière, casques à cimier, boucliers peints,
  arcs, arbalètes, mousquets, fusils. Chevaux articulés (encolure, tête, crinière, queue,
  jambes à deux segments, sabots), avec selle, bride, rênes ou caparaçon.
- **Animations** : marche avec flexion des genoux et balancier des bras, trot des chevaux,
  respiration et regard au repos, garde de combat, coups d'épée avec rotation du buste et
  fente, coups de lance, tir à l'arc (bander, décocher), visée à l'épaule, recul des armes
  à feu, travail des villageois, chute des morts. Les petits détails ne sont dessinés que de
  près, et les unités hors de l'écran ne sont pas animées.
- **5 qualités graphiques** : Ultra, Équilibrée, Mobile, Performance (3D) et Classique (2D,
  utilisée automatiquement si WebGL 2 n'est pas disponible).
- **6 civilisations** jouables, chacune avec son architecture, l'apparence de ses unités,
  un bonus, une unité unique (formée à la forteresse) et des gammes musicales propres :

  | Civilisation | Architecture | Bonus | Unité unique |
  |---|---|---|---|
  | Francs | pierre, colombages, tuiles, château fort | cavalerie +20 PV, fermes +40 nourriture | Garde royale |
  | Romains | marbre, colonnades, temple à fronton | infanterie +1/+1 armure, bâtiments +15 % PV | Légionnaire |
  | Égyptiens | grès, pylônes, obélisques, toits plats | or et pierre +20 % | Char de guerre |
  | Incas | pierres ajustées, plateforme à degrés, chaume | villageois +1/+1 armure, maisons +3 pop. | Frondeur |
  | Japonais | bois sombre, cloisons blanches, château à étages | infanterie attaque 20 % plus vite, bois +15 % | Samouraï |
  | Vikings | rondins, grande halle, proues de dragon | infanterie +15 % vitesse, villageois +10 PV | Berserker |

- **Carte procédurale** : lacs, plages, forêts, filons d'or et de pierre, baies, moutons.
- **4 ressources**, **8 âges**, **26 bâtiments** (dont palissade et muraille de pierre à
  tracer en cliquant-glissant, avec tours automatiques aux angles), **34 unités**
  (dont 3 volantes), **44 technologies**, marché à cours variables.
- **8 âges, du Moyen Âge au futur** :

  | Âge | Coût | Nouveautés |
  |---|---|---|
  | Tribal | — | villageois, milicien, éclaireur, maisons, camps, caserne, écurie |
  | Féodal | 500 nourriture | piquier, archer, tirailleur, forge, marché, tour, muraille |
  | Châteaux | 800 nourriture, 200 or | épéiste, arbalétrier, chevalier, siège, forteresse, unités uniques |
  | Impérial | 1000 nourriture, 800 or | champion, paladin, bombarde, **trébuchet**, **université**, **merveille**, 11 technologies impériales |
  | Renaissance | 1600 nourriture, 1200 or | mousquetaire, cuirassier, canon, **banque** (revenu d'or) |
  | Industriel | 2000 nourriture, 1500 or, 500 pierre | fusilier, dragon, artillerie de campagne, **usine** (produit la ressource choisie et des chars), bunker |
  | Moderne | 2500 nourriture, 2000 or, 1000 bois | soldat, mitrailleur, char d'assaut, **bombardier**, aérodrome |
  | Futur | 3000 nourriture, 2500 or, 1500 pierre | exo-soldat, robot de combat, **drone**, tourelle à plasma, **programme spatial** |

- **Merveilles** propres à chaque civilisation (cathédrale, Colisée, pyramide et sphinx,
  temple du Soleil, pagode et torii, église en bois debout) : si elle tient **8 minutes**,
  c'est la victoire. **Programme spatial** : si la fusée décolle au bout de **4 minutes**,
  c'est la victoire scientifique. Un compte à rebours s'affiche pour tous les joueurs.
- **Armes à feu et unités volantes** : balles traçantes, obus explosifs, rayons laser, bombes ;
  les bombardiers et drones survolent le terrain et seules les unités à distance et les
  bâtiments défensifs peuvent les toucher.
- **Portes** : porte de palissade et porterie fortifiée, à poser sur un mur existant ou
  dans un passage. Vos unités les franchissent (les battants s'ouvrent à leur approche),
  l'ennemi reste bloqué ; une porte peut être verrouillée (touche L). Une armée ennemie
  arrêtée par un rempart s'attaque à la porte ou au mur qui lui barre la route.
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
| Construction | V : changer de page (Économie / Armée et défense) |
| Portes | Sélectionnez une porte, puis L pour la verrouiller ou la déverrouiller |

**Victoire** : détruire toutes les unités et tous les bâtiments principaux de l'adversaire,
ou garder une merveille debout 8 minutes, ou faire décoller une fusée depuis le programme spatial.

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
public/js/r3d/       rendu 3D : moteur, shaders, modèles, styles des civilisations, textures
public/js/r3d/units.js  unités : anatomie, équipements, squelette et animations
public/js/r3d/nature.js  arbres, fleurs, fougères, roseaux, galets, nénuphars, oiseaux
public/js/render.js  rendu 2D « classique » (repli sans WebGL)
public/js/terrain.js champs du terrain et couleurs (minicarte, rendu 2D)
public/js/sprites.js sprites du rendu 2D
public/js/icons.js   icônes vectorielles de l'interface
public/js/audio.js   musique rock / électro, voix et bruitages (Web Audio API)
public/vendor/       Three.js et modules de post-traitement (licence MIT)
public/fonts/        polices Cinzel et Inter (licence SIL OFL)
public/js/ui.js      souris, clavier, écran tactile, interface
public/js/main.js    menu et boucle de jeu
public/js/dmath.js   calculs identiques sur tous les navigateurs (distance, sinus, cosinus)
public/js/net.js     multijoueur « lockstep » : tours, envoi des ordres, contrôle de synchronisation
public/js/online.js  connexion Supabase : compte invité, salons, canal temps réel
public/js/lobby.js   menu « En ligne » : création, code, salle d'attente, lancement
public/js/save.js    sauvegarde des parties solo (appareil et transfert par code)
public/vendor/supabase.js  client Supabase (licence MIT), chargé seulement en ligne
supabase/salons.sql  structure de la base des salons et règles d'accès
public/manifest.webmanifest, public/icons/  icône et réglages d'installation sur l'écran d'accueil
android/             application Android : manifeste, activité WebView, icônes, script de fabrication
test/                tests (node --test)
```

Le moteur tourne à pas fixe (20 mises à jour par seconde) et l'affichage interpole les
positions. Le joueur et l'IA passent par la même fonction `game.issue()`, ce qui garantit
qu'ils suivent les mêmes règles.

## Tests

```bash
npm test
```

Les tests du multijoueur simulent deux navigateurs reliés par un faux réseau (latence variable,
messages perdus) pendant plusieurs minutes de jeu et vérifient que les deux parties restent
identiques, que l'abandon est appliqué des deux côtés et qu'une divergence est bien détectée.

Les tests génèrent des cartes, vérifient la récolte et font jouer l'IA contre elle-même
pendant 16 minutes de jeu simulé, et vérifient la progression jusqu'à l'âge du Futur,
les unités volantes, les revenus de la banque, les victoires par merveille et par fusée, et
le fonctionnement des portes (passage, blocage de l'ennemi, verrouillage, brèche).

## Performances

Seuls les arbres, l'herbe et le décor visibles à l'écran sont dessinés, ce qui allège
beaucoup l'affichage. La qualité **Ultra** est prévue pour une carte graphique récente. Sur un ordinateur portable
ou une carte graphique intégrée, choisissez **Équilibrée** ou **Performance** dans le menu.

## Crédits

- [Three.js](https://threejs.org) (licence MIT, voir `public/vendor/THREE-LICENSE.txt`)
- Polices Cinzel et Inter (licence SIL Open Font License, voir `public/fonts/`)
- Graphismes, musiques et sons : générés par le code du jeu (créations originales)

## Pistes d'évolution

- Multijoueur à 3 ou 4 joueurs, équipes et IA alliées en ligne
- Revenir dans une partie en ligne après avoir rechargé la page
- Unités navales, moines et conversion
