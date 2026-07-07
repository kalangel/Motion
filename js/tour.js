/* ============================================================
   tour.js — движок 3D-тура
   Режимы:
     orbit — облёт всего дома снаружи (колесо: ближе/дальше)
     walk  — прогулка внутри от первого лица (клик по полу — шаг,
             колесо — зум; отдаление до упора = вылет за окно)
     pano  — реальная 360°-фотография комнаты
   ============================================================ */
(function () {
  'use strict';

  const T = THREE;
  const EYE = 1.55;

  const tour = {
    mode: 'orbit',
    container: null,
    renderer: null, scene: null, camera: null,
    house: null,
    // walk
    yaw: 0, pitch: 0, fov: 65,
    pos: new T.Vector3(),
    curFloor: 0,
    glide: null,
    // orbit
    orbit: { theta: 0.7, phi: 1.15, radius: 19, target: new T.Vector3(0, 2.6, 0) },
    autoRotate: true,
    // transition
    flight: null,
    // pano
    panoSphere: null, panoLoaded: false, panoRoom: null,
    prevWalk: null,
    // escape-by-zoom
    escape: 0,
    // ui
    markers: [], panoMarker: null, reticle: null,
    raycaster: new T.Raycaster(),
    pointer: { down: false, moved: false, x: 0, y: 0, id: -1 },
    pinch: null,
    cutaway: false,
    listeners: {},
  };

  function emit(name, detail) {
    (tour.listeners[name] || []).forEach(function (f) { f(detail); });
  }
  function on(name, f) {
    (tour.listeners[name] = tour.listeners[name] || []).push(f);
  }

  const EASE = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  // ---------- маркеры-спрайты ----------
  function labelSprite(text, opts) {
    opts = opts || {};
    const cv = document.createElement('canvas');
    const scale = 4;
    const font = (opts.size || 30) * scale;
    const ctx = cv.getContext('2d');
    ctx.font = '600 ' + font + 'px "Golos Text", Arial, sans-serif';
    const w = ctx.measureText(text).width + 34 * scale;
    cv.width = w; cv.height = 62 * scale;
    const c2 = cv.getContext('2d');
    c2.font = '600 ' + font + 'px "Golos Text", Arial, sans-serif';
    const r = 30 * scale;
    c2.fillStyle = opts.bg || 'rgba(16,18,24,0.82)';
    c2.beginPath();
    c2.moveTo(r, 0); c2.arcTo(w, 0, w, 62 * scale, r); c2.arcTo(w, 62 * scale, 0, 62 * scale, r);
    c2.arcTo(0, 62 * scale, 0, 0, r); c2.arcTo(0, 0, w, 0, r);
    c2.fill();
    c2.strokeStyle = opts.border || 'rgba(199,161,90,0.9)';
    c2.lineWidth = 2.5 * scale;
    c2.stroke();
    c2.fillStyle = opts.color || '#f5efdf';
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(text, w / 2, 33 * scale);
    const tex = new T.CanvasTexture(cv);
    tex.minFilter = T.LinearFilter;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const aspect = w / (62 * scale);
    const hgt = opts.height || 0.55;
    sp.scale.set(hgt * aspect, hgt, 1);
    sp.renderOrder = 999;
    return sp;
  }

  // ---------- инициализация ----------
  function init(container) {
    tour.container = container;
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    tour.renderer = renderer;

    const scene = new T.Scene();
    tour.scene = scene;
    const camera = new T.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.05, 300);
    camera.rotation.order = 'YXZ';
    tour.camera = camera;

    MotionHouse.buildEnvironment(scene, renderer);
    tour.house = MotionHouse.buildHouse(scene);

    // маркеры комнат (видны в режиме облёта)
    tour.house.rooms.forEach(function (room) {
      const sp = labelSprite(room.name, { height: 0.72 });
      sp.position.copy(room.pos).add(new T.Vector3(0, 2.1, 0));
      sp.userData.room = room;
      scene.add(sp);
      tour.markers.push(sp);
    });

    // маркер 360°-фото в кабинете
    const office = tour.house.rooms.find(function (r) { return r.id === 'office'; });
    const pm = labelSprite('360° фото', { height: 0.42, bg: 'rgba(199,161,90,0.92)', color: '#141414', border: 'rgba(255,255,255,0.85)' });
    pm.position.copy(office.pos).add(new T.Vector3(-0.7, EYE + 0.35, -0.6));
    scene.add(pm);
    tour.panoMarker = pm;
    tour.panoRoom = office;

    // прицел-кольцо для перемещения
    const ring = new T.Mesh(
      new T.RingGeometry(0.16, 0.24, 32),
      new T.MeshBasicMaterial({ color: 0xc7a15a, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 998;
    scene.add(ring);
    const dot = new T.Mesh(
      new T.CircleGeometry(0.06, 24),
      new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
    );
    dot.rotation.x = -Math.PI / 2;
    ring.add(dot.clone().translateZ ? dot : dot); // keep simple
    dot.position.set(0, 0, 0.001);
    ring.add(dot);
    tour.reticle = ring;

    // сфера 360°-панорамы (текстура грузится при первом входе)
    const panoGeo = new T.SphereGeometry(6, 48, 32);
    panoGeo.scale(-1, 1, 1);
    const panoMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
    const pano = new T.Mesh(panoGeo, panoMat);
    pano.visible = false;
    pano.renderOrder = 1000;
    scene.add(pano);
    tour.panoSphere = pano;

    bindEvents();
    applyOrbitCamera();
    animate();
    emit('mode', tour.mode);
    return api;
  }

  // ---------- камеры режимов ----------
  function applyOrbitCamera() {
    const o = tour.orbit;
    const sp = Math.sin(o.phi), cp = Math.cos(o.phi);
    tour.camera.position.set(
      o.target.x + o.radius * sp * Math.sin(o.theta),
      o.target.y + o.radius * cp,
      o.target.z + o.radius * sp * Math.cos(o.theta)
    );
    tour.camera.lookAt(o.target);
  }
  function applyWalkCamera() {
    tour.camera.position.copy(tour.pos);
    tour.camera.rotation.set(tour.pitch, tour.yaw, 0);
    tour.camera.fov = tour.fov;
    tour.camera.updateProjectionMatrix();
  }
  function lookDir() {
    const d = new T.Vector3();
    tour.camera.getWorldDirection(d);
    return d;
  }
  function syncOrbitFromCamera() {
    const o = tour.orbit;
    const off = tour.camera.position.clone().sub(o.target);
    o.radius = off.length();
    o.phi = Math.acos(Math.max(-1, Math.min(1, off.y / o.radius)));
    o.theta = Math.atan2(off.x, off.z);
  }
  function syncWalkFromCamera() {
    tour.pos.copy(tour.camera.position);
    const d = lookDir();
    tour.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    tour.yaw = Math.atan2(-d.x, -d.z);
  }

  // ---------- полёты ----------
  function fly(points, lookFrom, lookTo, dur, endFn) {
    tour.flight = {
      curve: new T.CatmullRomCurve3(points, false, 'catmullrom', 0.6),
      lookFrom: lookFrom, lookTo: lookTo,
      t0: performance.now(), dur: dur, end: endFn,
      fovFrom: tour.camera.fov, fovTo: 62,
    };
    tour.mode = 'transition';
    emit('mode', 'transition');
    setGlassGhost(true);
  }
  function setGlassGhost(ghost) {
    // во время пролёта через окно стекло почти исчезает
    tour.house.windows.forEach(function (w) {
      w.glass.material.opacity = ghost ? 0.04 : 0.38;
    });
  }

  function nearestWindow() {
    let best = null, bd = 1e9;
    tour.house.windows.forEach(function (w) {
      if (Math.abs(w.center.y - (tour.pos.y - EYE + 1.7)) > 2.2) return; // окна своего этажа
      const d = w.center.distanceTo(tour.pos);
      if (d < bd) { bd = d; best = w; }
    });
    return best || tour.house.windows[0];
  }

  function flyOut() {
    if (tour.mode === 'pano') { exitPano(); return; }
    if (tour.mode !== 'walk') return;
    const w = nearestWindow();
    const inPt = w.center.clone().sub(w.normal.clone().multiplyScalar(1.4));
    inPt.y = w.center.y;
    const outPt = w.center.clone().add(w.normal.clone().multiplyScalar(3.2));
    outPt.y = w.center.y + 0.8;
    const dir = w.normal.clone().add(new T.Vector3(0, 0, 0)).normalize();
    const farPt = tour.orbit.target.clone().add(dir.multiplyScalar(17));
    farPt.y = 10.5;
    const look0 = tour.camera.position.clone().add(lookDir().multiplyScalar(6));
    fly([tour.pos.clone(), inPt, outPt, farPt], look0, tour.orbit.target.clone(), 2600, function () {
      tour.mode = 'orbit';
      tour.camera.fov = 62; tour.camera.updateProjectionMatrix();
      tour.camera.lookAt(tour.orbit.target);
      syncOrbitFromCamera();
      setGlassGhost(false);
      tour.autoRotate = false;
      emit('mode', 'orbit');
    });
    emit('escape', 0);
  }

  function flyIn(room) {
    const w = tour.house.windows[room.win];
    const outPt = w.center.clone().add(w.normal.clone().multiplyScalar(3.4));
    outPt.y = w.center.y + 0.6;
    const inPt = w.center.clone().sub(w.normal.clone().multiplyScalar(1.2));
    inPt.y = room.pos.y + EYE;
    const endPos = room.pos.clone(); endPos.y = room.pos.y + EYE;
    const look0 = tour.mode === 'orbit' ? tour.orbit.target.clone() : tour.camera.position.clone().add(lookDir().multiplyScalar(6));
    const lookEnd = room.look ? room.look.clone() : endPos.clone().sub(w.normal.clone().multiplyScalar(4));
    if (tour.cutaway) setCutaway(false);
    fly([tour.camera.position.clone(), outPt, inPt, endPos], look0, lookEnd, 2400, function () {
      tour.mode = 'walk';
      tour.curFloor = room.floor;
      tour.pos.copy(endPos);
      tour.fov = 65;
      syncWalkFromCamera();
      applyWalkCamera();
      setGlassGhost(false);
      emit('mode', 'walk');
    });
  }

  // ---------- 360°-панорама ----------
  function enterPano() {
    const room = tour.panoRoom;
    const center = room.pos.clone(); center.y = room.pos.y + EYE;
    function activate() {
      tour.panoSphere.position.copy(center);
      tour.panoSphere.visible = true;
      tour.prevWalk = { pos: tour.pos.clone(), yaw: tour.yaw, pitch: tour.pitch, floor: tour.curFloor };
      tour.pos.copy(center);
      tour.curFloor = room.floor;
      tour.mode = 'pano';
      tour.fov = 72;
      emit('mode', 'pano');
      // плавное проявление
      const t0 = performance.now();
      (function fade() {
        const k = Math.min(1, (performance.now() - t0) / 500);
        tour.panoSphere.material.opacity = k;
        if (k < 1) requestAnimationFrame(fade);
      })();
    }
    if (tour.panoLoaded) { activate(); return; }
    emit('loadingPano', true);
    new T.TextureLoader().load('assets/pano.jpg', function (tex) {
      tex.encoding = T.sRGBEncoding;
      tex.minFilter = T.LinearFilter;
      tour.panoSphere.material.map = tex;
      tour.panoSphere.material.color.set(0xffffff);
      tour.panoSphere.material.needsUpdate = true;
      tour.panoSphere.rotation.y = Math.PI * 0.9; // окно фото ~на юг
      tour.panoLoaded = true;
      emit('loadingPano', false);
      activate();
    });
  }
  function exitPano() {
    const t0 = performance.now();
    (function fade() {
      const k = Math.min(1, (performance.now() - t0) / 400);
      tour.panoSphere.material.opacity = 1 - k;
      if (k < 1) requestAnimationFrame(fade);
      else {
        tour.panoSphere.visible = false;
        if (tour.prevWalk) {
          tour.pos.copy(tour.prevWalk.pos);
          tour.curFloor = tour.prevWalk.floor;
        }
        tour.mode = 'walk';
        tour.fov = 65;
        emit('mode', 'walk');
      }
    })();
  }

  // ---------- разрез (dollhouse) ----------
  function setCutaway(v) {
    tour.cutaway = v;
    tour.house.roofGroup.visible = !v;
    emit('cutaway', v);
  }

  // ---------- перемещение по клику ----------
  function walkables() {
    return tour.house.walkables.map(function (w) { return w.mesh; });
  }
  function floorOfMesh(mesh) {
    const rec = tour.house.walkables.find(function (w) { return w.mesh === mesh; });
    return rec ? rec.floor : 0;
  }
  function clampInside(p) {
    const b = tour.house.bounds;
    p.x = Math.max(b.x0, Math.min(b.x1, p.x));
    p.z = Math.max(b.z0, Math.min(b.z1, p.z));
    return p;
  }
  function startGlide(target, floor) {
    const F = tour.house.floors;
    const from = tour.pos.clone();
    const pts = [from];
    const fromFloor = tour.curFloor;
    // между этажами — через лестницу
    if (Math.round(floor) !== Math.round(fromFloor) && floor !== 0.5 && fromFloor !== 0.5) {
      const s = tour.house.stair;
      const b = s.bottom.clone(); b.y += EYE;
      const m = s.mid.clone(); m.y += EYE;
      const tp = s.top.clone(); tp.y += EYE;
      if (floor > fromFloor) pts.push(b, m, tp);
      else pts.push(tp, m, b);
    } else {
      // через дверной проём, если пересекаем внутреннюю стену
      const lvl = F[Math.round(fromFloor)];
      if (lvl && Math.sign(from.x - lvl.wallX) !== Math.sign(target.x - lvl.wallX)) {
        const doorZ = (lvl.doorZ[0] + lvl.doorZ[1]) / 2;
        pts.push(new T.Vector3(lvl.wallX, from.y, doorZ));
      }
    }
    pts.push(target);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    tour.glide = {
      curve: new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.2),
      t0: performance.now(),
      dur: Math.max(500, Math.min(3200, len * 420)),
      floor: floor === 0.5 ? fromFloor : floor,
    };
  }

  function pickWalkTarget(clientX, clientY) {
    setPointerRay(clientX, clientY);
    const hits = tour.raycaster.intersectObjects(walkables());
    if (!hits.length) return null;
    const h = hits[0];
    const sh = tour.house.stairHole;
    const p = clampInside(h.point.clone());
    const f = floorOfMesh(h.object);
    // не телепортируемся в проём лестницы на 2 этаже
    if (f === 1 && p.x > sh.x0 && p.x < sh.x1 && p.z > sh.z0 && p.z < sh.z1) return null;
    const floorY = f === 0.5 ? h.point.y : tour.house.floors[f].y;
    return { point: new T.Vector3(p.x, floorY + EYE, p.z), floor: f, surfaceY: h.point.y };
  }
  function setPointerRay(clientX, clientY) {
    const r = tour.container.getBoundingClientRect();
    const v = new T.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    tour.raycaster.setFromCamera(v, tour.camera);
  }

  // ---------- события ----------
  function bindEvents() {
    const el = tour.renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', function (e) {
      tour.autoRotate = false;
      if (tour.pinch) return;
      tour.pointer.down = true; tour.pointer.moved = false;
      tour.pointer.x = e.clientX; tour.pointer.y = e.clientY; tour.pointer.id = e.pointerId;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', function (e) {
      if (tour.mode === 'transition') return;
      if (!tour.pointer.down || e.pointerId !== tour.pointer.id) {
        if (tour.mode === 'walk') updateReticle(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - tour.pointer.x, dy = e.clientY - tour.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) tour.pointer.moved = true;
      tour.pointer.x = e.clientX; tour.pointer.y = e.clientY;
      if (tour.mode === 'orbit') {
        tour.orbit.theta -= dx * 0.005;
        tour.orbit.phi = Math.max(0.12, Math.min(1.5, tour.orbit.phi - dy * 0.004));
        applyOrbitCamera();
      } else if (tour.mode === 'walk' || tour.mode === 'pano') {
        const k = tour.fov / 65;
        tour.yaw += dx * 0.0034 * k;
        tour.pitch = Math.max(-1.45, Math.min(1.45, tour.pitch + dy * 0.0034 * k));
        applyWalkCamera();
      }
    });

    el.addEventListener('pointerup', function (e) {
      if (e.pointerId !== tour.pointer.id) return;
      tour.pointer.down = false;
      if (tour.pointer.moved || tour.mode === 'transition') return;
      // клик
      if (tour.mode === 'orbit') {
        setPointerRay(e.clientX, e.clientY);
        const hit = tour.raycaster.intersectObjects(tour.markers)[0];
        if (hit) flyIn(hit.object.userData.room);
      } else if (tour.mode === 'walk') {
        setPointerRay(e.clientX, e.clientY);
        const pm = tour.raycaster.intersectObject(tour.panoMarker)[0];
        if (pm && tour.pos.distanceTo(tour.panoMarker.position) < 7) { enterPano(); return; }
        const t = pickWalkTarget(e.clientX, e.clientY);
        if (t) startGlide(t.point, t.floor);
      }
    });

    // масштабирование колесом
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      tour.autoRotate = false;
      handleZoom(e.deltaY > 0 ? 1 : -1, Math.min(3, Math.abs(e.deltaY) / 53));
    }, { passive: false });

    // pinch на тач-устройствах
    const touches = {};
    el.addEventListener('touchstart', function (e) {
      for (const t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
      if (e.touches.length === 2) {
        tour.pinch = { d: touchDist(e), fov: tour.fov, radius: tour.orbit.radius };
        tour.pointer.down = false;
      }
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (tour.pinch && e.touches.length === 2) {
        const k = touchDist(e) / tour.pinch.d;
        if (tour.mode === 'orbit') {
          tour.orbit.radius = Math.max(6.5, Math.min(42, tour.pinch.radius / k));
          applyOrbitCamera();
        } else if (tour.mode === 'walk' || tour.mode === 'pano') {
          setFov(tour.pinch.fov / k);
          if (tour.fov >= maxFov() - 0.01 && k < 0.97) bumpEscape(0.05);
        }
      }
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      for (const t of e.changedTouches) delete touches[t.identifier];
      if (e.touches.length < 2) tour.pinch = null;
    }, { passive: true });
    function touchDist(e) {
      const a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    window.addEventListener('resize', function () {
      const c = tour.container;
      tour.camera.aspect = c.clientWidth / c.clientHeight;
      tour.camera.updateProjectionMatrix();
      tour.renderer.setSize(c.clientWidth, c.clientHeight);
    });

    // клавиатура: WASD/стрелки — шаг, Esc — наружу/выход из панорамы
    window.addEventListener('keydown', function (e) {
      if (tour.mode === 'pano' && e.key === 'Escape') { exitPano(); return; }
      if (tour.mode !== 'walk') return;
      const step = 1.0;
      const dir = lookDir(); dir.y = 0; dir.normalize();
      const right = new T.Vector3(-dir.z, 0, dir.x);
      let mv = null;
      if (e.key === 'w' || e.key === 'ц' || e.key === 'ArrowUp') mv = dir;
      if (e.key === 's' || e.key === 'ы' || e.key === 'ArrowDown') mv = dir.clone().negate();
      if (e.key === 'a' || e.key === 'ф' || e.key === 'ArrowLeft') mv = right.clone().negate();
      if (e.key === 'd' || e.key === 'в' || e.key === 'ArrowRight') mv = right;
      if (!mv) return;
      const target = clampInside(tour.pos.clone().add(mv.multiplyScalar(step)));
      target.y = tour.house.floors[Math.round(tour.curFloor)].y + EYE;
      startGlide(target, tour.curFloor);
    });
  }

  function maxFov() { return tour.mode === 'pano' ? 95 : 85; }

  function handleZoom(dir, mag) {
    mag = mag || 1;
    if (tour.mode === 'orbit') {
      tour.orbit.radius = Math.max(6.5, Math.min(42, tour.orbit.radius * (dir > 0 ? 1 + 0.09 * mag : 1 - 0.09 * mag)));
      applyOrbitCamera();
    } else if (tour.mode === 'walk' || tour.mode === 'pano') {
      if (dir > 0 && tour.fov >= maxFov() - 0.01) { bumpEscape(0.34 * mag); return; }
      tour.escape = 0; emit('escape', 0);
      setFov(tour.fov + dir * 4.5 * mag);
    }
  }
  function setFov(v) {
    tour.fov = Math.max(28, Math.min(maxFov(), v));
    tour.camera.fov = tour.fov;
    tour.camera.updateProjectionMatrix();
  }
  // «отдаление до упора» → вылет наружу
  function bumpEscape(amount) {
    tour.escape += amount;
    emit('escape', Math.min(1, tour.escape));
    if (tour.escape >= 1) {
      tour.escape = 0;
      flyOut();
    }
  }

  function updateReticle(cx, cy) {
    const t = pickWalkTarget(cx, cy);
    if (t) {
      tour.reticle.position.set(t.point.x, t.surfaceY + 0.02, t.point.z);
      tour.reticle.visible = true;
    } else {
      tour.reticle.visible = false;
    }
  }

  // ---------- цикл ----------
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();

    if (tour.flight) {
      const f = tour.flight;
      const k = EASE(Math.min(1, (now - f.t0) / f.dur));
      tour.camera.position.copy(f.curve.getPoint(k));
      const look = f.lookFrom.clone().lerp(f.lookTo, EASE(Math.min(1, k * 1.25)));
      tour.camera.lookAt(look);
      tour.camera.fov = f.fovFrom + (f.fovTo - f.fovFrom) * k;
      tour.camera.updateProjectionMatrix();
      if (k >= 1) { const end = f.end; tour.flight = null; end(); }
    } else if (tour.mode === 'orbit') {
      if (tour.autoRotate) {
        tour.orbit.theta += 0.0021;
        applyOrbitCamera();
      }
    } else if (tour.mode === 'walk' || tour.mode === 'pano') {
      if (tour.glide) {
        const g = tour.glide;
        const k = EASE(Math.min(1, (now - g.t0) / g.dur));
        tour.pos.copy(g.curve.getPoint(k));
        if (k >= 1) { tour.curFloor = g.floor; tour.glide = null; }
        if (tour.mode === 'pano') tour.panoSphere.position.copy(tour.pos);
      }
      applyWalkCamera();
    }

    // маркеры видны только в облёте (и 360-маркер — на прогулке)
    const showRoomMarkers = tour.mode === 'orbit' || (tour.mode === 'transition');
    tour.markers.forEach(function (m) { m.visible = showRoomMarkers; });
    tour.panoMarker.visible = tour.mode === 'walk' && tour.curFloor === 1;
    if (tour.mode !== 'walk') tour.reticle.visible = false;

    tour.renderer.render(tour.scene, tour.camera);
  }

  // ---------- публичный API ----------
  const api = {
    init: init,
    on: on,
    mode: function () { return tour.mode; },
    goWalk: function () {
      if (tour.mode === 'orbit') flyIn(tour.house.rooms[0]);
      else if (tour.mode === 'pano') exitPano();
    },
    goOrbit: function () {
      if (tour.mode === 'walk') flyOut();
      else if (tour.mode === 'pano') { exitPano(); setTimeout(flyOut, 450); }
    },
    goPano: function () {
      if (tour.mode === 'pano') return;
      if (tour.mode === 'walk') {
        // подойти в кабинет и включить панораму
        const r = tour.panoRoom;
        if (tour.curFloor === r.floor && tour.pos.distanceTo(new T.Vector3(r.pos.x, r.pos.y + EYE, r.pos.z)) < 2.5) {
          enterPano();
        } else {
          const target = r.pos.clone(); target.y += EYE;
          startGlide(target, r.floor);
          const wait = setInterval(function () {
            if (!tour.glide) { clearInterval(wait); enterPano(); }
          }, 120);
        }
      } else if (tour.mode === 'orbit') {
        flyIn(tour.panoRoom);
        const wait = setInterval(function () {
          if (tour.mode === 'walk') { clearInterval(wait); enterPano(); }
        }, 150);
      }
    },
    enterRoom: flyIn,
    toggleCutaway: function () { setCutaway(!tour.cutaway); },
    cutawayOn: function () { return tour.cutaway; },
    zoom: function (dir) { handleZoom(dir, 1.4); },
    rooms: function () { return tour.house.rooms; },
    _setOrbit: function (theta, phi, radius) {
      tour.autoRotate = false;
      tour.mode = 'orbit';
      tour.orbit.theta = theta; tour.orbit.phi = phi; tour.orbit.radius = radius;
      applyOrbitCamera();
    },
  };
  window.MotionTour = api;
})();
