// The arena: fighters, weapons, AI and game-mode rules.
// Rendering lives in battle_render.js (same class, extra prototype methods).
(() => {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const GREMLIN = {
    grunt:   { r: 14, hp: 18, spd: 150, colors: { p: '#8a9a3a', s: '#5a6a20', a: '#ffde3b', d: '#2a3410' } },
    spitter: { r: 13, hp: 14, spd: 125, colors: { p: '#c46be0', s: '#7a3a99', a: '#b6ff3b', d: '#3a1a4a' } },
  };
  const HORDE_WAVES = [8, 12, 16];
  const PIXEL_BUDGET = 2.4e6;
  const QUALITY_KEY = 'mom_quality';

  class Battle {
    constructor(canvas, cfg, hooks) {
      this.cv = canvas;
      this.c = canvas.getContext('2d', { alpha: false });
      this.cfg = cfg;
      this.hooks = hooks;
      this.mode = cfg.mode;
      this.diff = MOM.DIFFICULTIES[cfg.diff];
      this.diffIdx = MOM.DIFF_ORDER.indexOf(cfg.diff);
      this.world = new MOM.World(cfg.theme, cfg.mode, cfg.restore && cfg.restore.world);
      this.fighters = []; this.projs = []; this.mines = []; this.pickups = []; this.parts = []; this.texts = [];
      this.t = 0; this.timeScale = 1;
      this.state = 'intro'; this.introT = 3.5; this.lastCount = 4;
      this.announce = null;
      this.cam = { x: 0, y: 0 }; this.zoom = 1; this.shakeAmt = 0;
      this.earned = 0; this.kills = 0; this.score = [0, 0];
      this.pickupT = 7;
      this.fields = {};
      this.miniDirty = true;
      this.perfMs = 0; this.perfWork = 0; this.perfN = 0;
      this.quality = 1;
      try { this.quality = clamp(parseFloat(localStorage.getItem(QUALITY_KEY)) || 1, 0.5, 1); } catch (e) {}

      const W = this.world;
      const a = W.center(W.spawnA.tx, W.spawnA.ty), b = W.center(W.spawnB.tx, W.spawnB.ty);
      this.player = this.makeFighter(cfg.player, 0, a.x, a.y, true);
      this.fighters.push(this.player);
      if (this.mode !== 'horde') {
        this.rival = this.makeFighter(cfg.rival, 1, b.x, b.y, false);
        this.rival.ang = Math.PI;
        this.fighters.push(this.rival);
      }
      this.reach = W.bfs(W.spawnA.tx, W.spawnA.ty, false);

      if (this.mode === 'ctf') {
        this.timeLeft = 180;
        this.flags = [0, 1].map((team) => {
          const p = team === 0 ? a : b;
          return { team, home: { x: p.x, y: p.y }, x: p.x, y: p.y, carrier: null, atHome: true, dropT: 0 };
        });
      } else if (this.mode === 'destruction') {
        this.timeLeft = 75;
      } else if (this.mode === 'horde') {
        this.wave = 0; this.waveSpawn = 0; this.waveT = 0; this.boss = null;
      }

      if (cfg.restore) this.applySnapshot(cfg.restore);

      this.resize();
      this.cam.x = this.player.x - this.vw / 2; this.cam.y = this.player.y - this.vh / 2;
      this.clampCam();
      this._resize = () => this.resize();
      window.addEventListener('resize', this._resize);
      this.last = performance.now();
      this.running = true;
      this._loop = (now) => this.loop(now);
      requestAnimationFrame(this._loop);
    }

    destroy() {
      this.running = false;
      window.removeEventListener('resize', this._resize);
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      // Render resolution: device pixel ratio, capped to a pixel budget (a full
      // 2x Retina canvas is ~5M pixels a frame), then scaled by adaptive quality.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cap = Math.sqrt(PIXEL_BUDGET / (w * h));
      const scale = Math.max(0.5, Math.min(dpr, cap) * this.quality);
      this.cv.width = Math.round(w * scale); this.cv.height = Math.round(h * scale);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      this.dpr = scale; this.sw = w; this.sh = h;
      this.zoom = clamp(Math.min(w / 980, h / 680), 0.55, 1.5);
      this.vw = w / this.zoom; this.vh = h / this.zoom;
    }

    clampCam() {
      const W = this.world;
      this.cam.x = W.pw <= this.vw ? (W.pw - this.vw) / 2 : clamp(this.cam.x, 0, W.pw - this.vw);
      this.cam.y = W.ph <= this.vh ? (W.ph - this.vh) / 2 : clamp(this.cam.y, 0, W.ph - this.vh);
    }

    // ---------- Save / restore ----------
    // Everything needed to rebuild the fight after a page reload. Particles and
    // in-flight projectiles are transient and skipped.
    serialize() {
      const ref = (f) => (!f ? null : f === this.player ? 'p' : f === this.rival ? 'r' : null);
      const fs = (f) => ({
        x: f.x, y: f.y, ang: f.ang, hp: f.hp, alive: f.alive, respawnT: f.respawnT || 0, sel: f.sel,
        slowT: Math.max(0, f.slowT), poisonT: Math.max(0, f.poisonT), dashCd: Math.max(0, f.dashCd),
        weapons: f.weapons.map((w) => ({ id: w.id, ammo: w.ammo === Infinity ? -1 : w.ammo })),
      });
      return {
        v: 1,
        cfg: { mode: this.mode, theme: this.world.themeId, diff: this.cfg.diff, rival: this.cfg.rival, playerId: this.cfg.player.id },
        world: this.world.snapshot(),
        state: this.state === 'paused' ? this.prevState : this.state,
        t: this.t, introT: this.introT, score: this.score, earned: this.earned, kills: this.kills, pickupT: this.pickupT,
        timeLeft: this.timeLeft, wave: this.wave, waveSpawn: this.waveSpawn, waveTotal: this.waveTotal, spawnT: this.spawnT, bossT: this.bossT,
        player: fs(this.player),
        rival: this.rival ? fs(this.rival) : null,
        minions: this.fighters.filter((f) => f.minion && f.alive).map((f) => ({ ...fs(f), kind: f.kind, maxHp: f.maxHp, spd: f.spd })),
        flags: this.flags ? this.flags.map((fl) => ({ x: fl.x, y: fl.y, atHome: fl.atHome, dropT: fl.dropT, carrier: ref(fl.carrier) })) : null,
        pickups: this.pickups.map((p) => ({ x: p.x, y: p.y, kind: p.kind, life: p.life })),
        mines: this.mines.map((m) => ({ x: m.x, y: m.y, team: m.team, owner: ref(m.owner), arm: m.arm, life: m.life })),
        result: this.state === 'over' ? this.result : null,
      };
    }

    applySnapshot(s) {
      for (const k of ['t', 'introT', 'earned', 'kills', 'pickupT', 'timeLeft', 'wave', 'waveSpawn', 'waveTotal', 'spawnT', 'bossT']) {
        if (s[k] != null) this[k] = s[k];
      }
      this.score = s.score.slice();
      this.lastCount = Math.ceil(this.introT - 0.5) + 1;
      const setF = (f, d) => {
        Object.assign(f, { x: d.x, y: d.y, ang: d.ang, hp: d.hp, hpLag: d.hp, alive: d.alive, respawnT: d.respawnT, sel: d.sel, slowT: d.slowT, poisonT: d.poisonT, dashCd: d.dashCd });
        f.weapons = d.weapons.map((w) => ({ id: w.id, ammo: w.ammo == null || w.ammo < 0 ? Infinity : w.ammo, cd: 0 }));
        if (!f.alive) f.deadT = 0;
      };
      setF(this.player, s.player);
      if (this.mode === 'horde' && s.rival) {
        this.boss = this.makeFighter(this.cfg.rival, 1, s.rival.x, s.rival.y, false);
        this.rival = this.boss;
        this.fighters.push(this.boss);
      }
      if (this.rival && s.rival) setF(this.rival, s.rival);
      for (const d of s.minions) {
        const f = this.makeMinion(d.x, d.y, d.kind);
        setF(f, d);
        f.maxHp = d.maxHp; f.spd = d.spd;
        this.fighters.push(f);
      }
      const byRef = (r) => (r === 'p' ? this.player : r === 'r' ? this.rival : null);
      if (this.flags && s.flags) {
        s.flags.forEach((d, i) => {
          const fl = this.flags[i];
          Object.assign(fl, { x: d.x, y: d.y, atHome: d.atHome, dropT: d.dropT, carrier: byRef(d.carrier) });
          if (fl.carrier) fl.carrier.carrying = fl;
        });
      }
      this.pickups = s.pickups.map((p) => ({ ...p, t: 0 }));
      this.mines = s.mines.map((m) => ({ ...m, owner: byRef(m.owner) || this.player, D: MOM.WEAPONS.mine }));
      this.state = s.state;
    }

    // ---------- Fighters ----------
    makeFighter(src, team, x, y, isPlayer) {
      const st = MOM.Save.stats(src);
      const f = {
        src, team, isPlayer, type: src.type, name: src.name, level: src.level,
        x, y, vx: 0, vy: 0, kbx: 0, kby: 0, ang: 0, r: st.r,
        hp: isPlayer ? clamp(src.hp, 1, st.hp) : st.hp, maxHp: st.hp,
        str: st.str, arm: st.arm, spd: st.spd, regen: st.regen,
        weapons: src.weapons.map((w) => ({ id: w.id, ammo: w.ammo, cd: 0 })), sel: 0,
        meleeCd: 0, atk: 0, dashCd: 0, dashT: 0, dashX: 0, dashY: 0, slowT: 0, poisonT: 0, poisonBy: null,
        flash: 0, walk: 0, moving: false, alive: true, respawnT: 0, spawn: { x, y },
        dmgDealt: 0, minion: false, colors: null,
      };
      f.hpLag = f.hp;
      if (!isPlayer) f.ai = this.makeAI(f);
      return f;
    }

    makeAI(f) {
      const ranged = f.weapons.some((w) => w.ammo > 0 && !['flame', 'roar', 'mine'].includes(w.id));
      return {
        style: ranged && f.str < 13 ? 'gunner' : 'brawler',
        strafe: Math.random() < 0.5 ? -1 : 1, strafeT: 1,
        seen: 0, goalKey: null, field: null, fieldT: 0,
        lastX: f.x, lastY: f.y, stuckT: 0, unstuck: 0, ux: 0, uy: 0,
        obsGoal: null, obsT: 0, think: 0,
      };
    }

    makeMinion(x, y, kind) {
      const g = GREMLIN[kind], hpMul = 1 + this.diffIdx * 0.35 + (this.wave - 1) * 0.15;
      const f = {
        team: 1, isPlayer: false, minion: true, kind, type: 'gremlin', name: 'Gremlin', level: 1,
        x, y, vx: 0, vy: 0, kbx: 0, kby: 0, ang: 0, r: g.r,
        hp: Math.round(g.hp * hpMul), maxHp: Math.round(g.hp * hpMul),
        str: 4 + this.diffIdx * 1.5, arm: 0, spd: g.spd + rand(-10, 25), regen: 0,
        weapons: [], sel: 0,
        meleeCd: rand(0, 1), atk: 0, dashCd: 99, dashT: 0, slowT: 0, poisonT: 0,
        flash: 0, walk: rand(0, 10), moving: false, alive: true, respawnT: 0,
        spitCd: rand(1, 2.5), colors: g.colors, dmgDealt: 0,
      };
      f.hpLag = f.hp;
      return f;
    }

    // ---------- Main loop ----------
    loop(now) {
      if (!this.running) return;
      const raw = now - this.last;
      let dt = Math.min(0.05, raw / 1000);
      this.last = now;
      if (this.state !== 'paused') {
        const w0 = performance.now();
        dt *= this.timeScale;
        this.update(dt);
        this.render(dt);
        this.trackPerf(raw, performance.now() - w0);
        this.pausedDrawn = false;
      } else if (!this.pausedDrawn) {
        // The paused scene is static; draw it once.
        this.render(0);
        this.pausedDrawn = true;
      }
      MOM.Input.endFrame();
      requestAnimationFrame(this._loop);
    }

    // If frames run consistently slow, step the render resolution down. The
    // setting is remembered so the next battle starts at the right quality.
    // Two signals: the frame interval (GPU-bound or slow machines) and our own
    // per-frame work, which is where drawing time shows up when the browser
    // rasterizes on the CPU. 9ms of work leaves headroom on 120Hz displays.
    trackPerf(ms, work) {
      if (ms > 100) return; // tab switch or hitch, not steady load
      this.perfMs += ms; this.perfWork += work; this.perfN++;
      if (this.perfMs < 2000) return;
      const avg = this.perfMs / this.perfN, avgWork = this.perfWork / this.perfN;
      this.perfMs = 0; this.perfWork = 0; this.perfN = 0;
      if ((avg > 20 || avgWork > 9) && this.quality > 0.55) {
        this.quality = Math.max(0.5, this.quality - 0.15);
        try { localStorage.setItem(QUALITY_KEY, String(this.quality)); } catch (e) {}
        this.resize();
      }
    }

    pause() {
      if (this.state === 'paused' || this.state === 'over') return;
      this.prevState = this.state;
      this.state = 'paused';
      this.hooks.onPause && this.hooks.onPause();
    }
    resume() {
      if (this.state !== 'paused') return;
      this.state = this.prevState;
      this.last = performance.now();
      MOM.Input.endFrame();
    }
    forfeit() {
      this.state = this.prevState || 'play';
      this.finish(false, 'Forfeited');
      this.overT = 0;
    }

    update(dt) {
      const I = MOM.Input;
      if (I.wasPressed('Escape') || I.wasPressed('p')) { this.pause(); return; }
      const pad = I.readPad();
      if (pad && pad.edge.start) { this.pause(); return; }

      this.t += dt;
      if (this.state === 'intro') {
        this.introT -= dt;
        const n = Math.ceil(this.introT - 0.5);
        if (n < this.lastCount && n > 0) { MOM.Audio.play('beep'); this.lastCount = n; }
        if (this.introT <= 0.5) {
          this.state = 'play';
          MOM.Audio.play('go');
          this.say('FIGHT!', MOM.MODES[this.mode].desc, '#ffd23f', 1.6);
          if (this.mode === 'horde') this.nextWave();
        }
      }
      const playing = this.state === 'play';

      if (playing) this.updateMode(dt);
      for (const f of this.fighters) {
        if (!f.alive) { this.updateDead(f, dt); continue; }
        if (playing) {
          if (f.isPlayer) this.controlPlayer(f, dt, pad);
          else if (f.minion) this.controlMinion(f, dt);
          else this.controlAI(f, dt);
        } else { f.mx = 0; f.my = 0; }
        this.physics(f, dt);
      }
      this.separate();
      this.fighters = this.fighters.filter((f) => f.alive || !f.minion || f.deadT > 0);

      this.updateProjectiles(dt);
      this.updateMines(dt);
      if (playing) this.updatePickups(dt);
      this.updateParticles(dt);

      // Camera
      const p = this.player;
      let tx = p.x - this.vw / 2, ty = p.y - this.vh / 2;
      if (p.isPlayer && I.mouse.active && performance.now() - I.mouse.lastMove < 2500) {
        tx += (I.mouse.x / this.zoom - this.vw / 2) * 0.18;
        ty += (I.mouse.y / this.zoom - this.vh / 2) * 0.18;
      }
      const k = 1 - Math.pow(0.0015, dt);
      this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
      this.clampCam();
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
      if (this.announce) { this.announce.t += dt; if (this.announce.t > this.announce.dur) this.announce = null; }

      if (this.state === 'over') {
        this.overT -= dt / Math.max(0.01, this.timeScale);
        if (this.overT <= 0 && !this.ended) {
          this.ended = true;
          this.hooks.onEnd(this.result);
        }
      }
    }

    say(text, sub, color, dur = 2) { this.announce = { text, sub, color, t: 0, dur }; }

    // ---------- Player ----------
    controlPlayer(f, dt, pad) {
      const I = MOM.Input;
      let mx = 0, my = 0;
      if (I.down('a') || I.down('ArrowLeft')) mx -= 1;
      if (I.down('d') || I.down('ArrowRight')) mx += 1;
      if (I.down('w') || I.down('ArrowUp')) my -= 1;
      if (I.down('s') || I.down('ArrowDown')) my += 1;
      if (pad && (pad.lx || pad.ly)) { mx = pad.lx; my = pad.ly; }
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      f.mx = mx; f.my = my;

      // Aim: right stick > mouse (if recently used) > movement direction.
      let aim = null;
      if (pad && (pad.rx || pad.ry)) { aim = Math.atan2(pad.ry, pad.rx); I.mouse.active = false; }
      else if (I.mouse.active && (performance.now() - I.mouse.lastMove < 3000 || I.mouse.left)) {
        const wx = this.cam.x + I.mouse.x / this.zoom, wy = this.cam.y + I.mouse.y / this.zoom;
        aim = Math.atan2(wy - f.y, wx - f.x);
      } else if (ml > 0.1) aim = Math.atan2(my, mx);
      if (aim != null) f.ang += angDiff(f.ang, aim) * Math.min(1, dt * 18);

      if (I.wasPressed(' ') || I.wasPressed('k') || I.wasPressed('mouse2') || (pad && pad.edge.melee)) this.melee(f);
      if (I.wasPressed('Shift') || I.wasPressed('l') || (pad && pad.edge.dash)) this.dash(f);
      const n = f.weapons.length;
      if (n) {
        let sw = 0;
        if (I.wasPressed('q') || (pad && pad.edge.prev)) sw = -1;
        if (I.wasPressed('e') || (pad && pad.edge.next)) sw = 1;
        if (I.mouse.wheel) sw = I.mouse.wheel;
        if (sw) { f.sel = (f.sel + sw + n) % n; MOM.Audio.play('click'); }
        for (let i = 0; i < n; i++) if (I.wasPressed(String(i + 1))) { f.sel = i; MOM.Audio.play('click'); }
        if (I.mouse.left || I.down('j') || (pad && pad.fire)) this.fire(f);
      }
    }

    // ---------- Physics ----------
    physics(f, dt) {
      const W = this.world, G = MOM.G;
      f.meleeCd -= dt; f.dashCd -= dt; f.flash -= dt; f.slowT -= dt;
      f.atk = Math.max(0, f.atk - dt * 4);
      for (const w of f.weapons) w.cd -= dt;
      if (f.regen && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + f.regen * dt);
      f.hpLag += (f.hp - f.hpLag) * Math.min(1, dt * 3);

      if (f.poisonT > 0) {
        f.poisonT -= dt;
        this.hurt(f, 3.5 * dt, f.poisonBy, { raw: true, quiet: true });
        if (Math.random() < dt * 8) this.part({ x: f.x + rand(-f.r, f.r), y: f.y + rand(-f.r, f.r), vy: -30, life: 0.6, size: 3, color: '#9cff4f' });
        if (!f.alive) return;
      }

      const g = W.groundAtPx(f.x, f.y);
      const flying = f.type === 'bat';
      let mul = f.slowT > 0 ? 0.5 : 1;
      if (g === G.WATER && !flying) {
        mul *= f.type === 'wyrm' ? 1.05 : f.type === 'golem' ? 0.4 : 0.55;
        if (f.moving && Math.random() < dt * 6) this.part({ ring: true, x: f.x, y: f.y, r0: f.r * 0.6, r1: f.r * 1.5, life: 0.6, color: 'rgba(200,235,255,0.6)' });
      }
      if (g === G.LAVA && !flying && f.type !== 'mech') {
        mul *= 0.8;
        this.hurt(f, 11 * dt, null, { raw: true, quiet: true });
        if (Math.random() < dt * 14) this.part({ x: f.x + rand(-f.r, f.r), y: f.y + rand(-f.r, f.r), vy: -50, life: 0.5, size: 4, color: '#ffb52e', glow: true });
        if (!f.alive) return;
      }

      let tvx = (f.mx || 0) * f.spd * mul, tvy = (f.my || 0) * f.spd * mul;
      const acc = Math.min(1, dt * 11);
      f.vx += (tvx - f.vx) * acc; f.vy += (tvy - f.vy) * acc;
      if (f.dashT > 0) {
        f.dashT -= dt;
        f.vx = f.dashX * f.spd * 3.1; f.vy = f.dashY * f.spd * 3.1;
        if (Math.random() < 0.7) this.part({ x: f.x, y: f.y, life: 0.3, size: f.r * 0.5, color: 'rgba(255,255,255,0.25)' });
      }
      f.x += (f.vx + f.kbx) * dt; f.y += (f.vy + f.kby) * dt;
      const kd = Math.pow(0.004, dt);
      f.kbx *= kd; f.kby *= kd;
      this.collideTiles(f);
      f.x = clamp(f.x, f.r, W.pw - f.r); f.y = clamp(f.y, f.r, W.ph - f.r);
      const sp = Math.hypot(f.vx, f.vy);
      f.moving = sp > 25;
      f.walk += sp * dt * 0.07;
    }

    collideTiles(f) {
      const W = this.world, T = W.T;
      for (let it = 0; it < 2; it++) {
        const tx0 = Math.floor((f.x - f.r) / T), tx1 = Math.floor((f.x + f.r) / T);
        const ty0 = Math.floor((f.y - f.r) / T), ty1 = Math.floor((f.y + f.r) / T);
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          if (!W.solid(tx, ty)) continue;
          const cx = clamp(f.x, tx * T, tx * T + T), cy = clamp(f.y, ty * T, ty * T + T);
          let dx = f.x - cx, dy = f.y - cy;
          const d = Math.hypot(dx, dy);
          if (d >= f.r) continue;
          if (d < 0.001) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
          f.x += dx * (f.r - d); f.y += dy * (f.r - d);
          // Ramming obstacles while dashing smashes them.
          if (f.dashT > 0 && f.dashHit !== ty * 1000 + tx) {
            f.dashHit = ty * 1000 + tx;
            this.hitTile(tx, ty, f.str * 2.2, f);
            this.shake(4);
            f.dashT = Math.min(f.dashT, 0.04);
          }
          if (f.ai) f.ai.bump = { tx, ty };
        }
      }
    }

    separate() {
      const L = this.fighters;
      for (let i = 0; i < L.length; i++) {
        const a = L[i]; if (!a.alive) continue;
        for (let j = i + 1; j < L.length; j++) {
          const b = L[j]; if (!b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
          const d = Math.hypot(dx, dy);
          if (d >= rr || d < 0.001) continue;
          const o = (rr - d) / d;
          const wa = a.type === 'golem' ? 0.15 : b.type === 'golem' ? 0.85 : b.r / rr;
          a.x -= dx * o * wa; a.y -= dy * o * wa;
          b.x += dx * o * (1 - wa); b.y += dy * o * (1 - wa);
        }
      }
    }

    // ---------- Combat ----------
    enemiesOf(f) { return this.fighters.filter((o) => o.alive && o.team !== f.team); }

    melee(f) {
      if (f.meleeCd > 0 || !f.alive) return;
      f.meleeCd = f.minion ? 0.9 : f.type === 'mantis' ? 0.26 : 0.5;
      f.atk = 1;
      const reach = f.r + (f.minion ? 16 : 28);
      let hit = false;
      for (const o of this.enemiesOf(f)) {
        const d = dist(f, o);
        if (d - o.r > reach) continue;
        const a = Math.atan2(o.y - f.y, o.x - f.x);
        if (Math.abs(angDiff(f.ang, a)) > 1.0 + Math.atan2(o.r, Math.max(d, 1))) continue;
        let dmg = f.str * rand(0.85, 1.15) * (f.type === 'rex' ? 1.25 : 1);
        this.hurt(o, dmg, f, {
          kb: f.type === 'rex' ? 420 : f.minion ? 90 : 220,
          ang: a, poison: f.type === 'spider' ? 3 : 0,
        });
        this.part({ x: (f.x + o.x) / 2, y: (f.y + o.y) / 2, ring: true, r0: 4, r1: 22, life: 0.18, color: 'rgba(255,255,255,0.8)' });
        hit = true;
      }
      if (!f.minion) {
        // Bite whatever obstacle is in front.
        const fx = f.x + Math.cos(f.ang) * (f.r + 14), fy = f.y + Math.sin(f.ang) * (f.r + 14);
        const tx = Math.floor(fx / this.world.T), ty = Math.floor(fy / this.world.T);
        if (this.world.solid(tx, ty) && this.world.ob(tx, ty).kind !== 'wall') {
          this.hitTile(tx, ty, f.str * 1.6, f);
          hit = true;
        }
      }
      if (this.audible(f)) MOM.Audio.play(hit ? 'bite' : 'swing', 0.05);
    }

    dash(f) {
      if (f.dashCd > 0 || !f.alive) return;
      let dx = f.mx || 0, dy = f.my || 0;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(f.ang); dy = Math.sin(f.ang); }
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      f.dashX = dx; f.dashY = dy; f.dashT = 0.17; f.dashCd = 1.6; f.dashHit = -1;
      if (this.audible(f)) MOM.Audio.play('dash');
    }

    fire(f) {
      const w = f.weapons[f.sel];
      if (!w || w.cd > 0 || !f.alive) return;
      const D = MOM.WEAPONS[w.id];
      if (w.ammo <= 0) {
        w.cd = 0.4;
        if (f.isPlayer) { MOM.Audio.play('error'); this.floatText(f.x, f.y - f.r - 10, 'OUT OF AMMO', '#ff6b6b', 12); }
        return;
      }
      w.cd = D.cd;
      if (!D.builtin) w.ammo--;
      const ca = Math.cos(f.ang), sa = Math.sin(f.ang);
      const mx = f.x + ca * (f.r + 6), my = f.y + sa * (f.r + 6);
      const loud = this.audible(f);
      switch (D.kind) {
        case 'proj': {
          this.projs.push({ x: mx, y: my, vx: ca * D.speed, vy: sa * D.speed, life: D.life, max: D.life, D, wid: w.id, owner: f, team: f.team });
          if (loud) MOM.Audio.play(w.id === 'spit' ? 'spit' : w.id === 'rocket' ? 'rocket' : w.id === 'freeze' ? 'freeze' : w.id === 'eye' ? 'eye' : 'laser', 0.05);
          if (w.id === 'rocket') { f.kbx -= ca * 120; f.kby -= sa * 120; }
          break;
        }
        case 'flame': {
          const a = f.ang + rand(-0.17, 0.17), sp = D.speed * rand(0.85, 1.15);
          this.projs.push({ x: mx, y: my, vx: Math.cos(a) * sp + f.vx * 0.5, vy: Math.sin(a) * sp + f.vy * 0.5, life: D.life, max: D.life, D, wid: 'flame', owner: f, team: f.team });
          if (loud) MOM.Audio.play('flame', 0.09);
          break;
        }
        case 'mine': {
          const bx = f.x - ca * (f.r + 12), by = f.y - sa * (f.r + 12);
          this.mines.push({ x: bx, y: by, team: f.team, owner: f, arm: 0.6, life: 40, D });
          const mine = this.mines.filter((m) => m.owner === f);
          if (mine.length > 8) this.mines.splice(this.mines.indexOf(mine[0]), 1);
          if (loud) MOM.Audio.play('mine');
          break;
        }
        case 'roar': {
          this.part({ ring: true, x: f.x, y: f.y, r0: f.r, r1: D.splash, life: 0.4, color: 'rgba(199,155,255,0.9)', lw: 6 });
          this.part({ ring: true, x: f.x, y: f.y, r0: f.r, r1: D.splash * 0.7, life: 0.3, color: 'rgba(255,255,255,0.6)', lw: 3 });
          for (const o of this.enemiesOf(f)) {
            const d = dist(f, o);
            if (d - o.r > D.splash) continue;
            const fall = 1 - clamp(d / (D.splash + o.r), 0, 1) * 0.5;
            this.hurt(o, D.dmg * fall, f, { kb: 650 * fall, ang: Math.atan2(o.y - f.y, o.x - f.x) });
          }
          this.tilesInRadius(f.x, f.y, D.splash, (tx, ty, fall) => this.hitTile(tx, ty, D.dmg * fall, f));
          this.shake(8);
          if (loud) MOM.Audio.play('roar');
          break;
        }
      }
    }

    audible(f) {
      return f.isPlayer || Math.hypot(f.x - (this.cam.x + this.vw / 2), f.y - (this.cam.y + this.vh / 2)) < Math.max(this.vw, this.vh) * 0.7;
    }

    hurt(o, dmg, src, opts = {}) {
      if (!o.alive || this.state === 'over' && !opts.raw) return;
      const final = opts.raw ? dmg : dmg * (30 / (30 + o.arm));
      o.hp -= final;
      if (src && src !== o) src.dmgDealt = (src.dmgDealt || 0) + final;
      if (!opts.quiet) {
        o.flash = 0.1;
        this.floatText(o.x + rand(-8, 8), o.y - o.r - 6, Math.max(1, Math.round(final)), o.isPlayer ? '#ff6b6b' : '#ffffff', 13 + Math.min(10, final * 0.4));
        const col = o.colors ? o.colors.p : MOM.MONSTERS[o.type].colors.p;
        this.burst(o.x, o.y, 6 + Math.min(10, final / 2), col, 140, 0.45, 3.5);
        if (Math.random() < 0.4) this.world.decal(o.x + rand(-10, 10), o.y + rand(-10, 10), rand(4, 9), this.hexA(col, 0.35));
        if (this.audible(o)) MOM.Audio.play('hit', 0.06);
        if (o.isPlayer) this.shake(Math.min(10, 3 + final * 0.3));
      }
      if (opts.kb && o.type !== 'golem') {
        const k = opts.kb * (o.minion ? 1.5 : 1);
        o.kbx += Math.cos(opts.ang) * k; o.kby += Math.sin(opts.ang) * k;
      }
      if (opts.slow) o.slowT = Math.max(o.slowT, opts.slow);
      if (opts.poison) { o.poisonT = Math.max(o.poisonT, opts.poison); o.poisonBy = src; }
      if (o.ai && src && src.team !== o.team) o.ai.seen = Math.max(o.ai.seen, this.diff.react);
      if (o.hp <= 0) this.kill(o, src);
    }

    kill(o, src) {
      if (!o.alive) return;
      o.alive = false; o.hp = 0; o.deadT = 0.01; o.flash = 0; o.slowT = 0; o.poisonT = 0;
      const col = o.colors ? o.colors.p : MOM.MONSTERS[o.type].colors.p;
      this.burst(o.x, o.y, o.minion ? 18 : 40, col, 260, 0.9, 5);
      this.burst(o.x, o.y, 12, '#ffffff', 180, 0.5, 3);
      this.world.decal(o.x, o.y, o.r * 1.4, this.hexA(col, 0.45));
      this.part({ ring: true, x: o.x, y: o.y, r0: o.r, r1: o.r * 3.5, life: 0.5, color: this.hexA(col, 0.8), lw: 5 });
      if (this.audible(o)) MOM.Audio.play(o.minion ? 'hit' : 'ko');
      if (!o.minion) this.shake(12);
      if (o.carrying) this.dropFlag(o);
      if (o.minion) {
        this.kills++;
        const pay = Math.round(15 * this.diff.mult);
        this.earned += pay;
        this.floatText(o.x, o.y - 18, '+$' + pay, '#7dff7a', 14);
        MOM.Audio.play('cash', 0.08);
        return;
      }
      if (src && src.isPlayer) this.kills++;
      this.onDeath(o, src);
    }

    hitTile(tx, ty, dmg, by) {
      const W = this.world, o = W.ob(tx, ty);
      if (!o || o.kind === 'wall') return;
      const mult = by && by.flameHit && (o.kind === 'tree' || o.kind === 'cactus') ? 3 : 1;
      const cx = (tx + 0.5) * W.T, cy = (ty + 0.5) * W.T;
      const debris = o.kind === 'tree' || o.kind === 'cactus' ? '#3f8a35' : o.kind === 'building' ? '#d8cbb5' : '#8a847d';
      const gone = W.damage(tx, ty, dmg * mult);
      if (Math.random() < 0.5) this.burst(cx, cy, 3, debris, 120, 0.4, 3);
      if (!gone) return;
      this.miniDirty = true; this.fields = {};
      this.burst(cx, cy, 22, debris, 220, 0.8, 5);
      this.burst(cx, cy, 10, 'rgba(120,110,100,0.6)', 60, 1.2, 12, { smoke: true });
      MOM.Audio.play('crumble', 0.08);
      const def = MOM.OBS[gone.kind];
      if (by) {
        if (this.mode === 'destruction' && this.state === 'play') {
          this.score[by.team] += def.pts;
          this.floatText(cx, cy - 10, '+' + def.pts, by.isPlayer ? '#ffd23f' : '#ff6b6b', 16);
        }
        if (by.isPlayer && def.cash && this.state === 'play' && this.mode !== 'destruction') {
          this.earned += def.cash;
          this.floatText(cx, cy - 26, '+$' + def.cash, '#7dff7a', 13);
        }
      }
      if (gone.kind === 'building' && Math.random() < 0.3) this.spawnPickup(cx, cy);
    }

    tilesInRadius(x, y, r, fn) {
      const T = this.world.T;
      for (let ty = Math.floor((y - r) / T); ty <= Math.floor((y + r) / T); ty++) {
        for (let tx = Math.floor((x - r) / T); tx <= Math.floor((x + r) / T); tx++) {
          const d = Math.hypot((tx + 0.5) * T - x, (ty + 0.5) * T - y);
          if (d <= r + T * 0.35) fn(tx, ty, 1 - clamp(d / (r + T), 0, 1) * 0.6);
        }
      }
    }

    explode(x, y, D, owner) {
      const r = D.splash;
      this.burst(x, y, 30, '#ffb52e', 300, 0.6, 6, { glow: true });
      this.burst(x, y, 16, '#ff5a1f', 200, 0.5, 8, { glow: true });
      this.burst(x, y, 14, 'rgba(60,55,50,0.6)', 80, 1.4, 16, { smoke: true });
      this.part({ ring: true, x, y, r0: 6, r1: r, life: 0.35, color: 'rgba(255,220,140,0.9)', lw: 5 });
      this.world.decal(x, y, r * 0.45, 'rgba(20,15,10,0.35)');
      this.shake(10);
      MOM.Audio.play('boom', 0.06);
      for (const o of this.fighters) {
        if (!o.alive || o.team === owner.team) continue;
        const d = Math.hypot(o.x - x, o.y - y);
        if (d - o.r > r) continue;
        const fall = 1 - clamp(d / (r + o.r), 0, 1) * 0.6;
        this.hurt(o, D.dmg * fall, owner, { kb: 420 * fall, ang: Math.atan2(o.y - y, o.x - x) });
      }
      this.tilesInRadius(x, y, r, (tx, ty, fall) => this.hitTile(tx, ty, D.dmg * fall * (D.structMult || 1), owner));
    }

    updateProjectiles(dt) {
      const W = this.world;
      for (const p of this.projs) {
        p.life -= dt;
        if (p.dead) continue;
        const steps = Math.ceil(Math.hypot(p.vx, p.vy) * dt / 10);
        for (let s = 0; s < steps && !p.dead; s++) {
          p.x += p.vx * dt / steps; p.y += p.vy * dt / steps;
          const tx = Math.floor(p.x / W.T), ty = Math.floor(p.y / W.T);
          if (W.solid(tx, ty)) {
            if (p.D.splash) this.explode(p.x - p.vx * dt / steps, p.y - p.vy * dt / steps, p.D, p.owner);
            else {
              p.owner.flameHit = p.wid === 'flame';
              this.hitTile(tx, ty, p.D.dmg * (p.D.structMult || 1), p.owner);
              p.owner.flameHit = false;
              this.burst(p.x, p.y, 4, p.D.color, 100, 0.25, 2.5, { glow: true });
            }
            p.dead = true; break;
          }
          for (const o of this.fighters) {
            if (!o.alive || o.team === p.team) continue;
            const rr = o.r + (p.D.rad || 4);
            if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 > rr * rr) continue;
            if (p.D.splash) this.explode(p.x, p.y, p.D, p.owner);
            else {
              this.hurt(o, p.D.dmg, p.owner, { kb: p.wid === 'flame' ? 30 : 90, ang: Math.atan2(p.vy, p.vx), slow: p.D.slow });
              this.burst(p.x, p.y, 5, p.D.color, 120, 0.3, 2.5, { glow: true });
            }
            p.dead = true; break;
          }
        }
        if (p.wid === 'rocket' && Math.random() < 0.8) this.part({ x: p.x, y: p.y, life: 0.5, size: 5, color: 'rgba(200,200,200,0.4)', smoke: true });
      }
      this.projs = this.projs.filter((p) => {
        if (p.life > 0 && !p.dead) return true;
        // Splash weapons that run out of range still detonate.
        if (!p.dead && p.D.splash) this.explode(p.x, p.y, p.D, p.owner);
        return false;
      });
    }

    updateMines(dt) {
      for (const m of this.mines) {
        m.arm -= dt; m.life -= dt;
        if (m.arm > 0 || m.life <= 0) continue;
        for (const o of this.fighters) {
          if (!o.alive || o.team === m.team || o.type === 'bat') continue;
          if (Math.hypot(o.x - m.x, o.y - m.y) < o.r + 18) { m.life = 0; this.explode(m.x, m.y, m.D, m.owner); break; }
        }
      }
      this.mines = this.mines.filter((m) => m.life > 0);
    }

    // ---------- Pickups ----------
    spawnPickup(x, y) {
      const r = Math.random();
      const kind = r < 0.4 ? 'health' : r < 0.72 ? 'cash' : 'ammo';
      if (x == null) {
        const tile = this.world.randomOpenTile(this.reach, (tx, ty) => Math.hypot(tx - this.player.x / 48, ty - this.player.y / 48) < 3);
        const c = this.world.center(tile.tx, tile.ty);
        x = c.x; y = c.y;
      }
      this.pickups.push({ x, y, kind, t: 0, life: 25 });
    }

    updatePickups(dt) {
      this.pickupT -= dt;
      if (this.pickupT <= 0) {
        this.pickupT = rand(8, 13);
        if (this.pickups.length < 4) this.spawnPickup();
      }
      for (const p of this.pickups) {
        p.t += dt; p.life -= dt;
        for (const f of this.fighters) {
          if (!f.alive || f.minion || Math.hypot(f.x - p.x, f.y - p.y) > f.r + 14) continue;
          p.life = 0;
          this.collect(f, p);
          break;
        }
      }
      this.pickups = this.pickups.filter((p) => p.life > 0);
    }

    collect(f, p) {
      this.part({ ring: true, x: p.x, y: p.y, r0: 6, r1: 34, life: 0.35, color: 'rgba(255,255,255,0.8)' });
      if (f.isPlayer) MOM.Audio.play(p.kind === 'cash' ? 'cash' : 'pickup');
      if (p.kind === 'health') {
        const h = Math.round(f.maxHp * 0.3);
        f.hp = Math.min(f.maxHp, f.hp + h);
        this.floatText(f.x, f.y - f.r - 12, '+' + h + ' HP', '#7dff7a', 15);
      } else if (p.kind === 'cash') {
        const v = Math.round(rand(40, 80) / 5) * 5;
        if (f.isPlayer) { this.earned += v; this.floatText(f.x, f.y - f.r - 12, '+$' + v, '#ffd23f', 15); }
        else this.floatText(f.x, f.y - f.r - 12, 'STOLEN!', '#ff6b6b', 13);
      } else {
        const ws = f.weapons.filter((w) => !MOM.WEAPONS[w.id].builtin);
        if (ws.length) {
          const w = f.weapons[f.sel] && !MOM.WEAPONS[f.weapons[f.sel].id].builtin ? f.weapons[f.sel] : ws[0];
          const n = Math.ceil(MOM.WEAPONS[w.id].pack / 2);
          w.ammo += n;
          this.floatText(f.x, f.y - f.r - 12, '+' + n + ' ' + MOM.WEAPONS[w.id].name, '#7fe8ff', 13);
        } else {
          f.hp = Math.min(f.maxHp, f.hp + 15);
          this.floatText(f.x, f.y - f.r - 12, '+15 HP', '#7dff7a', 15);
        }
      }
    }

    // ---------- AI ----------
    fieldTo(tx, ty, allowLava) {
      const key = tx + ',' + ty + (allowLava ? 'L' : '');
      const F = this.fields[key];
      if (F && this.t - F.t < 0.6) return F.d;
      const d = this.world.bfs(tx, ty, allowLava);
      this.fields[key] = { d, t: this.t };
      return d;
    }

    // Direction along the BFS field toward its source, or null.
    stepAlong(f, field) {
      const W = this.world, T = W.T;
      const tx = Math.floor(f.x / T), ty = Math.floor(f.y / T);
      let best = W.inb(tx, ty) ? field[W.idx(tx, ty)] : -1, bx = -1, by = -1;
      if (best === 0) return null;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (!W.inb(nx, ny)) continue;
        if (dx && dy && (W.solid(tx + dx, ty) || W.solid(tx, ty + dy))) continue;
        const v = field[W.idx(nx, ny)];
        if (v < 0) continue;
        if (best < 0 || v < best || (v === best && dx && dy)) { best = v; bx = nx; by = ny; }
      }
      if (bx < 0) return null;
      const c = W.center(bx, by);
      const l = Math.hypot(c.x - f.x, c.y - f.y) || 1;
      return { x: (c.x - f.x) / l, y: (c.y - f.y) / l };
    }

    steerTo(f, gx, gy, allowDirect = true) {
      const W = this.world;
      const d = Math.hypot(gx - f.x, gy - f.y);
      if (d < 4) return { x: 0, y: 0 };
      if (allowDirect && d < 320 && W.los(f.x, f.y, gx, gy) && this.clearPath(f, gx, gy)) {
        return { x: (gx - f.x) / d, y: (gy - f.y) / d };
      }
      const lava = f.type === 'bat' || f.type === 'mech';
      const field = this.fieldTo(Math.floor(gx / W.T), Math.floor(gy / W.T), lava);
      return this.stepAlong(f, field) || { x: (gx - f.x) / d, y: (gy - f.y) / d };
    }

    // Wide-body check: offset rays on both sides of the path.
    clearPath(f, gx, gy) {
      const W = this.world, a = Math.atan2(gy - f.y, gx - f.x);
      const px = -Math.sin(a) * f.r * 0.9, py = Math.cos(a) * f.r * 0.9;
      if (!W.los(f.x + px, f.y + py, gx + px, gy + py) || !W.los(f.x - px, f.y - py, gx - px, gy - py)) return false;
      if (f.type === 'bat' || f.type === 'mech') return true;
      const n = Math.ceil(Math.hypot(gx - f.x, gy - f.y) / 24);
      for (let i = 1; i <= n; i++) if (W.groundAtPx(f.x + (gx - f.x) * i / n, f.y + (gy - f.y) * i / n) === MOM.G.LAVA) return false;
      return true;
    }

    controlAI(f, dt) {
      const ai = f.ai, W = this.world;
      const foes = this.enemiesOf(f);
      let target = null, td = Infinity;
      for (const o of foes) { const d = dist(f, o); if (d < td) { td = d; target = o; } }

      let goal = null, fight = !!target;
      if (this.mode === 'ctf') {
        const mine = this.flags[f.team], theirs = this.flags[1 - f.team];
        if (f.carrying) { goal = mine.home; fight = target && td < 160; }
        else if (mine.carrier) { goal = mine.carrier; }
        else if (!mine.atHome) { goal = mine; fight = target && td < 200; }
        else { goal = theirs.carrier ? theirs.carrier : theirs; fight = target && td < 230; }
      } else if (this.mode === 'destruction') {
        fight = target && td < 240 && W.los(f.x, f.y, target.x, target.y);
        if (!fight) {
          ai.obsT -= dt;
          if (!ai.obsGoal || !W.solid(ai.obsGoal.tx, ai.obsGoal.ty) || ai.obsT <= 0) { ai.obsGoal = this.pickObstacle(f); ai.obsT = 6; }
          if (ai.obsGoal) goal = W.center(ai.obsGoal.tx, ai.obsGoal.ty);
        }
      }
      if (fight && target && !goal) goal = target;
      if (!goal && target) goal = target;
      if (!goal) { f.mx = f.my = 0; return; }

      // Grab health when hurting.
      if (f.hp < f.maxHp * 0.35 && !f.carrying) {
        const hp = this.pickups.filter((p) => p.kind === 'health').sort((a, b) => dist(f, a) - dist(f, b))[0];
        if (hp && dist(f, hp) < 600) { goal = hp; }
      }

      const visible = target && td < 520 && W.los(f.x, f.y, target.x, target.y);
      ai.seen = visible ? ai.seen + dt : Math.max(0, ai.seen - dt * 2);
      const ready = ai.seen >= this.diff.react;

      // Movement
      let mv;
      const engaging = fight && target && goal === target;
      if (ai.unstuck > 0) {
        ai.unstuck -= dt;
        mv = { x: ai.ux, y: ai.uy };
      } else if (engaging && visible && ai.style === 'gunner' && this.hasAmmo(f)) {
        ai.strafeT -= dt;
        if (ai.strafeT <= 0) { ai.strafe *= -1; ai.strafeT = rand(0.8, 2); }
        const a = Math.atan2(target.y - f.y, target.x - f.x);
        const radial = td > 260 ? 1 : td < 170 ? -1 : 0;
        mv = { x: Math.cos(a) * radial - Math.sin(a) * ai.strafe * 0.8, y: Math.sin(a) * radial + Math.cos(a) * ai.strafe * 0.8 };
        const l = Math.hypot(mv.x, mv.y) || 1; mv.x /= l; mv.y /= l;
        // Don't strafe into lava or walls.
        const nx = f.x + mv.x * 40, ny = f.y + mv.y * 40;
        if (W.solidAtPx(nx, ny) || (W.groundAtPx(nx, ny) === MOM.G.LAVA && f.type !== 'bat' && f.type !== 'mech')) { ai.strafe *= -1; mv = this.steerTo(f, target.x, target.y); }
      } else {
        const close = engaging ? f.r + target.r + 8 : 6;
        mv = Math.hypot(goal.x - f.x, goal.y - f.y) > close ? this.steerTo(f, goal.x, goal.y) : { x: 0, y: 0 };
      }
      f.mx = mv.x; f.my = mv.y;

      // Stuck detection: if barely moving while trying to, wiggle and chew through.
      ai.stuckT += dt;
      if (ai.stuckT > 0.8) {
        const moved = Math.hypot(f.x - ai.lastX, f.y - ai.lastY);
        if (moved < 10 && (Math.abs(f.mx) + Math.abs(f.my)) > 0.3 && ai.unstuck <= 0) {
          const a = rand(0, TAU);
          ai.ux = Math.cos(a); ai.uy = Math.sin(a); ai.unstuck = 0.35;
          if (ai.bump) { f.ang = Math.atan2((ai.bump.ty + 0.5) * W.T - f.y, (ai.bump.tx + 0.5) * W.T - f.x); this.melee(f); }
        }
        ai.lastX = f.x; ai.lastY = f.y; ai.stuckT = 0; ai.bump = null;
      }

      // Facing and attacks
      let want = Math.atan2(f.my, f.mx);
      if (!(f.mx || f.my)) want = f.ang;
      if (target && visible && td < 460 && (fight || td < 140)) {
        const w = f.weapons[f.sel], D = w && MOM.WEAPONS[w.id];
        const lead = D && D.speed ? td / D.speed : 0;
        const tx = target.x + target.vx * lead * 0.8, ty = target.y + target.vy * lead * 0.8;
        ai.err = ai.err == null || Math.random() < dt * 2 ? rand(-1, 1) * this.diff.aim * 2.2 : ai.err;
        want = Math.atan2(ty - f.y, tx - f.x) + ai.err;
      } else if (this.mode === 'destruction' && ai.obsGoal && goal && !fight && dist(f, goal) < f.r + W.T) {
        want = Math.atan2(goal.y - f.y, goal.x - f.x);
        if (Math.abs(angDiff(f.ang, want)) < 0.5) {
          this.melee(f);
          this.pickWeapon(f, 120, true);
          if (f.weapons[f.sel] && f.weapons[f.sel].ammo > 0 && Math.random() < 0.5) this.fire(f);
        }
      }
      f.ang += angDiff(f.ang, want) * Math.min(1, dt * 9);

      if (target && visible && ready && (fight || td < 120)) {
        const aimOff = Math.abs(angDiff(f.ang, Math.atan2(target.y - f.y, target.x - f.x)));
        if (td < f.r + target.r + 26 && aimOff < 0.7) this.melee(f);
        if (this.pickWeapon(f, td) && aimOff < 0.3 + this.diff.aim) this.fire(f);
        if (f.dashCd <= 0 && Math.random() < dt * 0.9) {
          if (ai.style === 'brawler' && td > 110 && td < 260) this.dash(f);
          else if (f.hp < f.maxHp * 0.3 && td < 120) {
            const a = Math.atan2(f.y - target.y, f.x - target.x);
            f.mx = Math.cos(a); f.my = Math.sin(a); this.dash(f);
          }
        }
      }
    }

    hasAmmo(f) { return f.weapons.some((w) => w.ammo > 0); }

    pickWeapon(f, d, structures) {
      let best = -1, bestScore = 0;
      f.weapons.forEach((w, i) => {
        if (w.ammo <= 0) return;
        const D = MOM.WEAPONS[w.id];
        let s = 0;
        if (D.kind === 'proj') { const range = D.speed * D.life; if (d < range * 0.95) s = 2 + D.dmg / 10 + (w.id === 'rocket' && structures ? 3 : 0); }
        else if (D.kind === 'flame') s = d < 150 ? 4 : 0;
        else if (D.kind === 'roar') s = d < 120 ? 3.5 : 0;
        else if (D.kind === 'mine') s = d < 110 && Math.random() < 0.05 ? 3 : 0;
        if (w.id === 'freeze' && this.enemiesOf(f).some((o) => o.slowT > 0.5)) s *= 0.4;
        if (s > bestScore) { bestScore = s; best = i; }
      });
      if (best >= 0) f.sel = best;
      return best >= 0;
    }

    pickObstacle(f) {
      const W = this.world;
      let best = null, bd = Infinity;
      for (let ty = 1; ty < W.H - 1; ty++) for (let tx = 1; tx < W.W - 1; tx++) {
        const o = W.obs[W.idx(tx, ty)];
        if (!o) continue;
        const pts = MOM.OBS[o.kind].pts;
        const d = Math.hypot((tx + 0.5) * W.T - f.x, (ty + 0.5) * W.T - f.y) / (1 + pts * 0.25);
        if (d < bd) { bd = d; best = { tx, ty }; }
      }
      return best;
    }

    controlMinion(f, dt) {
      const p = this.player, W = this.world;
      if (!p.alive) { f.mx = f.my = 0; return; }
      const d = dist(f, p);
      const vis = d < 400 && W.los(f.x, f.y, p.x, p.y);
      let mv;
      if (f.kind === 'spitter' && vis && d < 220) {
        const a = Math.atan2(p.y - f.y, p.x - f.x);
        const r = d < 150 ? -1 : 0;
        mv = { x: Math.cos(a) * r - Math.sin(a) * 0.5, y: Math.sin(a) * r + Math.cos(a) * 0.5 };
      } else if (vis && d < 200 && this.clearPath(f, p.x, p.y)) {
        mv = { x: (p.x - f.x) / d, y: (p.y - f.y) / d };
      } else {
        const field = this.fieldTo(Math.floor(p.x / W.T), Math.floor(p.y / W.T), false);
        mv = this.stepAlong(f, field) || { x: (p.x - f.x) / d, y: (p.y - f.y) / d };
      }
      f.mx = mv.x; f.my = mv.y;
      const want = vis ? Math.atan2(p.y - f.y, p.x - f.x) : Math.atan2(f.my, f.mx);
      f.ang += angDiff(f.ang, want) * Math.min(1, dt * 8);
      if (d < f.r + p.r + 14) this.melee(f);
      if (f.kind === 'spitter') {
        f.spitCd -= dt;
        if (vis && f.spitCd <= 0 && d < 300) {
          f.spitCd = rand(1.4, 2.4);
          const a = Math.atan2(p.y - f.y, p.x - f.x) + rand(-0.15, 0.15);
          const D = { ...MOM.WEAPONS.spit, dmg: 4 + this.diffIdx, color: '#b6ff3b' };
          this.projs.push({ x: f.x, y: f.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, life: 1, max: 1, D, wid: 'spit', owner: f, team: 1 });
          if (this.audible(f)) MOM.Audio.play('spit', 0.15);
        }
      }
    }

    updateDead(f, dt) {
      if (f.deadT > 0) f.deadT += dt;
      if (f.minion && f.deadT > 0.6) f.deadT = 0;
      if (f.respawnT > 0) {
        f.respawnT -= dt;
        if (f.respawnT <= 0) {
          f.alive = true;
          f.hp = Math.max(f.hp, f.maxHp * 0.6);
          f.hpLag = f.hp;
          f.x = f.spawn.x; f.y = f.spawn.y; f.vx = f.vy = f.kbx = f.kby = 0;
          f.poisonT = 0; f.slowT = 0;
          this.part({ ring: true, x: f.x, y: f.y, r0: 50, r1: 5, life: 0.4, color: 'rgba(255,255,255,0.8)', lw: 4 });
          if (f.isPlayer) MOM.Audio.play('pickup');
        }
      }
    }

    // ---------- Modes ----------
    onDeath(o, src) {
      if (this.mode === 'survival') {
        this.finish(!o.isPlayer, o.isPlayer ? 'Knocked out!' : `${o.name} is down!`);
      } else if (this.mode === 'horde') {
        if (o.isPlayer) this.finish(false, 'Overrun by the horde!');
        else if (o === this.boss) {
          this.earned += Math.round(120 * this.diff.mult);
          this.floatText(o.x, o.y - 30, '+$' + Math.round(120 * this.diff.mult), '#7dff7a', 20);
        }
      } else {
        o.respawnT = 3;
        o.hp = 0;
        if (o.isPlayer) this.say('KNOCKED OUT', 'Respawning in 3…', '#ff6b6b', 2.5);
        else this.say(`${o.name} DOWN!`, 'Rival respawns in 3 seconds', '#ffd23f', 1.8);
      }
    }

    updateMode(dt) {
      if (this.mode === 'ctf' || this.mode === 'destruction') {
        this.timeLeft -= dt;
        if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== this.lastTick) { this.lastTick = Math.ceil(this.timeLeft); MOM.Audio.play('beep'); }
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          const [a, b] = this.score;
          this.finish(a > b ? true : a < b ? false : null, a === b ? 'Time! It\'s a draw.' : 'Time!');
          return;
        }
      }
      if (this.mode === 'ctf') this.updateFlags(dt);
      if (this.mode === 'horde') this.updateHorde(dt);
    }

    updateFlags(dt) {
      for (const fl of this.flags) {
        if (fl.carrier) {
          fl.x = fl.carrier.x; fl.y = fl.carrier.y;
          continue;
        }
        if (!fl.atHome) {
          fl.dropT -= dt;
          if (fl.dropT <= 0) this.returnFlag(fl);
        }
        for (const f of this.fighters) {
          if (!f.alive || f.minion || Math.hypot(f.x - fl.x, f.y - fl.y) > f.r + 18) continue;
          if (f.team === fl.team) {
            if (!fl.atHome) {
              this.returnFlag(fl);
              this.say(f.isPlayer ? 'FLAG RETURNED' : 'RIVAL RETURNED THEIR FLAG', '', f.isPlayer ? '#7dff7a' : '#ff6b6b', 1.5);
            }
          } else if (!f.carrying) {
            fl.carrier = f; fl.atHome = false; f.carrying = fl;
            MOM.Audio.play('flag');
            this.say(f.isPlayer ? 'YOU GOT THEIR FLAG!' : 'YOUR FLAG WAS TAKEN!', f.isPlayer ? 'Bring it home!' : 'Chase them down!', f.isPlayer ? '#ffd23f' : '#ff6b6b', 1.8);
            break;
          }
        }
      }
      // Captures: carry enemy flag home while own flag is at home.
      for (const f of this.fighters) {
        if (!f.alive || !f.carrying) continue;
        const mine = this.flags[f.team];
        if (mine.atHome && Math.hypot(f.x - mine.home.x, f.y - mine.home.y) < 46) {
          const fl = f.carrying;
          f.carrying = null; fl.carrier = null;
          this.returnFlag(fl);
          this.score[f.team]++;
          MOM.Audio.play(f.isPlayer ? 'win' : 'lose');
          if (f.isPlayer) { this.earned += 60; this.floatText(f.x, f.y - 30, '+$60', '#7dff7a', 18); }
          this.burst(f.x, f.y, 40, f.isPlayer ? '#4fa8ff' : '#ff4f4f', 300, 1, 5, { glow: true });
          if (this.score[f.team] >= 3) { this.finish(f.isPlayer, f.isPlayer ? 'Hat trick! 3 captures.' : 'Rival made 3 captures.'); return; }
          this.say(f.isPlayer ? 'CAPTURE!' : 'RIVAL SCORES', `${this.score[0]} — ${this.score[1]}`, f.isPlayer ? '#ffd23f' : '#ff6b6b', 2);
        }
      }
    }

    dropFlag(f) {
      const fl = f.carrying;
      fl.carrier = null; fl.x = f.x; fl.y = f.y; fl.dropT = 15;
      f.carrying = null;
    }
    returnFlag(fl) {
      fl.x = fl.home.x; fl.y = fl.home.y; fl.atHome = true; fl.carrier = null; fl.dropT = 0;
    }

    nextWave() {
      this.wave++;
      this.waveSpawn = HORDE_WAVES[this.wave - 1];
      this.waveTotal = this.waveSpawn;
      this.spawnT = 0.5;
      MOM.Audio.play('wave');
      this.say(`WAVE ${this.wave}`, this.wave === 3 ? 'The Brute is coming…' : `${this.waveSpawn} gremlins incoming`, '#ff9a3b', 2.2);
      if (this.wave === 3) this.bossT = 6;
    }

    updateHorde(dt) {
      const W = this.world;
      if (this.waveSpawn > 0) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawnT = rand(0.35, 0.9) / (1 + this.diffIdx * 0.3);
          const t = W.randomOpenTile(this.reach, (tx, ty) => Math.hypot((tx + 0.5) * W.T - this.player.x, (ty + 0.5) * W.T - this.player.y) < 420);
          const c = W.center(t.tx, t.ty);
          const kind = this.wave > 1 && Math.random() < 0.3 ? 'spitter' : 'grunt';
          const m = this.makeMinion(c.x, c.y, kind);
          this.fighters.push(m);
          this.part({ ring: true, x: c.x, y: c.y, r0: 30, r1: 4, life: 0.4, color: 'rgba(200,120,255,0.8)', lw: 3 });
          this.waveSpawn--;
        }
      }
      if (this.bossT > 0) {
        this.bossT -= dt;
        if (this.bossT <= 0) {
          const t = W.randomOpenTile(this.reach, (tx, ty) => Math.hypot((tx + 0.5) * W.T - this.player.x, (ty + 0.5) * W.T - this.player.y) < 500);
          const c = W.center(t.tx, t.ty);
          this.boss = this.makeFighter(this.cfg.rival, 1, c.x, c.y, false);
          this.boss.name = this.cfg.rival.name;
          this.rival = this.boss;
          this.fighters.push(this.boss);
          this.shake(10);
          MOM.Audio.play('roar');
          this.say('THE BRUTE APPEARS!', `${this.boss.name} the ${MOM.MONSTERS[this.boss.type].name}`, '#ff4f4f', 2.2);
        }
      }
      const left = this.fighters.some((f) => f.alive && f.team === 1);
      if (!left && this.waveSpawn <= 0 && !(this.bossT > 0)) {
        if (this.wave >= 3) this.finish(true, 'The horde is vanquished!');
        else this.nextWave();
      }
    }

    remainingFoes() {
      return this.fighters.filter((f) => f.alive && f.team === 1).length + (this.waveSpawn || 0) + (this.bossT > 0 ? 1 : 0);
    }

    finish(win, reason) {
      if (this.state === 'over') return;
      this.state = 'over';
      this.overT = 2.2;
      this.timeScale = 0.35;
      const mult = this.diff.mult;
      const p = this.player, R = this.cfg.rival;
      let reward = 0, xp = 0;
      const m = this.mode;
      if (m === 'survival') { reward = win ? Math.round(MOM.MODES.survival.reward * mult + R.level * 20) : 40; xp = win ? 60 + this.diffIdx * 30 : 20; }
      else if (m === 'ctf') { reward = win ? Math.round(MOM.MODES.ctf.reward * mult) : win === null ? 120 : 50 + this.score[0] * 30; xp = win ? 70 + this.diffIdx * 30 : 25 + this.score[0] * 5; }
      else if (m === 'destruction') { reward = (win ? Math.round(MOM.MODES.destruction.reward * mult) : 0) + this.score[0] * 4; xp = (win ? 50 + this.diffIdx * 25 : 15) + this.score[0]; }
      else if (m === 'horde') { reward = win ? Math.round(250 * mult) : 0; xp = this.kills * 3 + (win ? 60 + this.diffIdx * 30 : 10); }
      this.say(win ? 'VICTORY!' : win === null ? 'DRAW' : 'DEFEAT', reason, win ? '#ffd23f' : win === null ? '#cccccc' : '#ff6b6b', 9);
      setTimeout(() => MOM.Audio.play(win ? 'win' : 'lose'), 250);
      this.result = {
        win, reason, mode: m, diff: this.cfg.diff,
        bonus: reward, pickups: this.earned, total: reward + this.earned, xp,
        kills: this.kills, damage: Math.round(p.dmgDealt), score: this.score.slice(),
        hp: p.alive ? Math.round(p.hp) : (m === 'survival' || m === 'horde' ? 0 : Math.round(p.maxHp * 0.25)),
        weapons: p.weapons.map((w) => ({ id: w.id, ammo: w.ammo })),
        rival: R,
      };
    }

    // ---------- FX helpers ----------
    shake(a) { this.shakeAmt = Math.min(16, Math.max(this.shakeAmt, a)); }
    part(p) { p.max = p.life; this.parts.push(p); if (this.parts.length > 900) this.parts.shift(); }
    burst(x, y, n, color, speed, life, size, extra = {}) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), s = rand(0.2, 1) * speed;
        this.part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rand(0.6, 1.1), size: size * rand(0.6, 1.3), color, drag: 3, ...extra });
      }
    }
    floatText(x, y, txt, color, size = 14) { this.texts.push({ x, y, txt: String(txt), color, size, life: 0.9, max: 0.9 }); }
    hexA(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    updateParticles(dt) {
      for (const p of this.parts) {
        p.life -= dt;
        if (p.ring) continue;
        p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
        if (p.drag) { const k = Math.pow(1 / (1 + p.drag), dt * 3); p.vx *= k; p.vy *= k; }
      }
      this.parts = this.parts.filter((p) => p.life > 0);
      for (const t of this.texts) { t.life -= dt; t.y -= 40 * dt; }
      this.texts = this.texts.filter((t) => t.life > 0);
    }
  }

  MOM.Battle = Battle;
  MOM.BattleUtil = { rand, clamp, angDiff, dist, TAU };
})();
