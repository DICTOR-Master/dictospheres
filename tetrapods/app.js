// Drop us a tetrapod (DICTO, 2026-10-14; PLAN-TETRAPODS.md). Three real stretches of the Misaki coast (Osaka Bay), joined, from GSI elevation data,
// with its breakwater blocks taken away: every visit drops a standard tetrapod onto the shore, and each visitor may add 3 more a day of any
// family. Rocks and pines are placed from the terrain. Blocks fall with real gravity and settle on the land, the sea floor and each other; older blocks grow algae.
// The heap is shared through Supabase (Store), and kept on the device when Supabase cannot be reached. DICTO · dictospheres.com
(function () {
  'use strict';
  const T = window.COAST, PHI = (1 + Math.sqrt(5)) / 2;
  const W = T.w, H = T.h, CELL = T.cell, SX = (W - 1) * CELL, SZ = (H - 1) * CELL;
  const raw = atob(T.heights), heights = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { let v = raw.charCodeAt(2 * i) | (raw.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; heights[i] = v / 10; }
  const hAt = (r, c) => heights[Math.max(0, Math.min(H - 1, r)) * W + Math.max(0, Math.min(W - 1, c))];
  const toWorld = (r, c) => [-SX / 2 + c * CELL, hAt(r, c), -SZ / 2 + r * CELL];
  function heightAtXZ(x, z) {
    const c = (x + SX / 2) / CELL, r = (z + SZ / 2) / CELL, c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
    return hAt(r0, c0) * (1 - fc) * (1 - fr) + hAt(r0, c0 + 1) * fc * (1 - fr) + hAt(r0 + 1, c0) * (1 - fc) * fr + hAt(r0 + 1, c0 + 1) * fc * fr;
  }

  // beyond the two ends the coast carries on as its own mirror image (reflected about each end), so the shoreline runs on unbroken
  const reflX = (x) => { const P = 2 * SX; let u = ((x + SX / 2) % P + P) % P; if (u > SX) u = P - u; return u - SX / 2; };
  const groundAt = (x, z) => heightAtXZ(reflX(x), Math.max(-SZ / 2, Math.min(SZ / 2, z)));

  // ---- the families: legs from a centre, seaside style (leg length 2.2 m) ----
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const FAMILIES = {
    tetra: { name: 'Tetrahedral', legs: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(norm), r: 0.34 },
    octa: { name: 'Octahedral', legs: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], r: 0.28 },
    cube: { name: 'Cube corners', legs: [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => norm([a, b, c])))), r: 0.24 },
    // DICTO's Dodeca-13 (filled cluster) takes the 12-arm place: arms along the centre dodecahedron's face normals, edge D13 m
    to5: { name: 'Five truncated octahedra', piece: 'to5' },   // DICTO's tetrapod pieces: each one block that fills space by parallel copies
    rd4: { name: 'Four rhombic dodecahedra', piece: 'rd4' },
    d13: { name: 'DICTO Dodeca-13', legs: [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [[0, a * PHI, b], [a * PHI, b, 0], [b, 0, a * PHI]])).map(norm), r: 0 },
  };
  const LEG = 2.2, D13 = 0.7, D13_IN = D13 * 1.113516;   // dodecahedron inradius = 1.113516 × edge
  const MAX_EXTRAS = 3;

  // ---- storage: on this device for now; Supabase replaces load/add with the same shapes ----
  const KEY = 'dicto-tetrapods-heap-v1', DAYKEY = 'dicto-tetrapods-day-v1';
  const today = () => new Date().toISOString().slice(0, 10);
  // the shared heap lives in Supabase (project "dictospheres", table tetrapods, rules in data/supabase.sql); if it cannot be
  // reached, blocks are kept on this device instead, so the page always works
  const SUPA = { url: 'https://wdprxowinnseoyryfrkt.supabase.co/rest/v1/tetrapods', key: 'sb_publishable_xP_n5QnD1ncEDG0Nha4lbQ_SS2kdHQq' };
  const visitor = (() => { try { let v = localStorage.getItem('dicto-tetrapods-visitor'); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('dicto-tetrapods-visitor', v); } return v; } catch { return 'v' + Math.random().toString(16).slice(2, 14); } })();
  const local = {
    load() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } },
    add(rec) { try { const a = local.load(); a.push(rec); localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage blocked: the block stays for this visit only */ } },
  };
  const fromRow = (r) => ({ id: r.id, f: r.family, p: r.p, q: r.q, t: Date.parse(r.created_at) });
  const Store = {
    shared: false, lastId: 0,
    async load() {   // the newest 600 blocks of the shared heap
      try {
        const res = await fetch(`${SUPA.url}?select=id,created_at,family,p,q&order=id.desc&limit=600`, { headers: { apikey: SUPA.key } });
        if (!res.ok) throw new Error(res.status);
        const rows = (await res.json()).map(fromRow).reverse(); Store.shared = true; Store.lastId = rows.length ? rows[rows.length - 1].id : 0; return rows;
      } catch { Store.shared = false; return local.load(); }
    },
    async count() {   // how many blocks the shared heap holds in all (everyone can see it); null when it cannot be reached
      if (!Store.shared) return null;
      try {
        const res = await fetch(`${SUPA.url}?select=id&limit=1`, { headers: { apikey: SUPA.key, Prefer: 'count=exact' } });
        const m = /\/(\d+)$/.exec(res.headers.get('content-range') || ''); return res.ok && m ? +m[1] : null;
      } catch { return null; }
    },
    async newer() {   // blocks other visitors added since we last looked
      if (!Store.shared) return [];
      try {
        const res = await fetch(`${SUPA.url}?select=id,created_at,family,p,q&id=gt.${Store.lastId}&order=id.asc&limit=100`, { headers: { apikey: SUPA.key } });
        if (!res.ok) return [];
        const rows = (await res.json()).map(fromRow); if (rows.length) Store.lastId = rows[rows.length - 1].id; return rows;
      } catch { return []; }
    },
    async add(rec) {
      if (Store.shared) {
        try {
          const res = await fetch(`${SUPA.url}?select=id`, { method: 'POST', headers: { apikey: SUPA.key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify({ family: rec.f, p: rec.p, q: rec.q, visitor }) });
          if (res.ok) { const [row] = await res.json(); if (row) { mineIds.add(row.id); } return true; }
          return false;
        } catch { /* fall through to this device */ }
      }
      local.add(rec); return true;
    },
    day() { try { const d = JSON.parse(localStorage.getItem(DAYKEY) || 'null'); return d && d.date === today() ? d : { date: today(), auto: false, extras: 0 }; } catch { return { date: today(), auto: false, extras: 0 }; } },
    setDay(d) { try { localStorage.setItem(DAYKEY, JSON.stringify(d)); } catch { /* best effort */ } },
  };
  const mineIds = new Set();   // our own new blocks, so the refresh does not place them twice


  // ---- scene ----
  const canvas = document.getElementById('sea');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd3dc);
  scene.fog = new THREE.Fog(0xbfd3dc, 1000, 3200);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
  const hemi = new THREE.HemisphereLight(0xe8f0f2, 0x3e4a3a, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.15); sun.position.set(-260, 300, -320); scene.add(sun);

  // terrain mesh, coloured by height and slope
  // the terrain mesh at twice the data's resolution, curved smoothly between the data points (Catmull-Rom)
  const UP = 2, FW = (W - 1) * UP + 1, FH = (H - 1) * UP + 1;
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  function hFine(rf, cf) {
    const r0 = Math.floor(rf), c0 = Math.floor(cf), tr = rf - r0, tc = cf - c0, rows = [];
    for (let k = -1; k <= 2; k++) rows.push(cr(hAt(r0 + k, c0 - 1), hAt(r0 + k, c0), hAt(r0 + k, c0 + 1), hAt(r0 + k, c0 + 2), tc));
    return cr(rows[0], rows[1], rows[2], rows[3], tr);
  }
  const tg = new THREE.PlaneGeometry(SX, SZ, FW - 1, FH - 1); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, tcol = new Float32Array(tp.count * 3), col = new THREE.Color();
  const SAND = new THREE.Color(0xcdbb8e), WETSAND = new THREE.Color(0x8f8366), SEABED = new THREE.Color(0x9a9a78), GRASS = new THREE.Color(0x5f7d45), WOOD = new THREE.Color(0x2f4a2c), ROCK = new THREE.Color(0x77736b), TOWN = new THREE.Color(0x9a948a);
  function groundColour(c, y, slope) {   // one colour rule for the real coast and the land around it
    if (y < -0.3) c.copy(SEABED).lerp(WETSAND, Math.max(0, 1 + y / 3));
    else if (y < 1.6) c.copy(WETSAND).lerp(SAND, (y + 0.3) / 1.9);
    else if (slope > 0.55) c.copy(ROCK);
    else if (y < 8 && slope < 0.08) c.copy(TOWN).lerp(GRASS, 0.45);
    else c.copy(GRASS).lerp(WOOD, Math.min(1, (y - 6) / 25));
    return c;
  }
  for (let i = 0; i < tp.count; i++) {
    const cf = (i % FW) / UP, rf = Math.floor(i / FW) / UP, y = hFine(rf, cf); tp.setY(i, y);
    const e = 0.5, slope = Math.hypot(hFine(rf, cf + e) - hFine(rf, cf - e), hFine(rf + e, cf) - hFine(rf - e, cf)) / (2 * e * CELL);
    groundColour(col, y, slope);
    tcol.set([col.r, col.g, col.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  scene.add(terrain);
  // the shore (DICTO 2026-10-21): foam lapping at the waterline as the waves run up and draw back, and glistening wet sand behind it.
  // A thin strip of the terrain round the waterline, drawn by a small shader on the graphics card: the run-up follows the sea's own
  // swell plus a slower surge; foam froths where the water's edge is, lines of it are left behind as the water draws back, and the
  // sand it has just left is darker and twinkles.
  const shoreFoam = (() => {
    const P = tg.attributes.position, idx = tg.index.array, keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      const ys = [P.getY(idx[i]), P.getY(idx[i + 1]), P.getY(idx[i + 2])];
      if (Math.min(...ys) > -0.9 && Math.max(...ys) < 1.4) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', P); g.setIndex(keep);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { t: { value: 0 }, amp: { value: 1 } },
      vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, 0.015, 0.0), 1.0); }',
      fragmentShader: `uniform float t; uniform float amp; varying vec3 vp;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          float sea = amp * (0.25 * sin(vp.x * 0.05 + t * 0.9) + 0.15 * sin(vp.z * 0.08 - t * 0.7));
          float surge = amp * 0.35 * pow(0.5 + 0.5 * sin(t * 0.55 + vp.x * 0.021 + vp.z * 0.013), 2.0);
          float edge = sea + surge;                                   // where the water's edge is now
          float reach = sea + amp * 0.35;                             // how far the last waves ran up
          float d = vp.y - edge;
          float froth = n2(vp.xz * 1.7 + vec2(t * 0.3, -t * 0.2)) * 0.6 + n2(vp.xz * 5.0 - t * 0.5) * 0.4;
          float band = smoothstep(0.16, 0.0, abs(d - 0.04)) * smoothstep(0.25, 0.6, froth);          // the frothing edge
          float lines = (d > 0.0 && vp.y < reach) ? smoothstep(0.55, 0.85, n2(vp.xz * vec2(0.8, 3.2) + 7.0)) * 0.55 * (1.0 - d / max(0.05, reach - edge + 0.3)) : 0.0;
          float wet = (vp.y > edge && vp.y < reach + 0.25) ? 1.0 - smoothstep(reach - 0.05, reach + 0.25, vp.y) : 0.0;
          float glint = wet * step(0.985, h21(floor(vp.xz * 9.0) + floor(t * 3.0))) * 0.9;            // sparkles on the wet sand
          float foam = clamp(band + lines, 0.0, 1.0);
          vec3 c = mix(vec3(0.33, 0.30, 0.24), vec3(0.97, 0.98, 0.96), clamp(foam + glint, 0.0, 1.0));
          float a = max(foam * 0.9, max(wet * 0.32, glint));
          if (vp.y < edge - 0.2 || a < 0.01) discard;
          gl_FragColor = vec4(c, a);
        }`,
    });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 1; scene.add(m); return m;
  })();
  // the sea: a gently moving surface over a much wider area
  // beyond the data: the land carries on to the back line, rising into hills, and the sea floor carries on out to sea.
  // A coarse skirt under and around the terrain, continued from its edges.
  // Its grid lines fall exactly on the terrain's edges, and inside them it drops well below, so it never shows through the real coast.
  const KX = 12000, KZ = 12000;   // 6 km each way, past the haze
  const step = (d) => (d < 700 ? 10 : 40);   // fine near the real coast, coarse far off
  const axis = (half, K) => { const a = []; for (let v = -K / 2; v < -half - 1; v += step(-half - v)) a.push(v); a.push(-half); for (let v = -half + 40; v < half - 1; v += 40) a.push(v); a.push(half); for (let v = half + 10; v <= K / 2; v += step(v - half)) a.push(v); return a; };
  const XS = axis(SX / 2, KX), ZS = axis(SZ / 2, KZ), kpos = [], kidx = [];
  for (const z of ZS) for (const x of XS) kpos.push(x, 0, z);
  for (let j = 0; j + 1 < ZS.length; j++) for (let i = 0; i + 1 < XS.length; i++) { const a0 = j * XS.length + i, b0 = a0 + 1, c0 = a0 + XS.length, d0 = c0 + 1; kidx.push(a0, c0, b0, b0, c0, d0); }
  const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute(kpos, 3)); kg.setIndex(kidx);
  const kp = kg.attributes.position, kcol = new Float32Array(kp.count * 3);
  for (let i = 0; i < kp.count; i++) {
    const x = kp.getX(i), z = kp.getZ(i), cz = Math.max(-SZ / 2, Math.min(SZ / 2, z)), back = Math.max(0, z - SZ / 2);
    let base = groundAt(x, cz);
    if (back > 0) {   // behind, the back edge's heights are smoothed more the further back, so they do not run on as streaks
      const span = Math.min(400, back * 0.6); let sum = 0; for (let k = -4; k <= 4; k++) sum += groundAt(x + k * span / 4, cz); base = base + (sum / 9 - base) * Math.min(1, back / 300);
    }
    let y = base;
    // behind the land: wooded hills rising to ridges, so there is never empty space behind it
    if (base > 0.5 && back > 0) y += Math.min(back, 2500) * 0.09 * (1 + 0.45 * Math.sin(x * 0.0021) * Math.cos(z * 0.0017)) + 18 * Math.sin(x * 0.006 + z * 0.002) * Math.min(1, back / 300) + 7 * Math.sin(x * 0.019 - z * 0.011) * Math.min(1, back / 150);
    if (Math.abs(x) < SX / 2 - 1 && Math.abs(z) < SZ / 2 - 1) y = Math.min(base, 0) - 6;   // under the real terrain
    kp.setY(i, y);
    const e = 6, slope = Math.hypot(groundAt(x + e, cz) - groundAt(x - e, cz), groundAt(x, cz + e) - groundAt(x, cz - e)) / (2 * e);
    groundColour(col, y, back > 0 ? Math.max(slope, 0.1) : slope);
    kcol.set([col.r, col.g, col.b], i * 3);
  }
  kg.setAttribute('color', new THREE.BufferAttribute(kcol, 3)); kg.computeVertexNormals();
  const skirt = new THREE.Mesh(kg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })); scene.add(skirt);
  const sg = new THREE.PlaneGeometry(KX, KZ, 150, 100); sg.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x2f7f8e, roughness: 0.62, metalness: 0.02, transparent: true, opacity: 0.62 }));
  scene.add(sea);
  const seaBase = Float32Array.from(sg.attributes.position.array);
  if (window.Sky) Sky.init({ scene, sun, hemi, sea, camera, ground: groundAt });   // the live sky over Misaki: time of day, moon, weather (sky.js)

  // ---- physics ----
  const world = new CANNON.World(); world.gravity.set(0, -9.82, 0); world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world); world.solver.iterations = 12;
  const mat = new CANNON.Material('concrete');
  world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.6, restitution: 0.05 }));
  // the ground: a height field of the same terrain
  const data = []; for (let c = 0; c < W; c++) { const col2 = []; for (let j = 0; j < H; j++) col2.push(hAt(H - 1 - j, c)); data.push(col2); }
  const ground = new CANNON.Body({ mass: 0, material: mat });
  ground.addShape(new CANNON.Heightfield(data, { elementSize: CELL }));
  ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  ground.position.set(-SX / 2, 0, SZ / 2);
  world.addBody(ground);
  // cannon.js 0.6.2 builds a convex pillar for each height-field cell a block touches and logs a harmless winding warning for each;
  // keep the console clear of them while the world steps
  function stepWorld(dt) { const ce = console.error; console.error = () => {}; try { world.step(1 / 60, dt, 12); } finally { console.error = ce; } }

  // ---- a tetrapod: mesh + body ----
  const ALGAE = new THREE.Color(0x3d7a49), WET = new THREE.Color(0x6d7767), CONCRETE = new THREE.Color(0xd2cec6);
  // concrete: a pale cast surface with aggregate specks and small air pores, mapped flat onto each face; the algae tint sits on top
  const concreteTex = (() => {
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d');
    let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    x.fillStyle = '#e9e6df'; x.fillRect(0, 0, N, N);
    for (let k = 0; k < 9000; k++) { const v = 205 + Math.floor(rnd() * 50); x.fillStyle = `rgb(${v},${v - 2},${v - 6})`; x.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 2, 1 + rnd() * 2); }
    for (let k = 0; k < 420; k++) { const v = 150 + Math.floor(rnd() * 70); x.fillStyle = `rgba(${v},${v - 4},${v - 10},0.8)`; x.beginPath(); x.arc(rnd() * N, rnd() * N, 0.8 + rnd() * 2.2, 0, 6.3); x.fill(); }
    for (let k = 0; k < 160; k++) { x.fillStyle = 'rgba(70,66,60,0.75)'; x.beginPath(); x.arc(rnd() * N, rnd() * N, 0.6 + rnd() * 1.4, 0, 6.3); x.fill(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  })();
  const concrete = () => new THREE.MeshStandardMaterial({ vertexColors: true, map: concreteTex, bumpMap: concreteTex, bumpScale: 0.035, roughness: 0.96, metalness: 0, flatShading: false });
  function boxUV(geo, metres = 1.6) {   // each vertex takes the two coordinates across its normal's main axis
    const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) {
      const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i)), x = P.getX(i) / metres, y = P.getY(i) / metres, z = P.getZ(i) / metres;
      const [u, v] = ax >= ay && ax >= az ? [y, z] : ay >= az ? [x, z] : [x, y]; uv[2 * i] = u; uv[2 * i + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
  }
  const flatCache = {};
  function flatGeometry(key, V, F, scale) {   // flat-shaded triangles from a piece's faces (each face its own corners, so edges stay crisp)
    if (!flatCache[key]) {
      const pos = [];
      for (const f of F) for (let k = 1; k + 1 < f.length; k++) for (const j of [f[0], f[k], f[k + 1]]) pos.push(V[3 * j] * scale, V[3 * j + 1] * scale, V[3 * j + 2] * scale);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); flatCache[key] = boxUV(g);
    }
    return flatCache[key].clone();
  }
  const concreteMat = concrete();   // one material for every block (each block's algae lives in its own vertex colours)
  function merge(geos) {   // several geometries into one (non-indexed), so a block is drawn in one go
    const pos = [], nor = [], uv = [];
    for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  function blockMesh(fam) {
    const F = FAMILIES[fam];
    if (!flatCache[fam]) {
      if (fam === 'd13') flatGeometry('d13', window.DODECA13.v, window.DODECA13.f, D13);
      else if (F.piece) flatGeometry(fam, window.TPIECES[F.piece].v, window.TPIECES[F.piece].f, 1);
      else {   // legs and hub, merged
        const r = F.r * LEG, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), parts = [];
        for (const d of F.legs) {
          const geo = new THREE.CylinderGeometry(r * 0.52, r, LEG, 28, 6).translate(0, LEG / 2, 0);
          geo.applyMatrix4(m4.makeRotationFromQuaternion(q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)))); parts.push(boxUV(geo));
        }
        parts.push(boxUV(new THREE.IcosahedronGeometry(r * 1.05, 3)));
        flatCache[fam] = merge(parts);
      }
    }
    const g = new THREE.Group(), m = new THREE.Mesh(flatCache[fam].clone(), concreteMat); g.add(m);
    return { g, parts: [m] };
  }
  function paint(block, ageYears) {
    const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), c = new THREE.Color(), q = new THREE.Quaternion();
    const age = Math.min(1, ageYears / 3);  // fully mossy after about three years
    for (const m of block.parts) {
      const geo = m.geometry, N = geo.attributes.normal, P = geo.attributes.position, colors = new Float32Array(N.count * 3);
      q.copy(block.g.quaternion).multiply(m.quaternion);
      for (let i = 0; i < N.count; i++) {
        n.set(N.getX(i), N.getY(i), N.getZ(i)).applyQuaternion(q);
        const facing = Math.max(0, n.dot(up)), speck = 0.5 + 0.5 * Math.sin(P.getX(i) * 7.3 + P.getY(i) * 5.1 + P.getZ(i) * 6.7);
        const below = Math.max(0, Math.min(1, (1.2 - block.g.position.y) / 2));  // blocks low by the water green faster
        const a = Math.min(1, age * (0.25 + 0.9 * facing + 0.5 * below) * (0.7 + 0.5 * speck));
        c.copy(CONCRETE).lerp(WET, Math.min(1, age * 0.7)).lerp(ALGAE, a * a);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
  }
  function blockBody(fam, mass) {
    const F = FAMILIES[fam], r = F.r * LEG, b = new CANNON.Body({ mass, material: mat });
    if (fam === 'd13') {   // the centre and the 12 outer dodecahedra as spheres between their in- and circumradius
      b.addShape(new CANNON.Sphere(D13_IN * 1.08));
      for (const d of F.legs) b.addShape(new CANNON.Sphere(D13_IN * 1.08), new CANNON.Vec3(d[0] * 2 * D13_IN, d[1] * 2 * D13_IN, d[2] * 2 * D13_IN));
    } else if (F.piece) {   // DICTO's pieces: one sphere in each cell
      const P = window.TPIECES[F.piece]; for (const c of P.cells) b.addShape(new CANNON.Sphere(P.r), new CANNON.Vec3(...c));
    } else b.addShape(new CANNON.Sphere(r * 1.0));
    if (fam !== 'd13' && !F.piece) for (const d of F.legs) for (const [t, s] of [[0.35, 0.9], [0.65, 0.75], [0.9, 0.58]]) b.addShape(new CANNON.Sphere(r * s), new CANNON.Vec3(d[0] * LEG * t, d[1] * LEG * t, d[2] * LEG * t));
    b.allowSleep = true; b.sleepSpeedLimit = 0.25; b.sleepTimeLimit = 0.8; b.linearDamping = 0.05; b.angularDamping = 0.15;
    return b;
  }
  const blocks = [];   // { rec, block, body, settling, born }
  let yearsAhead = 0;
  function place(rec) {      // a block already on the heap: still
    const block = blockMesh(rec.f); block.g.position.set(...rec.p); block.g.quaternion.set(...rec.q);
    scene.add(block.g); const body = blockBody(rec.f, 0); body.position.set(...rec.p); body.quaternion.set(...rec.q); world.addBody(body);
    const b = { rec, block, body, settling: false }; blocks.push(b); paint(block, ageOf(rec)); return b;
  }
  const ageOf = (rec) => (Date.now() - rec.t) / (365.25 * 864e5) + yearsAhead;
  let mine = null;
  function drop(fam, x, z, welcome = false) {
    const y = Math.max(0, heightAtXZ(x, z)) + 16 + Math.random() * 4;
    const block = blockMesh(fam); scene.add(block.g);
    const body = blockBody(fam, 30); body.position.set(x, y, z);
    body.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    body.angularVelocity.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5);
    world.addBody(body);
    const rec = { f: fam, t: Date.now() };
    const b = { rec, block, body, settling: true, sim: 0 }; blocks.push(b); paint(block, 0); if (welcome) mine = b;
    if (window.Sky) Sky.aurora(b);   // a green aurora as it falls (sky.js)
    return b;
  }
  function settle(b) {
    b.settling = false; b.body.mass = 0; b.body.type = CANNON.Body.STATIC; b.body.updateMassProperties(); b.body.velocity.set(0, 0, 0); b.body.angularVelocity.set(0, 0, 0);
    const p = b.body.position, q = b.body.quaternion;
    b.rec.p = [p.x, p.y, p.z].map((v) => +v.toFixed(3)); b.rec.q = [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(5));
    if (b.rec.p[1] < -15) return;  // fell off the edge: not kept
    paint(b.block, ageOf(b.rec));
    Store.add(b.rec).then((ok) => { showCount(); return ok; }).then((ok) => setStatus(!ok ? 'The shore is full for today. Come back tomorrow.' : b === mine ? 'Your tetrapod has settled. Thank you for visiting.' : 'Settled. It is on the heap now.'));
  }

  // ---- where blocks go: the shore, or where you tap ----
  const shore = [];
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) { const y = hAt(r, c); if (y > -1.2 && y < 1.2 && (hAt(r - 1, c) < -0.3 || hAt(r + 1, c) < -0.3 || hAt(r, c - 1) < -0.3 || hAt(r, c + 1) < -0.3)) shore.push([r, c]); }
  const randomShore = () => { const [r, c] = shore[Math.floor(Math.random() * shore.length)]; const [x, , z] = toWorld(r, c); return [x, z]; };
  let focus = randomShore();

  // the direction from the land out to sea at a point (the downhill direction of the terrain), so the camera stands offshore
  function shoreNormal(x, z) {
    const e = 12, gx = groundAt(x + e, z) - groundAt(x - e, z), gz = groundAt(x, z + e) - groundAt(x, z - e), l = Math.hypot(gx, gz) || 1;
    return [-gx / l, -gz / l];
  }
  // ---- rocks and pines: placed from the terrain with a fixed seed, so every visitor sees the same coast ----
  let seed = 20261014;
  const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const slopeAt = (r, c) => Math.hypot(hAt(r, c + 1) - hAt(r, c - 1), hAt(r + 1, c) - hAt(r - 1, c)) / (2 * CELL);
  const nearSea = (r, c, k) => { for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) if (hAt(r + i, c + j) < -0.3) return true; return false; };
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), vp = new THREE.Vector3(), vs = new THREE.Vector3(), tint = new THREE.Color();
  // rocks: boulders along the waterline (heavier where the shore is steep) and outcrops on steep ground (scenery: blocks rest on the
  // ground and on each other)
  const rocks = [];
  for (let r = 2; r < H - 2; r++) for (let c = 2; c < W - 2; c++) {
    const y = hAt(r, c), s = slopeAt(r, c);
    let p = 0;
    if (y > -1.5 && y < 2.5 && nearSea(r, c, 1)) p = 0.10 + Math.min(0.35, s * 0.6);
    else if (y >= 2.5 && s > 0.55) p = 0.05;
    if (rand() < p) { const n = 1 + Math.floor(rand() * 3); for (let k = 0; k < n; k++) rocks.push([r + rand() - 0.5, c + rand() - 0.5, 0.5 + rand() * rand() * 1.8]); }
  }
  const EDGE = 140;   // cells (about 550 m) of trees and rocks repeated in the mirror past each end
  const mirrorList = (list) => { for (const t of list.slice()) { if (t[1] < EDGE) list.push([t[0], -t[1], ...t.slice(2)]); if (t[1] > W - 1 - EDGE) list.push([t[0], 2 * (W - 1) - t[1], ...t.slice(2)]); } };
  mirrorList(rocks);
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), rocks.length);
  rocks.forEach(([r, c, size], i) => {
    const x = -SX / 2 + c * CELL, z = -SZ / 2 + r * CELL, y = groundAt(x, z) - size * 0.3;
    vp.set(x, y, z); vs.set(size * (0.9 + rand() * 0.5), size * (0.55 + rand() * 0.35), size * (0.9 + rand() * 0.5));
    qq.setFromEuler(ee.set(rand() * 0.6, rand() * 6.28, rand() * 0.6)); rockMesh.setMatrixAt(i, m4.compose(vp, qq, vs));
    rockMesh.setColorAt(i, tint.setHSL(0.09 + rand() * 0.05, 0.06 + rand() * 0.06, 0.36 + rand() * 0.18));
  });
  scene.add(rockMesh);
  // pines: Japanese black pines, a leaning trunk and flat layered crowns; a seaside row just above the shore and woods on the hills,
  // none on flat town ground or bare rock
  const pines = [];
  for (let r = 2; r < H - 2; r++) for (let c = 2; c < W - 2; c++) {
    const y = hAt(r, c), s = slopeAt(r, c);
    if (y < 2.2 || s > 0.75 || (y < 8 && s < 0.08)) continue;
    const p = nearSea(r, c, 3) ? 0.16 : Math.min(0.32, 0.04 + (y - 6) * 0.006);
    if (rand() < p) pines.push([r + rand() - 0.5, c + rand() - 0.5, 0.7 + rand() * 0.6]);
  }
  mirrorList(pines);
  const LAYERS = 3;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }), pines.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), pines.length * LAYERS);
  const lean = new THREE.Vector3();
  pines.forEach(([r, c, k], i) => {
    const x = -SX / 2 + c * CELL, z = -SZ / 2 + r * CELL, y = groundAt(x, z), tall = (7 + rand() * 5) * k, cr = (reflX(x) + SX / 2) / CELL;
    const n = shoreNormal(x, z), tilt = nearSea(Math.round(r), Math.round(cr), 3) ? 0.18 + rand() * 0.15 : rand() * 0.08;   // shore pines lean out to sea
    qq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean.set(n[0] * tilt, 1, n[1] * tilt).normalize());
    trunks.setMatrixAt(i, m4.compose(vp.set(x, y - 0.3, z), qq, vs.set(k, tall, k)));
    for (let j = 0; j < LAYERS; j++) {
      const h = tall * (0.62 + j * 0.15), w = (3.2 - j * 0.8) * k * (0.85 + rand() * 0.3);
      vp.copy(lean).multiplyScalar(h).add(new THREE.Vector3(x + (rand() - 0.5) * w * 0.5, y - 0.3, z + (rand() - 0.5) * w * 0.5));
      crowns.setMatrixAt(i * LAYERS + j, m4.compose(vp, qq.setFromEuler(ee.set(0, rand() * 6.28, 0)), vs.set(w, w * 0.38, w * (0.8 + rand() * 0.3))));
      crowns.setColorAt(i * LAYERS + j, tint.setHSL(0.30 + rand() * 0.05, 0.32 + rand() * 0.12, 0.17 + j * 0.03 + rand() * 0.05));
    }
  });
  scene.add(trunks, crowns);

  // ---- camera ----
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; window.__cam = controls;   // for tests
  controls.maxPolarAngle = Math.PI / 2 - 0.06; controls.minDistance = 8; controls.maxDistance = 900;
  function look(x, z, d = 60) {
    const y = Math.max(0, heightAtXZ(x, z));
    controls.target.set(x, y + 1, z); camera.position.set(x + d * 0.25, y + d * 0.6, z - d); controls.update();   // from out at sea, the same way every time
  }

  // ---- panel ----
  const status = document.getElementById('status'), extrasEl = document.getElementById('extras');
  // the count of everyone's blocks on the shore, under the title (shared heap only)
  const countEl = document.getElementById('count');
  function showCount() { Store.count().then((n) => { if (n == null || !countEl) return; countEl.textContent = `${n.toLocaleString('en')} ${n === 1 ? 'tetrapod' : 'tetrapods'} on the shore`; countEl.hidden = false; }); }
  const setStatus = (s) => { status.textContent = s; };
  let fam = 'tetra', day = Store.day();
  const chips = document.querySelectorAll('[data-fam]');
  function renderPanel() {
    chips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fam === fam)));
    const left = MAX_EXTRAS - day.extras; extrasEl.textContent = left > 0 ? `${left} extra ${left === 1 ? 'block' : 'blocks'} left today` : 'No extras left today. Come back tomorrow.';
    document.getElementById('dropHere').disabled = left <= 0;
  }
  chips.forEach((b) => b.addEventListener('click', () => { fam = b.dataset.fam; renderPanel(); setStatus(`${FAMILIES[fam].name} chosen. Tap the shore or the sea to drop it.`); }));
  function extra(x, z) {
    if (day.extras >= MAX_EXTRAS) { setStatus('That is all the extras for today. Come back tomorrow for more.'); return; }
    day.extras += 1; Store.setDay(day); renderPanel(); drop(fam, x, z); setStatus(`${FAMILIES[fam].name} dropping.`);
  }
  document.getElementById('dropHere').addEventListener('click', () => { const [x, z] = randomShore(); look(x, z, 45); extra(x, z); });
  // tap (not drag) on the scene drops the chosen family there
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rc = canvas.getBoundingClientRect(); ptr.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ptr, camera); const hit = ray.intersectObjects([sea, terrain])[0];
    if (hit && Math.abs(hit.point.x) < SX / 2 - 3 && Math.abs(hit.point.z) < SZ / 2 - 3) extra(hit.point.x, hit.point.z);
  });
  const yearsEl = document.getElementById('years'), yearsTxt = document.getElementById('yearsTxt');
  yearsEl.addEventListener('input', () => {
    yearsAhead = +yearsEl.value; yearsTxt.textContent = yearsAhead === 0 ? 'today' : `in ${yearsAhead} ${yearsAhead === 1 ? 'year' : 'years'}`;
    for (const b of blocks) if (!b.settling) paint(b.block, ageOf(b.rec));
  });

  // ---- start: the heap, then this visit's own block ----
  renderPanel(); setStatus('Loading the heap…'); look(...focus, 55);   // the view stays here while the heap loads and your block drops
  Store.load().then((heap) => {
    for (const rec of heap) { if (rec.f === 'ico') rec.f = 'd13'; if (rec.p && rec.q && FAMILIES[rec.f]) place(rec); }
    const who = !Store.shared ? '' : heap.length ? `${heap.length} ${heap.length === 1 ? 'block' : 'blocks'} on the shore so far.` : 'You are the first on the shore.';
    // every visit drops a block of its own
    const [x, z] = focus;
    drop('tetra', x, z, true); setStatus(`Welcome. Your tetrapod is dropping onto the shore. ${who}`.trim());
    // other visitors' blocks appear as they arrive
    showCount();
    setInterval(() => Store.newer().then((rows) => { for (const rec of rows) if (!mineIds.has(rec.id) && FAMILIES[rec.f]) place(rec); if (rows.length) showCount(); }), 60000);
  });

  // ---- loop ----
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.2, (now - last) / 1000); last = now;   // a slow device takes more physics steps per frame and keeps real time
    if (blocks.some((b) => b.settling)) stepWorld(dt);   // the physics rests while every block is still
    for (const b of blocks) {
      if (!b.settling) continue;
      b.sim += dt;   // simulated seconds, so a slow device never freezes a block in mid-air
      b.block.g.position.copy(b.body.position); b.block.g.quaternion.copy(b.body.quaternion);
      const still = b.body.velocity.length() < 0.3 && b.body.angularVelocity.length() < 0.3;
      if (b.body.sleepState === CANNON.Body.SLEEPING || (b.sim > 12 && still) || b.sim > 40 || b.body.position.y < -20) settle(b);
    }
    shoreFoam.material.uniforms.amp.value = window.SkyWave || 1; if (!reduce) shoreFoam.material.uniforms.t.value = now / 1000;
    if (!reduce) { const t = now / 1000, P = sg.attributes.position; for (let i = 0; i < P.count; i++) { const x = seaBase[3 * i], z = seaBase[3 * i + 2]; P.setY(i, (window.SkyWave || 1) * (0.25 * Math.sin(x * 0.05 + t * 0.9) + 0.15 * Math.sin(z * 0.08 - t * 0.7))); } P.needsUpdate = true; }
    controls.update(); window.__tetrapodsTarget = controls.target; if (window.Sky) Sky.update(now); renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__tetrapods = { blocks, world, rocks: rocks.length, pines: pines.length, sea, skirt, terrain, shoreFoam };   // for tests
})();
