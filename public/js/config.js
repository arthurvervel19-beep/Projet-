// Données du jeu : unités, bâtiments, technologies, âges.
// Ce fichier ne dépend pas du DOM : il est partagé entre le navigateur et les tests Node.

export const TILE_W = 64;
export const TILE_H = 32;
export const TICK = 1 / 20; // pas de simulation (20 mises à jour par seconde)

export const RESOURCES = ['food', 'wood', 'gold', 'stone'];
export const RES_ICON = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
export const RES_NAME = { food: 'Nourriture', wood: 'Bois', gold: 'Or', stone: 'Pierre' };

export const TERRAIN = { GRASS: 0, WATER: 1, SAND: 2, DIRT: 3 };

export const PLAYER_COLORS = ['#2f6fe0', '#d8392b', '#2fae4a', '#e0b62f'];
export const PLAYER_NAMES = ["Royaume d'Azur", 'Empire Écarlate', 'Ligue Émeraude', 'Couronne Dorée'];

export const MAX_POP = 200;
export const REACH = 0.75; // distance d'interaction (récolte, construction, mêlée)

export const AGES = [
  { name: 'Âge Tribal', short: 'I' },
  { name: 'Âge Féodal', short: 'II', cost: { food: 500 }, time: 45, req: 2 },
  { name: 'Âge des Châteaux', short: 'III', cost: { food: 800, gold: 200 }, time: 60, req: 2 },
  { name: 'Âge Impérial', short: 'IV', cost: { food: 1000, gold: 800 }, time: 75, req: 1 },
  { name: 'Âge de la Renaissance', short: 'V', cost: { food: 1600, gold: 1200 }, time: 90, req: 1 },
  { name: 'Âge Industriel', short: 'VI', cost: { food: 2000, gold: 1500, stone: 500 }, time: 100, req: 1 },
  { name: 'Âge Moderne', short: 'VII', cost: { food: 2500, gold: 2000, wood: 1000 }, time: 110, req: 1 },
  { name: 'Âge du Futur', short: 'VIII', cost: { food: 3000, gold: 2500, stone: 1500 }, time: 120, req: 1 },
];
export const WONDER_TIME = 480; // secondes à tenir une merveille pour gagner
export const LAUNCH_TIME = 240; // compte à rebours du lancement spatial

// Ressources naturelles (Gaïa)
export const RESOURCE_DEFS = {
  tree: { name: 'Arbre', res: 'wood', amount: 100 },
  gold: { name: "Filon d'or", res: 'gold', amount: 800 },
  stone: { name: 'Carrière de pierre', res: 'stone', amount: 350 },
  berries: { name: 'Buisson de baies', res: 'food', amount: 125 },
  sheep: { name: 'Mouton', res: 'food', amount: 100 },
};

// Vitesse de récolte (unités de ressource par seconde et par villageois)
export const GATHER_RATE = { sheep: 0.6, berries: 0.45, farm: 0.47, tree: 0.5, gold: 0.45, stone: 0.42 };

// cls : villager | infantry | archer | cavalry | siege
export const UNITS = {
  villager: {
    name: 'Villageois', icon: '🧑‍🌾', cost: { food: 50 }, time: 14, hp: 25, atk: 3, atkType: 'melee',
    range: 0, rof: 2, speed: 1.6, los: 4, armor: [0, 0], cls: 'villager', from: 'town_center', age: 0,
    desc: 'Récolte les ressources et construit les bâtiments.',
  },
  militia: {
    name: 'Milicien', icon: '🗡️', cost: { food: 60, gold: 20 }, time: 15, hp: 45, atk: 5, atkType: 'melee',
    range: 0, rof: 2, speed: 1.5, los: 4, armor: [0, 1], cls: 'infantry', from: 'barracks', age: 0,
    desc: 'Fantassin de base, polyvalent.',
  },
  spearman: {
    name: 'Piquier', icon: '🔱', cost: { food: 35, wood: 25 }, time: 14, hp: 45, atk: 3, atkType: 'melee',
    bonus: { cavalry: 15 }, range: 0, rof: 2.5, speed: 1.5, los: 4, armor: [0, 0], cls: 'infantry',
    from: 'barracks', age: 1, desc: 'Efficace contre la cavalerie.',
  },
  swordsman: {
    name: 'Épéiste', icon: '⚔️', cost: { food: 60, gold: 25 }, time: 16, hp: 60, atk: 9, atkType: 'melee',
    range: 0, rof: 2, speed: 1.5, los: 5, armor: [1, 1], cls: 'infantry', from: 'barracks', age: 2,
    desc: "Fantassin lourd de l'âge des châteaux.",
  },
  champion: {
    name: 'Champion', icon: '🛡️', cost: { food: 60, gold: 30 }, time: 16, hp: 80, atk: 13, atkType: 'melee',
    range: 0, rof: 2, speed: 1.5, los: 5, armor: [2, 2], cls: 'infantry', from: 'barracks', age: 3,
    desc: "Le meilleur fantassin de l'empire.",
  },
  archer: {
    name: 'Archer', icon: '🏹', cost: { wood: 25, gold: 45 }, time: 17, hp: 30, atk: 4, atkType: 'pierce',
    range: 4.5, rof: 2, speed: 1.5, los: 6, armor: [0, 0], cls: 'archer', from: 'archery_range', age: 1,
    projectile: 'arrow', bonus: { infantry: 1 }, desc: 'Tir à distance, efficace contre l’infanterie.',
  },
  skirmisher: {
    name: 'Tirailleur', icon: '🎯', cost: { food: 25, wood: 35 }, time: 15, hp: 30, atk: 2, atkType: 'pierce',
    range: 4, rof: 2.5, speed: 1.5, los: 6, armor: [0, 3], cls: 'archer', from: 'archery_range', age: 1,
    projectile: 'javelin', bonus: { archer: 4 }, desc: 'Bon marché, efficace contre les archers.',
  },
  crossbowman: {
    name: 'Arbalétrier', icon: '🎯', cost: { wood: 25, gold: 45 }, time: 18, hp: 35, atk: 5, atkType: 'pierce',
    range: 5, rof: 2, speed: 1.5, los: 7, armor: [0, 0], cls: 'archer', from: 'archery_range', age: 2,
    projectile: 'arrow', bonus: { infantry: 2 }, desc: 'Archer amélioré à longue portée.',
  },
  scout: {
    name: 'Éclaireur', icon: '🐎', cost: { food: 80 }, time: 15, hp: 45, atk: 3, atkType: 'melee',
    range: 0, rof: 2, speed: 2.6, los: 7, armor: [0, 2], cls: 'cavalry', from: 'stable', age: 0,
    desc: 'Cavalier rapide, idéal pour explorer et harceler.',
  },
  knight: {
    name: 'Chevalier', icon: '🏇', cost: { food: 60, gold: 75 }, time: 22, hp: 100, atk: 10, atkType: 'melee',
    range: 0, rof: 1.8, speed: 2.2, los: 5, armor: [2, 2], cls: 'cavalry', from: 'stable', age: 2,
    desc: 'Cavalerie lourde puissante.',
  },
  paladin: {
    name: 'Paladin', icon: '🏇', cost: { food: 60, gold: 75 }, time: 22, hp: 160, atk: 14, atkType: 'melee',
    range: 0, rof: 1.8, speed: 2.2, los: 6, armor: [2, 3], cls: 'cavalry', from: 'stable', age: 3,
    desc: 'La cavalerie d’élite impériale.',
  },
  ram: {
    name: 'Bélier', icon: '🪓', cost: { wood: 160, gold: 75 }, time: 30, hp: 175, atk: 2, atkType: 'melee',
    bonus: { building: 125 }, range: 0, rof: 5, speed: 1.0, los: 3, armor: [0, 150], cls: 'siege',
    from: 'siege_workshop', age: 2, onlyBuildings: true, desc: 'Détruit les bâtiments. Insensible aux flèches.',
  },
  mangonel: {
    name: 'Catapulte', icon: '☄️', cost: { wood: 160, gold: 135 }, time: 30, hp: 50, atk: 40, atkType: 'melee',
    bonus: { building: 20 }, range: 7, minRange: 2, rof: 6, splash: 1, speed: 1.0, los: 8, armor: [0, 6],
    cls: 'siege', from: 'siege_workshop', age: 2, projectile: 'stone', desc: 'Dégâts de zone à longue portée.',
  },
  bombard: {
    name: 'Bombarde', icon: '💣', cost: { wood: 225, gold: 225 }, time: 35, hp: 80, atk: 40, atkType: 'melee',
    bonus: { building: 150 }, range: 9, minRange: 2, rof: 6.5, speed: 0.9, los: 9, armor: [2, 5], cls: 'siege',
    from: 'siege_workshop', age: 3, projectile: 'ball', desc: 'Canon dévastateur contre les bâtiments.',
  },
  royal_guard: {
    name: 'Garde royale', icon: '👑', cost: { food: 65, gold: 50 }, time: 18, hp: 85, atk: 11, atkType: 'melee',
    range: 0, rof: 1.9, speed: 1.6, los: 5, armor: [2, 2], cls: 'infantry', from: 'fortress', age: 2, civ: 'francs',
    desc: 'Unité unique franque : chevalier à pied robuste et redoutable.',
  },
  legionary: {
    name: 'Légionnaire', icon: '🛡️', cost: { food: 60, gold: 40 }, time: 16, hp: 70, atk: 9, atkType: 'melee',
    bonus: { building: 3 }, range: 0, rof: 1.9, speed: 1.5, los: 5, armor: [3, 4], cls: 'infantry', from: 'fortress', age: 2, civ: 'romains',
    desc: 'Unité unique romaine : grand bouclier, très résistant aux flèches.',
  },
  chariot: {
    name: 'Char de guerre', icon: '🏹', cost: { food: 70, wood: 60, gold: 30 }, time: 22, hp: 95, atk: 6, atkType: 'pierce',
    bonus: { infantry: 2 }, range: 4, rof: 2, speed: 2.1, los: 7, armor: [1, 2], cls: 'cavalry', from: 'fortress', age: 2, civ: 'egyptiens',
    projectile: 'arrow', desc: 'Unité unique égyptienne : archer sur char, rapide et résistant.',
  },
  slinger: {
    name: 'Frondeur', icon: '🪨', cost: { food: 40, stone: 25 }, time: 15, hp: 40, atk: 5, atkType: 'pierce',
    bonus: { infantry: 4 }, range: 5, rof: 2, speed: 1.55, los: 7, armor: [0, 2], cls: 'archer', from: 'fortress', age: 2, civ: 'incas',
    projectile: 'pebble', desc: 'Unité unique inca : la fronde écrase l’infanterie.',
  },
  samurai: {
    name: 'Samouraï', icon: '⚔️', cost: { food: 60, gold: 40 }, time: 16, hp: 75, atk: 12, atkType: 'melee',
    bonus: { infantry: 4, cavalry: 2 }, range: 0, rof: 1.6, speed: 1.6, los: 5, armor: [1, 1], cls: 'infantry', from: 'fortress', age: 2, civ: 'japonais',
    desc: 'Unité unique japonaise : frappe vite et fort.',
  },
  // ---------------- Âge Impérial
  trebuchet: {
    name: 'Trébuchet', cost: { wood: 250, gold: 300 }, time: 40, hp: 120, atk: 150, atkType: 'melee', bonus: { building: 250 },
    range: 13, minRange: 3, rof: 10, splash: 1.2, speed: 0.8, los: 10, armor: [2, 8], cls: 'siege', from: 'siege_workshop', age: 3,
    projectile: 'stone', desc: 'Engin de siège à très longue portée.',
  },
  // ---------------- Âge de la Renaissance
  musketeer: {
    name: 'Mousquetaire', cost: { food: 60, gold: 60 }, time: 18, hp: 75, atk: 14, atkType: 'pierce', bonus: { cavalry: 6 },
    range: 5.5, rof: 3, speed: 1.45, los: 7, armor: [2, 2], cls: 'archer', from: 'archery_range', age: 4, gunpowder: true,
    projectile: 'bullet', desc: 'Infanterie à poudre noire, efficace contre la cavalerie.',
  },
  cuirassier: {
    name: 'Cuirassier', cost: { food: 100, gold: 100 }, time: 24, hp: 220, atk: 20, atkType: 'melee', range: 0, rof: 1.8,
    speed: 2.3, los: 6, armor: [4, 4], cls: 'cavalry', from: 'stable', age: 4, desc: 'Cavalerie lourde cuirassée.',
  },
  cannon: {
    name: 'Canon', cost: { wood: 300, gold: 250 }, time: 35, hp: 150, atk: 60, atkType: 'melee', bonus: { building: 120, infantry: 10 },
    range: 9, minRange: 1.5, rof: 5, splash: 1, speed: 0.95, los: 9, armor: [3, 8], cls: 'siege', from: 'siege_workshop', age: 4, gunpowder: true,
    projectile: 'shell', desc: 'Artillerie à poudre : dégâts de zone.',
  },
  // ---------------- Âge Industriel
  fusilier: {
    name: 'Fusilier', cost: { food: 70, gold: 70 }, time: 18, hp: 110, atk: 20, atkType: 'pierce', bonus: { cavalry: 10 },
    range: 6, rof: 2.5, speed: 1.5, los: 7, armor: [3, 4], cls: 'archer', from: 'archery_range', age: 5, gunpowder: true,
    projectile: 'bullet', desc: 'Fusil à baïonnette, infanterie de ligne.',
  },
  dragoon: {
    name: 'Dragon', cost: { food: 120, gold: 120 }, time: 24, hp: 200, atk: 18, atkType: 'pierce', range: 4.5, rof: 2.2,
    speed: 2.4, los: 7, armor: [3, 4], cls: 'cavalry', from: 'stable', age: 5, gunpowder: true, projectile: 'bullet',
    desc: 'Cavalerie armée de carabines.',
  },
  field_gun: {
    name: 'Artillerie de campagne', cost: { wood: 250, gold: 300 }, time: 35, hp: 200, atk: 80, atkType: 'melee', bonus: { building: 150, infantry: 15 },
    range: 10, minRange: 1.5, rof: 5, splash: 1.4, speed: 1.0, los: 10, armor: [4, 10], cls: 'siege', from: 'siege_workshop', age: 5, gunpowder: true,
    projectile: 'shell', desc: 'Canon rayé moderne à longue portée.',
  },
  // ---------------- Âge Moderne
  soldier: {
    name: 'Soldat', cost: { food: 100, gold: 100 }, time: 18, hp: 160, atk: 26, atkType: 'pierce', range: 7, rof: 1.5,
    speed: 1.7, los: 8, armor: [4, 6], cls: 'infantry', from: 'barracks', age: 6, gunpowder: true, projectile: 'bullet',
    desc: 'Fantassin moderne polyvalent, peut tirer sur les avions.',
  },
  machine_gunner: {
    name: 'Mitrailleur', cost: { food: 120, gold: 150 }, time: 22, hp: 150, atk: 9, atkType: 'pierce', bonus: { infantry: 5, cavalry: 5 },
    range: 6.5, rof: 0.35, speed: 1.35, los: 8, armor: [3, 5], cls: 'infantry', from: 'barracks', age: 6, gunpowder: true,
    projectile: 'bullet', desc: 'Cadence de tir infernale contre l’infanterie.',
  },
  tank: {
    name: "Char d'assaut", cost: { wood: 400, gold: 400 }, time: 40, hp: 900, atk: 70, atkType: 'melee', bonus: { building: 100, siege: 40 },
    range: 8, rof: 3, splash: 0.8, speed: 1.8, los: 9, armor: [12, 20], cls: 'siege', from: 'factory', age: 6,
    projectile: 'shell', desc: 'Blindé surpuissant.',
  },
  bomber: {
    name: 'Bombardier', cost: { wood: 500, gold: 500 }, time: 45, hp: 400, atk: 120, atkType: 'melee', bonus: { building: 200 },
    range: 1.2, rof: 4, splash: 1.8, speed: 3.4, los: 10, armor: [5, 5], cls: 'air', from: 'airfield', age: 6,
    projectile: 'bomb', desc: 'Avion : survole tout, intouchable au corps à corps.',
  },
  // ---------------- Âge du Futur
  exo_soldier: {
    name: 'Exo-soldat', cost: { food: 200, gold: 250 }, time: 22, hp: 400, atk: 40, atkType: 'pierce', range: 7, rof: 1,
    speed: 2.0, los: 9, armor: [8, 10], cls: 'infantry', from: 'barracks', age: 7, projectile: 'laser',
    desc: 'Fantassin en exosquelette armé d’un fusil à plasma.',
  },
  robot: {
    name: 'Robot de combat', cost: { gold: 600, stone: 300 }, time: 45, hp: 1600, atk: 60, atkType: 'pierce', bonus: { siege: 60 },
    range: 7, rof: 1.4, speed: 1.6, los: 9, armor: [15, 15], cls: 'mech', from: 'factory', age: 7, projectile: 'laser',
    desc: 'Marcheur géant cuirassé.',
  },
  drone: {
    name: 'Drone', cost: { wood: 150, gold: 300 }, time: 25, hp: 250, atk: 30, atkType: 'pierce', range: 6, rof: 1.2,
    speed: 3.6, los: 10, armor: [6, 8], cls: 'air', from: 'airfield', age: 7, projectile: 'laser',
    desc: 'Drone de combat rapide.',
  },
  berserker: {
    name: 'Berserker', icon: '🪓', cost: { food: 65, gold: 35 }, time: 15, hp: 70, atk: 13, atkType: 'melee',
    range: 0, rof: 1.8, speed: 1.85, los: 5, armor: [0, 1], cls: 'infantry', from: 'fortress', age: 2, civ: 'vikings',
    desc: 'Unité unique viking : guerrier furieux et très rapide.',
  },
};

// Civilisations : style, bonus et unité unique
export const CIVS = {
  francs: {
    name: 'Francs', realm: 'Royaume franc', unique: 'royal_guard', music: ['dorian', 'aeolian'],
    desc: 'Châteaux de pierre, colombages et tuiles.', bonus: 'Cavalerie : +20 PV. Fermes : +40 nourriture.',
    apply: (m) => { m.hp.cavalry += 20; m.farmFood += 40; },
  },
  romains: {
    name: 'Romains', realm: 'Empire romain', unique: 'legionary', music: ['aeolian', 'mixolydian'],
    desc: 'Marbre, colonnades et toits de terre cuite.', bonus: 'Infanterie : +1/+1 armure. Bâtiments : +15 % PV.',
    apply: (m) => { m.armor.infantry[0] += 1; m.armor.infantry[1] += 1; m.bhp *= 1.15; },
  },
  egyptiens: {
    name: 'Égyptiens', realm: "Royaume d'Égypte", unique: 'chariot', music: ['hijaz', 'phrygian'],
    desc: 'Grès, pylônes, obélisques et toits plats.', bonus: "Récolte de l'or et de la pierre : +20 %.",
    apply: (m) => { m.gather.gold *= 1.2; m.gather.stone *= 1.2; },
  },
  incas: {
    name: 'Incas', realm: 'Empire inca', unique: 'slinger', music: ['pentaMinor', 'dorian'],
    desc: 'Pierres ajustées, portes trapézoïdales, toits de chaume.', bonus: 'Villageois : +1/+1 armure. Maisons : +3 population.',
    apply: (m) => { m.vilArmor[0] += 1; m.vilArmor[1] += 1; m.housePop += 3; },
  },
  japonais: {
    name: 'Japonais', realm: 'Shogunat du Japon', unique: 'samurai', music: ['inScale', 'aeolian'],
    desc: 'Bois sombre, cloisons blanches et toits incurvés.', bonus: "L'infanterie attaque 20 % plus vite. Bûcherons : +15 %.",
    apply: (m) => { m.rof.infantry *= 0.8; m.gather.tree *= 1.15; },
  },
  vikings: {
    name: 'Vikings', realm: 'Jarls du Nord', unique: 'berserker', music: ['dorian', 'aeolian'],
    desc: 'Longues maisons de rondins, toits pentus, proues de dragon.', bonus: 'Infanterie : +15 % de vitesse. Villageois : +10 PV.',
    apply: (m) => { m.speed.infantry *= 1.15; m.vilHp += 10; },
  },
};
export const CIV_IDS = Object.keys(CIVS);

export const BUILDINGS = {
  town_center: {
    name: 'Hôtel de ville', icon: '🏛️', cost: { wood: 275, stone: 100 }, size: 4, hp: 2400, time: 120,
    age: 2, pop: 5, drop: ['food', 'wood', 'gold', 'stone'], trains: ['villager'], techs: ['loom', 'wheelbarrow', 'hand_cart', 'masonry', 'census', 'railway'],
    attack: { atk: 5, range: 6, rof: 2 }, armor: [3, 7], los: 8, hotkey: 'T',
    desc: 'Centre de votre civilisation. Forme des villageois et permet de changer d’âge.',
  },
  house: {
    name: 'Maison', icon: '🏠', cost: { wood: 25 }, size: 2, hp: 550, time: 18, age: 0, pop: 5,
    armor: [0, 7], los: 2, hotkey: 'H', desc: '+5 de population.',
  },
  mill: {
    name: 'Moulin', icon: '🌾', cost: { wood: 100 }, size: 2, hp: 600, time: 25, age: 0, drop: ['food'],
    techs: ['horse_collar', 'heavy_plow', 'crop_rotation'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'M',
    desc: 'Dépôt de nourriture. Améliorations agricoles.',
  },
  lumber_camp: {
    name: 'Camp de bûcherons', icon: '🪓', cost: { wood: 100 }, size: 2, hp: 600, time: 25, age: 0, drop: ['wood'],
    techs: ['double_axe', 'bow_saw', 'two_man_saw'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'L',
    desc: 'Dépôt de bois. Améliorations de coupe.',
  },
  mining_camp: {
    name: 'Camp de mineurs', icon: '⛏️', cost: { wood: 100 }, size: 2, hp: 600, time: 25, age: 0, drop: ['gold', 'stone'],
    techs: ['gold_mining', 'stone_mining', 'gold_shaft', 'stone_shaft'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'N',
    desc: "Dépôt d'or et de pierre.",
  },
  farm: {
    name: 'Ferme', icon: '🟫', cost: { wood: 60 }, size: 3, hp: 480, time: 15, age: 0, farm: true, food: 175,
    armor: [0, 0], los: 1, hotkey: 'F', desc: 'Source de nourriture inépuisable (se ressème automatiquement).',
  },
  palisade: {
    name: 'Palissade', icon: '🪵', cost: { wood: 2 }, size: 1, hp: 250, time: 4, age: 0, wall: true,
    armor: [2, 5], los: 1, hotkey: 'P', desc: 'Mur de bois. Cliquez-glissez pour tracer une ligne.',
  },
  stone_wall: {
    name: 'Muraille de pierre', icon: '🧱', cost: { stone: 6 }, size: 1, hp: 1800, time: 7, age: 1, wall: true,
    armor: [8, 10], los: 2, hotkey: 'U', desc: 'Rempart crénelé très résistant. Cliquez-glissez pour tracer une ligne.',
  },
  palisade_gate: {
    name: 'Porte de palissade', icon: '🚪', cost: { wood: 30 }, size: 1, hp: 500, time: 10, age: 0, wall: true, gate: true, gateOf: 'palisade',
    armor: [2, 5], los: 2, hotkey: 'R',
    desc: "Porte en bois : vos unités la franchissent, l'ennemi reste bloqué. Placez-la sur une palissade existante ou dans un passage.",
  },
  gate: {
    name: 'Porterie', icon: '🏰', cost: { stone: 30 }, size: 1, hp: 2600, time: 18, age: 1, wall: true, gate: true, gateOf: 'stone_wall',
    armor: [8, 10], los: 3, hotkey: 'E',
    desc: "Porte fortifiée encadrée de deux tours : vos unités passent, l'ennemi reste bloqué. Placez-la sur une muraille existante ou dans un passage. Peut être verrouillée.",
  },
  barracks: {
    name: 'Caserne', icon: '⚔️', cost: { wood: 175 }, size: 3, hp: 1200, time: 35, age: 0,
    trains: ['militia', 'spearman', 'swordsman', 'champion', 'soldier', 'machine_gunner', 'exo_soldier'], techs: ['conscription'], armor: [0, 7], los: 5, countsForAge: true, hotkey: 'B',
    desc: "Forme l'infanterie.",
  },
  archery_range: {
    name: "Camp de tir à l'arc", icon: '🏹', cost: { wood: 175 }, size: 3, hp: 1200, time: 35, age: 1,
    trains: ['archer', 'skirmisher', 'crossbowman', 'musketeer', 'fusilier'], armor: [0, 7], los: 5, countsForAge: true, hotkey: 'A',
    desc: 'Forme les archers.',
  },
  stable: {
    name: 'Écurie', icon: '🐎', cost: { wood: 175 }, size: 3, hp: 1200, time: 35, age: 0,
    trains: ['scout', 'knight', 'paladin', 'cuirassier', 'dragoon'], techs: ['bloodlines'], armor: [0, 7], los: 5, countsForAge: false, hotkey: 'S',
    desc: 'Forme la cavalerie.',
  },
  blacksmith: {
    name: 'Forge', icon: '⚒️', cost: { wood: 150 }, size: 3, hp: 1200, time: 35, age: 1,
    techs: ['forging', 'iron_casting', 'blast_furnace', 'fletching', 'bodkin', 'scale_armor', 'chain_mail', 'plate_armor', 'barding', 'plate_barding', 'flintlock', 'rifling', 'kevlar'],
    armor: [0, 7], los: 4, countsForAge: true, hotkey: 'G', desc: 'Améliore l’attaque et l’armure des unités.',
  },
  market: {
    name: 'Marché', icon: '⚖️', cost: { wood: 175 }, size: 3, hp: 1200, time: 40, age: 1, market: true,
    armor: [0, 7], los: 4, countsForAge: true, hotkey: 'K', desc: "Achetez et vendez des ressources contre de l'or.",
  },
  tower: {
    name: 'Tour de guet', icon: '🗼', cost: { wood: 25, stone: 125 }, size: 1, hp: 1020, time: 45, age: 1,
    attack: { atk: 5, range: 7, rof: 2 }, armor: [1, 7], los: 9, hotkey: 'O', desc: 'Tire des flèches sur les ennemis.',
  },
  siege_workshop: {
    name: 'Atelier de siège', icon: '🛠️', cost: { wood: 200 }, size: 3, hp: 1500, time: 40, age: 2,
    trains: ['ram', 'mangonel', 'bombard', 'trebuchet', 'cannon', 'field_gun'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'W',
    desc: 'Construit les engins de siège.',
  },
  fortress: {
    name: 'Forteresse', icon: '🏰', cost: { stone: 650 }, size: 4, hp: 4800, time: 120, age: 2,
    trains: ['royal_guard', 'legionary', 'chariot', 'slinger', 'samurai', 'berserker'], attack: { atk: 11, range: 8, rof: 2 }, armor: [8, 11], los: 10, countsForAge: true,
    hotkey: 'C', desc: 'Puissante défense, forme l’unité unique de votre civilisation.',
  },
  // ---------------- bâtiments des âges avancés
  university: {
    name: 'Université', cost: { wood: 250, gold: 150 }, size: 3, hp: 2000, time: 60, age: 3, countsForAge: true,
    techs: ['chemistry', 'architecture', 'printing', 'medicine', 'radar', 'ai_tactics', 'nanotech'], armor: [2, 8], los: 5, hotkey: 'Y',
    desc: 'Recherches scientifiques. Nécessaire pour la Renaissance.',
  },
  wonder: {
    name: 'Merveille', cost: { wood: 1000, gold: 1000, stone: 1000 }, size: 5, hp: 9000, time: 360, age: 3, wonder: true, unique: true,
    armor: [6, 10], los: 8, hotkey: 'E', desc: 'Monument propre à votre civilisation. Victoire si elle reste debout 8 minutes.',
  },
  bank: {
    name: 'Banque', cost: { wood: 300, gold: 200 }, size: 3, hp: 2200, time: 60, age: 4, countsForAge: true, income: { gold: 1 },
    techs: ['compound_interest', 'bastion'], armor: [3, 8], los: 4, hotkey: 'J', desc: 'Produit de l’or en continu. Nécessaire pour l’ère industrielle.',
  },
  factory: {
    name: 'Usine', cost: { wood: 600, stone: 400 }, size: 4, hp: 3500, time: 90, age: 5, countsForAge: true, factory: true,
    trains: ['tank', 'robot'], techs: ['steam_power', 'mechanization', 'fusion'], armor: [4, 10], los: 5, hotkey: 'I',
    desc: 'Produit la ressource choisie en continu et construit les blindés.',
  },
  bunker: {
    name: 'Bunker', cost: { stone: 300, gold: 100 }, size: 2, hp: 3000, time: 45, age: 5,
    attack: { atk: 12, range: 7, rof: 0.6, kind: 'bullet' }, armor: [10, 14], los: 9, hotkey: 'Q', desc: 'Casemate de béton armée de mitrailleuses.',
  },
  airfield: {
    name: 'Aérodrome', cost: { wood: 500, gold: 400, stone: 300 }, size: 4, hp: 3000, time: 90, age: 6, countsForAge: true,
    trains: ['bomber', 'drone'], techs: ['jet_engines'], armor: [3, 8], los: 8, hotkey: 'D', desc: 'Forme les unités aériennes. Nécessaire pour l’âge du futur.',
  },
  laser_turret: {
    name: 'Tourelle à plasma', cost: { gold: 300, stone: 300 }, size: 1, hp: 2500, time: 50, age: 7,
    attack: { atk: 45, range: 9, rof: 1.5, kind: 'laser' }, armor: [12, 16], los: 10, hotkey: 'Z', desc: 'Défense futuriste à rayon plasma.',
  },
  space_program: {
    name: 'Programme spatial', cost: { food: 2500, wood: 2500, gold: 3000, stone: 2000 }, size: 5, hp: 10000, time: 360, age: 7,
    space: true, unique: true, armor: [8, 12], los: 8, hotkey: 'R', desc: 'Construisez-le puis protégez-le : le lancement de la fusée apporte la victoire scientifique.',
  },
};

// Ordre d'affichage du menu de construction des villageois
export const BUILD_PAGES = [
  { name: 'Économie', list: ['house', 'mill', 'lumber_camp', 'mining_camp', 'farm', 'market', 'town_center', 'university', 'bank', 'factory', 'wonder', 'space_program'] },
  { name: 'Armée et défense', list: ['palisade', 'palisade_gate', 'stone_wall', 'gate', 'tower', 'barracks', 'archery_range', 'stable', 'blacksmith', 'siege_workshop', 'fortress', 'bunker', 'airfield', 'laser_turret'] },
];
export const BUILD_MENU = BUILD_PAGES.flatMap((p) => p.list);

// Technologies : apply(mods) modifie les bonus du joueur
export const TECHS = {
  loom: {
    name: 'Métier à tisser', icon: '🧵', cost: { gold: 50 }, time: 20, age: 0,
    desc: 'Villageois : +15 PV, +1/+2 armure.', apply: (m) => { m.vilHp += 15; m.vilArmor[0] += 1; m.vilArmor[1] += 2; },
  },
  wheelbarrow: {
    name: 'Brouette', icon: '🛒', cost: { food: 175, wood: 50 }, time: 35, age: 1,
    desc: 'Villageois : +10% vitesse, +3 de capacité.', apply: (m) => { m.vilSpeed *= 1.1; m.carry += 3; },
  },
  hand_cart: {
    name: 'Charrette à bras', icon: '🛞', cost: { food: 300, wood: 200 }, time: 45, age: 2, req: 'wheelbarrow',
    desc: 'Villageois : +10% vitesse, +4 de capacité.', apply: (m) => { m.vilSpeed *= 1.1; m.carry += 4; },
  },
  masonry: {
    name: 'Maçonnerie', icon: '🧱', cost: { wood: 175, stone: 150 }, time: 40, age: 2,
    desc: 'Bâtiments : +10% PV, +1/+1 armure.', apply: (m) => { m.bhp *= 1.1; m.armor.building[0] += 1; m.armor.building[1] += 1; },
  },
  double_axe: {
    name: 'Hache double', icon: '🪓', cost: { food: 100, wood: 50 }, time: 20, age: 0,
    desc: 'Bûcherons : +20% de vitesse de coupe.', apply: (m) => { m.gather.tree *= 1.2; },
  },
  bow_saw: {
    name: 'Scie à arc', icon: '🪚', cost: { food: 150, wood: 100 }, time: 30, age: 1, req: 'double_axe',
    desc: 'Bûcherons : +20% de vitesse de coupe.', apply: (m) => { m.gather.tree *= 1.2; },
  },
  horse_collar: {
    name: 'Collier d’attelage', icon: '🐴', cost: { food: 75, wood: 75 }, time: 20, age: 0,
    desc: 'Fermiers : +15% de production, fermes +75 nourriture.', apply: (m) => { m.gather.farm *= 1.15; m.farmFood += 75; },
  },
  heavy_plow: {
    name: 'Charrue lourde', icon: '🌱', cost: { food: 125, wood: 125 }, time: 30, age: 1, req: 'horse_collar',
    desc: 'Fermiers : +15% de production, cueillette +10%.', apply: (m) => { m.gather.farm *= 1.15; m.gather.berries *= 1.1; m.farmFood += 100; },
  },
  gold_mining: {
    name: "Extraction de l'or", icon: '🪙', cost: { food: 100, wood: 75 }, time: 25, age: 0,
    desc: 'Mineurs d’or : +15%.', apply: (m) => { m.gather.gold *= 1.15; },
  },
  stone_mining: {
    name: 'Taille de pierre', icon: '🪨', cost: { food: 100, wood: 75 }, time: 25, age: 0,
    desc: 'Mineurs de pierre : +15%.', apply: (m) => { m.gather.stone *= 1.15; },
  },
  forging: {
    name: 'Fer forgé', icon: '🔨', cost: { food: 150 }, time: 30, age: 1,
    desc: 'Infanterie et cavalerie : +1 attaque.', apply: (m) => { m.atk.infantry += 1; m.atk.cavalry += 1; },
  },
  iron_casting: {
    name: 'Fonte du fer', icon: '🔥', cost: { food: 220, gold: 120 }, time: 40, age: 2, req: 'forging',
    desc: 'Infanterie et cavalerie : +1 attaque.', apply: (m) => { m.atk.infantry += 1; m.atk.cavalry += 1; },
  },
  fletching: {
    name: 'Empennage', icon: '🪶', cost: { food: 100, gold: 50 }, time: 30, age: 1,
    desc: 'Archers et bâtiments : +1 attaque, +1 portée.',
    apply: (m) => { m.atk.archer += 1; m.range.archer += 1; m.atk.building += 1; m.range.building += 1; },
  },
  bodkin: {
    name: 'Flèches perforantes', icon: '➶', cost: { food: 200, gold: 100 }, time: 40, age: 2, req: 'fletching',
    desc: 'Archers et bâtiments : +1 attaque, +1 portée.',
    apply: (m) => { m.atk.archer += 1; m.range.archer += 1; m.atk.building += 1; m.range.building += 1; },
  },
  scale_armor: {
    name: 'Armure d’écailles', icon: '🥋', cost: { food: 100 }, time: 30, age: 1,
    desc: 'Infanterie : +1/+1 armure.', apply: (m) => { m.armor.infantry[0] += 1; m.armor.infantry[1] += 1; },
  },
  chain_mail: {
    name: 'Cotte de mailles', icon: '⛓️', cost: { food: 200, gold: 100 }, time: 40, age: 2, req: 'scale_armor',
    desc: 'Infanterie : +1/+1 armure.', apply: (m) => { m.armor.infantry[0] += 1; m.armor.infantry[1] += 1; },
  },
  barding: {
    name: 'Barde de cheval', icon: '🐎', cost: { food: 150 }, time: 30, age: 1,
    desc: 'Cavalerie : +1/+1 armure.', apply: (m) => { m.armor.cavalry[0] += 1; m.armor.cavalry[1] += 1; },
  },
  bloodlines: {
    name: 'Lignées', icon: '🧬', cost: { food: 150, gold: 100 }, time: 30, age: 1,
    desc: 'Cavalerie : +20 PV.', apply: (m) => { m.hp.cavalry += 20; },
  },
  // ---------------- Âge Impérial
  census: { name: 'Recensement impérial', cost: { food: 400, gold: 300 }, time: 50, age: 3, desc: 'Population maximale : +50.', apply: (m) => { m.maxPop += 50; } },
  crop_rotation: { name: 'Rotation des cultures', cost: { food: 250, wood: 250 }, time: 40, age: 3, req: 'heavy_plow', desc: 'Fermiers : +20 %.', apply: (m) => { m.gather.farm *= 1.2; m.farmFood += 150; } },
  two_man_saw: { name: 'Scie de long', cost: { food: 300, wood: 100 }, time: 40, age: 3, req: 'bow_saw', desc: 'Bûcherons : +20 %.', apply: (m) => { m.gather.tree *= 1.2; } },
  gold_shaft: { name: 'Puits de mine', cost: { food: 200, wood: 150 }, time: 40, age: 3, req: 'gold_mining', desc: "Mineurs d'or : +20 %.", apply: (m) => { m.gather.gold *= 1.2; } },
  stone_shaft: { name: 'Carrière profonde', cost: { food: 200, wood: 150 }, time: 40, age: 3, req: 'stone_mining', desc: 'Mineurs de pierre : +20 %.', apply: (m) => { m.gather.stone *= 1.2; } },
  blast_furnace: { name: 'Haut fourneau', cost: { food: 275, gold: 225 }, time: 50, age: 3, req: 'iron_casting', desc: 'Infanterie et cavalerie : +2 attaque.', apply: (m) => { m.atk.infantry += 2; m.atk.cavalry += 2; } },
  plate_armor: { name: 'Armure de plates', cost: { food: 300, gold: 150 }, time: 50, age: 3, req: 'chain_mail', desc: 'Infanterie : +1/+2 armure.', apply: (m) => { m.armor.infantry[0] += 1; m.armor.infantry[1] += 2; } },
  plate_barding: { name: 'Barde de plates', cost: { food: 350, gold: 200 }, time: 50, age: 3, req: 'barding', desc: 'Cavalerie : +1/+2 armure.', apply: (m) => { m.armor.cavalry[0] += 1; m.armor.cavalry[1] += 2; } },
  conscription: { name: 'Conscription', cost: { food: 400, gold: 200 }, time: 50, age: 3, desc: 'Unités militaires formées 33 % plus vite.', apply: (m) => { m.trainSpeed *= 1.33; } },
  chemistry: { name: 'Chimie', cost: { food: 300, gold: 200 }, time: 50, age: 3, desc: 'Projectiles : +1 attaque. Prépare la poudre à canon.', apply: (m) => { m.atk.archer += 1; m.atk.siege += 1; m.atk.building += 1; } },
  architecture: { name: 'Architecture', cost: { wood: 300, stone: 200 }, time: 50, age: 3, desc: 'Bâtiments : +20 % PV.', apply: (m) => { m.bhp *= 1.2; } },
  // ---------------- Renaissance
  printing: { name: 'Imprimerie', cost: { wood: 300, gold: 300 }, time: 50, age: 4, desc: 'Recherches 30 % plus rapides.', apply: (m) => { m.researchSpeed *= 1.3; } },
  compound_interest: { name: 'Intérêts composés', cost: { food: 400, wood: 400 }, time: 50, age: 4, desc: 'Banques : +50 % d’or.', apply: (m) => { m.income.bank *= 1.5; } },
  bastion: { name: 'Fortifications bastionnées', cost: { stone: 500, gold: 200 }, time: 60, age: 4, desc: 'Bâtiments : +3/+3 armure.', apply: (m) => { m.armor.building[0] += 3; m.armor.building[1] += 3; } },
  flintlock: { name: 'Platine à silex', cost: { food: 400, gold: 300 }, time: 50, age: 4, desc: 'Armes à poudre : +3 attaque.', apply: (m) => { m.gunAtk += 3; } },
  // ---------------- Industriel
  medicine: { name: 'Médecine', cost: { food: 600, gold: 400 }, time: 60, age: 5, desc: 'Les unités se soignent lentement.', apply: (m) => { m.regen += 0.4; } },
  railway: { name: 'Chemin de fer', cost: { wood: 800, gold: 500 }, time: 60, age: 5, desc: 'Toutes les unités : +12 % de vitesse.', apply: (m) => { m.speedAll *= 1.12; } },
  steam_power: { name: 'Machine à vapeur', cost: { wood: 600, gold: 400 }, time: 60, age: 5, desc: 'Usines : +50 % de production. Villageois : +10 %.', apply: (m) => { m.income.factory *= 1.5; for (const k of Object.keys(m.gather)) m.gather[k] *= 1.1; } },
  rifling: { name: 'Canon rayé', cost: { food: 500, gold: 500 }, time: 60, age: 5, desc: 'Armes à poudre : +1 portée, +3 attaque.', apply: (m) => { m.gunRange += 1; m.gunAtk += 3; } },
  // ---------------- Moderne
  radar: { name: 'Radar', cost: { gold: 800 }, time: 60, age: 6, desc: 'Toutes les unités : +3 de vision.', apply: (m) => { m.losAll += 3; } },
  mechanization: { name: 'Mécanisation', cost: { wood: 800, gold: 800 }, time: 70, age: 6, desc: 'Fermiers : +30 %. Usines : +25 %.', apply: (m) => { m.gather.farm *= 1.3; m.income.factory *= 1.25; } },
  kevlar: { name: 'Kevlar', cost: { food: 800, gold: 600 }, time: 60, age: 6, desc: 'Infanterie : +3/+4 armure.', apply: (m) => { m.armor.infantry[0] += 3; m.armor.infantry[1] += 4; } },
  jet_engines: { name: 'Moteurs à réaction', cost: { wood: 600, gold: 900 }, time: 70, age: 6, desc: 'Unités aériennes : +30 % de vitesse, +100 PV.', apply: (m) => { m.speed.air = (m.speed.air || 1) * 1.3; m.hp.air = (m.hp.air || 0) + 100; } },
  // ---------------- Futur
  ai_tactics: { name: 'Tactique par IA', cost: { gold: 1500, stone: 500 }, time: 80, age: 7, desc: 'Toutes les unités : +4 attaque.', apply: (m) => { m.atkAll += 4; } },
  nanotech: { name: 'Nanotechnologie', cost: { food: 1200, gold: 1200 }, time: 80, age: 7, desc: 'Unités et bâtiments se réparent seuls. Toutes les unités : +3/+3 armure.', apply: (m) => { m.regen += 2; m.bregen += 6; m.armorAll[0] += 3; m.armorAll[1] += 3; } },
  fusion: { name: 'Fusion nucléaire', cost: { wood: 1500, gold: 1500 }, time: 90, age: 7, desc: 'Usines et banques : production doublée.', apply: (m) => { m.income.factory *= 2; m.income.bank *= 2; } },
};

// tranche d'âge des technologies pour les icônes
export const TECH_AGE_NAMES = ['Tribal', 'Féodal', 'Châteaux', 'Impérial', 'Renaissance', 'Industriel', 'Moderne', 'Futur'];

export function defaultMods() {
  return {
    gather: { sheep: 1, berries: 1, farm: 1, tree: 1, gold: 1, stone: 1 },
    carry: 10,
    farmFood: 0,
    vilSpeed: 1,
    vilHp: 0,
    vilArmor: [0, 0],
    atk: { infantry: 0, cavalry: 0, archer: 0, siege: 0, building: 0 },
    armor: { infantry: [0, 0], cavalry: [0, 0], archer: [0, 0], siege: [0, 0], building: [0, 0] },
    range: { archer: 0, building: 0 },
    hp: { infantry: 0, cavalry: 0, archer: 0, siege: 0 },
    bhp: 1,
    housePop: 0,
    rof: { villager: 1, infantry: 1, cavalry: 1, archer: 1, siege: 1, mech: 1, air: 1 },
    speed: { villager: 1, infantry: 1, cavalry: 1, archer: 1, siege: 1, mech: 1, air: 1 },
    maxPop: 200,
    trainSpeed: 1,
    researchSpeed: 1,
    regen: 0,
    bregen: 0,
    income: { bank: 1, factory: 1 },
    gunAtk: 0,
    gunRange: 0,
    atkAll: 0,
    armorAll: [0, 0],
    losAll: 0,
    speedAll: 1,
  };
}

export function costText(cost) {
  return Object.entries(cost || {}).map(([k, v]) => `${RES_ICON[k]} ${v}`).join('  ');
}
