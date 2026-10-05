// Procedural top-down monster art. Every monster faces +x in local space,
// drawn at a nominal body radius of 20 and scaled to the real radius.
MOM.Art = (() => {
  const TAU = Math.PI * 2;
  const FLASH = { p: '#ffffff', s: '#f2f2f2', a: '#ffffff', d: '#bbbbbb' };

  function ell(c, x, y, rx, ry, rot, fill, stroke, lw = 2) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function circ(c, x, y, r, fill, stroke, lw = 2) { ell(c, x, y, r, r, 0, fill, stroke, lw); }
  function poly(c, pts, fill, stroke, lw = 2) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
  }
  function line(c, pts, stroke, lw) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.strokeStyle = stroke; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    c.stroke();
  }
  // A soft translucent ring standing in for shadowBlur glow, which is far too
  // expensive to use per-sprite every frame.
  function halo(c, x, y, r, col) {
    const a = c.globalAlpha;
    c.globalAlpha = a * 0.35;
    circ(c, x, y, r, col);
    c.globalAlpha = a;
  }
  function eye(c, x, y, r, col, glow) {
    if (glow) halo(c, x, y, r * 1.8, col);
    circ(c, x, y, r, col);
    circ(c, x + r * 0.3, y, r * 0.45, '#111');
  }

  const DRAW = {
    rex(c, P, t, w, atk) {
      const s = Math.sin(w);
      const tailSw = Math.sin(t * 3 + w * 0.5) * 4;
      poly(c, [-8, -8, -40, tailSw, -8, 8], P.p, P.d);
      ell(c, -2 + s * 5, -14, 9, 5.5, 0, P.s, P.d);
      ell(c, -2 - s * 5, 14, 9, 5.5, 0, P.s, P.d);
      ell(c, 0, 0, 17, 13, 0, P.p, P.d);
      for (let i = -2; i <= 1; i++) ell(c, i * 6, 0, 2.5, 4, 0, P.s);
      line(c, [9, -10, 14, -12], P.d, 3); line(c, [9, 10, 14, 12], P.d, 3);
      const jaw = 4 + atk * 6;
      ell(c, 18 + atk * 3, 0, 12, 9, 0, P.p, P.d);
      c.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) {
        poly(c, [22 + i * 2.5 + atk * 3, -jaw, 23.5 + i * 2.5 + atk * 3, -jaw + 3, 25 + i * 2.5 + atk * 3, -jaw], '#fff');
        poly(c, [22 + i * 2.5 + atk * 3, jaw, 23.5 + i * 2.5 + atk * 3, jaw - 3, 25 + i * 2.5 + atk * 3, jaw], '#fff');
      }
      eye(c, 18 + atk * 3, -6, 2.6, P.a);
      eye(c, 18 + atk * 3, 6, 2.6, P.a);
    },

    spider(c, P, t, w, atk) {
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 4; i++) {
          const bx = 6 - i * 4.5;
          const ph = Math.sin(w + i * 1.6 + (side > 0 ? Math.PI : 0)) * 5;
          const jx = bx + 6 - i * 4 + ph, jy = side * 22;
          const fx = bx + 12 - i * 9 + ph * 1.4, fy = side * (30 - Math.abs(i - 1.5) * 2);
          line(c, [bx, side * 5, jx, jy, fx, fy], P.d, 3.6);
          line(c, [bx, side * 5, jx, jy, fx, fy], P.s, 1.6);
        }
      }
      ell(c, -13, 0, 15, 12, 0, P.p, P.d);
      poly(c, [-20, -4, -13, 0, -20, 4, -6, 4, -13, 0, -6, -4], P.a);
      ell(c, 5, 0, 9, 8, 0, P.s, P.d);
      for (const [ex, ey] of [[11, -2.5], [11, 2.5], [9, -5], [9, 5], [8, -1], [8, 1]]) circ(c, ex, ey, 1.4, P.a);
      const f = 3 - atk * 2;
      line(c, [13, -3, 17 + atk * 3, -f], '#eee', 2);
      line(c, [13, 3, 17 + atk * 3, f], '#eee', 2);
    },

    golem(c, P, t, w, atk) {
      const s = Math.sin(w);
      ell(c, -6 - s * 4, -9, 6, 5, 0, P.d);
      ell(c, -6 + s * 4, 9, 6, 5, 0, P.d);
      const armF = atk * 10;
      poly(c, [2 + s * 6 + armF, -25, 12 + s * 6 + armF, -21, 11 + s * 6 + armF, -12, 0 + s * 6 + armF, -11, -4 + s * 6 + armF, -18], P.s, P.d);
      poly(c, [2 - s * 6 + armF, 25, 12 - s * 6 + armF, 21, 11 - s * 6 + armF, 12, 0 - s * 6 + armF, 11, -4 - s * 6 + armF, 18], P.s, P.d);
      poly(c, [-14, -12, -2, -17, 11, -12, 15, 0, 11, 12, -2, 17, -14, 12, -18, 0], P.p, P.d, 2.5);
      line(c, [-10, -6, -4, -2, -8, 5], P.d, 1.5);
      line(c, [2, 8, 6, 4, 4, -2], P.d, 1.5);
      poly(c, [4, -7, 12, -6, 14, 0, 12, 6, 4, 7, 2, 0], P.s, P.d);
      halo(c, 11, -3, 3.6, P.a); halo(c, 11, 3, 3.6, P.a);
      circ(c, 11, -3, 1.8, P.a); circ(c, 11, 3, 1.8, P.a);
    },

    wyrm(c, P, t, w, atk, moving) {
      const ph = moving ? w * 0.7 : t * 2;
      const amp = moving ? 6 : 2.5;
      const N = 10, segs = [];
      for (let i = 0; i < N; i++) segs.push([-i * 4.6 - 2, Math.sin(ph - i * 0.75) * amp * (i / N + 0.3)]);
      for (let i = N - 1; i >= 0; i--) {
        const r = 9 - i * 0.6;
        circ(c, segs[i][0], segs[i][1], r, i % 2 ? P.s : P.p, P.d, 1.5);
      }
      const hy = segs[0][1] * 0.5;
      if (Math.sin(t * 9) > 0.2 || atk > 0) {
        const tl = 22 + atk * 6;
        line(c, [14, hy, tl, hy, tl + 3, hy - 2.5], '#ff3b5c', 1.5);
        line(c, [tl, hy, tl + 3, hy + 2.5], '#ff3b5c', 1.5);
      }
      ell(c, 6 + atk * 4, hy, 11, 8, 0, P.p, P.d);
      ell(c, 4 + atk * 4, hy, 4, 2.5, 0, P.a);
      eye(c, 9 + atk * 4, hy - 5, 2.4, P.a);
      eye(c, 9 + atk * 4, hy + 5, 2.4, P.a);
    },

    mantis(c, P, t, w, atk) {
      const s = Math.sin(w);
      for (let side = -1; side <= 1; side += 2) {
        line(c, [-2, side * 3, 0 + s * 4 * side, side * 13, -4 + s * 5 * side, side * 22], P.s, 1.8);
        line(c, [-8, side * 3, -12 - s * 4 * side, side * 14, -20 - s * 4 * side, side * 21], P.s, 1.8);
      }
      ell(c, -17, 0, 14, 7.5, 0, P.p, P.d);
      for (let i = 0; i < 4; i++) line(c, [-24 + i * 5, -6, -24 + i * 5, 6], P.s, 1);
      ell(c, -1, 0, 10, 4.5, 0, P.s, P.d);
      const sw = atk * 0.9;
      for (let side = -1; side <= 1; side += 2) {
        c.save();
        c.translate(6, side * 4);
        c.rotate(side * (0.35 - sw));
        line(c, [0, 0, 11, side * 7, 22, side * 2, 18, side * -1], P.d, 4.5);
        line(c, [0, 0, 11, side * 7, 22, side * 2, 18, side * -1], P.p, 2.4);
        c.restore();
      }
      poly(c, [7, -8, 18, 0, 7, 8, 5, 0], P.p, P.d);
      eye(c, 8, -6.5, 3.2, P.a);
      eye(c, 8, 6.5, 3.2, P.a);
      line(c, [14, -2, 22, -9], P.d, 1); line(c, [14, 2, 22, 9], P.d, 1);
    },

    bat(c, P, t, w, atk) {
      const f = Math.sin(t * 16);
      const span = 27 + f * 7, sweep = f * 3;
      for (let side = -1; side <= 1; side += 2) {
        const S = side;
        poly(c, [
          2, S * 4, 6 + sweep, S * span * 0.55, 0 + sweep, S * span, -6, S * span * 0.82,
          -8, S * span * 0.6, -12, S * span * 0.5, -10, S * span * 0.3, -8, S * 4,
        ], P.s, P.d);
        line(c, [0, S * 4, 0 + sweep, S * span], P.p, 1.2);
        line(c, [0, S * 4, -6, S * span * 0.82], P.p, 1.2);
        line(c, [0, S * 4, -12, S * span * 0.5], P.p, 1.2);
      }
      ell(c, -1, 0, 10, 7, 0, P.p, P.d);
      poly(c, [6, -4, 4, -11, 11, -5], P.p, P.d, 1.5);
      poly(c, [6, 4, 4, 11, 11, 5], P.p, P.d, 1.5);
      circ(c, 10 + atk * 4, 0, 6, P.p, P.d);
      halo(c, 13 + atk * 4, 0, 4.6, P.a);
      circ(c, 13 + atk * 4, -2.5, 1.6, P.a); circ(c, 13 + atk * 4, 2.5, 1.6, P.a);
      line(c, [15 + atk * 4, -1.2, 17 + atk * 4, -1.2], '#fff', 1.2);
      line(c, [15 + atk * 4, 1.2, 17 + atk * 4, 1.2], '#fff', 1.2);
    },

    cyclops(c, P, t, w, atk) {
      const s = Math.sin(w);
      ell(c, -8 - s * 5, -8, 6, 4.5, 0, P.s, P.d);
      ell(c, -8 + s * 5, 8, 6, 4.5, 0, P.s, P.d);
      const pL = atk * 9;
      line(c, [0, -12, 6 + s * 4 + pL, -19], P.p, 6);
      line(c, [0, 12, 6 - s * 4 + pL * 0.3, 19], P.p, 6);
      circ(c, 7 + s * 4 + pL, -19, 6, P.p, P.d);
      circ(c, 7 - s * 4 + pL * 0.3, 19, 6, P.p, P.d);
      circ(c, 0, 0, 16, P.p, P.d, 2.5);
      c.beginPath(); c.arc(0, 0, 16, 2.2, 4.1); c.lineWidth = 5; c.strokeStyle = P.s; c.stroke();
      ell(c, -5, -5, 5, 3, -0.6, 'rgba(255,255,255,0.25)');
      poly(c, [-6, -2, -14, 0, -6, 2], '#f4f0e0', P.d, 1);
      circ(c, 7, 0, 7.5, '#fff', P.d);
      halo(c, 9, 0, 6, P.a);
      circ(c, 9, 0, 4.2, P.a);
      circ(c, 10, 0, 2, '#111');
      line(c, [1, -6, 9, -8, 14, -5], P.d, 2);
    },

    ooze(c, P, t, w, atk, moving) {
      const N = 20, pts = [];
      const sq = moving ? Math.sin(w * 0.8) * 0.08 : 0;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const rr = 18 + Math.sin(t * 4 + i * 1.3) * 1.5 + Math.sin(t * 2.3 + i * 2.1) * 1;
        pts.push(Math.cos(a) * rr * (1 + sq + atk * 0.2), Math.sin(a) * rr * (1 - sq));
      }
      c.globalAlpha *= 0.92;
      c.beginPath();
      for (let i = 0; i < N; i++) {
        const x0 = pts[i * 2], y0 = pts[i * 2 + 1];
        const j = (i + 1) % N, x1 = pts[j * 2], y1 = pts[j * 2 + 1];
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        if (i === 0) c.moveTo(mx, my); else c.quadraticCurveTo(x0, y0, mx, my);
      }
      c.quadraticCurveTo(pts[0], pts[1], (pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2);
      c.closePath();
      c.fillStyle = P.p; c.fill();
      c.strokeStyle = P.d; c.lineWidth = 2; c.stroke();
      c.globalAlpha /= 0.92;
      circ(c, -5, 3, 6, P.s);
      for (let i = 0; i < 4; i++) circ(c, -8 + Math.sin(t * 1.5 + i * 2) * 6, -4 + Math.cos(t * 1.2 + i * 1.7) * 7, 1.4, P.a);
      ell(c, -4, -9, 5, 2.5, -0.4, 'rgba(255,255,255,0.5)');
      circ(c, 8 + atk * 3, -5, 4, '#fff', P.d, 1);
      circ(c, 8 + atk * 3, 5, 4, '#fff', P.d, 1);
      circ(c, 10 + atk * 3, -5, 2, '#111');
      circ(c, 10 + atk * 3, 5, 2, '#111');
    },

    mech(c, P, t, w, atk) {
      const off = (w * 2) % 4;
      for (let side = -1; side <= 1; side += 2) {
        c.fillStyle = P.d;
        c.beginPath(); c.roundRect(-14, side * 13 - 4, 28, 8, 3); c.fill();
        c.strokeStyle = P.s; c.lineWidth = 1;
        for (let x = -12 + off; x < 13; x += 4) line(c, [x, side * 13 - 3, x, side * 13 + 3], P.s, 1);
      }
      c.fillStyle = P.s; c.strokeStyle = P.d; c.lineWidth = 2;
      c.beginPath(); c.roundRect(-12, -11, 22, 22, 4); c.fill(); c.stroke();
      c.fillStyle = P.p;
      c.beginPath(); c.roundRect(-9, -8, 16, 16, 3); c.fill(); c.stroke();
      const rec = atk * -3;
      c.fillStyle = P.d;
      c.fillRect(2 + rec, -16, 14, 4); c.fillRect(2 + rec, 12, 14, 4);
      c.globalAlpha *= 0.35; c.fillStyle = P.a; c.fillRect(4, -7, 9, 14); c.globalAlpha /= 0.35;
      c.fillStyle = P.a; c.fillRect(6, -5, 5, 10);
      line(c, [-6, -4, -14, -10], P.d, 1.5);
      circ(c, -14, -10, 1.8, Math.sin(t * 6) > 0 ? '#ff3b3b' : '#551111');
      line(c, [-5, 4, 2, 4], P.s, 1);
    },

    cat(c, P, t, w, atk) {
      const s = Math.sin(w);
      const tw = Math.sin(t * 3) * 6;
      line(c, [-14, 0, -24, tw * 0.5, -33, tw], P.d, 7);
      line(c, [-14, 0, -24, tw * 0.5, -33, tw], P.p, 4.5);
      circ(c, -33, tw, 2.6, P.s);
      ell(c, 8 + s * 5, -10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, 8 - s * 5, 10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, -9 - s * 5, -10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, -9 + s * 5, 10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, -2, 0, 17, 10, 0, P.p, P.d);
      for (let i = 0; i < 4; i++) {
        line(c, [-13 + i * 6, -9, -11 + i * 6, -3], P.s, 2.2);
        line(c, [-13 + i * 6, 9, -11 + i * 6, 3], P.s, 2.2);
      }
      const hx = 15 + atk * 5;
      poly(c, [hx - 3, -5, hx - 6, -14, hx + 3, -8], P.p, P.d, 1.5);
      poly(c, [hx - 3, 5, hx - 6, 14, hx + 3, 8], P.p, P.d, 1.5);
      poly(c, [hx - 3, -7, hx - 4.5, -11.5, hx + 0.5, -8], '#ff9fb2');
      poly(c, [hx - 3, 7, hx - 4.5, 11.5, hx + 0.5, 8], '#ff9fb2');
      circ(c, hx, 0, 9, P.p, P.d);
      line(c, [hx + 6, -2.5, hx + 13, -2 - atk * 2], '#fff', 2.6);
      line(c, [hx + 6, 2.5, hx + 13, 2 + atk * 2], '#fff', 2.6);
      eye(c, hx + 3, -4, 2.3, P.a, true);
      eye(c, hx + 3, 4, 2.3, P.a, true);
      circ(c, hx + 8.5, 0, 1.6, '#ff8fa3');
      line(c, [hx + 7, -1.5, hx + 13, -6], 'rgba(255,255,255,0.6)', 0.8);
      line(c, [hx + 7, 1.5, hx + 13, 6], 'rgba(255,255,255,0.6)', 0.8);
    },

    dog(c, P, t, w, atk) {
      const s = Math.sin(w);
      const wag = Math.sin(t * 14) * 5;
      line(c, [-15, 0, -22, wag * 0.5, -28, wag], P.d, 6.5);
      line(c, [-15, 0, -22, wag * 0.5, -28, wag], P.s, 4);
      ell(c, 9 + s * 5, -10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, 9 - s * 5, 10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, -9 - s * 5, -10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, -9 + s * 5, 10, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, -2, 0, 16, 11, 0, P.p, P.d);
      ell(c, -7, -3, 6, 5, 0.4, P.s);
      ell(c, -5, -2, 9, 3, 0, 'rgba(0,0,0,0.12)');
      const hx = 14 + atk * 5;
      ell(c, 8, 0, 3, 9, 0, P.a, P.d, 1.5);
      for (const y of [-6, 0, 6]) circ(c, 8, y, 1.2, '#ddd');
      ell(c, hx, 0, 9, 8, 0, P.p, P.d);
      ell(c, hx + 8, 0, 5.5, 4.5, 0, P.s, P.d, 1.5);
      if (atk > 0) { line(c, [hx + 9, -3, hx + 13, -2], '#fff', 1.5); line(c, [hx + 9, 3, hx + 13, 2], '#fff', 1.5); }
      circ(c, hx + 12.5, 0, 2, '#1a1a1a');
      ell(c, hx - 2, -8, 5.5, 3, -0.5 - Math.sin(t * 5) * 0.1, P.s, P.d, 1.5);
      ell(c, hx - 2, 8, 5.5, 3, 0.5 + Math.sin(t * 5) * 0.1, P.s, P.d, 1.5);
      eye(c, hx + 3, -4, 2, P.a, true);
      eye(c, hx + 3, 4, 2, P.a, true);
    },

    dragon(c, P, t, w, atk) {
      const s = Math.sin(w);
      const flap = Math.sin(t * 5);
      const span = 26 + flap * 4, sweep = flap * 2;
      // Tail with a spade tip
      const tw = Math.sin(t * 2.5 + w * 0.4) * 5;
      line(c, [-12, 0, -24, tw * 0.4, -36, tw], P.d, 9);
      line(c, [-12, 0, -24, tw * 0.4, -36, tw], P.p, 6);
      poly(c, [-35, tw, -40, tw - 5, -46, tw, -40, tw + 5], P.a, P.d, 1.5);
      ell(c, 7 + s * 4, -11, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, 7 - s * 4, 11, 5, 3.5, 0, P.s, P.d, 1.5);
      ell(c, -9 - s * 4, -11, 5.5, 4, 0, P.s, P.d, 1.5);
      ell(c, -9 + s * 4, 11, 5.5, 4, 0, P.s, P.d, 1.5);
      for (let side = -1; side <= 1; side += 2) {
        const S = side;
        poly(c, [
          4, S * 6, 10 + sweep, S * span * 0.7, 4 + sweep, S * span, -6, S * span * 0.9,
          -12, S * span * 0.65, -16, S * span * 0.45, -10, S * 8,
        ], P.s, P.d);
        line(c, [3, S * 6, 4 + sweep, S * span], P.p, 1.6);
        line(c, [3, S * 6, -6, S * span * 0.9], P.p, 1.3);
        line(c, [3, S * 6, -16, S * span * 0.45], P.p, 1.3);
      }
      ell(c, -2, 0, 15, 10, 0, P.p, P.d);
      for (let i = 0; i < 5; i++) poly(c, [-13 + i * 5, -2, -10.5 + i * 5, 0, -13 + i * 5, 2, -15 + i * 5, 0], P.a);
      const hx = 16 + atk * 5;
      ell(c, 11, 0, 6, 5, 0, P.p, P.d);
      poly(c, [hx, -3, hx - 3, -7, hx - 13, -11], '#f4e6c8', P.d, 1.2);
      poly(c, [hx, 3, hx - 3, 7, hx - 13, 11], '#f4e6c8', P.d, 1.2);
      ell(c, hx + 2, 0, 9, 7, 0, P.p, P.d);
      ell(c, hx + 9, 0, 4, 4.5, 0, P.s, P.d, 1.5);
      circ(c, hx + 11, -2, 0.9, P.d); circ(c, hx + 11, 2, 0.9, P.d);
      eye(c, hx + 3, -4, 2.2, P.a, true);
      eye(c, hx + 3, 4, 2.2, P.a, true);
    },

    gremlin(c, P, t, w, atk) {
      const s = Math.sin(w);
      ell(c, -3 - s * 3, -7, 4, 3, 0, P.d);
      ell(c, -3 + s * 3, 7, 4, 3, 0, P.d);
      line(c, [-8, 0, -18, Math.sin(t * 6) * 4, -20, Math.sin(t * 6) * 4 + 3], P.s, 2);
      circ(c, 0, 0, 11, P.p, P.d);
      poly(c, [4, -7, -2, -22, -4, -8], P.p, P.d, 1.5);
      poly(c, [4, 7, -2, 22, -4, 8], P.p, P.d, 1.5);
      circ(c, 7 + atk * 3, -4, 2.6, P.a); circ(c, 7 + atk * 3, 4, 2.6, P.a);
      line(c, [10 + atk * 3, -2, 12 + atk * 3, 0, 10 + atk * 3, 2], '#fff', 1.5);
    },
  };

  function drawMonster(c, type, x, y, ang, r, t, opts = {}) {
    const def = MOM.MONSTERS[type];
    const pal = opts.flash ? FLASH : (opts.colors || def.colors);
    const k = (r / 20) * (type === 'gremlin' ? 1.55 : 1);
    const moving = !!opts.moving;
    const w = opts.walk != null ? opts.walk : (moving ? t * 10 : 0);
    const atk = opts.atk || 0;
    const flying = type === 'bat';
    c.save();
    c.translate(x, y);
    if (opts.alpha != null) c.globalAlpha = opts.alpha;
    if (!opts.noShadow) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      if (flying) c.ellipse(9 * k, 14 * k, 13 * k, 9 * k, 0, 0, TAU);
      else c.ellipse(3 * k, 5 * k, 22 * k, 17 * k, 0, 0, TAU);
      c.fill();
    }
    if (flying) c.translate(0, -3 * k + Math.sin(t * 3) * 1.5 * k);
    c.rotate(ang);
    c.scale(k, k);
    if (opts.squash) c.scale(1 + opts.squash, 1 - opts.squash);
    (DRAW[type] || DRAW.ooze)(c, pal, t, w, atk, moving);
    c.restore();
  }

  // Animated portraits for any <canvas data-monster="type"> in the DOM.
  const portraits = new Set();
  function registerPortrait(canvas, type, opts = {}) {
    canvas._mon = { type, opts };
    portraits.add(canvas);
    paintPortrait(canvas, performance.now() / 1000);
  }
  function paintPortrait(cv, t) {
    const { type, opts } = cv._mon;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const r = Math.min(w, h) * (opts.scale || 0.24);
    drawMonster(c, type, w / 2, h / 2 + r * 0.1, opts.angle != null ? opts.angle : -Math.PI / 2 + 0.5, r, t, {
      moving: opts.moving, colors: opts.colors,
    });
  }
  let lastPaint = 0;
  function animatePortraits(now) {
    requestAnimationFrame(animatePortraits);
    if (now - lastPaint < 32) return;
    lastPaint = now;
    const t = now / 1000;
    for (const cv of portraits) {
      if (!cv.isConnected) { portraits.delete(cv); continue; }
      if (cv.offsetParent === null) continue; // inside a hidden screen
      paintPortrait(cv, t);
    }
  }
  requestAnimationFrame(animatePortraits);

  return { drawMonster, registerPortrait, circ, ell, poly, line };
})();
