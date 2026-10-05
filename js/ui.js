// Menus: title screen, HQ (stable, catalog, armory, gene lab, arena), pause and results.
MOM.UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = MOM.Save;
  const A = MOM.Audio;
  const money = (n) => '$' + Math.round(n).toLocaleString();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  let tab = 'stable';
  const arena = { mode: 'survival', theme: 'random', diff: 'rookie' };
  let rival = null, rivalKey = '';
  let battle = null, lastBattle = null;
  let screen = 'title';

  // ---------- Persistence across reloads ----------
  // The profile lives in MOM.Save; these keys hold where you were in the menus
  // and a snapshot of any battle in progress.
  const UI_KEY = 'mom_ui_v1', BATTLE_KEY = 'mom_battle_v1';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  // JSON turns Infinity (built-in weapon ammo) into null.
  function fixAmmo(m) {
    if (m) for (const w of m.weapons) if (MOM.WEAPONS[w.id].builtin) w.ammo = Infinity;
    return m;
  }
  function saveUI() { store.set(UI_KEY, { screen, tab, arena, rival, rivalKey }); }
  function saveBattle() {
    if (battle && !battle.ended) store.set(BATTLE_KEY, battle.serialize());
  }

  // ---------- Generic helpers ----------
  function show(id) {
    $$('.screen').forEach((el) => el.classList.add('hidden'));
    if (id) $(id).classList.remove('hidden');
  }

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function modal({ title, body = '', input = null, buttons = [], center = false, onOpen }) {
    const root = $('#modal-root');
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="modal-card ${center ? 'center' : ''}">
      ${title ? `<h2>${title}</h2>` : ''}<div class="mbody">${body}</div>
      ${input != null ? `<input type="text" maxlength="18" value="${esc(input)}" />` : ''}
      <div class="row gap"></div></div>`;
    const row = $('.row', bd);
    const close = () => bd.remove();
    const inp = $('input', bd);
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.textContent = b.label;
      btn.onclick = () => { A.play('click'); if (b.onClick && b.onClick(inp ? inp.value.trim() : null) === false) return; close(); };
      row.appendChild(btn);
    }
    if (inp) {
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') row.lastChild.click(); if (e.key === 'Escape') close(); });
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    }
    bd.addEventListener('mousedown', (e) => { if (e.target === bd && buttons.length > 1) close(); });
    root.appendChild(bd);
    onOpen && onOpen(bd);
    return close;
  }

  function portraits(root) {
    for (const cv of $$('canvas[data-portrait]', root)) {
      MOM.Art.registerPortrait(cv, cv.dataset.portrait, {
        scale: +(cv.dataset.scale || 0.24),
        angle: cv.dataset.angle != null ? +cv.dataset.angle : undefined,
        moving: cv.dataset.moving === '1',
      });
    }
  }

  function bumpCash() {
    const el = $('#cash');
    el.textContent = money(S.get().cash);
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 200);
  }

  function spend(n) {
    const st = S.get();
    if (st.cash < n) { A.play('error'); toast("You can't afford that.", 'bad'); return false; }
    st.cash -= n;
    S.persist();
    A.play('buy');
    bumpCash();
    return true;
  }

  const healCost = (m) => Math.ceil((S.stats(m).hp - m.hp) * MOM.HEAL_COST_PER_HP);

  // ---------- Title ----------
  let paradeOn = false;
  function showTitle() {
    screen = 'title'; saveUI();
    show('#screen-title');
    $('#game').style.display = 'none';
    $('#btn-continue').classList.toggle('hidden', !S.hasSave());
    $('#btn-new').classList.toggle('btn-primary', !S.hasSave());
    if (!paradeOn) { paradeOn = true; requestAnimationFrame(parade); }
  }

  function parade() {
    const scr = $('#screen-title');
    if (scr.classList.contains('hidden')) { paradeOn = false; return; }
    const cv = $('#title-parade'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    const rows = [
      { y: h * 0.86, s: 26, sp: 60, a: 1 },
      { y: h * 0.12, s: 16, sp: -35, a: 0.28 },
    ];
    for (const r of rows) {
      const types = MOM.MONSTER_ORDER;
      // Enough slots to cover the whole width (plus one off each edge), so
      // the parade spans wide screens instead of wrapping after one lineup.
      const gap = r.s * 5.5, slots = Math.max(types.length, Math.ceil(w / gap) + 2), span = slots * gap;
      for (let i = 0; i < slots; i++) {
        let x = ((i * gap + t * r.sp) % span + span) % span - gap;
        if (x > w + gap) continue;
        const bob = Math.sin(t * 6 + i) * 2;
        MOM.Art.drawMonster(c, types[(i + (r.sp < 0 ? 4 : 0)) % types.length], x, r.y + bob, r.sp > 0 ? 0 : Math.PI, r.s, t + i, { moving: true, alpha: r.a });
      }
    }
    requestAnimationFrame(parade);
  }

  function howTo() {
    modal({
      title: 'How to Play',
      body: `
        <p><b>1. Order a monster</b> from the Catalog. You start with ${money(MOM.START_CASH)}.</p>
        <p><b>2. Arm it</b> in the Armory. Weapons need ammo, and ammo costs money — every shot counts.</p>
        <p><b>3. Mutate it</b> in the Gene Lab for permanent stat boosts.</p>
        <p><b>4. Fight</b> in the Arena: Survival, Horde, Capture the Flag or Destruction. Win cash and XP, then heal up and do it again.</p>
        <div class="controls-grid">${controlsHTML()}</div>
        <p style="font-size:13px;color:var(--muted)">Damage carries over between battles — visit the Stable to heal. Smash buildings for extra cash!</p>`,
      buttons: [{ label: 'Got it', cls: 'btn-primary' }],
    });
  }

  function controlsHTML() {
    return [
      ['WASD / Arrows', 'Move'], ['Mouse', 'Aim (or face where you walk)'], ['Left click / J', 'Fire weapon'],
      ['Space / Right click / K', 'Melee attack'], ['Shift / L', 'Dash (smashes obstacles)'],
      ['Q / E / 1-3 / Wheel', 'Switch weapon'], ['Esc / P', 'Pause'], ['Gamepad', 'Sticks, RT fire, A bite, B dash'],
    ].map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('');
  }

  // ---------- Hub ----------
  function showHub(t) {
    if (t) tab = t;
    screen = 'hub';
    show('#screen-hub');
    $('#game').style.display = 'none';
    MOM.Input.capture = false;
    const st = S.get();
    if (!st.stable.length && st.cash < 400) {
      st.cash = 400; S.persist();
      modal({ title: 'Monster Relief Fund', center: true, body: '<p>Times are tough. The Monster Relief Fund has topped your account up to <b>$400</b> so you can order a new companion.</p>', buttons: [{ label: 'Thanks!', cls: 'btn-primary' }] });
    }
    renderHub();
  }

  function renderHub() {
    saveUI();
    $('#cash').textContent = money(S.get().cash);
    $('#btn-sound').textContent = A.isMuted() ? '🔇' : '🔊';
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    renderActive();
    const el = $('#tab-content');
    el.innerHTML = '';
    ({ stable: renderStable, catalog: renderCatalog, armory: renderArmory, lab: renderLab, arena: renderArena })[tab](el);
    portraits(el);
  }

  function hpBar(m) {
    const max = S.stats(m).hp, pct = Math.max(0, m.hp / max);
    const col = pct > 0.5 ? 'var(--green)' : pct > 0.25 ? 'var(--yellow)' : 'var(--red)';
    return `<div class="bar-label"><span>HP</span><span>${Math.ceil(m.hp)} / ${max}</span></div>
      <div class="bar"><i style="width:${pct * 100}%;background:${col}"></i></div>`;
  }
  function xpBar(m) {
    const need = MOM.xpForLevel(m.level);
    return `<div class="bar-label"><span>XP</span><span>${m.xp} / ${need}</span></div>
      <div class="bar"><i style="width:${(m.xp / need) * 100}%;background:linear-gradient(90deg,var(--pink),var(--yellow))"></i></div>`;
  }

  function renderActive() {
    const el = $('#active-card'), m = S.active();
    if (!m) {
      el.innerHTML = `<div class="label">ACTIVE MONSTER</div><div class="empty">📦<br/>No monster yet.<br/><br/>
        <button class="btn btn-primary" data-go="catalog">Browse the Catalog</button></div>`;
      $('[data-go]', el).onclick = () => { A.play('click'); showHub('catalog'); };
      return;
    }
    const d = MOM.MONSTERS[m.type], st = S.stats(m), hc = healCost(m);
    el.innerHTML = `
      <div class="label">ACTIVE MONSTER</div>
      <canvas class="portrait" data-portrait="${m.type}" data-scale="0.22"></canvas>
      <div class="mon-name">${esc(m.name)}<span class="lvl">LV ${m.level}</span></div>
      <div class="mon-species">${d.species} · ${m.wins}W–${m.losses}L</div>
      ${hpBar(m)}${xpBar(m)}
      <div class="stats">
        <div class="stat"><small>STRENGTH</small><b>${st.str}</b></div>
        <div class="stat"><small>ARMOR</small><b>${st.arm}</b></div>
        <div class="stat"><small>SPEED</small><b>${st.spd}</b></div>
        <div class="stat"><small>REGEN</small><b>${st.regen ? st.regen.toFixed(1) + '/s' : '—'}</b></div>
      </div>
      <div class="trait"><b>${d.trait}:</b> ${d.traitDesc}</div>
      <div class="chips">${m.weapons.length ? m.weapons.map((w) => `<span class="chip" style="color:${MOM.WEAPONS[w.id].color}">${MOM.WEAPONS[w.id].name} · ${w.ammo === Infinity ? '∞' : w.ammo}</span>`).join('') : '<span class="chip">No weapons</span>'}</div>
      ${hc > 0 ? healButtons(m) : ''}`;
    portraits(el);
    bindHeal(el, m);
  }

  function healButtons(m) {
    const hc = healCost(m), st = S.get();
    const free = st.cash < hc && m.hp < S.stats(m).hp * 0.3;
    return `<div class="row gap wrap" style="margin-top:8px">
      <button class="btn btn-sm ${m.hp <= 0 ? 'btn-primary' : ''}" data-heal="${m.id}" ${st.cash < hc ? 'disabled' : ''}>❤️ Heal ${money(hc)}</button>
      ${free ? `<button class="btn btn-sm" data-clinic="${m.id}">Free clinic (30%)</button>` : ''}</div>`;
  }
  function bindHeal(el, m) {
    for (const b of $$(`[data-heal="${m.id}"]`, el)) b.onclick = () => {
      if (!spend(healCost(m))) return;
      m.hp = S.stats(m).hp; S.persist(); toast(`${m.name} is good as new!`, 'good'); renderHub();
    };
    for (const b of $$(`[data-clinic="${m.id}"]`, el)) b.onclick = () => {
      A.play('buy');
      m.hp = Math.max(m.hp, Math.round(S.stats(m).hp * 0.3)); S.persist();
      toast('The free clinic patched things up. Mostly.'); renderHub();
    };
  }

  // ----- Stable -----
  function renderStable(el) {
    const st = S.get();
    el.innerHTML = `<h2>Your Stable</h2><p class="sub">Up to ${MOM.MAX_STABLE} monsters. Record: ${st.record.wins} wins, ${st.record.losses} losses · Lifetime earnings ${money(st.record.earned)}</p><div class="grid" id="stable-grid"></div>`;
    const g = $('#stable-grid', el);
    for (const m of st.stable) {
      const d = MOM.MONSTERS[m.type], active = S.active() === m;
      const sale = Math.round(S.worth(m) * 0.5 + m.weapons.reduce((s, w) => s + MOM.WEAPONS[w.id].price * 0.5, 0));
      const card = document.createElement('div');
      card.className = 'card' + (active ? ' selected' : '');
      card.innerHTML = `
        <canvas class="portrait" data-portrait="${m.type}" data-scale="0.22"></canvas>
        <h3>${esc(m.name)} <span class="lvl">LV ${m.level}</span></h3>
        <p>${d.species} · ${m.wins}W–${m.losses}L ${active ? '· <b style="color:var(--yellow)">ACTIVE</b>' : ''}</p>
        ${hpBar(m)}
        <div class="actions">
          ${active ? '' : '<button class="btn btn-sm btn-primary" data-act="use">Make Active</button>'}
          ${healCost(m) > 0 ? healButtons(m) : ''}
          <button class="btn btn-sm" data-act="rename">Rename</button>
          <button class="btn btn-sm btn-danger" data-act="sell">Sell ${money(sale)}</button>
        </div>`;
      $('[data-act=rename]', card).onclick = () => {
        A.play('click');
        modal({ title: 'Rename Monster', input: m.name, buttons: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: (v) => { if (v) { m.name = v; S.persist(); renderHub(); } } }] });
      };
      $('[data-act=sell]', card).onclick = () => {
        A.play('click');
        modal({
          title: `Sell ${esc(m.name)}?`, body: `<p>Ship ${esc(m.name)} back to the factory for <b>${money(sale)}</b> (including weapons). This can't be undone.</p>`,
          buttons: [{ label: 'Keep' }, { label: 'Sell', cls: 'btn-danger', onClick: () => {
            st.stable = st.stable.filter((x) => x !== m);
            if (st.active === m.id) st.active = st.stable[0] ? st.stable[0].id : null;
            st.cash += sale; S.persist(); A.play('cash'); toast(`Sold for ${money(sale)}`); renderHub();
          } }],
        });
      };
      const use = $('[data-act=use]', card);
      if (use) use.onclick = () => { A.play('click'); st.active = m.id; S.persist(); renderHub(); };
      bindHeal(card, m);
      g.appendChild(card);
    }
    for (let i = st.stable.length; i < MOM.MAX_STABLE; i++) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'border-style:dashed;align-items:center;justify-content:center;min-height:240px;cursor:pointer;color:var(--muted)';
      card.innerHTML = '<div style="font-size:40px">📦</div><div>Empty kennel</div><small>Order from the catalog</small>';
      card.onclick = () => { A.play('click'); showHub('catalog'); };
      g.appendChild(card);
    }
  }

  // ----- Catalog -----
  const MAXS = { hp: 160, str: 18, arm: 15, spd: 240 };
  function statBars(d) {
    const row = (k, lab, col) => `<span>${lab}</span><div class="sb"><i style="width:${Math.min(100, (d[k] / MAXS[k]) * 100)}%;background:${col}"></i></div><span>${d[k]}</span>`;
    return `<div class="statbars">${row('hp', 'HP', 'var(--green)')}${row('str', 'STR', 'var(--red)')}${row('arm', 'ARM', 'var(--blue)')}${row('spd', 'SPD', 'var(--yellow)')}</div>`;
  }

  function renderCatalog(el) {
    const st = S.get(), full = st.stable.length >= MOM.MAX_STABLE;
    el.innerHTML = `<h2>The Monster Catalog</h2><p class="sub">Fall/Winter edition. All monsters ship overnight in a reinforced crate.</p>
      <div class="catalog-intro"><div style="font-size:34px">📬</div><div><div class="big">Order today, fight tonight!</div>
      <div style="color:var(--muted);font-size:13px">Every monster starts at level 1. Weapons sold separately in the Armory.</div></div></div>
      <div class="grid" id="cat-grid"></div>`;
    const g = $('#cat-grid', el);
    for (const id of MOM.MONSTER_ORDER) {
      const d = MOM.MONSTERS[id];
      const card = document.createElement('div');
      card.className = 'card';
      const can = !full && st.cash >= d.price;
      card.innerHTML = `
        <div class="price-tag">${money(d.price)}</div>
        <canvas class="portrait" data-portrait="${id}" data-scale="0.24" data-moving="1"></canvas>
        <h3>${d.name}</h3>
        <p style="color:var(--muted);font-weight:600">${d.species}</p>
        ${statBars(d)}
        <div class="trait"><b>${d.trait}:</b> ${d.traitDesc}</div>
        <p>${d.blurb}</p>
        <div class="actions"><button class="btn btn-primary btn-sm" ${can ? '' : 'disabled'}>${full ? 'Stable full' : st.cash < d.price ? 'Not enough cash' : 'Order Now'}</button></div>`;
      $('button', card).onclick = () => order(id);
      g.appendChild(card);
    }
  }

  function order(id) {
    const d = MOM.MONSTERS[id];
    A.play('click');
    modal({
      title: `Order ${d.name}`,
      body: `<p>${d.blurb}</p><p>Give your new ${d.species.toLowerCase()} a name:</p>`,
      input: d.name,
      buttons: [{ label: 'Cancel' }, { label: `Pay ${money(d.price)}`, cls: 'btn-primary', onClick: (name) => {
        if (!spend(d.price)) return false;
        const st = S.get();
        const m = S.makeMonster(id, name || d.name);
        st.stable.push(m);
        st.active = m.id;
        S.persist();
        const first = st.stable.length === 1 && st.record.battles === 0;
        toast(`📦 ${m.name} has arrived!`, 'good');
        showHub(first ? 'armory' : 'stable');
        if (first) {
          modal({
            title: 'Special Delivery!', center: true,
            body: `<canvas data-portrait="${id}" data-scale="0.3" data-moving="1" style="width:200px;height:150px"></canvas>
              <p><b>${esc(m.name)}</b> has arrived. Head into the arena bare-handed, or spend some of your remaining <b>${money(st.cash)}</b> on weapons and ammo first.</p>`,
            buttons: [{ label: "Let's shop", cls: 'btn-primary' }],
            onOpen: (bd) => portraits(bd),
          });
        }
      } }],
    });
  }

  // ----- Armory -----
  function rangeLabel(D) {
    if (D.kind === 'flame') return 'Short';
    if (D.kind === 'mine') return 'Trap';
    if (D.kind === 'roar') return 'Area';
    const r = D.speed * D.life;
    return r > 450 ? 'Long' : r > 300 ? 'Medium' : 'Short';
  }
  function wstats(D) {
    const dps = D.kind === 'flame' ? D.dmg / D.cd : D.dmg;
    return `<div class="wstats"><span>DMG <b>${D.kind === 'flame' ? Math.round(dps) + '/s' : D.dmg}</b></span><span>RATE <b>${(1 / D.cd).toFixed(1)}/s</b></span><span>RANGE <b>${rangeLabel(D)}</b></span>${D.splash ? '<span><b>Splash</b></span>' : ''}${D.slow ? '<span><b>Slows</b></span>' : ''}</div>`;
  }

  function needMonster(el, what) {
    el.innerHTML = `<h2>${what}</h2><div class="empty">You need a monster first.<br/><br/><button class="btn btn-primary">Open the Catalog</button></div>`;
    $('button', el).onclick = () => { A.play('click'); showHub('catalog'); };
  }

  function renderArmory(el) {
    const m = S.active();
    if (!m) return needMonster(el, 'Armory');
    const st = S.get(), slots = S.slots(m);
    el.innerHTML = `<h2>Armory</h2><p class="sub">Arming <b>${esc(m.name)}</b> · ${m.weapons.length}/${slots} weapon slots used. Ammo carries over between battles.</p>
      <div class="section-title">EQUIPPED</div><div class="slot-row" id="slots"></div>
      <div class="section-title">FOR SALE</div><div class="grid" id="wgrid"></div>`;
    const sr = $('#slots', el);
    for (let i = 0; i < slots; i++) {
      const w = m.weapons[i];
      const div = document.createElement('div');
      if (!w) { div.className = 'slot empty-slot'; div.innerHTML = `<div style="font-size:24px">＋</div><div>Empty slot ${i + 1}</div>`; sr.appendChild(div); continue; }
      const D = MOM.WEAPONS[w.id];
      div.className = 'slot';
      div.innerHTML = `<div class="wname"><span class="swatch" style="background:${D.color}"></span>${D.name}</div>
        <div class="ammo">${D.builtin ? '∞' : w.ammo} <small style="font-family:var(--body);font-size:12px;color:var(--muted)">${D.builtin ? 'built-in' : 'rounds'}</small></div>
        ${D.builtin ? '<div class="wstats">Part of the monster. Cannot be removed.</div>' : `<div class="row gap wrap">
          <button class="btn btn-sm btn-primary" data-ammo ${st.cash < D.packPrice ? 'disabled' : ''}>+${D.pack} ammo · ${money(D.packPrice)}</button>
          <button class="btn btn-sm btn-danger" data-sell>Sell ${money(D.price / 2)}</button></div>`}`;
      if (!D.builtin) {
        $('[data-ammo]', div).onclick = () => { if (spend(D.packPrice)) { w.ammo += D.pack; S.persist(); renderHub(); } };
        $('[data-sell]', div).onclick = () => {
          A.play('cash');
          m.weapons.splice(i, 1); st.cash += D.price / 2; S.persist(); toast(`Sold ${D.name}`); renderHub();
        };
      }
      sr.appendChild(div);
    }
    const g = $('#wgrid', el);
    for (const id of MOM.WEAPON_ORDER) {
      const D = MOM.WEAPONS[id];
      const owned = m.weapons.some((w) => w.id === id);
      const full = m.weapons.length >= slots;
      const total = D.price;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="price-tag">${money(total)}</div>
        <div class="wname" style="font-weight:800;font-size:17px;display:flex;gap:8px;align-items:center;margin-top:4px"><span class="swatch" style="background:${D.color}"></span>${D.name}</div>
        <p>${D.desc}</p>${wstats(D)}
        <p style="color:var(--muted);font-size:12px">Includes ${D.pack} rounds · Refills ${money(D.packPrice)} / ${D.pack}</p>
        <div class="actions"><button class="btn btn-sm btn-primary" ${owned || full || st.cash < total ? 'disabled' : ''}>${owned ? 'Equipped' : full ? 'No free slot' : st.cash < total ? 'Not enough cash' : 'Buy & Equip'}</button></div>`;
      $('button', card).onclick = () => {
        if (!spend(total)) return;
        m.weapons.push({ id, ammo: D.pack }); S.persist(); toast(`${D.name} bolted on!`, 'good'); renderHub();
      };
      g.appendChild(card);
    }
  }

  // ----- Gene Lab -----
  function renderLab(el) {
    const m = S.active();
    if (!m) return needMonster(el, 'Gene Lab');
    const st = S.get();
    el.innerHTML = `<h2>Gene Lab</h2><p class="sub">Permanent mutations for <b>${esc(m.name)}</b>. Each graft costs more than the last. Level-ups add +${MOM.LEVEL_BONUS.hp} HP, +1 STR, +1 ARM and +${MOM.LEVEL_BONUS.spd} SPD for free.</p><div class="grid" id="lgrid"></div>`;
    const g = $('#lgrid', el);
    for (const id of MOM.MORPH_ORDER) {
      const M = MOM.MORPHS[id], lvl = m.morphs[id], maxed = lvl >= M.max, cost = MOM.morphCost(id, lvl);
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="morph-icon">${M.icon}</div><h3>${M.name}</h3><p>${M.desc}</p>
        <div class="pips">${Array.from({ length: M.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        <p style="color:var(--muted);font-size:12px">Current bonus: +${+(lvl * M.per).toFixed(1)} ${M.stat === 'regen' ? 'HP/s' : M.stat.toUpperCase()}</p>
        <div class="actions"><button class="btn btn-sm btn-primary" ${maxed || st.cash < cost ? 'disabled' : ''}>${maxed ? 'MAXED' : `Graft · ${money(cost)}`}</button></div>`;
      $('button', card).onclick = () => {
        if (!spend(cost)) return;
        const before = S.stats(m).hp;
        m.morphs[id]++;
        m.hp += S.stats(m).hp - before;
        S.persist(); A.play('levelup'); toast(`${M.name} grafted!`, 'good'); renderHub();
      };
      g.appendChild(card);
    }
  }

  // ----- Arena -----
  function makeRival(diffId) {
    const p = S.active(), d = MOM.DIFFICULTIES[diffId], di = MOM.DIFF_ORDER.indexOf(diffId);
    // Pricier monsters only show up as rivals at higher difficulties.
    const maxPrice = [700, 950, Infinity][di];
    const type = pick(MOM.MONSTER_ORDER.filter((id) => MOM.MONSTERS[id].price <= maxPrice));
    const r = S.makeMonster(type, pick(MOM.RIVAL_NAMES));
    r.level = Math.max(1, p.level + d.lvl);
    const pm = Object.values(p.morphs).reduce((a, b) => a + b, 0);
    let pts = Math.round(pm * d.morphs + di + Math.random() * (di + 1));
    const keys = ['hide', 'muscle', 'glands', 'heart'];
    while (pts-- > 0) { const k = pick(keys); if (r.morphs[k] < 5) r.morphs[k]++; }
    const pools = [['spit', 'laser', 'flame'], ['spit', 'laser', 'flame', 'freeze', 'mine', 'roar'], ['laser', 'flame', 'freeze', 'roar', 'rocket', 'mine']];
    const want = [1, Math.random() < 0.5 ? 1 : 2, 2][di] + (type === 'mech' && di > 0 ? 1 : 0);
    const pool = pools[di].slice();
    while (r.weapons.length < Math.min(S.slots(r), want + (MOM.MONSTERS[type].builtin ? 1 : 0)) && pool.length) {
      const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      r.weapons.push({ id, ammo: MOM.WEAPONS[id].pack * (2 + di) });
    }
    r.hp = S.stats(r).hp;
    return r;
  }

  function renderArena(el) {
    const m = S.active();
    if (!m) return needMonster(el, 'Arena');
    const key = arena.diff + ':' + m.id + ':' + m.level;
    if (!rival || rivalKey !== key) { rival = makeRival(arena.diff); rivalKey = key; }
    const D = MOM.DIFFICULTIES[arena.diff];
    const ready = m.hp > 0;
    const prize = arena.mode === 'horde' ? `${money(15 * D.mult)}/kill + ${money(250 * D.mult)}` : money(MOM.MODES[arena.mode].reward * D.mult);
    const rd = MOM.MONSTERS[rival.type];
    el.innerHTML = `<h2>The Arena</h2><p class="sub">Pick your fight. Prizes scale with difficulty.</p>
      <div class="section-title">MODE</div>
      <div class="picker">${MOM.MODE_ORDER.map((id) => { const M = MOM.MODES[id]; return `<button class="pick ${arena.mode === id ? 'on' : ''}" data-mode="${id}"><span class="ic">${M.icon}</span><b>${M.name}</b><small>${M.desc}</small></button>`; }).join('')}</div>
      <div class="section-title">ARENA</div>
      <div class="picker">${['random', ...MOM.THEME_ORDER].map((id) => {
        const T = MOM.THEMES[id];
        const sw = T ? `linear-gradient(135deg, ${T.ground[0]} 0 55%, ${T.lava ? '#ff6a1f' : T.water ? '#2f7fbf' : T.ground[1]} 55% 70%, ${T.accent} 70%)` : 'linear-gradient(135deg,#4d7a35,#5b5f66,#3a302d,#c9a46a)';
        return `<button class="pick ${arena.theme === id ? 'on' : ''}" data-theme="${id}"><div class="theme-swatch" style="background:${sw}"></div><b>${T ? T.name : '🎲 Random'}</b></button>`;
      }).join('')}</div>
      <div class="section-title">DIFFICULTY</div>
      <div class="picker">${MOM.DIFF_ORDER.map((id) => { const X = MOM.DIFFICULTIES[id]; return `<button class="pick ${arena.diff === id ? 'on' : ''}" data-diff="${id}"><b style="color:${X.color}">${X.name}</b><small>Prize ×${X.mult} · Rivals ${X.lvl >= 0 ? '+' : ''}${X.lvl} levels</small></button>`; }).join('')}</div>
      <div class="versus">
        <div class="side"><canvas data-portrait="${m.type}" data-scale="0.3" data-angle="0"></canvas><div class="who"><b>${esc(m.name)}</b><small>LV ${m.level} ${MOM.MONSTERS[m.type].name} · ${Math.ceil(m.hp)}/${S.stats(m).hp} HP</small></div></div>
        <div class="vs">VS</div>
        <div class="side right"><canvas data-portrait="${rival.type}" data-scale="0.3" data-angle="${Math.PI}"></canvas><div class="who">
          ${arena.mode === 'horde' ? `<b>The Horde</b><small>3 waves of gremlins, then ${esc(rival.name)} the ${rd.name} (LV ${rival.level})</small>` : `<b>${esc(rival.name)}</b><small>LV ${rival.level} ${rd.name} · ${S.stats(rival).hp} HP<br/>${rival.weapons.map((w) => MOM.WEAPONS[w.id].name).join(', ') || 'Bare claws'}</small>`}
        </div></div>
      </div>
      <div class="fight-row">
        <button class="btn btn-primary btn-lg" id="btn-fight" ${ready ? '' : 'disabled'}>⚔️ FIGHT!</button>
        <button class="btn" id="btn-reroll">🎲 New challenger</button>
        <span style="color:var(--muted);font-weight:600">Prize: <b style="color:#7dff7a">${prize}</b></span>
        ${ready ? (m.hp < S.stats(m).hp * 0.5 ? '<span class="warn">⚠️ Your monster is badly hurt.</span>' : '') : '<span class="warn">Your monster is knocked out — heal it first.</span>'}
      </div>`;
    $$('[data-mode]', el).forEach((b) => b.onclick = () => { A.play('click'); arena.mode = b.dataset.mode; renderHub(); });
    $$('[data-theme]', el).forEach((b) => b.onclick = () => { A.play('click'); arena.theme = b.dataset.theme; renderHub(); });
    $$('[data-diff]', el).forEach((b) => b.onclick = () => { A.play('click'); arena.diff = b.dataset.diff; renderHub(); });
    $('#btn-reroll', el).onclick = () => { A.play('click'); rival = makeRival(arena.diff); renderHub(); };
    $('#btn-fight', el).onclick = () => startBattle();
  }

  // ---------- Battle ----------
  function startBattle(cfgOverride) {
    const m = S.active();
    if (!m || m.hp <= 0) return;
    A.init();
    A.play('go');
    const theme = arena.theme === 'random' ? pick(MOM.THEME_ORDER) : arena.theme;
    const cfg = cfgOverride || { mode: arena.mode, theme, diff: arena.diff, player: m, rival };
    lastBattle = { ...cfg, rival: cfg.rival };
    delete lastBattle.restore;
    show(null);
    $$('#modal-root .backdrop').forEach((b) => b.remove());
    const cv = $('#game');
    cv.style.display = 'block';
    MOM.Input.capture = true;
    if (battle) battle.destroy();
    battle = new MOM.Battle(cv, cfg, { onEnd: showResults, onPause: showPause });
    MOM.debugBattle = battle;
    if (cfg.restore) battle.pause();
    saveBattle();
  }

  // Rebuild an interrupted battle (or finish one that ended just before the reload).
  function resumeBattle(snap) {
    const st = S.get(), m = st.stable.find((x) => x.id === snap.cfg.playerId);
    st.active = m.id;
    const R = fixAmmo(snap.cfg.rival);
    if (snap.result) {
      lastBattle = { mode: snap.cfg.mode, theme: snap.cfg.theme, diff: snap.cfg.diff, rival: R };
      $('#game').style.display = 'none';
      show(null);
      showResults(snap.result);
      return;
    }
    startBattle({ mode: snap.cfg.mode, theme: snap.cfg.theme, diff: snap.cfg.diff, player: m, rival: R, restore: snap });
  }

  function showPause() {
    $('#screen-pause h2').textContent = battle && battle.cfg.restore && battle.t === battle.cfg.restore.t ? 'Battle Restored' : 'Paused';
    $('#pause-controls').innerHTML = controlsHTML();
    $('#screen-pause').classList.remove('hidden');
  }
  function resume() {
    $('#screen-pause').classList.add('hidden');
    battle && battle.resume();
  }

  function showResults(res) {
    store.del(BATTLE_KEY);
    const st = S.get(), m = S.active();
    const max = S.stats(m).hp;
    m.hp = Math.max(0, Math.min(max, res.hp));
    res.weapons.forEach((w, i) => { if (m.weapons[i] && m.weapons[i].id === w.id) m.weapons[i].ammo = w.ammo; });
    st.cash += res.total;
    st.record.battles++;
    st.record.earned += res.total;
    if (res.win) { st.record.wins++; m.wins++; } else if (res.win === false) { st.record.losses++; m.losses++; }
    const lvlBefore = m.level;
    const ups = S.addXp(m, res.xp);
    if (ups) m.hp += S.stats(m).hp - max;
    S.persist();
    if (ups) setTimeout(() => A.play('levelup'), 900);

    const col = res.win ? 'var(--yellow)' : res.win === null ? '#ccc' : 'var(--red)';
    const lines = [];
    if (res.mode === 'horde') lines.push([`Bounty (${res.kills} kills) & pickups`, res.pickups], [res.win ? 'Survival bonus' : 'Survival bonus (failed)', res.bonus]);
    else lines.push([res.win ? 'Prize purse' : res.win === null ? 'Draw purse' : 'Appearance fee', res.bonus], ['Arena pickups & smashing', res.pickups]);
    const need = MOM.xpForLevel(m.level);
    $('#results-card').innerHTML = `
      <h1 class="banner" style="color:${col}">${res.win ? 'VICTORY!' : res.win === null ? 'DRAW' : 'DEFEAT'}</h1>
      <p class="reason">${esc(res.reason)}</p>
      <canvas data-portrait="${m.type}" data-scale="0.3" data-moving="${res.win ? 1 : 0}" style="width:180px;height:140px"></canvas>
      <div class="ledger">
        ${lines.map(([k, v]) => `<div><span>${k}</span><span>${money(v)}</span></div>`).join('')}
        <div><span>Damage dealt</span><span>${res.damage}</span></div>
        ${res.mode === 'ctf' || res.mode === 'destruction' ? `<div><span>Score</span><span>${res.score[0]} – ${res.score[1]}</span></div>` : ''}
        <div class="total"><span>Total earned</span><span>${money(res.total)}</span></div>
      </div>
      ${ups ? `<div class="levelup">LEVEL UP! LV ${lvlBefore} → ${m.level}</div>` : ''}
      <div class="bar-label"><span>+${res.xp} XP</span><span>${m.xp} / ${need}</span></div>
      <div class="bar"><i style="width:0;background:linear-gradient(90deg,var(--pink),var(--yellow))" id="xpfill"></i></div>
      ${hpBar(m)}
      ${m.hp <= 0 ? `<p class="warn">${esc(m.name)} was knocked out and needs healing (${money(healCost(m))}).</p>` : ''}
      <div class="row gap wrap" style="justify-content:center">
        <button class="btn" id="btn-rematch" ${m.hp > 0 ? '' : 'disabled'}>🔁 Rematch</button>
        <button class="btn btn-primary" id="btn-hq">Back to HQ</button>
      </div>`;
    $('#screen-results').classList.remove('hidden');
    portraits($('#results-card'));
    setTimeout(() => { const f = $('#xpfill'); if (f) f.style.width = (m.xp / need) * 100 + '%'; }, 60);
    $('#btn-hq').onclick = () => { A.play('click'); endBattle(); showHub(m.hp < S.stats(m).hp ? 'stable' : 'arena'); };
    $('#btn-rematch').onclick = () => {
      A.play('click'); endBattle();
      const r = lastBattle.rival; r.hp = S.stats(r).hp;
      for (const w of r.weapons) if (!MOM.WEAPONS[w.id].builtin) w.ammo = MOM.WEAPONS[w.id].pack * (2 + MOM.DIFF_ORDER.indexOf(lastBattle.diff));
      startBattle({ ...lastBattle, player: m, theme: arena.theme === 'random' ? pick(MOM.THEME_ORDER) : lastBattle.theme });
    };
    rival = null; // fresh challenger next time
  }

  function endBattle() {
    store.del(BATTLE_KEY);
    if (battle) { battle.destroy(); battle = null; }
    $('#screen-results').classList.add('hidden');
    $('#game').style.display = 'none';
  }

  // ---------- Boot ----------
  function boot() {
    S.load();
    const unlock = () => A.init();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    MOM.Input.attach($('#game'));

    $('#btn-continue').onclick = () => { A.init(); A.play('click'); S.load(); showHub(S.active() ? 'stable' : 'catalog'); };
    $('#btn-new').onclick = () => {
      A.init(); A.play('click');
      const go = () => {
        S.newGame();
        store.del(BATTLE_KEY);
        rival = null;
        showHub('catalog');
        modal({
          title: 'Welcome, Monster Trainer!', center: true,
          body: `<p>Your account has been credited with <b>${money(MOM.START_CASH)}</b>.</p><p>Pick a monster from the catalog, kit it out with weapons and mutations, then take it to the arena to earn more.</p>`,
          buttons: [{ label: 'Browse the Catalog', cls: 'btn-primary' }],
        });
      };
      if (S.hasSave()) modal({ title: 'Start over?', body: '<p>This will erase your current stable and savings.</p>', buttons: [{ label: 'Cancel' }, { label: 'Start Fresh', cls: 'btn-danger', onClick: go }] });
      else go();
    };
    $('#btn-howto').onclick = () => { A.init(); A.play('click'); howTo(); };
    $('#brand-home').onclick = () => { A.play('click'); showTitle(); };
    $('#btn-sound').onclick = () => { A.init(); A.setMuted(!A.isMuted()); $('#btn-sound').textContent = A.isMuted() ? '🔇' : '🔊'; A.play('click'); };
    $$('#tabs button').forEach((b) => b.onclick = () => { A.play('click'); tab = b.dataset.tab; renderHub(); $('#screen-hub').scrollTop = 0; });
    $('#btn-resume').onclick = () => { A.play('click'); resume(); };
    $('#btn-forfeit').onclick = () => { A.play('click'); $('#screen-pause').classList.add('hidden'); battle && battle.forfeit(); };
    window.addEventListener('keydown', (e) => {
      if (!$('#screen-pause').classList.contains('hidden') && (e.key === 'Escape' || e.key === 'p')) resume();
    });
    // Autosave the fight periodically and whenever the page is hidden or closed.
    setInterval(saveBattle, 1000);
    window.addEventListener('pagehide', saveBattle);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveBattle(); });

    const ui = store.get(UI_KEY);
    if (ui) {
      if (ui.tab) tab = ui.tab;
      if (ui.arena) Object.assign(arena, ui.arena);
      if (ui.rival) { rival = fixAmmo(ui.rival); rivalKey = ui.rivalKey || ''; }
    }
    const st = S.get();
    const snap = store.get(BATTLE_KEY);
    if (snap && snap.v === 1 && st && st.stable.some((x) => x.id === snap.cfg.playerId)) {
      try { resumeBattle(snap); return; } catch (e) { console.warn('Could not restore battle', e); store.del(BATTLE_KEY); if (battle) { battle.destroy(); battle = null; } }
    } else store.del(BATTLE_KEY);

    if (ui && ui.screen === 'hub' && st) showHub();
    else showTitle();
  }

  boot();
  return { showHub, toast };
})();
