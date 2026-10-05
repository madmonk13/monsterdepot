// Arena generation, terrain, destructible obstacles and pathfinding.
MOM.G = { GROUND: 0, WATER: 1, LAVA: 2, ROAD: 3 };

MOM.OBS = {
  tree:     { hp: 28,  pts: 1, cash: 0 },
  cactus:   { hp: 20,  pts: 1, cash: 0 },
  rock:     { hp: 90,  pts: 2, cash: 0 },
  building: { hp: 110, pts: 5, cash: 25 },
  wall:     { hp: Infinity, pts: 0, cash: 0 },
};

MOM.World = class {
  constructor(themeId, mode, snap) {
    this.T = 48; this.W = 34; this.H = 24;
    this.theme = MOM.THEMES[themeId];
    this.themeId = themeId;
    this.mode = mode;
    this.pw = this.W * this.T; this.ph = this.H * this.T;
    this.destroyed = [];
    if (snap) this.restore(snap);
    else {
      for (let tries = 0; tries < 30; tries++) {
        this.generate();
        if (this.connected()) break;
      }
    }
    this.prerender();
    for (const [tx, ty, kind] of this.destroyed) this.rubble(tx, ty, kind);
    this.dirty = new Set();     // obstacle tiles needing a terrain-cache redraw
    this.dirtyRects = [];       // world-space rects (decals) needing a redraw
    this.shaking = new Set();   // obstacles currently drawn live, not from cache
    this.terrain = null;
    this.scale = 0;
  }

  // Compact, JSON-safe copy of the terrain for save/restore.
  snapshot() {
    return {
      ground: this.ground,
      variant: this.variant.map((v) => Math.round(v * 1000) / 1000),
      obs: this.obs.map((o) => (!o ? 0 : o.kind === 'wall' ? 'w' : [o.kind, Math.round(o.hp), Math.round(o.v * 1000) / 1000])),
      spawnA: this.spawnA, spawnB: this.spawnB,
      destroyed: this.destroyed,
    };
  }

  restore(s) {
    this.ground = s.ground.slice();
    this.variant = s.variant.slice();
    this.spawnA = s.spawnA; this.spawnB = s.spawnB;
    this.destroyed = s.destroyed.slice();
    this.obs = s.obs.map((o) => {
      if (!o) return null;
      if (o === 'w') return { kind: 'wall', hp: Infinity, max: Infinity, shake: 0, v: 0 };
      return { kind: o[0], hp: o[1], max: MOM.OBS[o[0]].hp, shake: 0, v: o[2] };
    });
  }

  idx(tx, ty) { return ty * this.W + tx; }
  inb(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H; }
  ob(tx, ty) { return this.inb(tx, ty) ? this.obs[this.idx(tx, ty)] : { kind: 'wall' }; }
  gr(tx, ty) { return this.inb(tx, ty) ? this.ground[this.idx(tx, ty)] : 0; }
  solid(tx, ty) { return !!this.ob(tx, ty); }
  groundAtPx(x, y) { return this.gr(Math.floor(x / this.T), Math.floor(y / this.T)); }
  solidAtPx(x, y) { return this.solid(Math.floor(x / this.T), Math.floor(y / this.T)); }
  center(tx, ty) { return { x: (tx + 0.5) * this.T, y: (ty + 0.5) * this.T }; }

  generate() {
    const { W, H, theme } = this, G = MOM.G;
    const R = Math.random;
    this.ground = new Array(W * H).fill(G.GROUND);
    this.obs = new Array(W * H).fill(null);
    this.variant = new Array(W * H).fill(0).map(() => R());
    this.spawnA = { tx: 3, ty: Math.floor(H / 2) };
    this.spawnB = { tx: W - 4, ty: Math.floor(H / 2) };

    if (theme.roads) {
      for (let y = 4; y < H - 2; y += 7) for (let x = 1; x < W - 1; x++) this.ground[this.idx(x, y)] = G.ROAD;
      for (let x = 6; x < W - 2; x += 9) for (let y = 1; y < H - 1; y++) this.ground[this.idx(x, y)] = G.ROAD;
    }
    const pool = (type) => {
      const cx = 4 + Math.floor(R() * (W - 8)), cy = 3 + Math.floor(R() * (H - 6));
      const rad = 1.6 + R() * 2.2;
      const ph = R() * 10;
      for (let y = Math.floor(cy - rad - 2); y <= cy + rad + 2; y++) {
        for (let x = Math.floor(cx - rad - 2); x <= cx + rad + 2; x++) {
          if (!this.inb(x, y)) continue;
          const a = Math.atan2(y - cy, x - cx);
          const rr = rad * (1 + 0.3 * Math.sin(a * 3 + ph));
          if (Math.hypot(x - cx, y - cy) <= rr) this.ground[this.idx(x, y)] = type;
        }
      }
    };
    for (let i = 0; i < theme.water; i++) pool(G.WATER);
    for (let i = 0; i < theme.lava; i++) pool(G.LAVA);

    const dens = theme.obstacles;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const g = this.ground[this.idx(x, y)];
        if (g !== G.GROUND) continue;
        const r = R();
        let acc = 0, kind = null;
        for (const k in dens) { acc += dens[k]; if (r < acc) { kind = k; break; } }
        if (kind === 'tree' && theme.cactus && R() < 0.6) kind = 'cactus';
        if (kind) this.place(x, y, kind);
      }
    }
    // Grow small groves / city blocks around existing obstacles.
    const grow = this.theme.roads ? 'building' : (theme.obstacles.tree > 0.05 ? 'tree' : 'rock');
    for (let n = 0; n < 2; n++) {
      const snapshot = this.obs.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (snapshot[this.idx(x, y)] || this.ground[this.idx(x, y)] !== G.GROUND) continue;
        let nb = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = snapshot[this.idx(x + dx, y + dy)];
          if (o && o.kind === grow) nb++;
        }
        if (nb && R() < 0.12 * nb) this.place(x, y, grow);
      }
    }
    for (let x = 0; x < W; x++) { this.place(x, 0, 'wall'); this.place(x, H - 1, 'wall'); }
    for (let y = 0; y < H; y++) { this.place(0, y, 'wall'); this.place(W - 1, y, 'wall'); }

    // Clear spawn zones.
    for (const s of [this.spawnA, this.spawnB]) {
      for (let y = s.ty - 2; y <= s.ty + 2; y++) for (let x = s.tx - 2; x <= s.tx + 2; x++) {
        if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) continue;
        this.obs[this.idx(x, y)] = null;
        if (this.ground[this.idx(x, y)] !== G.ROAD) this.ground[this.idx(x, y)] = G.GROUND;
      }
    }
  }

  place(x, y, kind) {
    const d = MOM.OBS[kind];
    this.obs[this.idx(x, y)] = { kind, hp: d.hp, max: d.hp, shake: 0, v: Math.random() };
  }

  connected() {
    const dist = this.bfs(this.spawnA.tx, this.spawnA.ty, true);
    if (dist[this.idx(this.spawnB.tx, this.spawnB.ty)] < 0) return false;
    // Require most of the open floor to be reachable.
    let open = 0, reach = 0;
    for (let i = 0; i < this.obs.length; i++) if (!this.obs[i]) { open++; if (dist[i] >= 0) reach++; }
    return reach / open > 0.9;
  }

  // Breadth-first distance field from a tile. Lava is avoided unless allowLava.
  bfs(sx, sy, allowLava) {
    const { W, H } = this, N = W * H;
    const dist = new Int16Array(N).fill(-1);
    if (!this.inb(sx, sy)) return dist;
    const q = new Int16Array(N);
    let h = 0, t = 0;
    const s = this.idx(sx, sy);
    dist[s] = 0; q[t++] = s;
    while (h < t) {
      const c = q[h++], cx = c % W, cy = (c / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (!this.inb(nx, ny)) continue;
        const n = this.idx(nx, ny);
        if (dist[n] >= 0 || this.obs[n]) continue;
        if (!allowLava && this.ground[n] === MOM.G.LAVA) continue;
        dist[n] = dist[c] + 1;
        q[t++] = n;
      }
    }
    return dist;
  }

  // Line of sight between two points (obstacles block).
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d / 12);
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      if (this.solidAtPx(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return false;
    }
    return true;
  }

  randomOpenTile(reach, avoid) {
    for (let i = 0; i < 200; i++) {
      const tx = 1 + Math.floor(Math.random() * (this.W - 2)), ty = 1 + Math.floor(Math.random() * (this.H - 2));
      const n = this.idx(tx, ty);
      if (this.obs[n] || this.ground[n] === MOM.G.LAVA || this.ground[n] === MOM.G.WATER) continue;
      if (reach && reach[n] < 0) continue;
      if (avoid && avoid(tx, ty)) continue;
      return { tx, ty };
    }
    return { ...this.spawnA };
  }

  // Returns the obstacle if destroyed.
  damage(tx, ty, dmg) {
    const o = this.ob(tx, ty);
    if (!o || o.kind === 'wall') return null;
    o.hp -= dmg;
    o.shake = 0.18;
    const i = this.idx(tx, ty);
    // While shaking, the obstacle is drawn live rather than from the cache.
    if (!this.shaking.has(i)) { this.shaking.add(i); this.dirty.add(i); }
    if (o.hp <= 0) {
      this.obs[i] = null;
      this.dirty.add(i);
      this.destroyed.push([tx, ty, o.kind]);
      this.rubble(tx, ty, o.kind);
      return o;
    }
    return null;
  }

  // ---------- Rendering ----------
  prerender() {
    const cv = document.createElement('canvas');
    cv.width = this.pw; cv.height = this.ph;
    this.groundCv = cv;
    const c = cv.getContext('2d');
    const { T, W, H, theme } = this, G = MOM.G;
    const gc = theme.ground;
    c.fillStyle = gc[0];
    c.fillRect(0, 0, this.pw, this.ph);
    // Soft organic patches of the alternate ground tones.
    for (let i = 0; i < W * H * 0.6; i++) {
      const x = Math.random() * this.pw, y = Math.random() * this.ph, r = T * (0.6 + Math.random() * 1.6);
      c.globalAlpha = 0.35;
      c.fillStyle = gc[1 + (i % 2)];
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    // Organic speckle texture.
    for (let i = 0; i < W * H * 6; i++) {
      const x = Math.random() * this.pw, y = Math.random() * this.ph;
      c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
      c.beginPath(); c.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2); c.fill();
    }
    if (this.themeId === 'jungle') {
      for (let i = 0; i < W * H * 2; i++) {
        const x = Math.random() * this.pw, y = Math.random() * this.ph;
        c.strokeStyle = 'rgba(140,200,90,0.35)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 4, y - 5); c.stroke();
      }
    }
    // Roads
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.ground[this.idx(x, y)] !== G.ROAD) continue;
      c.fillStyle = '#3a3d42'; c.fillRect(x * T, y * T, T, T);
      const horiz = this.gr(x - 1, y) === G.ROAD || this.gr(x + 1, y) === G.ROAD;
      const vert = this.gr(x, y - 1) === G.ROAD || this.gr(x, y + 1) === G.ROAD;
      c.fillStyle = '#e8c840';
      if (horiz && !vert) { c.fillRect(x * T + 6, y * T + T / 2 - 2, T - 12, 4); }
      else if (vert && !horiz) { c.fillRect(x * T + T / 2 - 2, y * T + 6, 4, T - 12); }
    }
    // Liquids drawn as soft blobs for organic edges.
    const liquid = (type, edge, body, deep) => {
      for (const [col, rad] of [[edge, 0.78], [body, 0.62], [deep, 0.4]]) {
        c.fillStyle = col;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (this.ground[this.idx(x, y)] !== type) continue;
          const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
          c.beginPath(); c.arc(cx, cy, T * rad, 0, Math.PI * 2); c.fill();
          // Fill toward same-type neighbours so pools are solid.
          for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
            if (this.gr(x + dx, y + dy) === type) {
              c.beginPath(); c.arc(cx + dx * T / 2, cy + dy * T / 2, T * rad, 0, Math.PI * 2); c.fill();
            }
          }
        }
      }
    };
    liquid(G.WATER, this.themeId === 'desert' ? '#a88a55' : '#3d6b4a', '#2f7fbf', '#245f99');
    liquid(G.LAVA, '#2a1a14', '#d9541c', '#f59a2e');
  }

  rubble(tx, ty, kind) {
    const c = this.groundCv.getContext('2d'), T = this.T;
    const x = tx * T, y = ty * T;
    const col = kind === 'tree' || kind === 'cactus' ? ['#4a3520', '#5e4429', '#2e5a1f'] : ['#6b6560', '#57524d', '#8a847d'];
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath(); c.arc(x + T / 2, y + T / 2, T * 0.45, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 14; i++) {
      c.fillStyle = col[i % 3];
      const px = x + 6 + Math.random() * (T - 12), py = y + 6 + Math.random() * (T - 12), s = 2 + Math.random() * 6;
      c.save(); c.translate(px, py); c.rotate(Math.random() * 3);
      c.fillRect(-s / 2, -s / 2, s, s * 0.7);
      c.restore();
    }
  }

  decal(x, y, r, color) {
    const c = this.groundCv.getContext('2d');
    c.fillStyle = color;
    c.beginPath();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, rr = r * (0.7 + Math.random() * 0.5);
      i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.fill();
    this.dirtyRects.push([x - r * 1.3, y - r * 1.3, x + r * 1.3, y + r * 1.3]);
  }

  drawLiquids(c, cam, vw, vh, t) {
    const { T } = this, G = MOM.G;
    const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(this.W - 1, Math.ceil((cam.x + vw) / T));
    const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(this.H - 1, Math.ceil((cam.y + vh) / T));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const g = this.ground[this.idx(x, y)];
      if (g !== G.WATER && g !== G.LAVA) continue;
      const v = this.variant[this.idx(x, y)];
      const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
      if (g === G.WATER) {
        const ph = t * 1.6 + v * 6;
        c.strokeStyle = `rgba(200,235,255,${0.18 + 0.12 * Math.sin(ph)})`;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cx + Math.sin(ph) * 6, cy + Math.cos(ph * 0.7) * 6, 7 + v * 6, 0.2, 1.6);
        c.stroke();
      } else {
        const ph = t * 2 + v * 6;
        c.fillStyle = `rgba(255,230,120,${0.25 + 0.2 * Math.sin(ph)})`;
        c.beginPath(); c.arc(cx + Math.sin(ph * 0.5) * 8, cy + Math.cos(ph * 0.4) * 8, 4 + 4 * Math.abs(Math.sin(ph)), 0, Math.PI * 2); c.fill();
      }
    }
  }

  // ---------- Terrain cache ----------
  // Ground (with decals and rubble) plus every obstacle, pre-rendered once at
  // the exact on-screen scale. Each frame is then a single unscaled,
  // pixel-aligned copy, which stays fast even when the browser rasterizes the
  // canvas on the CPU (as Firefox does). Changed areas are redrawn locally.
  setScale(s) {
    if (this.terrain && Math.abs(s - this.scale) < 1e-6) return;
    this.scale = s;
    const cv = this.terrain || document.createElement('canvas');
    cv.width = Math.ceil(this.pw * s); cv.height = Math.ceil(this.ph * s);
    this.terrain = cv;
    this.tctx = cv.getContext('2d', { alpha: false });
    this.refreshRect(0, 0, this.pw, this.ph);
  }

  // Redraw a world-space rect of the cache: ground first, then any obstacles
  // that could overlap it (art spills up to about half a tile).
  refreshRect(wx0, wy0, wx1, wy1) {
    const s = this.scale, c = this.tctx, T = this.T;
    const x0 = Math.max(0, Math.floor(wx0 * s)), y0 = Math.max(0, Math.floor(wy0 * s));
    const x1 = Math.min(this.terrain.width, Math.ceil(wx1 * s)), y1 = Math.min(this.terrain.height, Math.ceil(wy1 * s));
    if (x1 <= x0 || y1 <= y0) return;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    c.drawImage(this.groundCv, x0 / s, y0 / s, (x1 - x0) / s, (y1 - y0) / s, x0, y0, x1 - x0, y1 - y0);
    c.setTransform(s, 0, 0, s, 0, 0);
    const tx0 = Math.floor(x0 / s / T) - 1, tx1 = Math.floor(x1 / s / T) + 1;
    const ty0 = Math.floor(y0 / s / T) - 1, ty1 = Math.floor(y1 / s / T) + 1;
    for (let y = Math.max(0, ty0); y <= Math.min(this.H - 1, ty1); y++) {
      for (let x = Math.max(0, tx0); x <= Math.min(this.W - 1, tx1); x++) {
        const j = this.idx(x, y), o = this.obs[j];
        if (o && !this.shaking.has(j)) this.drawOb(c, o, x * T, y * T, x, y);
      }
    }
    c.restore();
  }

  // Apply pending changes (damage, destruction, decals) to the cache.
  flush(dt) {
    for (const i of this.shaking) {
      const o = this.obs[i];
      if (o) o.shake -= dt;
      if (!o || o.shake <= 0) { this.shaking.delete(i); this.dirty.add(i); }
    }
    const T = this.T;
    for (const i of this.dirty) {
      const tx = i % this.W, ty = (i / this.W) | 0;
      this.refreshRect((tx - 1) * T, (ty - 1) * T, (tx + 2) * T, (ty + 2) * T);
    }
    this.dirty.clear();
    for (const r of this.dirtyRects) this.refreshRect(r[0], r[1], r[2], r[3]);
    this.dirtyRects.length = 0;
  }

  // True when the cache fully covers a screen-sized area at this offset.
  covers(ox, oy, w, h) {
    return ox >= 0 && oy >= 0 && ox + w <= this.terrain.width && oy + h <= this.terrain.height;
  }

  // Copy the cache to the screen. Caller sets an identity transform; ox/oy are
  // whole device pixels so no resampling happens.
  drawTerrain(c, ox, oy, w, h) {
    const sx = Math.max(0, ox), sy = Math.max(0, oy), dx = sx - ox, dy = sy - oy;
    const sw = Math.min(this.terrain.width - sx, w - dx), sh = Math.min(this.terrain.height - sy, h - dy);
    if (sw > 0 && sh > 0) c.drawImage(this.terrain, sx, sy, sw, sh, dx, dy, sw, sh);
  }

  // Obstacles that were just hit wobble, so they're drawn live on top.
  drawShaking(c) {
    const T = this.T;
    for (const i of this.shaking) {
      const o = this.obs[i], tx = i % this.W, ty = (i / this.W) | 0;
      this.drawOb(c, o, tx * T + (Math.random() - 0.5) * 5, ty * T + (Math.random() - 0.5) * 5, tx, ty);
    }
  }

  drawOb(c, o, x, y, tx, ty) {
    const T = this.T, A = MOM.Art, dmg = 1 - o.hp / o.max;
    const cx = x + T / 2, cy = y + T / 2;
    switch (o.kind) {
      case 'wall': {
        c.fillStyle = '#1d1b22'; c.fillRect(x, y, T, T);
        c.fillStyle = '#2b2833'; c.fillRect(x + 3, y + 3, T - 6, T - 6);
        c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 3, y + 3, T - 6, 6);
        break;
      }
      case 'tree': {
        A.circ(c, cx + 5, cy + 7, T * 0.42, 'rgba(0,0,0,0.3)');
        const g = o.v < 0.5 ? ['#2d6b2a', '#3f8a35', '#5aad47'] : ['#245e33', '#337a42', '#4c9e58'];
        A.circ(c, cx - 7, cy + 3, T * 0.3, g[0]);
        A.circ(c, cx + 7, cy + 2, T * 0.3, g[0]);
        A.circ(c, cx, cy - 6, T * 0.32, g[1]);
        A.circ(c, cx - 3, cy - 9, T * 0.17, g[2]);
        A.circ(c, cx + 8, cy - 2, T * 0.1, g[2]);
        break;
      }
      case 'cactus': {
        A.circ(c, cx + 4, cy + 6, T * 0.25, 'rgba(0,0,0,0.25)');
        A.line(c, [cx - 12, cy - 2, cx - 12, cy - 10], '#2e6b34', 7);
        A.line(c, [cx + 11, cy + 4, cx + 11, cy - 6], '#2e6b34', 7);
        A.line(c, [cx - 12, cy - 2, cx + 11, cy + 4], '#2e6b34', 7);
        A.circ(c, cx, cy, T * 0.22, '#3f8a45', '#1f4a24');
        A.circ(c, cx - 3, cy - 3, 3, '#ff7aa8');
        break;
      }
      case 'rock': {
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.beginPath(); c.ellipse(cx + 4, cy + 6, T * 0.44, T * 0.36, 0, 0, Math.PI * 2); c.fill();
        const s = T * 0.44, v = o.v;
        const base = this.themeId === 'volcano' ? ['#4a3f3b', '#5d514c', '#2a2321'] : this.themeId === 'desert' ? ['#a07a50', '#b8936a', '#6e5236'] : ['#7c7a78', '#94918e', '#4e4c4a'];
        A.poly(c, [cx - s, cy + s * 0.2, cx - s * 0.6, cy - s * 0.8, cx + s * 0.2 * (1 + v), cy - s, cx + s, cy - s * 0.2, cx + s * 0.8, cy + s * 0.8, cx - s * 0.3, cy + s], base[0], base[2]);
        A.poly(c, [cx - s * 0.5, cy - s * 0.5, cx + s * 0.2, cy - s * 0.75, cx + s * 0.5, cy - s * 0.1, cx - s * 0.2, cy], base[1]);
        if (dmg > 0.3) A.line(c, [cx - 6, cy - 4, cx, cy + 2, cx - 2, cy + 10], base[2], 2);
        break;
      }
      case 'building': {
        const roofs = ['#c0504d', '#4f81bd', '#9bbb59', '#d8b25c', '#8064a2', '#4bacc6'];
        const roof = roofs[Math.floor(o.v * roofs.length)];
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 8, y + 9, T - 8, T - 8);
        c.fillStyle = '#e4ddd0'; c.fillRect(x + 3, y + 3, T - 6, T - 6);
        c.fillStyle = roof; c.fillRect(x + 5, y + 5, T - 10, T - 10);
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + T / 2, y + 5, T / 2 - 5, T - 10);
        c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 5, y + 5, T - 10, 3);
        if (o.v > 0.5) { c.fillStyle = '#9aa0a8'; c.fillRect(x + 11, y + 11, 8, 6); c.fillStyle = '#6f757c'; c.fillRect(x + 12, y + 12, 6, 4); }
        else { c.fillStyle = '#5a5248'; c.fillRect(x + T - 17, y + 10, 6, 6); }
        if (dmg > 0.25) {
          A.line(c, [x + 10, y + 8, x + 20, y + 22, x + 16, y + 34], 'rgba(30,20,10,0.8)', 2);
        }
        if (dmg > 0.6) {
          A.line(c, [x + T - 8, y + 12, x + T - 22, y + 26, x + T - 14, y + T - 6], 'rgba(30,20,10,0.8)', 2);
          c.fillStyle = 'rgba(30,20,10,0.6)';
          c.beginPath(); c.arc(x + T * 0.6, y + T * 0.55, 6, 0, Math.PI * 2); c.fill();
        }
        break;
      }
    }
  }
};
