// Static game data: the catalog, the armory, the gene lab, arenas and modes.
window.MOM = window.MOM || {};

MOM.START_CASH = 1500;
MOM.MAX_STABLE = 4;
MOM.HEAL_COST_PER_HP = 2;

// Base stats for each monster in the Depot catalog.
// hp: max health, str: melee damage, arm: armor, spd: pixels/sec, r: body radius
MOM.MONSTERS = {
  ooze: {
    name: 'Oozeling', species: 'Gelatinous Blob', price: 400,
    hp: 120, str: 8, arm: 5, spd: 145, r: 21,
    colors: { p: '#7ee04f', s: '#3f9e2a', a: '#e8ff9e', d: '#1f5a14' },
    trait: 'Regeneration', traitDesc: 'Slowly regrows lost goo (+2 HP/sec).',
    blurb: 'Cheap, cheerful and nearly impossible to kill. Ships in a jar. Do not refrigerate.',
  },
  wyrm: {
    name: 'Coilwyrm', species: 'Swamp Serpent', price: 450,
    hp: 95, str: 10, arm: 5, spd: 195, r: 18,
    colors: { p: '#2bb5a8', s: '#167a70', a: '#ffd23f', d: '#0b3f3a' },
    trait: 'Amphibious', traitDesc: 'Swims at full speed through water.',
    blurb: 'Twenty feet of slithering muscle. Comes pre-coiled for easy shipping.',
  },
  spider: {
    name: 'Skitterfang', species: 'Giant Arachnid', price: 500,
    hp: 80, str: 9, arm: 3, spd: 210, r: 19,
    colors: { p: '#4a3b6b', s: '#2a2140', a: '#ff4fa3', d: '#140f20' },
    trait: 'Venom', traitDesc: 'Bites poison the victim for 3 seconds.',
    blurb: 'Eight legs, eight eyes, zero manners. Fast and nasty up close.',
  },
  mantis: {
    name: 'Scythe', species: 'Killer Mantis', price: 550,
    hp: 85, str: 12, arm: 4, spd: 185, r: 19,
    colors: { p: '#9bd63a', s: '#5f9420', a: '#fff27a', d: '#2f4d0c' },
    trait: 'Twin Blades', traitDesc: 'Melee attacks recover twice as fast.',
    blurb: 'Praying is optional. Slashing is not. A whirlwind of razor forelimbs.',
  },
  cat: {
    name: 'Clawdia', species: 'Sabre Cat', price: 575,
    hp: 80, str: 11, arm: 4, spd: 215, r: 19,
    colors: { p: '#f0a040', s: '#b8661e', a: '#7dff6a', d: '#5a2e0a' },
    trait: 'Nine Lives', traitDesc: 'Once per battle, shrugs off a knockout blow and bounces back at 30% HP.',
    blurb: 'Sabre fangs, a bad attitude and more lives than you have patience. Litter box not included.',
  },
  bat: {
    name: 'Gloomflap', species: 'Dire Bat', price: 600,
    hp: 70, str: 8, arm: 2, spd: 230, r: 18,
    colors: { p: '#6b4a8f', s: '#3b2757', a: '#ffcf4f', d: '#1d1230' },
    trait: 'Flight', traitDesc: 'Flies over water and lava unharmed.',
    blurb: 'Fragile but the fastest thing in the catalog. Hates daylight and losing.',
  },
  cyclops: {
    name: 'Oculus', species: 'Cave Cyclops', price: 650,
    hp: 110, str: 11, arm: 6, spd: 155, r: 21,
    colors: { p: '#e0925a', s: '#a65a2e', a: '#ff3b3b', d: '#5a2a10' },
    trait: 'Eye Beam', traitDesc: 'Built-in ranged beam that never runs out of ammo.', builtin: 'eye',
    blurb: 'One eye, one beam, one very bad attitude. Ammo not required.',
  },
  dog: {
    name: 'Barghest', species: 'Dire Hound', price: 725,
    hp: 105, str: 11, arm: 6, spd: 190, r: 20,
    colors: { p: '#8a6a4a', s: '#5a4430', a: '#ff4a2e', d: '#2a1e12' },
    trait: 'Pack Leader', traitDesc: 'Arrives with two loyal pups that fight by its side.',
    blurb: "A very good boy, technically. Comes with two pups who haven't learned to share either.",
  },
  rex: {
    name: 'Rexbane', species: 'Tyrannosaur', price: 700,
    hp: 130, str: 16, arm: 6, spd: 150, r: 24,
    colors: { p: '#d6493a', s: '#8f2a1f', a: '#ffe08a', d: '#4a120c' },
    trait: 'Crushing Jaws', traitDesc: 'Bites hit 25% harder and send foes flying.',
    blurb: 'The king is back. Big bite, short arms, enormous appetite.',
  },
  golem: {
    name: 'Rocklord', species: 'Stone Golem', price: 800,
    hp: 150, str: 13, arm: 14, spd: 115, r: 24,
    colors: { p: '#9a8f86', s: '#625a54', a: '#4ff0ff', d: '#2e2a27' },
    trait: 'Stone Skin', traitDesc: 'Cannot be knocked back. Sluggish in water.',
    blurb: 'A walking quarry. Slow to start, impossible to stop.',
  },
  mech: {
    name: 'Mechazoid', species: 'War Robot', price: 900,
    hp: 105, str: 10, arm: 10, spd: 160, r: 21,
    colors: { p: '#c9d3dd', s: '#6b7a8a', a: '#3bf0ff', d: '#2a323b' },
    trait: 'Hardpoints', traitDesc: 'Carries 3 weapons and is immune to lava.',
    blurb: 'Factory-fresh battle chassis. Batteries (and hostility) included.',
  },
  dragon: {
    name: 'Scorchmaw', species: 'Fire Drake', price: 1200,
    hp: 145, str: 15, arm: 10, spd: 160, r: 25,
    colors: { p: '#3a5fc8', s: '#22397e', a: '#ffc23f', d: '#101c40' },
    trait: 'Fire Breath', traitDesc: 'Built-in flame breath that never runs out. Immune to lava.', builtin: 'breath',
    blurb: 'Our premium model. Ships in a fireproof crate. Please remove all flammables from the delivery area.',
  },
};
MOM.MONSTER_ORDER = ['ooze', 'wyrm', 'spider', 'mantis', 'cat', 'bat', 'cyclops', 'rex', 'dog', 'golem', 'mech', 'dragon'];

// Ranged weapons. kind: proj | flame | mine | roar
MOM.WEAPONS = {
  spit: {
    name: 'Acid Spitter', price: 150, kind: 'proj', pack: 30, packPrice: 40,
    cd: 0.38, speed: 430, dmg: 8, life: 0.75, rad: 6, color: '#b6ff3b',
    desc: 'Lobs gobs of corrosive spit. Cheap and reliable.',
  },
  laser: {
    name: 'Laser Blaster', price: 400, kind: 'proj', pack: 40, packPrice: 80,
    cd: 0.17, speed: 950, dmg: 5, life: 0.55, rad: 4, color: '#ff3b6b',
    desc: 'Rapid-fire light bolts. High rate of fire.',
  },
  flame: {
    name: 'Flame Belcher', price: 350, kind: 'flame', pack: 120, packPrice: 60,
    cd: 0.05, speed: 330, dmg: 1.7, life: 0.42, rad: 9, color: '#ff8a1f',
    desc: 'Short-range firestorm. Sets foes and forests ablaze.',
  },
  freeze: {
    name: 'Freeze Ray', price: 450, kind: 'proj', pack: 20, packPrice: 70,
    cd: 0.6, speed: 620, dmg: 7, life: 0.7, rad: 6, color: '#7fe8ff', slow: 2.5,
    desc: 'Chills the target, halving their speed for a few seconds.',
  },
  rocket: {
    name: 'Rocket Pod', price: 700, kind: 'proj', pack: 8, packPrice: 120,
    cd: 0.9, speed: 400, dmg: 26, life: 1.4, rad: 7, color: '#ffd23f', splash: 75, structMult: 3,
    desc: 'Explosive warheads. Flattens buildings and anything near them.',
  },
  mine: {
    name: 'Mine Layer', price: 300, kind: 'mine', pack: 6, packPrice: 60,
    cd: 0.7, dmg: 32, splash: 65, color: '#ff4f4f',
    desc: 'Drops proximity mines behind you. Perfect for chasers.',
  },
  roar: {
    name: 'Sonic Roar', price: 550, kind: 'roar', pack: 10, packPrice: 90,
    cd: 1.4, dmg: 13, splash: 150, color: '#c79bff',
    desc: 'A deafening shockwave that blasts everything nearby away.',
  },
  // Built in to Scorchmaw — never sold.
  breath: {
    name: 'Fire Breath', price: 0, kind: 'flame', pack: 0, packPrice: 0, builtin: true,
    cd: 0.06, speed: 300, dmg: 1.4, life: 0.38, rad: 9, color: '#ff8a1f',
    desc: 'Built-in flame breath. Infinite fuel.',
  },
  // Built in to Oculus — never sold.
  eye: {
    name: 'Eye Beam', price: 0, kind: 'proj', pack: 0, packPrice: 0, builtin: true,
    cd: 0.45, speed: 800, dmg: 6, life: 0.55, rad: 5, color: '#ff3b3b',
    desc: 'Built-in optic laser. Infinite ammo.',
  },
};
MOM.WEAPON_ORDER = ['spit', 'laser', 'flame', 'freeze', 'mine', 'roar', 'rocket'];

// Gene Lab permanent upgrades.
MOM.MORPHS = {
  hide:   { name: 'Thick Hide',     stat: 'arm', per: 3,   max: 5, base: 180, icon: '🛡️', desc: '+3 Armor per graft.' },
  muscle: { name: 'Muscle Graft',   stat: 'str', per: 3,   max: 5, base: 200, icon: '💪', desc: '+3 Strength per graft.' },
  glands: { name: 'Hyper Glands',   stat: 'spd', per: 12,  max: 5, base: 160, icon: '⚡', desc: '+12 Speed per graft.' },
  heart:  { name: 'Extra Heart',    stat: 'hp',  per: 20,  max: 5, base: 220, icon: '❤️', desc: '+20 Max HP per graft.' },
  regen:  { name: 'Regen Gland',    stat: 'regen', per: 0.7, max: 3, base: 300, icon: '✚', desc: '+0.7 HP/sec regeneration.' },
};
MOM.MORPH_ORDER = ['heart', 'hide', 'muscle', 'glands', 'regen'];
MOM.morphCost = (id, lvl) => Math.round(MOM.MORPHS[id].base * (1 + lvl * 0.75));

MOM.LEVEL_BONUS = { hp: 8, str: 1, arm: 1, spd: 3 };
MOM.xpForLevel = (lvl) => 100 * lvl;

MOM.THEMES = {
  jungle: {
    name: 'Jungle Ruins', ground: ['#4d7a35', '#558541', '#46702f'], accent: '#6c9a46',
    obstacles: { tree: 0.09, rock: 0.025, building: 0.012 }, water: 4, lava: 0,
  },
  city: {
    name: 'Downtown', ground: ['#5b5f66', '#62666e', '#565a61'], accent: '#7a7f88',
    obstacles: { building: 0.075, tree: 0.02, rock: 0.008 }, water: 1, lava: 0, roads: true,
  },
  volcano: {
    name: 'Volcano Pit', ground: ['#3a302d', '#433733', '#352b28'], accent: '#5a4038',
    obstacles: { rock: 0.07, building: 0.006, tree: 0.0 }, water: 0, lava: 5,
  },
  desert: {
    name: 'Badlands', ground: ['#c9a46a', '#d1ad74', '#bf9a60'], accent: '#e0c08a',
    obstacles: { rock: 0.04, tree: 0.025, building: 0.03 }, water: 1, lava: 1, cactus: true,
  },
};
MOM.THEME_ORDER = ['jungle', 'city', 'volcano', 'desert'];

MOM.MODES = {
  survival: {
    name: 'Survival', icon: '⚔️', reward: 320,
    desc: 'One-on-one, no holds barred. Last monster standing wins.',
  },
  horde: {
    name: 'Horde', icon: '👹', reward: 0,
    desc: 'Survive three waves of gremlins and their brute boss. Paid per kill.',
  },
  ctf: {
    name: 'Capture the Flag', icon: '🚩', reward: 380,
    desc: 'Steal the rival flag and haul it home. First to 3 captures wins.',
  },
  destruction: {
    name: 'Destruction', icon: '🏚️', reward: 300,
    desc: 'Smash more of the arena than your rival before time runs out.',
  },
};
MOM.MODE_ORDER = ['survival', 'horde', 'ctf', 'destruction'];

MOM.DIFFICULTIES = {
  rookie:   { name: 'Rookie',   lvl: -1, mult: 1.0, aim: 0.22, react: 0.45, morphs: 0.3, color: '#5fd35f' },
  pro:      { name: 'Pro',      lvl: 0,  mult: 1.6, aim: 0.12, react: 0.28, morphs: 0.6, color: '#ffc23f' },
  champion: { name: 'Champion', lvl: 2,  mult: 2.5, aim: 0.05, react: 0.15, morphs: 1.0, color: '#ff4f4f' },
};
MOM.DIFF_ORDER = ['rookie', 'pro', 'champion'];

MOM.RIVAL_NAMES = [
  'Grimjaw', 'Sludgemaw', 'Professor Bones', 'Ripley', 'Gnasher', 'Big Trouble', 'Mangler',
  'Lady Venom', 'Crunchwrap', 'Doomsday Dave', 'Snarlgarr', 'The Baron', 'Fuzzbutt', 'Krakatoa',
  'Mr. Wiggles', 'Chompzilla', 'Vex', 'Rustbucket', 'Slobberknocker', 'Queen Mab',
];
