// Player profile, monster roster, persistence and derived stats.
MOM.Save = (() => {
  const KEY = 'mom_save_v1';
  let state = null;

  function fresh() {
    return {
      cash: MOM.START_CASH,
      stable: [],
      active: null,
      record: { wins: 0, losses: 0, battles: 0, earned: 0 },
      created: Date.now(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : null;
    } catch (e) { state = null; }
    return state;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function newGame() { state = fresh(); persist(); return state; }
  function hasSave() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  }
  function get() { return state; }

  let uid = 0;
  function makeMonster(type, nickname) {
    const d = MOM.MONSTERS[type];
    const m = {
      id: 'm' + Date.now().toString(36) + (uid++),
      type, name: nickname || d.name,
      level: 1, xp: 0,
      morphs: { hide: 0, muscle: 0, glands: 0, heart: 0, regen: 0 },
      weapons: [], // { id, ammo }
      wins: 0, losses: 0,
    };
    if (d.builtin) m.weapons.push({ id: d.builtin, ammo: Infinity });
    m.hp = stats(m).hp;
    return m;
  }

  function slots(m) { return m.type === 'mech' ? 3 : 2; }

  function stats(m) {
    const d = MOM.MONSTERS[m.type];
    const L = m.level - 1, B = MOM.LEVEL_BONUS, M = MOM.MORPHS, mo = m.morphs;
    return {
      hp: Math.round(d.hp + L * B.hp + mo.heart * M.heart.per),
      str: d.str + L * B.str + mo.muscle * M.muscle.per,
      arm: d.arm + L * B.arm + mo.hide * M.hide.per,
      spd: d.spd + L * B.spd + mo.glands * M.glands.per,
      regen: (m.type === 'ooze' ? 2 : 0) + mo.regen * M.regen.per,
      r: d.r,
    };
  }

  // Monster value (used for selling and rival scaling).
  function worth(m) {
    let v = MOM.MONSTERS[m.type].price;
    for (const k in m.morphs) for (let i = 0; i < m.morphs[k]; i++) v += MOM.morphCost(k, i);
    v += (m.level - 1) * 150;
    return v;
  }

  function addXp(m, xp) {
    m.xp += xp;
    let ups = 0;
    while (m.xp >= MOM.xpForLevel(m.level)) {
      m.xp -= MOM.xpForLevel(m.level);
      m.level++;
      ups++;
    }
    return ups;
  }

  function active() {
    if (!state) return null;
    return state.stable.find((m) => m.id === state.active) || state.stable[0] || null;
  }

  // Infinity doesn't survive JSON, so fix the built-in eye beam after load.
  function normalize() {
    if (!state) return;
    for (const m of state.stable) for (const w of m.weapons) if (MOM.WEAPONS[w.id].builtin) w.ammo = Infinity;
  }

  // ---------- Transfer between browsers ----------
  const EXPORT_APP = 'monster-depot';

  function exportData() {
    return { app: EXPORT_APP, version: 1, exported: new Date().toISOString(), save: state };
  }

  // Turn an imported file into a clean save. Nothing in the file is trusted:
  // unknown monsters and weapons are dropped, numbers are clamped, built-in
  // weapons are rebuilt. Throws with a readable message if it isn't a save.
  function parseImport(obj) {
    const src = obj && obj.app === EXPORT_APP ? obj.save : obj;
    if (!src || typeof src !== 'object' || !Array.isArray(src.stable)) {
      throw new Error("That file doesn't look like a Monster Depot save.");
    }
    const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
    const int = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(num(v, d))));
    const out = fresh();
    out.cash = int(src.cash, 0, 1e9, MOM.START_CASH);
    const rec = src.record || {};
    for (const k of Object.keys(out.record)) out.record[k] = int(rec[k], 0, 1e9, 0);
    out.created = int(src.created, 0, 8.64e15, Date.now());
    const ids = new Set();
    for (const m of src.stable) {
      if (out.stable.length >= MOM.MAX_STABLE_LEGACY) break;
      if (!m || !MOM.MONSTERS[m.type]) continue;
      const n = makeMonster(m.type, String(m.name || '').trim().slice(0, 18) || MOM.MONSTERS[m.type].name);
      if (typeof m.id === 'string' && m.id && !ids.has(m.id)) n.id = m.id.slice(0, 40);
      ids.add(n.id);
      n.level = int(m.level, 1, 99, 1);
      n.xp = int(m.xp, 0, MOM.xpForLevel(n.level) - 1, 0);
      for (const k of Object.keys(n.morphs)) n.morphs[k] = int(m.morphs && m.morphs[k], 0, MOM.MORPHS[k].max, 0);
      for (const w of Array.isArray(m.weapons) ? m.weapons : []) {
        const D = w && MOM.WEAPONS[w.id];
        if (!D || D.builtin || n.weapons.some((x) => x.id === w.id) || n.weapons.length >= slots(n)) continue;
        n.weapons.push({ id: w.id, ammo: int(w.ammo, 0, 1e6, 0) });
      }
      n.wins = int(m.wins, 0, 1e9, 0);
      n.losses = int(m.losses, 0, 1e9, 0);
      n.hp = int(m.hp, 0, stats(n).hp, stats(n).hp);
      out.stable.push(n);
    }
    out.active = out.stable.some((m) => m.id === src.active) ? src.active : (out.stable[0] ? out.stable[0].id : null);
    return out;
  }

  function replace(newState) { state = newState; persist(); return state; }

  return { load: () => { load(); normalize(); return state; }, persist, newGame, hasSave, get, makeMonster, stats, slots, worth, addXp, active, exportData, parseImport, replace };
})();
