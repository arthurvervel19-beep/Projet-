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
];

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
    range: 0, rof: 1.9, speed: 1.6, los: 5, armor: [2, 2], cls: 'infantry', from: 'fortress', age: 2,
    desc: 'Unité unique de la forteresse : robuste et redoutable.',
  },
};

export const BUILDINGS = {
  town_center: {
    name: 'Hôtel de ville', icon: '🏛️', cost: { wood: 275, stone: 100 }, size: 4, hp: 2400, time: 120,
    age: 2, pop: 5, drop: ['food', 'wood', 'gold', 'stone'], trains: ['villager'], techs: ['loom', 'wheelbarrow', 'hand_cart', 'masonry'],
    attack: { atk: 5, range: 6, rof: 2 }, armor: [3, 7], los: 8, hotkey: 'T',
    desc: 'Centre de votre civilisation. Forme des villageois et permet de changer d’âge.',
  },
  house: {
    name: 'Maison', icon: '🏠', cost: { wood: 25 }, size: 2, hp: 550, time: 18, age: 0, pop: 5,
    armor: [0, 7], los: 2, hotkey: 'H', desc: '+5 de population.',
  },
  mill: {
    name: 'Moulin', icon: '🌾', cost: { wood: 100 }, size: 2, hp: 600, time: 25, age: 0, drop: ['food'],
    techs: ['horse_collar', 'heavy_plow'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'M',
    desc: 'Dépôt de nourriture. Améliorations agricoles.',
  },
  lumber_camp: {
    name: 'Camp de bûcherons', icon: '🪓', cost: { wood: 100 }, size: 2, hp: 600, time: 25, age: 0, drop: ['wood'],
    techs: ['double_axe', 'bow_saw'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'L',
    desc: 'Dépôt de bois. Améliorations de coupe.',
  },
  mining_camp: {
    name: 'Camp de mineurs', icon: '⛏️', cost: { wood: 100 }, size: 2, hp: 600, time: 25, age: 0, drop: ['gold', 'stone'],
    techs: ['gold_mining', 'stone_mining'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'N',
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
  barracks: {
    name: 'Caserne', icon: '⚔️', cost: { wood: 175 }, size: 3, hp: 1200, time: 35, age: 0,
    trains: ['militia', 'spearman', 'swordsman', 'champion'], armor: [0, 7], los: 5, countsForAge: true, hotkey: 'B',
    desc: "Forme l'infanterie.",
  },
  archery_range: {
    name: "Camp de tir à l'arc", icon: '🏹', cost: { wood: 175 }, size: 3, hp: 1200, time: 35, age: 1,
    trains: ['archer', 'skirmisher', 'crossbowman'], armor: [0, 7], los: 5, countsForAge: true, hotkey: 'A',
    desc: 'Forme les archers.',
  },
  stable: {
    name: 'Écurie', icon: '🐎', cost: { wood: 175 }, size: 3, hp: 1200, time: 35, age: 0,
    trains: ['scout', 'knight', 'paladin'], techs: ['bloodlines'], armor: [0, 7], los: 5, countsForAge: false, hotkey: 'S',
    desc: 'Forme la cavalerie.',
  },
  blacksmith: {
    name: 'Forge', icon: '⚒️', cost: { wood: 150 }, size: 3, hp: 1200, time: 35, age: 1,
    techs: ['forging', 'iron_casting', 'fletching', 'bodkin', 'scale_armor', 'chain_mail', 'barding'],
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
    trains: ['ram', 'mangonel', 'bombard'], armor: [0, 7], los: 4, countsForAge: true, hotkey: 'W',
    desc: 'Construit les engins de siège.',
  },
  fortress: {
    name: 'Forteresse', icon: '🏰', cost: { stone: 650 }, size: 4, hp: 4800, time: 120, age: 2,
    trains: ['royal_guard'], attack: { atk: 11, range: 8, rof: 2 }, armor: [8, 11], los: 10, countsForAge: true,
    hotkey: 'C', desc: 'Puissante défense, forme la Garde royale.',
  },
};

// Ordre d'affichage du menu de construction des villageois
export const BUILD_MENU = [
  'house', 'mill', 'lumber_camp', 'mining_camp', 'farm', 'palisade', 'market', 'town_center',
  'barracks', 'archery_range', 'stable', 'blacksmith', 'tower', 'siege_workshop', 'fortress',
];

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
};

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
  };
}

export function costText(cost) {
  return Object.entries(cost || {}).map(([k, v]) => `${RES_ICON[k]} ${v}`).join('  ');
}
