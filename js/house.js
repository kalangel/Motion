/* ============================================================
   house.js — процедурная модель двухэтажного дома и участка
   с фототекстурами (assets/textures/), холмами и лесом вокруг.
   ============================================================ */
(function () {
  'use strict';

  const T = THREE;

  // ---- Текстуры ------------------------------------------------
  const texLoader = new T.TextureLoader();
  function tex(file, rx, ry, rot) {
    const t = texLoader.load('assets/textures/' + file);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    if (rot) { t.rotation = rot; t.center.set(0.5, 0.5); }
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  // ---- Палитра для нетекстурных деталей ------------------------
  const C = {
    frame:     0xf6f3ee,
    glass:     0x9fc2d8,
    doorWood:  0x6e4522,
    trunk:     0x6d4c33,
    sofa:      0x647a9c,
    fabric:    0xe3ddd0,
    dark:      0x2e2e33,
    metal:     0x9aa0a6,
    kitchen:   0x5f6670,
    counterTop:0xe9e6df,
    bedSheet:  0xeae5d8,
    accent:    0xc7a15a,
    leaf:      0x4e7d43,
  };

  const mats = {};
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!mats[key]) {
      const m = new T.MeshPhongMaterial(Object.assign({ color: color, shininess: 6, specular: 0x0a0a0a }, opts || {}));
      m.color.convertSRGBToLinear();
      if (opts && opts.emissive) m.emissive.convertSRGBToLinear();
      mats[key] = m;
    }
    return mats[key];
  }
  function texMat(file, rx, ry, extra) {
    const m = new T.MeshPhongMaterial(Object.assign({
      map: tex(file, rx, ry), shininess: 5, specular: 0x0a0a0a,
    }, extra || {}));
    if (extra && extra.bump) { m.bumpMap = m.map; m.bumpScale = extra.bump; }
    return m;
  }

  const glassMat = new T.MeshPhongMaterial({
    color: 0x7fb0c9, transparent: true, opacity: 0.38,
    shininess: 120, specular: 0xffffff, side: T.DoubleSide, depthWrite: false,
  });
  glassMat.color.convertSRGBToLinear();

  function box(w, h, d, material, x, y, z) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function cyl(rt, rb, h, material, x, y, z, seg) {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 18), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function sph(r, material, x, y, z) {
    const m = new T.Mesh(new T.SphereGeometry(r, 14, 12), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }

  // ---- Габариты ----------------------------------------------
  const X0 = -5, X1 = 5, Z0 = -4, Z1 = 4;
  const WT = 0.24;
  const F0 = 0.15;
  const H1 = 2.95;
  const F1 = 3.27;
  const SLAB = 0.30;
  const TOP = 6.05;
  const RIDGE = 8.15;

  // ---- Рельеф: холмы вокруг ровной площадки --------------------
  function hillH(x, z) {
    const r = Math.hypot(x, z);
    const k = Math.min(1, Math.max(0, (r - 24) / 34));
    const s = k * k * (3 - 2 * k);
    const n =
      Math.sin(x * 0.045 + 1.7) * Math.cos(z * 0.05 + 0.6) +
      0.55 * Math.sin(x * 0.1 + z * 0.075 + 0.9) +
      0.32 * Math.sin(x * 0.021 - z * 0.033 + 2.1);
    return s * (2.4 * n + 1.4);
  }

  // ---- Стены с проёмами ----------------------------------------
  function wallRun(group, axis, fixed, from, to, yBot, yTop, thick, material, openings) {
    openings = (openings || []).slice().sort((a, b) => a.from - b.from);
    const segs = [];
    let cur = from;
    const clusters = [];
    for (const o of openings) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last.from - o.from) < 1e-6 && Math.abs(last.to - o.to) < 1e-6) {
        last.bands.push(o);
      } else {
        clusters.push({ from: o.from, to: o.to, bands: [o] });
      }
    }
    for (const cl of clusters) {
      if (cl.from > cur + 1e-4) segs.push({ a: cur, b: cl.from, y0: yBot, y1: yTop });
      cl.bands.sort((a, b) => a.sill - b.sill);
      let y = yBot;
      for (const b of cl.bands) {
        if (b.sill > y + 1e-4) segs.push({ a: cl.from, b: cl.to, y0: y, y1: b.sill });
        y = b.head;
      }
      if (yTop > y + 1e-4) segs.push({ a: cl.from, b: cl.to, y0: y, y1: yTop });
      cur = cl.to;
    }
    if (to > cur + 1e-4) segs.push({ a: cur, b: to, y0: yBot, y1: yTop });

    for (const s of segs) {
      const len = s.b - s.a, h = s.y1 - s.y0;
      const cx = (s.a + s.b) / 2, cy = (s.y0 + s.y1) / 2;
      const m = axis === 'x'
        ? box(len, h, thick, material, cx, cy, fixed)
        : box(thick, h, len, material, fixed, cy, cx);
      group.add(m);
    }
  }

  function windowUnit(group, axis, fixed, from, to, sill, head, windows) {
    const w = to - from, h = head - sill;
    const cx = (from + to) / 2, cy = (sill + head) / 2;
    const fw = 0.07;
    const frame = new T.Group();
    const fmat = mat(C.frame);
    const parts = [
      [w, fw, 0.14, cx, sill + fw / 2],
      [w, fw, 0.14, cx, head - fw / 2],
      [fw, h, 0.14, from + fw / 2, cy],
      [fw, h, 0.14, to - fw / 2, cy],
      [fw, h, 0.10, cx, cy],
      [w, fw, 0.10, cx, cy],
    ];
    for (const p of parts) {
      const m = axis === 'x'
        ? box(p[0], p[1], p[2], fmat, p[3], p[4], fixed)
        : box(p[2], p[1], p[0], fmat, fixed, p[4], p[3]);
      frame.add(m);
    }
    const g = axis === 'x'
      ? box(w - fw * 2, h - fw * 2, 0.02, glassMat, cx, cy, fixed)
      : box(0.02, h - fw * 2, w - fw * 2, glassMat, fixed, cy, cx);
    g.castShadow = false;
    frame.add(g);
    const s = axis === 'x'
      ? box(w + 0.16, 0.05, WT + 0.14, fmat, cx, sill - 0.025, fixed)
      : box(WT + 0.14, 0.05, w + 0.16, fmat, fixed, sill - 0.025, cx);
    frame.add(s);
    group.add(frame);

    let normal;
    if (axis === 'x') normal = new T.Vector3(0, 0, fixed > 0 ? 1 : -1);
    else normal = new T.Vector3(fixed > 0 ? 1 : -1, 0, 0);
    const center = axis === 'x' ? new T.Vector3(cx, cy, fixed) : new T.Vector3(fixed, cy, cx);
    windows.push({ center: center, normal: normal, width: w, height: h, glass: g });
  }

  // ---- Мебель --------------------------------------------------
  let sofaMat, woodDarkMat, wardrobeMat;

  function sofaUnit(x, z, rotY) {
    const g = new T.Group();
    const m = sofaMat;
    g.add(box(2.4, 0.42, 0.95, m, 0, 0.21, 0));
    g.add(box(2.4, 0.62, 0.22, m, 0, 0.62, -0.42));
    g.add(box(0.24, 0.62, 0.95, m, -1.2 + 0.12, 0.5, 0));
    g.add(box(0.24, 0.62, 0.95, m, 1.2 - 0.12, 0.5, 0));
    const pm = mat(C.fabric);
    g.add(box(0.6, 0.16, 0.6, pm, -0.6, 0.5, 0.05));
    g.add(box(0.6, 0.16, 0.6, pm, 0.15, 0.5, 0.05));
    g.add(box(0.5, 0.3, 0.14, mat(C.accent), 0.85, 0.62, -0.28));
    g.position.set(x, F0, z); g.rotation.y = rotY || 0;
    return g;
  }
  function table(w, d, h, topMat, legMat, x, z, yBase) {
    const g = new T.Group();
    g.add(box(w, 0.05, d, topMat, 0, h - 0.025, 0));
    const lx = w / 2 - 0.07, lz = d / 2 - 0.07;
    for (const s of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(box(0.07, h - 0.05, 0.07, legMat, s[0] * lx, (h - 0.05) / 2, s[1] * lz));
    }
    g.position.set(x, yBase, z);
    return g;
  }
  function chair(x, z, rotY) {
    const g = new T.Group();
    const m = mat(C.dark);
    g.add(box(0.44, 0.05, 0.44, m, 0, 0.45, 0));
    g.add(box(0.44, 0.5, 0.05, m, 0, 0.72, -0.2));
    for (const s of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(box(0.05, 0.45, 0.05, mat(C.trunk), s[0] * 0.18, 0.225, s[1] * 0.18));
    }
    g.position.set(x, 0, z); g.rotation.y = rotY || 0;
    return g;
  }
  function plant(x, y, z, scale) {
    const g = new T.Group();
    const s = scale || 1;
    g.add(cyl(0.14 * s, 0.11 * s, 0.26 * s, mat(0x9a9187), 0, 0.13 * s, 0));
    g.add(sph(0.22 * s, mat(C.leaf), 0, 0.45 * s, 0));
    g.add(sph(0.15 * s, mat(0x5e9450), 0.1 * s, 0.58 * s, 0.05 * s));
    g.position.set(x, y, z);
    return g;
  }
  function floorLamp(x, y, z) {
    const g = new T.Group();
    g.add(cyl(0.16, 0.16, 0.03, mat(C.dark), 0, 0.015, 0));
    g.add(cyl(0.02, 0.02, 1.5, mat(C.metal), 0, 0.76, 0));
    g.add(cyl(0.16, 0.2, 0.28, mat(C.fabric, { emissive: 0x554422 }), 0, 1.6, 0));
    g.position.set(x, y, z);
    return g;
  }
  function bedUnit(x, z, rotY) {
    const g = new T.Group();
    g.add(box(1.8, 0.28, 2.1, woodDarkMat, 0, 0.14, 0));
    g.add(box(1.72, 0.2, 2.0, mat(C.bedSheet), 0, 0.36, 0.02));
    g.add(box(1.8, 0.85, 0.1, woodDarkMat, 0, 0.42, -1.05));
    g.add(box(0.6, 0.14, 0.4, mat(0xffffff), -0.45, 0.5, -0.75));
    g.add(box(0.6, 0.14, 0.4, mat(0xffffff), 0.45, 0.5, -0.75));
    g.add(box(1.72, 0.08, 0.9, mat(C.accent), 0, 0.48, 0.5));
    g.position.set(x, F1, z); g.rotation.y = rotY || 0;
    return g;
  }
  function wardrobe(x, y, z, rotY, w) {
    const g = new T.Group();
    const width = w || 1.6;
    g.add(box(width, 2.1, 0.6, wardrobeMat, 0, 1.05, 0));
    g.add(box(0.02, 1.9, 0.04, mat(0x8a6238), 0, 1.0, 0.31));
    g.add(sph(0.03, mat(C.dark), -0.08, 1.05, 0.32));
    g.add(sph(0.03, mat(C.dark), 0.08, 1.05, 0.32));
    g.position.set(x, y, z); g.rotation.y = rotY || 0;
    return g;
  }
  function fireplace(x, y, z, rotY) {
    const g = new T.Group();
    g.add(box(1.3, 1.1, 0.35, mat(0xd8d0c2), 0, 0.55, 0));
    g.add(box(0.7, 0.6, 0.3, mat(0x1c1a18), 0, 0.45, 0.04));
    g.add(box(0.5, 0.35, 0.1, mat(0xff7733, { emissive: 0xcc4400 }), 0, 0.3, 0.1));
    g.add(box(1.45, 0.08, 0.45, mat(0xe9e2d3), 0, 1.14, 0));
    g.position.set(x, y, z); g.rotation.y = rotY || 0;
    return g;
  }
  function tvWall(x, y, z, rotY) {
    const g = new T.Group();
    g.add(box(2.6, 0.4, 0.45, wardrobeMat, 0, 0.2, 0));
    g.add(box(1.6, 0.92, 0.06, mat(0x111114), 0, 1.15, 0.02));
    g.add(box(1.5, 0.82, 0.02, mat(0x1e2b3a, { emissive: 0x0d1622 }), 0, 1.15, 0.06));
    g.position.set(x, y, z); g.rotation.y = rotY || 0;
    return g;
  }

  // ---- Сборка дома ---------------------------------------------
  function buildHouse(scene) {
    const house = new T.Group();
    const windows = [];
    const walk = [];
    const roofGroup = new T.Group();

    // текстурные материалы
    const wOut = texMat('plaster.jpg', 3.2, 1.9, { bump: 0.012 });
    const wIn = texMat('plaster_in.jpg', 2.6, 1.4, { bump: 0.006 });
    const floorWood = texMat('wood_floor.jpg', 3.4, 2.8, { bump: 0.008, shininess: 22, specular: 0x333333 });
    const ceilWood = texMat('wood_ceiling.jpg', 2.4, 1.9, { bump: 0.008 });
    const carpetM = texMat('carpet.jpg', 4, 3.2);
    const roofM = texMat('roof.jpg', 4.6, 1.6, { bump: 0.02 });
    const brickM = texMat('brick.jpg', 4.4, 0.6, { bump: 0.015 });
    const stairWood = texMat('wood_floor.jpg', 0.4, 0.9, { bump: 0.008 });
    sofaMat = texMat('fabric.jpg', 1.6, 1.0);
    woodDarkMat = texMat('wood_dark.jpg', 1, 1, { bump: 0.008 });
    wardrobeMat = texMat('wood_ceiling.jpg', 1, 1, { bump: 0.006 });
    const doorM = new T.MeshPhongMaterial({ map: tex('wood_dark.jpg', 0.7, 1.4, Math.PI / 2), shininess: 10, specular: 0x151515 });
    doorM.bumpMap = doorM.map; doorM.bumpScale = 0.01;
    const porchWood = texMat('wood_floor.jpg', 1.8, 0.9, { bump: 0.01 });

    // --- цоколь и плита пола 1 этажа
    house.add(box(10.6, 0.5, 8.6, brickM, 0, -0.17, 0));
    const floor1 = box(9.8, F0, 7.8, floorWood, 0, F0 / 2, 0);
    house.add(floor1); walk.push({ mesh: floor1, floor: 0 });

    // --- наружные стены
    wallRun(house, 'x', Z1 - WT / 2, X0, X1, F0, TOP, WT, wOut, [
      { from: -4.2, to: -2.8, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: -2.1, to: -1.0, sill: F0, head: F0 + 2.15 },
      { from: 2.3, to: 3.7, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: -4.2, to: -2.8, sill: F1 + 0.9, head: F1 + 2.3 },
      { from: 2.3, to: 3.7, sill: F1 + 0.9, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'x', Z1 - WT / 2, -4.2, -2.8, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'x', Z1 - WT / 2, 2.3, 3.7, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'x', Z1 - WT / 2, -4.2, -2.8, F1 + 0.9, F1 + 2.3, windows);
    windowUnit(house, 'x', Z1 - WT / 2, 2.3, 3.7, F1 + 0.9, F1 + 2.3, windows);

    wallRun(house, 'x', Z0 + WT / 2, X0, X1, F0, TOP, WT, wOut, [
      { from: 2.3, to: 3.7, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: 2.3, to: 3.7, sill: F1 + 0.9, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'x', Z0 + WT / 2, 2.3, 3.7, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'x', Z0 + WT / 2, 2.3, 3.7, F1 + 0.9, F1 + 2.3, windows);

    wallRun(house, 'z', X0 + WT / 2, Z0, Z1, F0, TOP, WT, wOut, [
      { from: -2.6, to: -1.2, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: 0.8, to: 2.2, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: 0.8, to: 2.2, sill: F1 + 0.9, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'z', X0 + WT / 2, -2.6, -1.2, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'z', X0 + WT / 2, 0.8, 2.2, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'z', X0 + WT / 2, 0.8, 2.2, F1 + 0.9, F1 + 2.3, windows);

    wallRun(house, 'z', X1 - WT / 2, Z0, Z1, F0, TOP, WT, wOut, [
      { from: -0.7, to: 0.7, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: -0.9, to: 0.9, sill: F1 + 0.8, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'z', X1 - WT / 2, -0.7, 0.7, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'z', X1 - WT / 2, -0.9, 0.9, F1 + 0.8, F1 + 2.3, windows);

    // --- входная дверь
    const door = new T.Group();
    door.add(box(1.1, 2.15, 0.08, doorM, -1.55, F0 + 1.075, Z1 - WT / 2));
    door.add(box(0.16, 0.04, 0.14, mat(C.accent), -1.15, F0 + 1.05, Z1 - WT / 2));
    house.add(door);

    // --- межэтажное перекрытие
    const slab1 = box(9.5, SLAB, 6.4, ceilWood, 0, H1 + SLAB / 2 - 0.02, 0.55);
    const slab2 = box(6.1, SLAB, 1.25, ceilWood, 1.7, H1 + SLAB / 2 - 0.02, -3.15);
    house.add(slab1, slab2);
    const carpet1 = box(9.5, 0.04, 6.4, carpetM, 0, H1 + SLAB, 0.55);
    const carpet2 = box(6.1, 0.04, 1.25, carpetM, 1.7, H1 + SLAB, -3.15);
    house.add(carpet1, carpet2);
    walk.push({ mesh: carpet1, floor: 1 }, { mesh: carpet2, floor: 1 });

    // --- потолок 2 этажа
    const ceil2 = box(9.8, 0.12, 7.8, ceilWood, 0, TOP - 0.06, 0);
    roofGroup.add(ceil2);

    // --- внутренние стены
    wallRun(house, 'z', 0.9, Z0 + WT, Z1 - WT, F0, H1, 0.18, wIn, [
      { from: -0.8, to: 0.8, sill: F0, head: F0 + 2.15 },
    ]);
    wallRun(house, 'z', 0, Z0 + WT, Z1 - WT, F1 - 0.04, TOP, 0.18, wIn, [
      { from: 0.5, to: 1.9, sill: F1 - 0.04, head: F1 + 2.15 },
    ]);

    // --- лестница
    const NSTEP = 14, RISE = (F1 - 0.02 - F0) / NSTEP, DX = 3.0 / NSTEP;
    for (let i = 0; i < NSTEP; i++) {
      const s = box(DX + 0.03, RISE * (i + 1), 0.95, stairWood, -4.6 + (i + 0.5) * DX, F0 + RISE * (i + 1) / 2, -3.25);
      house.add(s);
      walk.push({ mesh: s, floor: 0.5 });
    }
    const railM = woodDarkMat;
    for (let i = 0; i <= 4; i++) {
      const x = -4.5 + i * 0.72;
      const y = F0 + ((x + 4.6) / 3.0) * (F1 - F0);
      house.add(box(0.05, 0.85, 0.05, railM, x, y + 0.42, -2.92));
    }
    const hr = box(3.3, 0.06, 0.07, railM, -3.1, (F0 + F1) / 2 + 0.95, -2.92);
    hr.rotation.z = Math.atan2(F1 - F0, 3.0);
    house.add(hr);
    for (let i = 0; i <= 5; i++) {
      house.add(box(0.05, 0.9, 0.05, railM, -4.7 + i * 0.66, F1 + 0.45, -2.78));
    }
    house.add(box(3.5, 0.06, 0.07, railM, -3.05, F1 + 0.93, -2.78));

    // --- терраса у входа
    const porch = new T.Group();
    porch.add(box(3.4, 0.18, 1.6, porchWood, -1.55, 0.06, Z1 + 0.8));
    porch.add(box(3.4, 0.14, 0.5, porchWood, -1.55, -0.05, Z1 + 1.85));
    porch.add(cyl(0.07, 0.07, 2.3, mat(C.frame), -3.05, 1.3, Z1 + 1.45));
    porch.add(cyl(0.07, 0.07, 2.3, mat(C.frame), -0.05, 1.3, Z1 + 1.45));
    porch.add(box(3.6, 0.1, 1.9, roofM, -1.55, 2.5, Z1 + 0.95));
    house.add(porch);

    // --- крыша
    const half = Z1 + 0.6;
    const rise = RIDGE - (TOP - 0.1);
    const slopeLen = Math.sqrt(half * half + rise * rise) + 0.25;
    const ang = Math.atan2(rise, half);
    const r1 = box(11.6, 0.16, slopeLen, roofM, 0, (TOP - 0.1 + RIDGE) / 2, -half / 2);
    r1.rotation.x = -ang;
    const r2 = box(11.6, 0.16, slopeLen, roofM, 0, (TOP - 0.1 + RIDGE) / 2, half / 2);
    r2.rotation.x = ang;
    roofGroup.add(r1, r2);
    roofGroup.add(box(10.3, 0.3, 0.14, mat(C.frame), 0, TOP + 0.04, Z1 + 0.02));
    roofGroup.add(box(10.3, 0.3, 0.14, mat(C.frame), 0, TOP + 0.04, -Z1 - 0.02));
    // конёк
    roofGroup.add(box(11.62, 0.1, 0.34, mat(0x3a3d45), 0, RIDGE + 0.02, 0));
    // фронтоны
    const gShape = new T.Shape();
    gShape.moveTo(-Z1, 0); gShape.lineTo(Z1, 0); gShape.lineTo(0, RIDGE - TOP);
    const gGeo = new T.ShapeGeometry(gShape);
    const gMat = new T.MeshPhongMaterial({ map: tex('plaster.jpg', 2, 1), shininess: 6, specular: 0x0a0a0a, side: T.DoubleSide });
    for (const sx of [X0 + 0.06, X1 - 0.06]) {
      const gm = new T.Mesh(gGeo, gMat);
      gm.position.set(sx, TOP, 0);
      gm.rotation.y = Math.PI / 2;
      gm.castShadow = true; gm.receiveShadow = true;
      roofGroup.add(gm);
    }
    // труба
    roofGroup.add(box(0.7, 1.6, 0.7, brickM, 2.6, RIDGE - 0.4, -1.2));
    roofGroup.add(box(0.85, 0.12, 0.85, mat(0x6e6862), 2.6, RIDGE + 0.42, -1.2));
    house.add(roofGroup);

    // ---- МЕБЕЛЬ ------------------------------------------------
    // Гостиная
    house.add(box(3.4, 0.02, 2.6, mat(0xd9d2c2), -2.4, F0 + 0.011, 0.9));
    house.add(sofaUnit(-2.4, 1.9, Math.PI));
    house.add(table(1.1, 0.6, 0.42, woodDarkMat, mat(C.dark), -2.4, 0.7, F0));
    house.add(tvWall(-2.4, F0, -3.55, 0));
    house.add(floorLamp(-4.3, F0, 3.2));
    house.add(plant(-4.4, F0, -1.6, 1.3));
    house.add(wardrobe(0.55, F0, 3.3, Math.PI, 1.4));

    // Кухня-столовая
    const kc = new T.Group();
    kc.add(box(2.8, 0.9, 0.62, mat(C.kitchen), 3.4, F0 + 0.45, -3.55));
    kc.add(box(2.8, 0.05, 0.66, mat(C.counterTop), 3.4, F0 + 0.925, -3.55));
    kc.add(box(0.62, 0.9, 2.2, mat(C.kitchen), 4.55, F0 + 0.45, -2.2));
    kc.add(box(0.66, 0.05, 2.2, mat(C.counterTop), 4.55, F0 + 0.925, -2.2));
    kc.add(box(0.75, 1.9, 0.7, mat(C.metal), 4.5, F0 + 0.95, 3.4));
    kc.add(box(0.06, 0.22, 0.06, mat(C.metal), 2.6, F0 + 1.06, -3.62));
    kc.add(box(0.05, 0.05, 0.2, mat(C.metal), 2.6, F0 + 1.15, -3.5));
    house.add(kc);
    house.add(table(1.5, 0.9, 0.75, woodDarkMat, mat(C.trunk), 2.8, 0.8, F0));
    house.add(chair(2.3, 0.15, 0));
    house.add(chair(3.3, 0.15, Math.PI));
    house.add(chair(2.3, 1.45, 0));
    house.add(chair(3.3, 1.45, 0));
    house.add(cyl(0.02, 0.02, 0.5, mat(C.dark), 2.8, H1 - 0.27, 0.8));
    house.add(cyl(0.2, 0.28, 0.22, mat(C.dark, { emissive: 0x443311 }), 2.8, H1 - 0.62, 0.8));

    // Спальня
    house.add(box(3.2, 0.02, 2.4, mat(0xd3ccbc), -2.6, F1 + 0.011, 1.2));
    house.add(bedUnit(-2.6, 1.6, 0));
    house.add(table(0.5, 0.4, 0.5, woodDarkMat, mat(C.trunk), -3.75, 0.4, F1));
    house.add(table(0.5, 0.4, 0.5, woodDarkMat, mat(C.trunk), -1.45, 0.4, F1));
    house.add(wardrobe(-0.35, F1, 3.35, Math.PI, 1.8));
    house.add(plant(-4.4, F1, 3.3, 1.1));

    // Кабинет (как на 360°-фото)
    const deskM = mat(0xf0ede6);
    house.add(box(1.7, 0.06, 0.65, deskM, 2.9, F1 + 0.73, 3.25));
    house.add(box(0.65, 0.06, 1.3, deskM, 2.4, F1 + 0.73, 2.6));
    house.add(box(0.06, 0.7, 0.6, deskM, 3.7, F1 + 0.38, 3.25));
    house.add(box(0.06, 0.7, 0.6, deskM, 2.12, F1 + 0.38, 3.25));
    const oc = new T.Group();
    oc.add(cyl(0.3, 0.3, 0.04, mat(C.dark), 0, 0.04, 0));
    oc.add(cyl(0.04, 0.04, 0.35, mat(C.metal), 0, 0.25, 0));
    oc.add(box(0.5, 0.1, 0.5, mat(C.dark), 0, 0.48, 0));
    oc.add(box(0.5, 0.6, 0.1, mat(C.dark), 0, 0.85, -0.22));
    oc.position.set(2.9, F1, 2.4);
    house.add(oc);
    house.add(wardrobe(3.9, F1, -3.35, 0, 1.9));
    house.add(fireplace(1.0, F1, -3.6, 0));
    const mir = new T.Group();
    mir.add(box(0.7, 1.7, 0.05, wardrobeMat, 0, 0.85, 0));
    mir.add(box(0.58, 1.58, 0.02, new T.MeshPhongMaterial({ color: 0xcfe4ec, shininess: 100, specular: 0xffffff }), 0, 0.85, 0.03));
    mir.position.set(4.75, F1, -1.8); mir.rotation.y = -Math.PI / 2; mir.rotation.x = -0.06;
    house.add(mir);
    house.add(plant(0.5, F1, 3.4, 1.0));
    house.add(cyl(0.09, 0.11, 0.04, mat(C.dark), 3.3, F1 + 0.78, 3.3));
    house.add(cyl(0.015, 0.015, 0.35, mat(C.dark), 3.3, F1 + 0.95, 3.3));
    house.add(sph(0.07, mat(C.fabric, { emissive: 0x665533 }), 3.3, F1 + 1.13, 3.3));
    const pic = new T.Group();
    pic.add(box(0.6, 0.8, 0.04, woodDarkMat, 0, 0, 0));
    pic.add(box(0.5, 0.7, 0.02, mat(0x8f4b3a), 0, 0, 0.02));
    pic.position.set(1.0, F1 + 1.9, -3.85);
    house.add(pic);

    scene.add(house);

    // ---- УЧАСТОК И МИР -------------------------------------------
    buildTerrain(scene);
    buildFence(scene);
    buildPath(scene);
    buildForest(scene);

    return {
      group: house,
      roofGroup: roofGroup,
      windows: windows,
      walkables: walk,
      bounds: { x0: X0 + 0.55, x1: X1 - 0.55, z0: Z0 + 0.55, z1: Z1 - 0.55 },
      floors: [
        { y: F0, wallX: 0.9, doorZ: [-0.7, 0.7] },
        { y: F1, wallX: 0.0, doorZ: [0.6, 1.8] },
      ],
      stair: {
        bottom: new T.Vector3(-4.55, F0, -3.25),
        top: new T.Vector3(-1.3, F1, -3.25),
        mid: new T.Vector3(-3.0, (F0 + F1) / 2, -3.25),
      },
      stairHole: { x0: -4.8, x1: -1.4, z0: -4, z1: -2.8 },
      rooms: [
        { id: 'living',  name: 'Гостиная',  floor: 0, pos: new T.Vector3(-0.6, F0, -1.8), win: 7,
          look: new T.Vector3(-3.4, F0 + 0.75, 1.6) },
        { id: 'kitchen', name: 'Кухня',     floor: 0, pos: new T.Vector3(1.8, F0, 0.4),   win: 9,
          look: new T.Vector3(4.0, F0 + 1.0, -3.0) },
        { id: 'bedroom', name: 'Спальня',   floor: 1, pos: new T.Vector3(-2.4, F1, 3.0),  win: 8,
          look: new T.Vector3(-2.6, F1 + 0.8, 0.4) },
        { id: 'office',  name: 'Кабинет',   floor: 1, pos: new T.Vector3(2.4, F1, 1.0),   win: 10,
          look: new T.Vector3(3.1, F1 + 0.9, 3.2) },
      ],
      levels: { F0: F0, F1: F1, TOP: TOP },
    };
  }

  // ---- Рельеф ---------------------------------------------------
  function buildTerrain(scene) {
    const size = 380, seg = 110;
    const geo = new T.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, hillH(x, z) - 0.28);
    }
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, texMat('grass.jpg', 56, 56));
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---- Забор из штакетника ---------------------------------------
  function buildFence(scene) {
    const g = new T.Group();
    const fm = texMat('wood_dark.jpg', 0.3, 1);
    const H = 1.05, PX = 15, PZ = 12.5;
    function run(x0, z0, x1, z1, gapFrom, gapTo) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / 0.24);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const d = t * len;
        if (gapFrom !== undefined && d > gapFrom && d < gapTo) continue;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const y = hillH(x, z) - 0.28;
        if (i % 8 === 0) g.add(box(0.12, H + 0.15, 0.12, fm, x, y + (H + 0.15) / 2, z));
        else g.add(box(0.09, H, 0.026, fm, x, y + H / 2, z));
      }
      // прожилины
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const y = hillH(cx, cz) - 0.28;
      for (const ry of [0.35, 0.8]) {
        const rail = box(len, 0.07, 0.05, fm, cx, y + ry, cz);
        rail.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
        g.add(rail);
      }
    }
    // все пикеты поворачиваем к направлению прогона
    function runR(x0, z0, x1, z1, gapFrom, gapTo) {
      const before = g.children.length;
      run(x0, z0, x1, z1, gapFrom, gapTo);
      const ang = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = before; i < g.children.length; i++) {
        const c = g.children[i];
        if (c.geometry.parameters.width < 0.2) c.rotation.y = ang;
      }
    }
    runR(-PX, -PZ, PX, -PZ);
    runR(-PX, PZ, PX, PZ, 12.2, 14.8);   // калитка напротив дорожки
    runR(-PX, -PZ, -PX, PZ);
    runR(PX, -PZ, PX, PZ);
    scene.add(g);
  }

  // ---- Дорожка --------------------------------------------------
  function buildPath(scene) {
    const sm = texMat('stone.jpg', 1, 0.8, { bump: 0.012 });
    for (let i = 0; i < 8; i++) {
      const z = Z1 + 2.6 + i * 1.06;
      const p = box(1.25, 0.07, 0.92, sm, -1.55, hillH(-1.55, z) - 0.245, z);
      p.castShadow = false;
      scene.add(p);
    }
  }

  // ---- Деревья и лес ---------------------------------------------
  let foliageMat = null, barkMat = null;
  function tree(scene, x, z, s, seed) {
    const g = new T.Group();
    if (!barkMat) barkMat = texMat('bark.jpg', 1, 2);
    if (!foliageMat) {
      const ft = tex('foliage.png', 1, 1);
      foliageMat = new T.MeshPhongMaterial({
        map: ft, alphaTest: 0.45, side: T.DoubleSide,
        shininess: 4, specular: 0x0a0a0a,
      });
    }
    const rnd = mulberry(seed || 1);
    const th = (1.5 + rnd() * 0.8) * s;
    const trunk = cyl(0.1 * s, 0.17 * s, th, barkMat, 0, th / 2, 0, 8);
    g.add(trunk);
    // крона: 4 скрещенные плоскости с листвой
    const crownR = (1.5 + rnd() * 0.9) * s;
    const cy = th + crownR * 0.45;
    for (let i = 0; i < 4; i++) {
      const pl = new T.Mesh(new T.PlaneGeometry(crownR * 2, crownR * 2), foliageMat);
      pl.position.set(0, cy, 0);
      pl.rotation.y = (Math.PI / 4) * i + rnd() * 0.4;
      pl.rotation.x = (rnd() - 0.5) * 0.25;
      pl.castShadow = true;
      g.add(pl);
    }
    // горизонтальная "шапка"
    const cap = new T.Mesh(new T.PlaneGeometry(crownR * 1.9, crownR * 1.9), foliageMat);
    cap.position.set(0, cy + crownR * 0.35, 0);
    cap.rotation.x = -Math.PI / 2 + (rnd() - 0.5) * 0.3;
    cap.castShadow = true;
    g.add(cap);
    const y = hillH(x, z) - 0.3;
    g.position.set(x, y, z);
    g.rotation.y = rnd() * Math.PI * 2;
    scene.add(g);
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function buildForest(scene) {
    // деревья на участке
    tree(scene, -8.5, -7.5, 1.6, 11); tree(scene, 9.0, -6.5, 1.3, 12);
    tree(scene, -9.5, 6.0, 1.25, 13); tree(scene, 8.5, 7.5, 1.5, 14);
    tree(scene, -12.8, 0.5, 1.9, 15); tree(scene, 13.0, -2.5, 1.7, 16);
    // кольцо леса вокруг
    const rnd = mulberry(99);
    for (let i = 0; i < 90; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 26 + rnd() * 62;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (Math.abs(x) < 17 && Math.abs(z) < 15) continue;
      tree(scene, x, z, 1.2 + rnd() * 1.6, 1000 + i);
    }
    // кусты у дома
    const bushMat = mat(0x527a45);
    for (const b of [[-4.2, 5.2], [1.2, 5.2], [5.8, 2.0], [-5.9, -2.5], [5.9, -4.8], [3.5, 5.4]]) {
      const bs = sph(0.5, bushMat, b[0], 0.05, b[1]);
      scene.add(bs);
      scene.add(sph(0.35, mat(0x639454), b[0] + 0.5, 0.0, b[1] + 0.3));
    }
  }

  // ---- Окружение: небо, свет -----------------------------------
  function buildEnvironment(scene, renderer) {
    const skyTex = tex('sky.jpg', 1, 1);
    skyTex.wrapS = T.ClampToEdgeWrapping;
    skyTex.wrapT = T.ClampToEdgeWrapping;
    const sky = new T.Mesh(
      new T.SphereGeometry(190, 32, 20),
      new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false })
    );
    sky.position.y = -6;
    scene.add(sky);
    scene.fog = new T.Fog(0xdde8ef, 70, 185);

    const hemi = new T.HemisphereLight(0xcfe5f5, 0x8f887a, 0.5);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff2dd, 0.95);
    sun.position.set(24, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
    sun.shadow.camera.far = 110;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    const amb = new T.AmbientLight(0xffffff, 0.07);
    scene.add(amb);

    const pts = [
      [-2.4, 2.55, 0.8, 0.42], [2.9, 2.55, 0.2, 0.4],
      [-2.5, 5.55, 1.2, 0.4], [2.6, 5.55, 0.4, 0.4],
      [-3.0, 2.55, -3.0, 0.28],
    ];
    for (const p of pts) {
      const l = new T.PointLight(0xfff2e2, p[3], 8.5);
      l.position.set(p[0], p[1], p[2]);
      scene.add(l);
    }
  }

  window.MotionHouse = { buildHouse: buildHouse, buildEnvironment: buildEnvironment, hillH: hillH };
})();
