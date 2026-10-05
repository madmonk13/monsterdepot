// Battle rendering: world, entities, effects and the heads-up display.
(() => {
  const { clamp, TAU } = MOM.BattleUtil;
  const P = MOM.Battle.prototype;
  const A = MOM.Art;
  const FONT = '"Rubik", "Segoe UI", system-ui, sans-serif';
  const DISPLAY = '"Bungee", "Rubik", Impact, sans-serif';
  const TEAM = ['#4fa8ff', '#ff4f5e'];

  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function panel(c, x, y, w, h, r = 12) {
    rr(c, x, y, w, h, r);
    c.fillStyle = 'rgba(14,11,24,0.72)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1; c.stroke();
  }
  function hpColor(f) { return f > 0.5 ? '#5fe35f' : f > 0.25 ? '#ffc23f' : '#ff4f4f'; }

  P.render = function (dt) {
    const c = this.c, z = this.zoom * this.dpr;
    const W = this.world, cam = this.cam, t = this.t;
    const cw = this.cv.width, ch = this.cv.height;
    W.setScale(z);
    W.flush(dt);
    // Snap the camera to whole device pixels so the terrain copy is 1:1.
    const sx = (Math.random() - 0.5) * this.shakeAmt, sy = (Math.random() - 0.5) * this.shakeAmt;
    const ox = Math.round((cam.x - sx) * z), oy = Math.round((cam.y - sy) * z);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (!W.covers(ox, oy, cw, ch)) {
      c.fillStyle = '#0d0b14';
      c.fillRect(0, 0, cw, ch);
    }
    W.drawTerrain(c, ox, oy, cw, ch);
    c.setTransform(z, 0, 0, z, -ox, -oy);

    W.drawLiquids(c, cam, this.vw, this.vh, t);
    W.drawShaking(c);
    if (this.flags) this.drawBases(c);
    for (const m of this.mines) this.drawMine(c, m);
    for (const p of this.pickups) this.drawPickup(c, p);

    const order = this.fighters.filter((f) => f.alive).sort((a, b) => (a.type === 'bat') - (b.type === 'bat') || a.y - b.y);
    for (const f of order) this.drawFighter(c, f);
    if (this.flags) for (const fl of this.flags) this.drawFlag(c, fl);
    this.drawProjs(c);
    this.drawParticles(c);
    this.drawTexts(c);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawIndicators(c);
    this.drawHUD(c);
  };

  P.toScreen = function (x, y) { return { x: (x - this.cam.x) * this.zoom, y: (y - this.cam.y) * this.zoom }; };

  P.drawFighter = function (c, f) {
    const team = TEAM[f.team];
    if (!f.minion || f.kind === 'pup') {
      c.strokeStyle = team; c.globalAlpha = 0.55; c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(f.x, f.y + 3, f.r + 5, (f.r + 5) * 0.8, 0, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
    if (f.dashT > 0) {
      A.drawMonster(c, f.type, f.x - f.vx * 0.03, f.y - f.vy * 0.03, f.ang, f.r, this.t, { walk: f.walk, alpha: 0.3, noShadow: true, colors: f.colors });
    }
    const squash = f.flash > 0 ? 0.08 : 0;
    A.drawMonster(c, f.type, f.x, f.y, f.ang, f.r, this.t, {
      moving: f.moving, walk: f.walk, atk: f.atk, flash: f.flash > 0, colors: f.colors, squash,
    });
    if (f.slowT > 0) {
      c.fillStyle = 'rgba(127,232,255,0.28)';
      c.beginPath(); c.arc(f.x, f.y, f.r + 2, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(200,245,255,0.8)'; c.lineWidth = 1.5; c.stroke();
    }
    if (f.poisonT > 0) {
      c.strokeStyle = 'rgba(156,255,79,0.6)'; c.lineWidth = 2;
      c.beginPath(); c.arc(f.x, f.y, f.r + 4, this.t * 4, this.t * 4 + 2); c.stroke();
    }
    if (f.carrying) {
      const fl = f.carrying;
      this.drawFlagShape(c, f.x - 6, f.y - f.r - 4, TEAM[fl.team], 0.85);
    }
    if (!f.isPlayer) {
      const w = Math.max(26, f.r * 2), x = f.x - w / 2, y = f.y - f.r - (f.minion ? 10 : 14);
      const pct = clamp(f.hp / f.maxHp, 0, 1);
      if (f.minion && pct >= 1) return;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - 1, y - 1, w + 2, 6);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x, y, w * clamp(f.hpLag / f.maxHp, 0, 1), 4);
      c.fillStyle = hpColor(pct); c.fillRect(x, y, w * pct, 4);
    }
  };

  // Projectiles in two passes so the additive-blend state is switched once
  // per frame rather than once per projectile.
  P.drawProjs = function (c) {
    if (!this.projs.length) return;
    for (const p of this.projs) if (!GLOWY[p.wid]) this.drawProj(c, p, false);
    c.globalCompositeOperation = 'lighter';
    for (const p of this.projs) if (GLOWY[p.wid]) this.drawProj(c, p, true);
    c.globalCompositeOperation = 'source-over';
  };
  const GLOWY = { laser: 1, eye: 1, flame: 1, freeze: 1, rocket: 1 };

  P.drawProj = function (c, p, glowPass) {
    const D = p.D, age = 1 - p.life / p.max;
    const a = Math.atan2(p.vy, p.vx);
    switch (p.wid) {
      case 'laser': case 'eye': {
        A.line(c, [p.x - p.vx * 0.025, p.y - p.vy * 0.025, p.x, p.y], D.color, p.wid === 'eye' ? 6 : 5);
        A.line(c, [p.x - p.vx * 0.02, p.y - p.vy * 0.02, p.x, p.y], '#fff', 2);
        break;
      }
      case 'flame': {
        const r = 5 + age * 18;
        const col = age < 0.3 ? `rgba(255,240,150,${0.7 - age})` : age < 0.65 ? `rgba(255,140,30,${0.6 - age * 0.4})` : `rgba(200,50,20,${0.5 - age * 0.45})`;
        A.circ(c, p.x, p.y, r, col);
        break;
      }
      case 'rocket': {
        // Exhaust glows; the body is drawn normally so it stays solid.
        const ca = Math.cos(a), sa = Math.sin(a);
        A.circ(c, p.x - ca * 10, p.y - sa * 10, 5 + Math.random() * 3, 'rgba(255,170,40,0.8)');
        c.globalCompositeOperation = 'source-over';
        c.save(); c.translate(p.x, p.y); c.rotate(a);
        c.fillStyle = '#d9dde3'; rr(c, -8, -3.5, 14, 7, 3); c.fill();
        c.fillStyle = '#ff4f4f'; c.beginPath(); c.moveTo(6, -3.5); c.lineTo(11, 0); c.lineTo(6, 3.5); c.fill();
        c.restore();
        c.globalCompositeOperation = 'lighter';
        break;
      }
      case 'freeze': {
        A.circ(c, p.x, p.y, 9, 'rgba(127,232,255,0.35)');
        c.save(); c.translate(p.x, p.y); c.rotate(this.t * 10);
        A.poly(c, [0, -6, 3, 0, 0, 6, -3, 0], '#e8fbff');
        c.restore();
        break;
      }
      default: {
        A.circ(c, p.x - p.vx * 0.02, p.y - p.vy * 0.02, D.rad * 0.6, 'rgba(182,255,59,0.4)');
        A.circ(c, p.x, p.y, D.rad, D.color, '#4a6a10', 1.5);
        A.circ(c, p.x - 1.5, p.y - 1.5, D.rad * 0.35, 'rgba(255,255,255,0.7)');
      }
    }
  };

  P.drawMine = function (c, m) {
    A.circ(c, m.x, m.y + 2, 9, 'rgba(0,0,0,0.3)');
    A.circ(c, m.x, m.y, 8, '#3a3d42', '#1a1c20', 1.5);
    const on = m.arm > 0 ? true : Math.sin(this.t * 10) > 0;
    if (on) A.circ(c, m.x, m.y, 6, 'rgba(255,59,59,0.35)');
    A.circ(c, m.x, m.y, 3, on ? '#ff4f4f' : '#661a1a');
    c.strokeStyle = TEAM[m.team]; c.globalAlpha = 0.5; c.lineWidth = 1.5;
    c.beginPath(); c.arc(m.x, m.y, 11, 0, TAU); c.stroke(); c.globalAlpha = 1;
  };

  P.drawPickup = function (c, p) {
    if (p.life < 4 && Math.sin(p.life * 18) < 0) return;
    const bob = Math.sin(p.t * 3) * 3, x = p.x, y = p.y + bob;
    const pulse = 0.5 + 0.5 * Math.sin(p.t * 4);
    const col = p.kind === 'health' ? '#ff4f5e' : p.kind === 'cash' ? '#ffd23f' : '#7fe8ff';
    A.ell(c, p.x, p.y + 12, 11, 4, 0, 'rgba(0,0,0,0.3)');
    c.globalAlpha = 0.25 + pulse * 0.25;
    A.circ(c, x, y, 18 + pulse * 3, col);
    c.globalAlpha = 1;
    if (p.kind === 'health') {
      A.circ(c, x, y, 12, '#ffffff', '#c22a3a', 2);
      c.fillStyle = '#e8303f'; c.fillRect(x - 2.5, y - 7, 5, 14); c.fillRect(x - 7, y - 2.5, 14, 5);
    } else if (p.kind === 'cash') {
      A.circ(c, x, y, 12, '#ffd23f', '#a07a10', 2);
      c.fillStyle = '#7a5a00'; c.font = `bold 14px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('$', x, y + 1);
    } else {
      c.fillStyle = '#8a6a3a'; rr(c, x - 11, y - 9, 22, 18, 3); c.fill();
      c.strokeStyle = '#4a3410'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#7fe8ff'; for (let i = -1; i <= 1; i++) c.fillRect(x + i * 6 - 1.5, y - 5, 3, 10);
    }
  };

  P.drawBases = function (c) {
    for (const fl of this.flags) {
      const { x, y } = fl.home, col = TEAM[fl.team];
      c.fillStyle = this.hexA(col, 0.18);
      c.beginPath(); c.arc(x, y, 46, 0, TAU); c.fill();
      c.setLineDash([8, 6]); c.lineDashOffset = -this.t * 20;
      c.strokeStyle = this.hexA(col, 0.8); c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 46, 0, TAU); c.stroke();
      c.setLineDash([]);
    }
  };

  P.drawFlagShape = function (c, x, y, col, s = 1) {
    A.line(c, [x, y + 14 * s, x, y - 22 * s], '#3a2a1a', 3 * s);
    const w = Math.sin(this.t * 6) * 3 * s;
    A.poly(c, [x, y - 22 * s, x + 20 * s, y - 16 * s + w, x, y - 9 * s], col, '#111', 1.5);
  };

  P.drawFlag = function (c, fl) {
    if (fl.carrier) return;
    A.ell(c, fl.x + 2, fl.y + 12, 8, 3, 0, 'rgba(0,0,0,0.35)');
    this.drawFlagShape(c, fl.x, fl.y, TEAM[fl.team]);
    if (!fl.atHome) {
      c.fillStyle = '#fff'; c.font = `bold 11px ${FONT}`; c.textAlign = 'center';
      c.fillText(Math.ceil(fl.dropT) + 's', fl.x, fl.y + 26);
    }
  };

  // Normal particles first, then every additive (glow) particle in one pass.
  P.drawParticles = function (c) {
    const vx0 = this.cam.x - 40, vy0 = this.cam.y - 40, vx1 = this.cam.x + this.vw + 40, vy1 = this.cam.y + this.vh + 40;
    let glow = false;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) { if (!glow) break; c.globalCompositeOperation = 'lighter'; }
      for (const p of this.parts) {
        if (!!p.glow !== (pass === 1)) { if (p.glow) glow = true; continue; }
        if (p.x < vx0 || p.y < vy0 || p.x > vx1 || p.y > vy1) continue;
        const k = clamp(p.life / p.max, 0, 1);
        if (p.ring) {
          const r = p.r0 + (p.r1 - p.r0) * (1 - k);
          c.globalAlpha = k;
          c.strokeStyle = p.color; c.lineWidth = p.lw || 2.5;
          c.beginPath(); c.arc(p.x, p.y, Math.max(0.1, r), 0, TAU); c.stroke();
          continue;
        }
        if (p.smoke) { c.globalAlpha = k * 0.8; A.circ(c, p.x, p.y, p.size * (1.6 - k * 0.6), p.color); }
        else { c.globalAlpha = Math.min(1, k * 1.5); A.circ(c, p.x, p.y, Math.max(0.3, p.size * (0.4 + k * 0.6)), p.color); }
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  };

  P.drawTexts = function (c) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = k > 0.8 ? 1 + (k - 0.8) * 2 : 1;
      c.globalAlpha = Math.min(1, k * 2);
      c.font = `900 ${Math.round(t.size * pop)}px ${FONT}`;
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.strokeText(t.txt, t.x, t.y);
      c.fillStyle = t.color; c.fillText(t.txt, t.x, t.y);
    }
    c.globalAlpha = 1;
  };

  // Arrows at the screen edge pointing to off-screen objectives.
  P.drawIndicators = function (c) {
    const marks = [];
    if (this.rival && this.rival.alive) marks.push({ x: this.rival.x, y: this.rival.y, col: TEAM[1] });
    if (this.flags) for (const fl of this.flags) if (!fl.carrier || !fl.carrier.isPlayer) marks.push({ x: fl.x, y: fl.y, col: TEAM[fl.team], flag: true });
    if (this.mode === 'horde' && this.remainingFoes() <= 4) for (const f of this.fighters) if (f.alive && f.team === 1) marks.push({ x: f.x, y: f.y, col: '#c46be0' });
    const m = 34;
    for (const k of marks) {
      const s = this.toScreen(k.x, k.y);
      if (s.x > 0 && s.y > 0 && s.x < this.sw && s.y < this.sh) continue;
      const cx = this.sw / 2, cy = this.sh / 2, a = Math.atan2(s.y - cy, s.x - cx);
      const x = clamp(s.x, m, this.sw - m), y = clamp(s.y, m + 70, this.sh - m - 70);
      c.save(); c.translate(x, y); c.rotate(a);
      A.poly(c, [12, 0, -6, -9, -2, 0, -6, 9], k.col, 'rgba(0,0,0,0.6)', 2);
      c.restore();
      if (k.flag) { c.font = `14px ${FONT}`; c.textAlign = 'center'; c.fillText('🚩', x - Math.cos(a) * 20, y - Math.sin(a) * 20 + 5); }
    }
  };

  P.drawHUD = function (c) {
    const sw = this.sw, sh = this.sh, p = this.player, t = this.t;
    const compact = sw < 720;
    c.textBaseline = 'middle';

    // Player card
    this.drawFighterCard(c, p, 14, 14, false, compact);
    // Rival card / horde status
    if (this.mode === 'horde') {
      const w = compact ? 150 : 200;
      panel(c, sw - w - 14, 14, w, 64);
      c.textAlign = 'left'; c.fillStyle = '#ff9a3b'; c.font = `16px ${DISPLAY}`;
      c.fillText(`WAVE ${Math.max(1, this.wave)}/3`, sw - w, 36);
      c.fillStyle = '#ddd'; c.font = `600 13px ${FONT}`;
      c.fillText(`Foes left: ${this.remainingFoes()}`, sw - w, 60);
    } else if (this.rival) {
      this.drawFighterCard(c, this.rival, sw - 14, 14, true, compact);
    }

    // Objective (top center)
    if (!compact || this.mode !== 'survival') {
      const cx = sw / 2;
      if (this.mode === 'ctf' || this.mode === 'destruction') {
        const w = 190;
        panel(c, cx - w / 2, 14, w, 56);
        c.textAlign = 'center';
        c.font = `26px ${DISPLAY}`;
        c.fillStyle = TEAM[0]; c.fillText(this.score[0], cx - 58, 42);
        c.fillStyle = TEAM[1]; c.fillText(this.score[1], cx + 58, 42);
        const tl = Math.ceil(this.timeLeft);
        c.fillStyle = tl <= 10 && Math.sin(t * 10) > 0 ? '#ff4f4f' : '#fff';
        c.font = `700 18px ${FONT}`;
        c.fillText(`${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`, cx, 36);
        c.fillStyle = '#9a95b0'; c.font = `600 10px ${FONT}`;
        c.fillText(this.mode === 'ctf' ? 'FIRST TO 3' : 'DESTROY!', cx, 56);
      } else if (!compact) {
        c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.6)'; c.font = `14px ${DISPLAY}`;
        c.fillText(MOM.MODES[this.mode].name.toUpperCase(), cx, 34);
      }
    }

    this.drawWeaponBar(c);
    this.drawMinimap(c);

    // Earnings
    c.textAlign = 'left';
    panel(c, 14, sh - 58, compact ? 110 : 150, 44);
    c.fillStyle = '#7dff7a'; c.font = `18px ${DISPLAY}`;
    c.fillText(`$${this.earned}`, 26, sh - 36);
    if (!compact) {
      c.fillStyle = '#9a95b0'; c.font = `600 11px ${FONT}`; c.textAlign = 'right';
      c.fillText(`KO ${this.kills}`, 152, sh - 36);
    }

    // Controls hint
    if (this.t < 9 && this.state !== 'over' && !compact) {
      c.globalAlpha = clamp(9 - this.t, 0, 1);
      c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.75)'; c.font = `600 12px ${FONT}`;
      const hy = this.mode === 'ctf' || this.mode === 'destruction' ? 92 : 62;
      c.fillText('WASD move  •  Mouse aim  •  Click / J fire  •  Space / Right-click bite', sw / 2, hy);
      c.fillText('Shift dash  •  Q / E / 1-3 switch weapon  •  Esc pause', sw / 2, hy + 18);
      c.globalAlpha = 1;
    }

    // Countdown
    if (this.state === 'intro') {
      const n = Math.ceil(this.introT - 0.5);
      const frac = (this.introT - 0.5) % 1;
      c.textAlign = 'center';
      c.font = `${Math.round(90 + frac * 50)}px ${DISPLAY}`;
      c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,0.6)';
      if (n > 0) { c.strokeText(n, sw / 2, sh / 2); c.fillStyle = '#ffd23f'; c.fillText(n, sw / 2, sh / 2); }
      c.font = `22px ${DISPLAY}`; c.fillStyle = '#fff';
      const vs = this.mode === 'horde' ? 'VS THE HORDE' : `VS ${this.rival.name.toUpperCase()}`;
      c.strokeText(vs, sw / 2, sh / 2 - 90); c.fillText(vs, sw / 2, sh / 2 - 90);
      c.font = `600 14px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText(`${MOM.MODES[this.mode].name}  •  ${this.world.theme.name}  •  ${this.diff.name}`, sw / 2, sh / 2 + 80);
    }

    // Big announcement
    const an = this.announce;
    if (an && this.state !== 'intro') {
      const k = an.t < 0.2 ? an.t / 0.2 : an.t > an.dur - 0.4 ? (an.dur - an.t) / 0.4 : 1;
      const sc = an.t < 0.2 ? 1.6 - an.t * 3 : 1;
      c.globalAlpha = clamp(k, 0, 1);
      c.textAlign = 'center';
      c.save(); c.translate(sw / 2, sh * 0.3); c.scale(sc, sc);
      c.font = `${compact ? 30 : 46}px ${DISPLAY}`;
      c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,0.65)'; c.strokeText(an.text, 0, 0);
      c.fillStyle = an.color; c.fillText(an.text, 0, 0);
      if (an.sub) {
        c.font = `600 ${compact ? 13 : 16}px ${FONT}`;
        c.lineWidth = 4; c.strokeText(an.sub, 0, 40);
        c.fillStyle = '#fff'; c.fillText(an.sub, 0, 40);
      }
      c.restore();
      c.globalAlpha = 1;
    }

    // Dead overlay
    if (!p.alive && p.respawnT > 0) {
      c.fillStyle = 'rgba(80,0,10,0.25)'; c.fillRect(0, 0, sw, sh);
    }

    // Reticle
    const I = MOM.Input;
    if (I.mouse.active && performance.now() - I.mouse.lastMove < 3000 && this.state !== 'over') {
      const { x, y } = I.mouse;
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 10, 0, TAU); c.stroke();
      A.line(c, [x - 16, y, x - 6, y], 'rgba(255,255,255,0.85)', 2);
      A.line(c, [x + 6, y, x + 16, y], 'rgba(255,255,255,0.85)', 2);
      A.line(c, [x, y - 16, x, y - 6], 'rgba(255,255,255,0.85)', 2);
      A.line(c, [x, y + 6, x, y + 16], 'rgba(255,255,255,0.85)', 2);
    }
  };

  P.drawFighterCard = function (c, f, x, y, right, compact) {
    const w = compact ? 170 : 270, h = 64;
    const x0 = right ? x - w : x;
    panel(c, x0, y, w, h);
    const px = right ? x0 + w - 34 : x0 + 34;
    A.circ(c, px, y + 32, 24, 'rgba(255,255,255,0.06)', TEAM[f.team], 2);
    c.drawImage(this.cardPortrait(f), px - 23, y + 9, 46, 46);
    const tx = right ? x0 + 12 : x0 + 68, bw = w - 82;
    c.textAlign = 'left';
    c.fillStyle = '#fff'; c.font = `700 14px ${FONT}`;
    const name = f.name.length > 16 ? f.name.slice(0, 15) + '…' : f.name;
    c.fillText(name, tx, y + 18);
    c.fillStyle = '#ffd23f'; c.font = `700 11px ${FONT}`;
    const nw = c.measureText ? (c.font = `700 14px ${FONT}`, c.measureText(name).width) : 80;
    c.font = `700 11px ${FONT}`;
    if (!compact) c.fillText(`LV ${f.level}`, tx + nw + 8, y + 19);
    const pct = clamp(f.hp / f.maxHp, 0, 1), lag = clamp(f.hpLag / f.maxHp, 0, 1);
    rr(c, tx, y + 30, bw, 14, 7); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
    if (lag > 0) { rr(c, tx, y + 30, Math.max(14, bw * lag), 14, 7); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill(); }
    if (pct > 0) {
      rr(c, tx, y + 30, Math.max(14, bw * pct), 14, 7);
      const g = c.createLinearGradient(tx, 0, tx + bw, 0);
      g.addColorStop(0, hpColor(pct)); g.addColorStop(1, pct > 0.5 ? '#a8ff6b' : hpColor(pct));
      c.fillStyle = g; c.fill();
    }
    c.fillStyle = '#fff'; c.font = `700 10px ${FONT}`; c.textAlign = 'center';
    c.fillText(`${Math.ceil(f.hp)} / ${f.maxHp}`, tx + bw / 2, y + 37.5);
    // Status pills
    c.textAlign = 'left'; c.font = `700 10px ${FONT}`;
    let sx = tx;
    const pill = (txt, col) => { c.fillStyle = col; c.fillText(txt, sx, y + 55); sx += c.measureText(txt).width + 10; };
    if (!f.alive && f.respawnT > 0) pill(`RESPAWN ${Math.ceil(f.respawnT)}`, '#ff6b6b');
    if (f.slowT > 0) pill('FROZEN', '#7fe8ff');
    if (f.poisonT > 0) pill('POISONED', '#9cff4f');
    if (f.carrying) pill('HAS FLAG', '#ffd23f');
    if (f.isPlayer && f.alive && !compact) {
      pill(f.dashCd > 0 ? `DASH ${f.dashCd.toFixed(1)}` : 'DASH READY', f.dashCd > 0 ? '#777' : '#c79bff');
    }
  };

  // The card portrait is a small cached image refreshed at ~10fps (or when the
  // hit flash toggles) instead of a clipped vector redraw every frame.
  P.cardPortrait = function (f) {
    const flash = f.flash > 0;
    let pc = f.portrait;
    if (pc && pc.flash === flash && this.t - pc.t < 0.1 && pc.dpr === this.dpr) return pc.cv;
    if (!pc) pc = f.portrait = { cv: document.createElement('canvas') };
    const px = Math.ceil(46 * this.dpr);
    if (pc.cv.width !== px) { pc.cv.width = px; pc.cv.height = px; }
    const c = pc.cv.getContext('2d'), k = px / 46;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, px, px);
    c.setTransform(k, 0, 0, k, 0, 0);
    A.drawMonster(c, f.type, 23, 25, -Math.PI / 2, 16, this.t, { noShadow: true, colors: f.colors, flash });
    c.globalCompositeOperation = 'destination-in';
    A.circ(c, 23, 23, 23, '#000');
    c.globalCompositeOperation = 'source-over';
    Object.assign(pc, { flash, t: this.t, dpr: this.dpr });
    return pc.cv;
  };

  P.drawWeaponBar = function (c) {
    const p = this.player, sw = this.sw, sh = this.sh;
    const compact = sw < 720;
    const cw = compact ? 92 : 132, ch = 52, gap = 8;
    const slots = [{ melee: true }, ...p.weapons.map((w, i) => ({ w, i }))];
    const total = slots.length * cw + (slots.length - 1) * gap;
    let x = sw / 2 - total / 2;
    const y = sh - ch - 16;
    for (const s of slots) {
      const sel = !s.melee && s.i === p.sel;
      rr(c, x, y, cw, ch, 10);
      c.fillStyle = sel ? 'rgba(255,210,63,0.16)' : 'rgba(14,11,24,0.72)'; c.fill();
      c.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,0.12)'; c.lineWidth = sel ? 2 : 1; c.stroke();
      c.textAlign = 'left';
      if (s.melee) {
        const cd = clamp(p.meleeCd / (p.type === 'mantis' ? 0.26 : 0.5), 0, 1);
        c.fillStyle = '#fff'; c.font = `700 13px ${FONT}`;
        c.fillText(p.type === 'mantis' ? 'SLASH' : p.type === 'cat' ? 'SWIPE' : p.type === 'golem' || p.type === 'cyclops' ? 'POUND' : 'BITE', x + 10, y + 18);
        c.fillStyle = '#9a95b0'; c.font = `600 10px ${FONT}`;
        c.fillText(`STR ${p.str}  •  SPACE`, x + 10, y + 36);
        if (cd > 0) { c.fillStyle = 'rgba(255,255,255,0.15)'; rr(c, x, y + ch - 4, cw * cd, 4, 2); c.fill(); }
      } else {
        const D = MOM.WEAPONS[s.w.id];
        c.fillStyle = D.color; c.fillRect(x + 8, y + 10, 4, ch - 20);
        c.fillStyle = '#fff'; c.font = `700 ${compact ? 11 : 13}px ${FONT}`;
        const nm = compact ? D.name.split(' ').pop() : D.name;
        c.fillText(nm, x + 18, y + 18);
        const ammo = s.w.ammo === Infinity || D.builtin ? '∞' : s.w.ammo;
        c.fillStyle = s.w.ammo <= 0 ? '#ff4f4f' : '#ddd'; c.font = `700 16px ${FONT}`;
        c.fillText(ammo, x + 18, y + 37);
        c.fillStyle = '#6a6580'; c.font = `700 10px ${FONT}`; c.textAlign = 'right';
        c.fillText(String(s.i + 1), x + cw - 8, y + 14);
        const cd = clamp(s.w.cd / D.cd, 0, 1);
        if (cd > 0) { c.fillStyle = 'rgba(255,255,255,0.2)'; rr(c, x, y + ch - 4, cw * cd, 4, 2); c.fill(); }
      }
      x += cw + gap;
    }
  };

  P.drawMinimap = function (c) {
    const W = this.world, sw = this.sw, sh = this.sh;
    if (sw < 720) return;
    const mw = 190, k = mw / W.pw, mh = W.ph * k;
    const x0 = sw - mw - 16, y0 = sh - mh - 16;
    if (this.miniDirty || !this.miniCv) {
      this.miniDirty = false;
      const cv = this.miniCv || (this.miniCv = document.createElement('canvas'));
      cv.width = W.W * 4; cv.height = W.H * 4;
      const m = cv.getContext('2d');
      const G = MOM.G;
      for (let ty = 0; ty < W.H; ty++) for (let tx = 0; tx < W.W; tx++) {
        const i = W.idx(tx, ty), g = W.ground[i], o = W.obs[i];
        m.fillStyle = o ? (o.kind === 'wall' ? '#15131b' : o.kind === 'tree' || o.kind === 'cactus' ? '#2d6b2a' : o.kind === 'building' ? '#c9b89a' : '#77736e')
          : g === G.WATER ? '#2f7fbf' : g === G.LAVA ? '#ff6a1f' : g === G.ROAD ? '#3a3d42' : W.theme.ground[0];
        m.fillRect(tx * 4, ty * 4, 4, 4);
      }
    }
    panel(c, x0 - 4, y0 - 4, mw + 8, mh + 8, 8);
    c.globalAlpha = 0.9;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.miniCv, x0, y0, mw, mh);
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    c.strokeRect(x0 + this.cam.x * k, y0 + this.cam.y * k, this.vw * k, this.vh * k);
    for (const p of this.pickups) A.circ(c, x0 + p.x * k, y0 + p.y * k, 2, p.kind === 'health' ? '#ff4f5e' : p.kind === 'cash' ? '#ffd23f' : '#7fe8ff');
    if (this.flags) for (const fl of this.flags) {
      c.fillStyle = TEAM[fl.team]; c.fillRect(x0 + fl.x * k - 2, y0 + fl.y * k - 6, 5, 4);
      c.fillStyle = '#fff'; c.fillRect(x0 + fl.x * k - 2, y0 + fl.y * k - 6, 1, 8);
    }
    for (const f of this.fighters) {
      if (!f.alive) continue;
      A.circ(c, x0 + f.x * k, y0 + f.y * k, f.minion ? 2 : 3.5, f.isPlayer ? '#ffffff' : f.kind === 'pup' ? TEAM[f.team] : f.minion ? '#c46be0' : TEAM[1], f.isPlayer ? TEAM[0] : null, 1.5);
    }
  };
})();
