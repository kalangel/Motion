/* ============================================================
   house.js — процедурная модель двухэтажного дома
   Резиденция «Сосновый берег» — демо-объект для 3D-тура
   ============================================================ */
(function () {
  'use strict';

  const T = THREE;

  // ---- Палитра ------------------------------------------------
  const C = {
    wallOut:   0xe8e2d4,
    wallIn:    0xf4f1ea,
    woodCeil:  0xb9885a,
    woodFloor: 0x8f6b49,
    carpet:    0xb7bcbe,
    roof:      0x545962,
    frame:     0xfaf8f4,
    glass:     0xaed4e6,
    doorWood:  0x7a4f2a,
    grass:     0x74a35e,
    path:      0xc9c2b4,
    trunk:     0x6d4c33,
    leaf:      0x4e7d43,
    hedge:     0x5c8a4e,
    sofa:      0x5a6f8f,
    fabric:    0xd8d2c4,
    dark:      0x2e2e33,
    metal:     0x8b8f94,
    kitchen:   0x69707a,
    counterTop:0xe9e6df,
    bedSheet:  0xe6e1d3,
    accent:    0xc7a15a,
  };

  const mats = {};
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!mats[key]) {
      mats[key] = new T.MeshPhongMaterial(Object.assign({ color: color, shininess: 6, specular: 0x0a0a0a }, opts || {}));
    }
    return mats[key];
  }
  const glassMat = new T.MeshPhongMaterial({
    color: 0x7fb0c9, transparent: true, opacity: 0.38,
    shininess: 120, specular: 0xffffff, side: T.DoubleSide, depthWrite: false,
  });

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
  const X0 = -5, X1 = 5, Z0 = -4, Z1 = 4;   // внешний контур
  const WT = 0.24;                           // толщина наружных стен
  const F0 = 0.15;                           // пол 1 этажа (верх плиты)
  const H1 = 2.95;                           // верх стен 1 этажа == низ перекрытия
  const F1 = 3.27;                           // пол 2 этажа (верх ковра)
  const SLAB = 0.30;                         // перекрытие 2.95..3.25 (+ковер 0.02)
  const TOP = 6.05;                          // верх стен 2 этажа
  const RIDGE = 8.15;                        // конёк крыши

  // ---- Стены с проёмами ---------------------------------------
  // axis: 'x' → стена вдоль X при z=fixed; 'z' → вдоль Z при x=fixed
  // openings: [{from,to,sill,head}] — координаты вдоль стены (мировые)
  function wallRun(group, axis, fixed, from, to, yBot, yTop, thick, material, openings) {
    openings = (openings || []).slice().sort((a, b) => a.from - b.from);
    const segs = [];
    let cur = from;
    // кластеры вертикально выровненных проёмов (одинаковый диапазон)
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

  // Окно: рама + стекло + подоконник
  function windowUnit(group, axis, fixed, from, to, sill, head, windows) {
    const w = to - from, h = head - sill;
    const cx = (from + to) / 2, cy = (sill + head) / 2;
    const fw = 0.07;
    const frame = new T.Group();
    const fmat = mat(C.frame);
    // рама по периметру + импост
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
    // стекло
    const g = axis === 'x'
      ? box(w - fw * 2, h - fw * 2, 0.02, glassMat, cx, cy, fixed)
      : box(0.02, h - fw * 2, w - fw * 2, glassMat, fixed, cy, cx);
    g.castShadow = false;
    frame.add(g);
    // подоконник
    const s = axis === 'x'
      ? box(w + 0.16, 0.05, WT + 0.14, mat(C.frame), cx, sill - 0.025, fixed)
      : box(WT + 0.14, 0.05, w + 0.16, mat(C.frame), fixed, sill - 0.025, cx);
    frame.add(s);
    group.add(frame);

    // нормаль наружу
    let normal;
    if (axis === 'x') normal = new T.Vector3(0, 0, fixed > 0 ? 1 : -1);
    else normal = new T.Vector3(fixed > 0 ? 1 : -1, 0, 0);
    const center = axis === 'x' ? new T.Vector3(cx, cy, fixed) : new T.Vector3(fixed, cy, cx);
    windows.push({ center: center, normal: normal, width: w, height: h, glass: g });
  }

  // ---- Мебель --------------------------------------------------
  function sofaUnit(x, z, rotY) {
    const g = new T.Group();
    const m = mat(C.sofa);
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
  function chair(x, z, rotY, seatMat) {
    const g = new T.Group();
    const m = seatMat || mat(C.dark);
    g.add(box(0.44, 0.05, 0.44, m, 0, 0.45, 0));
    g.add(box(0.44, 0.5, 0.05, m, 0, 0.72, -0.2));
    for (const s of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(box(0.05, 0.45, 0.05, mat(C.trunk || C.dark), s[0] * 0.18, 0.225, s[1] * 0.18));
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
    g.add(box(1.8, 0.28, 2.1, mat(C.trunk), 0, 0.14, 0));
    g.add(box(1.72, 0.2, 2.0, mat(C.bedSheet), 0, 0.36, 0.02));
    g.add(box(1.8, 0.85, 0.1, mat(C.trunk), 0, 0.42, -1.05));
    g.add(box(0.6, 0.14, 0.4, mat(0xffffff), -0.45, 0.5, -0.75));
    g.add(box(0.6, 0.14, 0.4, mat(0xffffff), 0.45, 0.5, -0.75));
    g.add(box(1.72, 0.08, 0.9, mat(C.accent), 0, 0.48, 0.5));
    g.position.set(x, F1, z); g.rotation.y = rotY || 0;
    return g;
  }
  function wardrobe(x, y, z, rotY, w) {
    const g = new T.Group();
    const width = w || 1.6;
    g.add(box(width, 2.1, 0.6, mat(C.woodCeil), 0, 1.05, 0));
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
    g.add(box(2.6, 0.4, 0.45, mat(C.woodCeil), 0, 0.2, 0));
    g.add(box(1.6, 0.92, 0.06, mat(0x111114), 0, 1.15, 0.02));
    g.add(box(1.5, 0.82, 0.02, mat(0x1e2b3a, { emissive: 0x0d1622 }), 0, 1.15, 0.06));
    g.position.set(x, y, z); g.rotation.y = rotY || 0;
    return g;
  }

  // ---- Сборка дома ---------------------------------------------
  function buildHouse(scene) {
    const house = new T.Group();
    const windows = [];
    const walk = [];      // кликабельные полы
    const roofGroup = new T.Group();

    const wOut = mat(C.wallOut);
    const wIn = mat(C.wallIn);

    // --- фундамент и плита пола 1 этажа
    house.add(box(10.6, 0.35, 8.6, mat(0xb0aca2), 0, -0.1, 0));
    const floor1 = box(9.8, F0, 7.8, mat(C.woodFloor), 0, F0 / 2, 0);
    house.add(floor1); walk.push({ mesh: floor1, floor: 0 });

    // --- наружные стены (единый прогон на 2 этажа)
    // Южная (z=+4): окно гостиной, дверь, окно кухни; 2 этаж: окна спальни и кабинета
    wallRun(house, 'x', Z1 - WT / 2, X0, X1, F0, TOP, WT, wOut, [
      { from: -4.2, to: -2.8, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: -2.1, to: -1.0, sill: F0, head: F0 + 2.15 },          // входная дверь
      { from: 2.3, to: 3.7, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: -4.2, to: -2.8, sill: F1 + 0.9, head: F1 + 2.3 },
      { from: 2.3, to: 3.7, sill: F1 + 0.9, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'x', Z1 - WT / 2, -4.2, -2.8, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'x', Z1 - WT / 2, 2.3, 3.7, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'x', Z1 - WT / 2, -4.2, -2.8, F1 + 0.9, F1 + 2.3, windows);
    windowUnit(house, 'x', Z1 - WT / 2, 2.3, 3.7, F1 + 0.9, F1 + 2.3, windows);

    // Северная (z=-4): окно кухни 1эт, окно кабинета 2эт
    wallRun(house, 'x', Z0 + WT / 2, X0, X1, F0, TOP, WT, wOut, [
      { from: 2.3, to: 3.7, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: 2.3, to: 3.7, sill: F1 + 0.9, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'x', Z0 + WT / 2, 2.3, 3.7, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'x', Z0 + WT / 2, 2.3, 3.7, F1 + 0.9, F1 + 2.3, windows);

    // Западная (x=-5): 2 окна гостиной, окно спальни
    wallRun(house, 'z', X0 + WT / 2, Z0, Z1, F0, TOP, WT, wOut, [
      { from: -2.6, to: -1.2, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: 0.8, to: 2.2, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: 0.8, to: 2.2, sill: F1 + 0.9, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'z', X0 + WT / 2, -2.6, -1.2, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'z', X0 + WT / 2, 0.8, 2.2, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'z', X0 + WT / 2, 0.8, 2.2, F1 + 0.9, F1 + 2.3, windows);

    // Восточная (x=+5): окно кухни, окно кабинета (панорамное шире)
    wallRun(house, 'z', X1 - WT / 2, Z0, Z1, F0, TOP, WT, wOut, [
      { from: -0.7, to: 0.7, sill: F0 + 0.9, head: F0 + 2.3 },
      { from: -0.9, to: 0.9, sill: F1 + 0.8, head: F1 + 2.3 },
    ]);
    windowUnit(house, 'z', X1 - WT / 2, -0.7, 0.7, F0 + 0.9, F0 + 2.3, windows);
    windowUnit(house, 'z', X1 - WT / 2, -0.9, 0.9, F1 + 0.8, F1 + 2.3, windows);

    // --- входная дверь
    const door = new T.Group();
    door.add(box(1.1, 2.15, 0.08, mat(C.doorWood), -1.55, F0 + 1.075, Z1 - WT / 2));
    door.add(box(0.16, 0.04, 0.14, mat(C.accent), -1.15, F0 + 1.05, Z1 - WT / 2));
    house.add(door);

    // --- межэтажное перекрытие (с проёмом лестницы x:-4.8..-1.4, z:-4..-2.8)
    const slabM = mat(C.woodCeil);
    const slab1 = box(9.5, SLAB, 6.4, slabM, 0, H1 + SLAB / 2 - 0.02, 0.55);   // z: -2.65..3.75
    const slab2 = box(6.1, SLAB, 1.25, slabM, 1.7, H1 + SLAB / 2 - 0.02, -3.15); // x: -1.35..4.75
    house.add(slab1, slab2);
    const carpet1 = box(9.5, 0.04, 6.4, mat(C.carpet), 0, H1 + SLAB, 0.55);
    const carpet2 = box(6.1, 0.04, 1.25, mat(C.carpet), 1.7, H1 + SLAB, -3.15);
    house.add(carpet1, carpet2);
    walk.push({ mesh: carpet1, floor: 1 }, { mesh: carpet2, floor: 1 });

    // --- потолок 2 этажа (дерево, как на фото)
    const ceil2 = box(9.8, 0.12, 7.8, mat(C.woodCeil), 0, TOP - 0.06, 0);
    roofGroup.add(ceil2);

    // --- внутренние стены
    // 1 этаж: гостиная | кухня, стена x=0.9, проём z: -0.8..0.8
    wallRun(house, 'z', 0.9, Z0 + WT, Z1 - WT, F0, H1, 0.18, wIn, [
      { from: -0.8, to: 0.8, sill: F0, head: F0 + 2.15 },
    ]);
    // 2 этаж: спальня | кабинет, стена x=0, проём z: 0.5..1.9
    wallRun(house, 'z', 0, Z0 + WT, Z1 - WT, F1 - 0.04, TOP, 0.18, wIn, [
      { from: 0.5, to: 1.9, sill: F1 - 0.04, head: F1 + 2.15 },
    ]);

    // --- лестница (низ x=-4.6 → верх x=-1.6, z: -3.9..-2.9)
    const NSTEP = 14, RISE = (F1 - 0.02 - F0) / NSTEP, DX = 3.0 / NSTEP;
    const stepM = mat(C.woodFloor);
    for (let i = 0; i < NSTEP; i++) {
      const s = box(DX + 0.03, RISE * (i + 1), 0.95, stepM, -4.6 + (i + 0.5) * DX, F0 + RISE * (i + 1) / 2, -3.25);
      house.add(s);
      walk.push({ mesh: s, floor: 0.5 });
    }
    // перила лестницы
    const railM = mat(C.trunk);
    for (let i = 0; i <= 4; i++) {
      const x = -4.5 + i * 0.72;
      const y = F0 + ((x + 4.6) / 3.0) * (F1 - F0);
      house.add(box(0.05, 0.85, 0.05, railM, x, y + 0.42, -2.92));
    }
    const hr = box(3.3, 0.06, 0.07, railM, -3.1, (F0 + F1) / 2 + 0.95, -2.92);
    hr.rotation.z = Math.atan2(F1 - F0, 3.0);
    house.add(hr);
    // ограждение проёма на 2 этаже (вдоль z=-2.8)
    for (let i = 0; i <= 5; i++) {
      house.add(box(0.05, 0.9, 0.05, railM, -4.7 + i * 0.66, F1 + 0.45, -2.78));
    }
    house.add(box(3.5, 0.06, 0.07, railM, -3.05, F1 + 0.93, -2.78));

    // --- терраса у входа
    const porch = new T.Group();
    porch.add(box(3.4, 0.18, 1.6, mat(C.woodFloor), -1.55, 0.06, Z1 + 0.8));
    porch.add(box(3.4, 0.14, 0.5, mat(C.woodFloor), -1.55, -0.05, Z1 + 1.85));
    porch.add(cyl(0.07, 0.07, 2.3, mat(C.frame), -3.05, 1.3, Z1 + 1.45));
    porch.add(cyl(0.07, 0.07, 2.3, mat(C.frame), -0.05, 1.3, Z1 + 1.45));
    porch.add(box(3.6, 0.1, 1.9, mat(C.roof), -1.55, 2.5, Z1 + 0.95));
    house.add(porch);

    // --- крыша (конёк вдоль X при z=0)
    const half = Z1 + 0.6;                       // вылет карниза
    const rise = RIDGE - (TOP - 0.1);
    const slopeLen = Math.sqrt(half * half + rise * rise) + 0.25;
    const ang = Math.atan2(rise, half);
    const roofM = mat(C.roof);
    const r1 = box(11.6, 0.16, slopeLen, roofM, 0, (TOP - 0.1 + RIDGE) / 2, -half / 2);
    r1.rotation.x = -ang;
    const r2 = box(11.6, 0.16, slopeLen, roofM, 0, (TOP - 0.1 + RIDGE) / 2, half / 2);
    r2.rotation.x = ang;
    roofGroup.add(r1, r2);
    // фриз, закрывающий стык стен и кровли
    roofGroup.add(box(10.3, 0.3, 0.14, mat(C.frame), 0, TOP + 0.04, Z1 + 0.02));
    roofGroup.add(box(10.3, 0.3, 0.14, mat(C.frame), 0, TOP + 0.04, -Z1 - 0.02));
    // фронтоны
    const gShape = new T.Shape();
    gShape.moveTo(-Z1, 0); gShape.lineTo(Z1, 0); gShape.lineTo(0, RIDGE - TOP);
    const gGeo = new T.ShapeGeometry(gShape);
    for (const sx of [X0 + 0.06, X1 - 0.06]) {
      const gm = new T.Mesh(gGeo, new T.MeshPhongMaterial({ color: C.wallOut, shininess: 6, specular: 0x0a0a0a, side: T.DoubleSide }));
      gm.position.set(sx, TOP, 0);
      gm.rotation.y = Math.PI / 2;
      gm.castShadow = true; gm.receiveShadow = true;
      roofGroup.add(gm);
    }
    // труба
    roofGroup.add(box(0.7, 1.6, 0.7, mat(0x9a5f43), 2.6, RIDGE - 0.4, -1.2));
    roofGroup.add(box(0.85, 0.12, 0.85, mat(0x6e6862), 2.6, RIDGE + 0.42, -1.2));
    house.add(roofGroup);

    // ---- МЕБЕЛЬ ------------------------------------------------
    // Гостиная (запад, 1 этаж)
    house.add(box(3.4, 0.02, 2.6, mat(0xcfc8b8), -2.4, F0 + 0.011, 0.9));  // ковёр
    house.add(sofaUnit(-2.4, 1.9, Math.PI));
    house.add(table(1.1, 0.6, 0.42, mat(C.woodCeil), mat(C.dark), -2.4, 0.7, F0));
    house.add(tvWall(-2.4, F0, -3.55, 0));
    house.add(floorLamp(-4.3, F0, 3.2));
    house.add(plant(-4.4, F0, -1.6, 1.3));
    house.add(wardrobe(0.55, F0, 3.3, Math.PI, 1.4));

    // Кухня-столовая (восток, 1 этаж)
    const kc = new T.Group();
    kc.add(box(2.8, 0.9, 0.62, mat(C.kitchen), 3.4, F0 + 0.45, -3.55));
    kc.add(box(2.8, 0.05, 0.66, mat(C.counterTop), 3.4, F0 + 0.925, -3.55));
    kc.add(box(0.62, 0.9, 2.2, mat(C.kitchen), 4.55, F0 + 0.45, -2.2));
    kc.add(box(0.66, 0.05, 2.2, mat(C.counterTop), 4.55, F0 + 0.925, -2.2));
    kc.add(box(2.2, 0.7, 0.35, mat(C.kitchen), 3.1, F0 + 2.1, -3.68));   // верхние шкафы
    kc.add(box(0.75, 1.9, 0.7, mat(C.metal), 4.5, F0 + 0.95, 3.4));      // холодильник
    kc.add(box(0.06, 0.22, 0.06, mat(C.metal), 2.6, F0 + 1.06, -3.62));  // смеситель
    kc.add(box(0.05, 0.05, 0.2, mat(C.metal), 2.6, F0 + 1.15, -3.5));
    house.add(kc);
    house.add(table(1.5, 0.9, 0.75, mat(C.woodCeil), mat(C.trunk), 2.8, 0.8, F0));
    house.add(chair(2.3, 0.15, Math.PI / 2 * 0 + 0, null)); // стулья вокруг стола
    house.add(chair(3.3, 0.15, Math.PI, null));
    house.add(chair(2.3, 1.45, 0, null));
    house.add(chair(3.3, 1.45, 0, null));
    // подвесной светильник
    house.add(cyl(0.02, 0.02, 0.5, mat(C.dark), 2.8, H1 - 0.27, 0.8));
    house.add(cyl(0.2, 0.28, 0.22, mat(C.dark, { emissive: 0x443311 }), 2.8, H1 - 0.62, 0.8));

    // Спальня (запад, 2 этаж)
    house.add(box(3.2, 0.02, 2.4, mat(0xcac2b2), -2.6, F1 + 0.011, 1.2)); // ковёр
    house.add(bedUnit(-2.6, 1.6, 0));
    house.add(table(0.5, 0.4, 0.5, mat(C.woodCeil), mat(C.trunk), -3.75, 0.4, F1));
    house.add(table(0.5, 0.4, 0.5, mat(C.woodCeil), mat(C.trunk), -1.45, 0.4, F1));
    house.add(wardrobe(-0.35, F1, 3.35, Math.PI, 1.8));
    house.add(plant(-4.4, F1, 3.3, 1.1));

    // Кабинет (восток, 2 этаж) — как на 360°-фото
    const deskM = mat(0xf0ede6);
    house.add(box(1.7, 0.06, 0.65, deskM, 2.9, F1 + 0.73, 3.25));         // стол у южного окна
    house.add(box(0.65, 0.06, 1.3, deskM, 2.4, F1 + 0.73, 2.6));
    house.add(box(0.06, 0.7, 0.6, deskM, 3.7, F1 + 0.38, 3.25));
    house.add(box(0.06, 0.7, 0.6, deskM, 2.12, F1 + 0.38, 3.25));
    const oc = new T.Group();                                              // кресло
    oc.add(cyl(0.3, 0.3, 0.04, mat(C.dark), 0, 0.04, 0));
    oc.add(cyl(0.04, 0.04, 0.35, mat(C.metal), 0, 0.25, 0));
    oc.add(box(0.5, 0.1, 0.5, mat(C.dark), 0, 0.48, 0));
    oc.add(box(0.5, 0.6, 0.1, mat(C.dark), 0, 0.85, -0.22));
    oc.position.set(2.9, F1, 2.4);
    house.add(oc);
    house.add(wardrobe(3.9, F1, -3.35, 0, 1.9));                           // шкаф (как на фото)
    house.add(fireplace(1.0, F1, -3.6, 0));                                // камин
    // зеркало у стены
    const mir = new T.Group();
    mir.add(box(0.7, 1.7, 0.05, mat(C.woodCeil), 0, 0.85, 0));
    mir.add(box(0.58, 1.58, 0.02, new T.MeshPhongMaterial({ color: 0xcfe4ec, shininess: 100, specular: 0xffffff }), 0, 0.85, 0.03));
    mir.position.set(4.75, F1, -1.8); mir.rotation.y = -Math.PI / 2; mir.rotation.x = -0.06;
    house.add(mir);
    house.add(plant(0.5, F1, 3.4, 1.0));
    // настольная лампа
    house.add(cyl(0.09, 0.11, 0.04, mat(C.dark), 3.3, F1 + 0.78, 3.3));
    house.add(cyl(0.015, 0.015, 0.35, mat(C.dark), 3.3, F1 + 0.95, 3.3));
    house.add(sph(0.07, mat(C.fabric, { emissive: 0x665533 }), 3.3, F1 + 1.13, 3.3));

    // картина над камином
    const pic = new T.Group();
    pic.add(box(0.6, 0.8, 0.04, mat(C.trunk), 0, 0, 0));
    pic.add(box(0.5, 0.7, 0.02, mat(0x8f4b3a), 0, 0, 0.02));
    pic.position.set(1.0, F1 + 1.9, -3.85);
    house.add(pic);

    scene.add(house);

    // ---- УЧАСТОК -----------------------------------------------
    const ground = new T.Mesh(new T.CircleGeometry(46, 48), mat(C.grass));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.27;
    ground.receiveShadow = true;
    scene.add(ground);

    // дорожка
    for (let i = 0; i < 6; i++) {
      const p = box(1.2, 0.06, 0.9, mat(C.path), -1.55, -0.24, Z1 + 2.6 + i * 1.05);
      p.castShadow = false;
      scene.add(p);
    }
    // живая изгородь по периметру
    const hedgeM = mat(C.hedge);
    const HX = 9.5, HZ = 8.5;
    scene.add(box(HX * 2, 0.55, 0.4, hedgeM, 0, 0.05, -HZ));
    scene.add(box(0.4, 0.55, HZ * 2, hedgeM, -HX, 0.05, 0));
    scene.add(box(0.4, 0.55, HZ * 2, hedgeM, HX, 0.05, 0));
    scene.add(box(HX - 2.5, 0.55, 0.4, hedgeM, -(HX / 2 + 2.4), 0.05, HZ));
    scene.add(box(HX - 2.5, 0.55, 0.4, hedgeM, HX / 2 + 2.4, 0.05, HZ));

    // деревья
    function tree(x, z, s) {
      const g = new T.Group();
      g.add(cyl(0.12 * s, 0.18 * s, 1.6 * s, mat(C.trunk), 0, 0.8 * s, 0));
      g.add(sph(0.95 * s, mat(C.leaf), 0, 2.1 * s, 0));
      g.add(sph(0.7 * s, mat(0x5e9450), 0.5 * s, 2.6 * s, 0.2 * s));
      g.add(sph(0.6 * s, mat(0x477a3e), -0.5 * s, 2.5 * s, -0.2 * s));
      g.position.set(x, -0.25, z);
      scene.add(g);
    }
    tree(-8.2, -6.5, 1.5); tree(8.4, -6.0, 1.2); tree(-8.6, 5.5, 1.1);
    tree(7.8, 6.8, 1.4); tree(-12.5, 0.5, 1.8); tree(12.8, -2.5, 1.6);
    tree(3.5, -11.5, 1.7); tree(-4.5, -12.0, 1.3); tree(11.0, 9.5, 1.5);

    // кусты у дома
    for (const b of [[-4.2, 5.2], [1.2, 5.2], [5.8, 2.0], [-5.9, -2.5], [5.9, -4.8]]) {
      scene.add(sph(0.5, hedgeM, b[0], 0.05, b[1]));
      scene.add(sph(0.35, mat(0x6a9a58), b[0] + 0.5, 0.0, b[1] + 0.3));
    }

    // ---- метаданные для движка ----------------------------------
    return {
      group: house,
      roofGroup: roofGroup,
      windows: windows,
      walkables: walk,
      bounds: { x0: X0 + 0.55, x1: X1 - 0.55, z0: Z0 + 0.55, z1: Z1 - 0.55 },
      floors: [
        { y: F0, wallX: 0.9, doorZ: [-0.7, 0.7] },   // 1 этаж: проём в стене x=0.9
        { y: F1, wallX: 0.0, doorZ: [0.6, 1.8] },     // 2 этаж: проём в стене x=0
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

  // ---- Окружение: небо, свет -----------------------------------
  function buildEnvironment(scene, renderer) {
    // небо — градиент на canvas
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 256;
    const ctx = cv.getContext('2d');
    const gr = ctx.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2e63a8');
    gr.addColorStop(0.55, '#7db4dd');
    gr.addColorStop(0.8, '#cfe4ee');
    gr.addColorStop(1, '#eef2ea');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 16, 256);
    const skyTex = new T.CanvasTexture(cv);
    const sky = new T.Mesh(
      new T.SphereGeometry(120, 24, 16),
      new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false })
    );
    scene.add(sky);
    scene.fog = new T.Fog(0xdfe9ee, 60, 118);

    const hemi = new T.HemisphereLight(0xcfe5f5, 0x8f887a, 0.55);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff2dd, 0.95);
    sun.position.set(24, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    const amb = new T.AmbientLight(0xffffff, 0.08);
    scene.add(amb);

    // внутренний свет
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

  window.MotionHouse = { buildHouse: buildHouse, buildEnvironment: buildEnvironment };
})();
