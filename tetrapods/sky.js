// The live sky for "Drop us a tetrapod" (DICTO, 2026-10-17): the real time and weather on the Misaki coast, Osaka Bay.
// Sun and moon: positions and the moon's phase worked out here from the date (after SunCalc, V. Agafonkin, BSD), no service needed.
// Weather: Open-Meteo (open-meteo.com, CC BY 4.0, no key), fetched on load and every 15 minutes; if it cannot be reached the sky stays clear.
// It changes only the sky, the light, the sea's surface and the falling rain or snow; the coast, the heap and the blocks are untouched.
// Scene axes: x east, y up, z south (the sea is to the north, -z). Test overrides: ?t=2026-10-18T02:00+09:00 and ?wx=clear|cloud|rain|snow|fog|storm.
// DICTO · dictospheres.com
(function () {
  'use strict';
  const LAT = 34.32, LON = 135.14;   // Misaki, Osaka Bay
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toDays = (d) => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const azim = (H, phi, d) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
  const alti = (H, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  function sunCoords(d) {
    const M = rad * (357.5291 + 0.98560028 * d);
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    return { dec: dec(L, 0), ra: ra(L, 0) };
  }
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dist = 385001 - 20905 * Math.cos(M);
    return { ra: ra(l, b), dec: dec(l, b), dist };
  }
  function bodies(date) {
    const lw = rad * -LON, phi = rad * LAT, d = toDays(date);
    const s = sunCoords(d), Hs = sidereal(d, lw) - s.ra;
    const m = moonCoords(d), Hm = sidereal(d, lw) - m.ra;
    const sdist = 149598000, ph = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(ph), m.dist - sdist * Math.cos(ph));
    const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return {
      sun: { alt: alti(Hs, phi, s.dec), az: azim(Hs, phi, s.dec) },
      moon: { alt: alti(Hm, phi, m.dec), az: azim(Hm, phi, m.dec), lit: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI },
    };
  }
  // azimuth is measured from south, westward positive
  const dirOf = (alt, az) => new THREE.Vector3(-Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt));

  const Q = new URLSearchParams(location.search);
  const fixedT = Q.get('t') ? new Date(Q.get('t')) : null;
  const now = () => (fixedT && !isNaN(fixedT) ? fixedT : new Date());
  const WX = { clear: { cloud: 5, rain: 0, snow: 0, wind: 12, vis: 24000, code: 0 }, cloud: { cloud: 95, rain: 0, snow: 0, wind: 18, vis: 20000, code: 3 },
    rain: { cloud: 100, rain: 3, snow: 0, wind: 25, vis: 8000, code: 63 }, snow: { cloud: 100, rain: 0, snow: 1.5, wind: 10, vis: 3000, code: 73 },
    fog: { cloud: 100, rain: 0, snow: 0, wind: 4, vis: 600, code: 45 }, storm: { cloud: 100, rain: 12, snow: 0, wind: 45, vis: 4000, code: 95 } };
  let wx = Object.assign({ temp: null }, WX.clear), wxLabel = '';

  const LABEL = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
    80: 'showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };
  function fetchWeather() {
    if (Q.get('wx') && WX[Q.get('wx')]) { wx = Object.assign({ temp: null }, WX[Q.get('wx')]); wxLabel = LABEL[wx.code] || ''; caption(); return; }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,visibility&timezone=Asia%2FTokyo`;
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
      const c = j.current || {};
      wx = { temp: c.temperature_2m, cloud: c.cloud_cover ?? 0, rain: (c.rain || 0) + (c.showers || 0) || (c.snowfall ? 0 : c.precipitation || 0), snow: (c.snowfall || 0) * 1.5,
        wind: c.wind_speed_10m ?? 10, vis: c.visibility ?? 24000, code: c.weather_code ?? 0 };
      wxLabel = LABEL[wx.code] || ''; caption();
    }).catch(() => { wxLabel = ''; caption(); });
  }
  function caption() {
    const el = document.getElementById('live'); if (!el) return;
    const t = now().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    el.textContent = `Live from Misaki, Osaka Bay · ${t} JST` + (wxLabel ? ` · ${wxLabel}` : '') + (wx.temp != null ? ` · ${Math.round(wx.temp)}°C` : '');
  }

  let S = null;
  function softTexture(draw, size = 128) {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); return t;
  }
  function moonTexture(phase) {
    return softTexture((g, n) => {
      const r = n * 0.42, cx = n / 2, cy = n / 2;
      g.fillStyle = 'rgba(60,66,80,0.55)'; g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.fill();   // the dark side, faint
      const waxing = phase < 0.5, k = Math.cos(2 * Math.PI * phase);   // k = 1 new, -1 full
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.clip();
      g.fillStyle = '#f3f0e2'; g.beginPath();
      // lit half (right when waxing), then the terminator ellipse adds or removes light
      g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing); g.ellipse(cx, cy, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing ? false : true);
      g.fill(); g.restore();
      const glow = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, n / 2); glow.addColorStop(0, 'rgba(230,235,255,0.25)'); glow.addColorStop(1, 'rgba(230,235,255,0)');
      g.fillStyle = glow; g.fillRect(0, 0, n, n);
    });
  }
  const glowTex = () => softTexture((g, n) => { const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
  const puffTex = () => softTexture((g, n) => { for (let i = 0; i < 9; i++) { const x = n * (0.25 + 0.5 * Math.random()), y = n * (0.4 + 0.2 * Math.random()), r = n * (0.14 + 0.12 * Math.random()); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); } }, 256);

  function init(o) {
    const { scene, sun, hemi, sea, camera, ground } = o;
    const sky = new THREE.Group(); scene.add(sky);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: new THREE.Color() }, glowAmt: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, hor, glow; uniform vec3 sunDir; uniform float glowAmt; varying vec3 vD; void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55)); float s = max(dot(normalize(vD), sunDir), 0.0); c += glow * glowAmt * (pow(s, 8.0) * 0.6 + pow(s, 64.0)); gl_FragColor = vec4(c, 1.0); }',
    }));
    dome.renderOrder = -10; sky.add(dome);
    // stars
    const sp = []; for (let i = 0; i < 1400; i++) { const u = Math.random(), v = Math.random() * 0.95 + 0.05, th = 2 * Math.PI * u, y = v, r = Math.sqrt(1 - y * y); sp.push(3300 * r * Math.cos(th), 3300 * y, 3300 * r * Math.sin(th)); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); sky.add(stars);
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff4d6, transparent: true, fog: false, depthWrite: false })); sunDisc.scale.set(260, 260, 1); sky.add(sunDisc);
    const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, fog: false, depthWrite: false })); moonDisc.scale.set(150, 150, 1); sky.add(moonDisc);
    const moonLight = new THREE.DirectionalLight(0xb9c8e8, 0); scene.add(moonLight); scene.add(moonLight.target);
    // clouds: soft puffs high over the bay, drifting with the wind
    const ptex = puffTex(), puffs = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ptex, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      const a = Math.random() * 2 * Math.PI, d = 600 + Math.random() * 2200; s.position.set(Math.cos(a) * d, 380 + Math.random() * 260, Math.sin(a) * d);
      const w = 900 + Math.random() * 900; s.scale.set(w, w * 0.45, 1); s.userData.k = Math.random(); sky.add(s); puffs.push(s);
    }
    // rain streaks and snow flakes in a box round the view
    const BOX = 160, NR = 5000, rp = new Float32Array(NR * 3), NS = 3000, spp = new Float32Array(NS * 3);
    for (let i = 0; i < NR; i++) rp.set([(Math.random() - 0.5) * BOX, Math.random() * 80, (Math.random() - 0.5) * BOX], i * 3);
    for (let i = 0; i < NS; i++) spp.set([(Math.random() - 0.5) * BOX, Math.random() * 160, (Math.random() - 0.5) * BOX], i * 3);
    // rain: points drawn as thin falling streaks (a streak texture), which every device draws reliably
    const streak = softTexture((g, n) => { const gr = g.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.95)'); g.fillStyle = gr; g.fillRect(n / 2 - 2, 0, 4, n); }, 64);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    const rain = new THREE.Points(rg, new THREE.PointsMaterial({ map: streak, color: 0xe6eef4, size: 2.6, transparent: true, opacity: 0.8, depthWrite: false })); rain.frustumCulled = false; rain.renderOrder = 10; rain.visible = false; scene.add(rain);   // drawn after the see-through sea
    const sgg = new THREE.BufferGeometry(); sgg.setAttribute('position', new THREE.BufferAttribute(spp, 3));
    const snow = new THREE.Points(sgg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.9, depthWrite: false })); snow.frustumCulled = false; snow.renderOrder = 10; snow.visible = false; scene.add(snow);
    // ripples: rings spreading on the sea where raindrops land (DICTO: "ripples on the water"); never on land
    const ringGeo = new THREE.RingGeometry(0.75, 1, 24); ringGeo.rotateX(-Math.PI / 2);
    const ripples = [];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe6eef4, transparent: true, opacity: 0, depthWrite: false }));
      m.renderOrder = 9; m.visible = false; m.userData.age = 9; scene.add(m); ripples.push(m);
    }
    S = { ground, ripples, scene, sun, hemi, sea, camera, sky, dome, stars, sunDisc, moonDisc, moonLight, puffs, rain, snow, rp, spp, moonPhase: -1, flash: 0, last: performance.now(), lastCap: 0 };
    fetchWeather(); setInterval(fetchWeather, 15 * 60 * 1000); caption();
  }

  const C = (h) => new THREE.Color(h);
  const DAY_TOP = C(0x5c9fd6), DAY_HOR = C(0xbfd3dc), GOLD_HOR = C(0xf0b98a), DUSK_TOP = C(0x2c3e6b), DUSK_HOR = C(0xd98f73), NIGHT_TOP = C(0x050a16), NIGHT_HOR = C(0x122036);
  const GREY_DAY = C(0xa7b0b6), GREY_NIGHT = C(0x0e1217), SEA_DAY = C(0x2f7f8e), SEA_NIGHT = C(0x0d2233);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function update(tnow) {
    if (!S) return;
    const dt = Math.min(0.1, (tnow - S.last) / 1000); S.last = tnow;
    const b = bodies(now()), sAlt = b.sun.alt / rad, mAlt = b.moon.alt / rad;
    const day = ss(-6, 8, sAlt), twi = ss(-14, -2, sAlt) * (1 - ss(2, 12, sAlt)), night = 1 - ss(-14, -4, sAlt);
    const cloud = Math.min(1, (wx.cloud || 0) / 100), wet = Math.min(1, (wx.rain + wx.snow) / 4);
    // sky colours
    const top = NIGHT_TOP.clone().lerp(DUSK_TOP, ss(-14, -4, sAlt)).lerp(DAY_TOP, ss(-2, 10, sAlt));
    const hor = NIGHT_HOR.clone().lerp(DUSK_HOR, ss(-12, -3, sAlt)).lerp(GOLD_HOR, ss(-3, 1, sAlt)).lerp(DAY_HOR, ss(2, 14, sAlt));
    const grey = GREY_NIGHT.clone().lerp(GREY_DAY, day), dim = 0.85 * cloud + 0.15 * wet;
    top.lerp(grey, dim); hor.lerp(grey, dim * 0.9);
    const u = S.dome.material.uniforms; u.top.value.copy(top); u.hor.value.copy(hor);
    const sd = dirOf(b.sun.alt, b.sun.az); u.sunDir.value.copy(sd); u.glow.value.set(sAlt < 6 ? 0xffb070 : 0xfff2d8); u.glowAmt.value = ss(-8, 0, sAlt) * (1 - cloud * 0.85);
    S.scene.background = hor;   // under the dome's edge
    // haze: the visibility, and more of it in rain
    const far = Math.max(450, Math.min(3200, (wx.vis || 24000) * 0.55)) * (1 - 0.35 * wet);
    S.scene.fog.color.copy(hor); S.scene.fog.far = far; S.scene.fog.near = Math.min(1000, far * 0.3);
    // sun, moon, stars
    S.sky.position.copy(S.camera.position);
    S.sunDisc.position.copy(sd).multiplyScalar(3000); S.sunDisc.material.opacity = ss(-3, 1, sAlt) * (1 - cloud * 0.9);
    S.sun.position.copy(sd).multiplyScalar(500); S.sun.intensity = 1.15 * ss(-2, 10, sAlt) * (1 - 0.65 * cloud);
    S.sun.color.set(0xfff1dc).lerp(C(0xffb27a), 1 - ss(2, 14, sAlt));
    const md = dirOf(b.moon.alt, b.moon.az);
    if (Math.abs(S.moonPhase - b.moon.phase) > 0.01) { S.moonPhase = b.moon.phase; if (S.moonDisc.material.map) S.moonDisc.material.map.dispose(); S.moonDisc.material.map = moonTexture(b.moon.phase); S.moonDisc.material.needsUpdate = true; }
    S.moonDisc.position.copy(md).multiplyScalar(3000); S.moonDisc.material.opacity = ss(-2, 2, mAlt) * (1 - 0.55 * day) * (1 - cloud * 0.92);
    S.moonLight.position.copy(md).multiplyScalar(500); S.moonLight.intensity = 0.95 * b.moon.lit * ss(-1, 6, mAlt) * night * (1 - 0.8 * cloud);
    S.stars.material.opacity = night * (1 - cloud) * 0.95;
    // fill light
    S.hemi.intensity = 0.3 + 0.25 * ss(-8, 10, sAlt) * (1 - 0.2 * cloud);   // night stays readable: a moonlit-blue fill
    S.hemi.color.set(0xe8f0f2).lerp(C(0x7486a8), night); S.hemi.groundColor.set(0x3e4a3a).lerp(C(0x10141c), night);
    // lightning in a thunderstorm
    if (wx.code >= 95) { if (Math.random() < dt * 0.06) S.flash = 1; S.flash = Math.max(0, S.flash - dt * 6); S.hemi.intensity += S.flash * 0.45; }
    // the sea: calmer and glassier at night so the moon lays a path of light on it; wind raises the waves
    const sm = S.sea.material; sm.color.copy(SEA_DAY).lerp(SEA_NIGHT, night).lerp(grey, 0.2 * cloud);
    sm.roughness = 0.62 - 0.4 * night * (1 - 0.6 * wet); sm.metalness = 0.02 + 0.33 * night;
    window.SkyWave = Math.max(0.5, Math.min(3, 0.5 + (wx.wind || 10) / 14));
    // clouds
    const drift = (wx.wind || 10) * 0.06 * dt;
    for (const p of S.puffs) {
      p.position.x += drift * (0.6 + p.userData.k); if (p.position.x > 2800) p.position.x -= 5600;
      p.material.opacity = Math.max(0, cloud * 1.1 - p.userData.k * 0.5) * 0.85; p.material.color.copy(grey).lerp(C(0xffffff), 0.5 * day);
    }
    // rain and snow round the point the camera looks at
    const ctr = window.__tetrapodsTarget || S.camera.position;   // the rain falls over the spot the viewer is looking at
    const R = S.rain, Sn = S.snow;
    R.visible = wx.rain > 0.05; Sn.visible = wx.snow > 0.05;
    if (R.visible) {
      R.position.set(ctr.x, 0, ctr.z); R.geometry.setDrawRange(0, Math.round(Math.min(5000, 1200 + wx.rain * 900)));
      const p = S.rp, v = 38 * dt; for (let i = 0; i < p.length; i += 3) { p[i + 1] -= v; if (p[i + 1] < -1) p[i + 1] += 80; }
      R.geometry.attributes.position.needsUpdate = true; R.material.color.copy(C(0xe6eef4)).lerp(C(0x9fb0c2), night);
    }
    // ripples
    const rate = R.visible ? Math.min(160, 25 + wx.rain * 30) : 0, cp = S.camera.position, wave = window.SkyWave || 1, tt = tnow / 1000;
    let spawn = rate * dt;
    for (const m of S.ripples) {
      if (m.userData.age < 0.9) {
        m.userData.age += dt; const k = m.userData.age / 0.9, r = 0.15 + 1.6 * k; m.scale.set(r, 1, r);
        m.material.opacity = 0.55 * (1 - k) * (1 - 0.5 * night); continue;
      }
      m.visible = false;
      if (spawn >= 1 || Math.random() < spawn) {
        spawn -= 1;
        const x = cp.x + (Math.random() - 0.5) * 140, z = cp.z + 10 + Math.random() * 110;   // in front of the viewer, towards the shore
        if (S.ground && S.ground(x, z) > -0.4) continue;   // only over water
        m.position.set(x, wave * (0.25 * Math.sin(x * 0.05 + tt * 0.9) + 0.15 * Math.sin(z * 0.08 - tt * 0.7)) + 0.06, z);
        m.userData.age = 0; m.visible = true; m.scale.set(0.15, 1, 0.15);
      }
    }
    if (Sn.visible) {
      Sn.position.set(ctr.x, 0, ctr.z); Sn.geometry.setDrawRange(0, Math.round(Math.min(3000, 400 + wx.snow * 1200)));
      const p = S.spp, v = 1.6 * dt; for (let i = 0; i < p.length; i += 3) { p[i + 1] -= v; p[i] += Math.sin(tnow / 900 + i) * 0.02; if (p[i + 1] < -2) p[i + 1] += 160; }
      Sn.geometry.attributes.position.needsUpdate = true;
    }
    auroraStep(dt, night);
    if (tnow - S.lastCap > 30000) { S.lastCap = tnow; caption(); }
  }
  // DICTO 2026-10-17: a green aurora round each block as it drops, like a falling star fragment, lighting the shore a little at night;
  // it trails behind while the block falls and fades out a few seconds after it settles. Touches no block: only light and glow round it.
  const AUR = [];
  let auraTex = null;
  function aurora(b) {
    if (!S) return;
    auraTex = auraTex || softTexture((g, n) => { const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(190,255,215,0.95)'); gr.addColorStop(0.3, 'rgba(80,255,160,0.55)'); gr.addColorStop(1, 'rgba(40,255,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
    const light = new THREE.PointLight(0x5cffa8, 0, 45, 2), glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, color: 0x9dffc8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.set(9, 9, 1);
    const NT = 40, tp = new Float32Array(NT * 3), tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    const tc = new Float32Array(NT * 3); for (let i = 0; i < NT; i++) { const k = 1 - i / NT; tc.set([0.35 * k, 1.0 * k, 0.62 * k], i * 3); } tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); trail.frustumCulled = false;
    const p0 = b.block.g.position; for (let i = 0; i < NT; i++) tp.set([p0.x, p0.y, p0.z], i * 3);
    S.scene.add(light); S.scene.add(glow); S.scene.add(trail);
    AUR.push({ b, light, glow, trail, tp, NT, after: 0, life: 1, fresh: true });
  }
  function auroraStep(dt, night) {
    for (let i = AUR.length - 1; i >= 0; i--) {
      const a = AUR[i], pos = a.b.block.g.position;
      if (a.fresh) { for (let k = 0; k < a.NT; k++) a.tp.set([pos.x, pos.y, pos.z], k * 3); a.fresh = false; }   // start the trail where the block really is
      if (!a.b.settling) a.after += dt;
      a.life = a.b.settling ? 1 : Math.max(0, 1 - a.after / 4);
      const flick = 0.85 + 0.15 * Math.sin(performance.now() / 90 + i);
      a.light.position.copy(pos); a.light.intensity = (0.9 + 1.8 * night) * a.life * flick;
      a.glow.position.copy(pos); a.glow.material.opacity = (0.45 + 0.5 * night) * a.life * flick;
      const sc = 7 + 4 * a.life; a.glow.scale.set(sc, sc, 1);
      a.tp.copyWithin(3, 0, (a.NT - 1) * 3); a.tp[0] = pos.x; a.tp[1] = pos.y; a.tp[2] = pos.z;   // the newest point at the front
      a.trail.geometry.attributes.position.needsUpdate = true; a.trail.material.opacity = a.life;
      if (a.life <= 0) { S.scene.remove(a.light, a.glow, a.trail); a.trail.geometry.dispose(); a.glow.material.dispose(); AUR.splice(i, 1); }
    }
  }
  window.Sky = { init, update, bodies, aurora, state: () => S };   // state: for tests
})();
