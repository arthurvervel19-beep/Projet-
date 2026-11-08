// Jeu d'icônes vectorielles (SVG) dessinées pour le jeu : nettes à toutes les tailles.

const S = (body, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// icônes « trait » (prennent la couleur du texte)
const LINE = {
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" fill-opacity=".25"/>',
  sword: '<path d="M14.5 4.5 20 4l-.5 5.5-9 9-2-2-2 2-1.5-1.5 2-2-2-2z" fill="currentColor" fill-opacity=".2"/><path d="m9 15 6-6"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" fill="currentColor" fill-opacity=".2"/><path d="M12 3v18"/>',
  range: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity=".3"/>',
  pop: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="16.5" cy="9" r="2.4"/><path d="M15 14.2c3 0 5.5 1.6 5.5 4.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  idle: '<path d="M4 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="10" cy="9" r="3.2"/><path d="M15 4h4l-4 4h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" fill-opacity=".15"/><path d="M8 10V7a4 4 0 0 1 7.5-1.8"/><path d="M12 14v2"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor" fill-opacity=".3"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor" fill-opacity=".3"/>',
  stop: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" fill="currentColor" fill-opacity=".2"/><path d="M8.5 12h7"/>',
  attackMove: '<path d="m4 20 9-9M13 5l5-1-1 5-4 4-4-4z" fill="currentColor" fill-opacity=".2"/><path d="M4 4l4 4M4 8V4h4"/>',
  delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  ageUp: '<path d="m4 16 2-9 4 4 2-6 2 6 4-4 2 9z" fill="currentColor" fill-opacity=".25"/><path d="M4 20h16"/>',
  buy: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  sell: '<path d="M12 20V8M7 13l5-5 5 5"/><path d="M5 4h14"/>',
  speed: '<path d="M4 6l7 6-7 6zM13 6l7 6-7 6z" fill="currentColor" fill-opacity=".25"/>',
  gather: '<path d="M5 19 15 9M13 5l6 6-2 2-6-6z" fill="currentColor" fill-opacity=".2"/>',
  hammer: '<path d="m14 6 4 4-2 2-4-4z" fill="currentColor" fill-opacity=".25"/><path d="M12 8 4 16l4 4 8-8M15 4l5 5"/>',
};

// icônes de technologies (pleines, dorées)
const TECH = {
  loom: '<ellipse cx="12" cy="6" rx="6" ry="2"/><ellipse cx="12" cy="18" rx="6" ry="2"/><path d="M6 6v12M18 6v12"/><path d="M6 9h12M6 12h12M6 15h12" stroke-width="1"/>',
  wheelbarrow: '<path d="M3 9h12l-2 6H6z" fill="currentColor" fill-opacity=".3"/><circle cx="14" cy="18" r="2.5"/><path d="M15 9l5-3M6 15l-1 4"/>',
  hand_cart: '<path d="M3 8h13v7H3z" fill="currentColor" fill-opacity=".3"/><circle cx="7" cy="18" r="2.5"/><circle cx="13" cy="18" r="2.5"/><path d="M16 9l5-2"/>',
  masonry: '<path d="M3 5h8v4H3zM13 5h8v4h-8zM7 10h10v4H7zM3 15h8v4H3zM13 15h8v4h-8z" fill="currentColor" fill-opacity=".3"/>',
  double_axe: '<path d="M12 3v18"/><path d="M12 6c-4-2-7 0-7 3s3 5 7 3zM12 6c4-2 7 0 7 3s-3 5-7 3z" fill="currentColor" fill-opacity=".3"/>',
  bow_saw: '<path d="M4 16c2-8 14-8 16 0"/><path d="M4 16h16" stroke-dasharray="1.5 1.2"/><path d="M4 16v3M20 16v3"/>',
  horse_collar: '<path d="M7 4c-3 4-3 12 2 16h6c5-4 5-12 2-16" fill="currentColor" fill-opacity=".2"/><path d="M9 7c-1 3-1 7 1 10M15 7c1 3 1 7-1 10"/>',
  heavy_plow: '<path d="M3 18h12l5-6-4-1-4 4H5z" fill="currentColor" fill-opacity=".3"/><path d="M8 15l3-10M12 8c2-3 5-3 6-1"/>',
  gold_mining: '<path d="M4 20 13 11M10 6c4-3 8-2 10 1-3-1-6 0-9 2z" fill="currentColor" fill-opacity=".2"/><circle cx="17" cy="17" r="3" fill="#f2c230" stroke="#a87810"/>',
  stone_mining: '<path d="M4 20 13 11M10 6c4-3 8-2 10 1-3-1-6 0-9 2z" fill="currentColor" fill-opacity=".2"/><path d="m14 15 4-1 3 3-2 4h-4l-2-3z" fill="#b8bcc0" stroke="#6e7174"/>',
  forging: '<path d="M4 14h12l2-3H8l-1-3H4z" fill="currentColor" fill-opacity=".3"/><path d="M9 14v3h-2v3h10v-3h-2v-3"/><path d="M17 4l3 3-3 1-1-1z" fill="currentColor"/>',
  iron_casting: '<path d="M5 14h12l2-3H9l-1-3H5z" fill="currentColor" fill-opacity=".3"/><path d="M10 14v3H8v3h10v-3h-2v-3"/><path d="M15 8c0-2 2-3 2-5 1 2 3 3 3 5a2.5 2.5 0 0 1-5 0z" fill="#ff8a30" stroke="#c04a10"/>',
  fletching: '<path d="M19 3c-7 1-12 6-13 13l2 2c7-1 12-6 13-13z" fill="currentColor" fill-opacity=".25"/><path d="M4 20 15 9M9 11h4M11 8h4"/>',
  bodkin: '<path d="M3 21 15 9"/><path d="m13 5 6 0 0 6-3 1-4-4z" fill="currentColor" fill-opacity=".4"/>',
  scale_armor: '<path d="M6 4h12l2 5-3 2v9H7v-9L4 9z" fill="currentColor" fill-opacity=".2"/><path d="M8 12c1 1 2 1 3 0 1 1 2 1 3 0 1 1 2 1 2 0M8 15c1 1 2 1 3 0 1 1 2 1 3 0 1 1 2 1 2 0M8 18c1 1 2 1 3 0 1 1 2 1 3 0 1 1 2 1 2 0" stroke-width="1.1"/>',
  chain_mail: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="12" cy="12" r="3"/><circle cx="8" cy="16" r="3"/><circle cx="16" cy="16" r="3"/>',
  barding: '<path d="M6 20V9c0-3 3-5 6-5 4 0 6 3 6 6v10" fill="currentColor" fill-opacity=".2"/><path d="M6 13h12M9 17h6"/>',
  bloodlines: '<path d="M8 21c0-4 1-6 3-8-3 0-5-2-5-5 2 1 4 1 5 0 1-3 3-4 6-4-1 2 0 4 2 5l-2 3-3 1c1 3 0 6-1 8z" fill="currentColor" fill-opacity=".25"/>',
  census: '<path d="M6 3h10l3 3v15H6z" fill="currentColor" fill-opacity=".2"/><path d="M9 8h7M9 12h7M9 16h5"/>',
  crop_rotation: '<path d="M12 21V10M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 11c0-3 2-5 5-5 0 3-2 5-5 5z" fill="currentColor" fill-opacity=".3"/><path d="M4 21h16"/><path d="M5 17a7 7 0 0 1 3-6" stroke-dasharray="2 2"/>',
  two_man_saw: '<path d="M3 14h18l-2 3H5z" fill="currentColor" fill-opacity=".3"/><path d="M3 14v-4M21 14v-4M5 17l1 1M9 17l1 1M13 17l1 1M17 17l1 1"/>',
  gold_shaft: '<path d="M4 4h4v16H4zM16 4h4v16h-4zM8 8h8M8 14h8"/><circle cx="12" cy="18" r="2.5" fill="#f2c230" stroke="#a87810"/>',
  stone_shaft: '<path d="M4 4h4v16H4zM16 4h4v16h-4zM8 8h8M8 14h8"/><path d="m10 17 3-2 2 2-1 3h-3z" fill="#b8bcc0" stroke="#6e7174"/>',
  blast_furnace: '<path d="M7 21V9l5-5 5 5v12z" fill="currentColor" fill-opacity=".2"/><path d="M10 21v-5a2 2 0 0 1 4 0v5"/><path d="M11 12c0-1.5 1-2 1-3 1 1 2 1.5 2 3a1.5 1.5 0 0 1-3 0z" fill="#ff8a30" stroke="#c04a10"/>',
  plate_armor: '<path d="M7 3h10l3 4-2 3v11H6V10L4 7z" fill="currentColor" fill-opacity=".3"/><path d="M6 13h12M6 17h12M12 3v18"/>',
  plate_barding: '<path d="M6 20V9c0-3 3-5 6-5 4 0 6 3 6 6v10" fill="currentColor" fill-opacity=".35"/><path d="M6 12h12M6 16h12"/>',
  conscription: '<path d="M6 21V4M6 4h11l-2 4 2 4H6" fill="currentColor" fill-opacity=".25"/><circle cx="17" cy="18" r="2.5"/><path d="M17 15v-1"/>',
  chemistry: '<path d="M10 3h4M11 3v6l-6 10a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L13 9V3" /><path d="M7.5 15h9l2 4H5.5z" fill="currentColor" fill-opacity=".35"/>',
  architecture: '<path d="M4 8 12 3l8 5z" fill="currentColor" fill-opacity=".3"/><path d="M6 8v10M10 8v10M14 8v10M18 8v10M4 20h16M4 18h16"/>',
  printing: '<path d="M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1zM20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z" fill="currentColor" fill-opacity=".2"/>',
  compound_interest: '<ellipse cx="12" cy="17" rx="6" ry="2.5" fill="#f2c230" stroke="#a87810"/><ellipse cx="12" cy="13" rx="6" ry="2.5" fill="#f2c230" stroke="#a87810"/><path d="M15 7l3-3 3 3M18 4v6"/>',
  bastion: '<path d="M12 2l4 5h5l-3 5 3 5h-5l-4 5-4-5H3l3-5-3-5h5z" fill="currentColor" fill-opacity=".25"/>',
  flintlock: '<path d="M3 13h13l2-2h3v4h-6l-2 3H9l-1-3H3z" fill="currentColor" fill-opacity=".3"/><path d="M16 11l-2-4"/>',
  medicine: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" fill-opacity=".3"/>',
  railway: '<path d="M8 3 5 21M16 3l3 18M7 7h10M6.4 11h11.2M5.8 15h12.4M5.2 19h13.6"/>',
  steam_power: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="6.5" fill="currentColor" fill-opacity=".15"/>',
  rifling: '<path d="M3 12h14M17 9l4 3-4 3z" fill="currentColor" fill-opacity=".4"/><path d="M6 10l2 4M10 10l2 4" />',
  radar: '<path d="M4 18a10 10 0 0 1 16-12" /><path d="M7 18a7 7 0 0 1 10-8" /><path d="M12 18 18 6"/><circle cx="12" cy="18" r="2" fill="currentColor"/>',
  mechanization: '<circle cx="7" cy="16" r="4"/><circle cx="18" cy="17" r="2.5"/><path d="M7 12V7h6l3 5h3v4" fill="currentColor" fill-opacity=".2"/>',
  kevlar: '<path d="M7 3 4 7v13h16V7l-3-4-2 3H9z" fill="currentColor" fill-opacity=".3"/><path d="M9 11h6M9 15h6"/>',
  jet_engines: '<path d="M2 12h12l6-3v6l-6-3" fill="currentColor" fill-opacity=".3"/><path d="M8 12 5 6h3l5 6-5 6H5z" fill="currentColor" fill-opacity=".2"/>',
  ai_tactics: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4M10 10h4v4h-4z"/>',
  nanotech: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" fill="currentColor" fill-opacity=".2"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/>',
  fusion: '<circle cx="12" cy="12" r="2" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)"/>',
};

export function icon(name, cls = '') {
  const body = LINE[name] || TECH[name] || LINE.gather;
  return S(body).replace('class="ico"', `class="ico ${cls}"`);
}

export function techIcon(name) { return icon(name, 'tech'); }

// icônes de ressources colorées (images), pour la barre et les coûts
const RES_SVG = {
  food: `<defs><radialGradient id="m" cx=".4" cy=".35"><stop offset="0" stop-color="#e08a4a"/><stop offset="1" stop-color="#8a3a18"/></radialGradient></defs>
    <path d="M27 9c-8 0-16 6-16 14 0 4 3 7 7 7 8 0 15-8 15-15 0-4-2-6-6-6z" fill="url(#m)" stroke="#4a1e0a" stroke-width="1.5"/>
    <path d="M17 26l-6 6" stroke="#f2e6cc" stroke-width="4" stroke-linecap="round"/><circle cx="9.5" cy="33" r="2.6" fill="#f2e6cc"/><circle cx="12.5" cy="35" r="2.4" fill="#f2e6cc"/>
    <path d="M20 14c3-2 7-2 9 0" stroke="#ffd2a0" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  wood: `<defs><linearGradient id="w" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a8703c"/><stop offset="1" stop-color="#5a3418"/></linearGradient></defs>
    <rect x="4" y="21" width="27" height="10" rx="5" fill="url(#w)" stroke="#3a2010" stroke-width="1.4"/><ellipse cx="31" cy="26" rx="4.5" ry="5" fill="#e0b47a" stroke="#3a2010" stroke-width="1.4"/><circle cx="31" cy="26" r="2" fill="none" stroke="#a87840"/>
    <rect x="9" y="10" width="25" height="10" rx="5" fill="url(#w)" stroke="#3a2010" stroke-width="1.4"/><ellipse cx="34" cy="15" rx="4.5" ry="5" fill="#e0b47a" stroke="#3a2010" stroke-width="1.4"/><circle cx="34" cy="15" r="2" fill="none" stroke="#a87840"/>`,
  gold: `<defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe88a"/><stop offset="1" stop-color="#c48a12"/></linearGradient></defs>
    ${[[11, 30], [25, 30], [18, 24], [12, 18], [24, 16]].map(([x, y]) => `<ellipse cx="${x + 2}" cy="${y + 2.5}" rx="8" ry="3.6" fill="#7a5408"/><ellipse cx="${x + 2}" cy="${y}" rx="8" ry="3.6" fill="url(#g)" stroke="#7a5408" stroke-width="1.2"/>`).join('')}`,
  stone: `<path d="M6 25 14 11l13-3 9 10-4 13-17 3z" fill="#9a9ea2" stroke="#4a4d50" stroke-width="1.5"/><path d="M14 11l13-3 9 10-15 3z" fill="#cfd2d4"/><path d="M14 11l7 10-6 13-9-9z" fill="#7d8184"/><path d="M21 21l15-3" stroke="#4a4d50" stroke-width="1.2"/>`,
};

const resCache = {};
export function resIconURL(res) {
  if (!resCache[res]) resCache[res] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${RES_SVG[res]}</svg>`);
  return resCache[res];
}

export function resImg(res, cls = 'rimg') { return `<img class="${cls}" src="${resIconURL(res)}" alt="">`; }

// coût sous forme de puces
export function costHTML(cost) {
  return Object.entries(cost || {}).map(([k, v]) => `<span class="cost-chip">${resImg(k)}${v}</span>`).join('');
}
