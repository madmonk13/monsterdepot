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

  return { load: () => { load(); normalize(); return state; }, persist, newGame, hasSave, get, makeMonster, stats, slots, worth, addXp, active };
})();
