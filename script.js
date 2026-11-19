/* =========================================================
   FINDING JANE — Humanoid Chibi-Anime Diorama Edition
   Sculpted Human Characters + Bustling Town + Water Physics + Beach
========================================================= */

const SEA_LEVEL = -0.25;

/* 1. Audio Synthesizer */
const AudioEngine = (() => {
  let ctx = null;
  let muted = false;

  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function playTone(freq, dur = 0.2, type = "sine", vol = 0.06, delay = 0) {
    if (muted) return;
    init();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + dur);
  }

  return {
    unlock: init,
    toggleMute() { muted = !muted; return muted; },
    blip: () => playTone(560, 0.07, "triangle", 0.04),
    jump: () => playTone(340, 0.12, "sine", 0.05),
    splash: () => { playTone(185, 0.16, "triangle", 0.06); playTone(125, 0.2, "sine", 0.05, 0.05); },
    hit: () => { playTone(130, 0.18, "sawtooth", 0.07); playTone(85, 0.22, "sawtooth", 0.06, 0.06); },
    colorDrain: () => [440, 392, 330, 247].forEach((f, i) => playTone(f, 0.45, "sine", 0.06, i * 0.22)),
    sparkle: () => [523, 659, 880].forEach((f, i) => playTone(f, 0.28, "triangle", 0.06, i * 0.09)),
    colorReturn: () => [261, 329, 392, 493, 587, 659, 784, 987].forEach((f, i) => playTone(f, 0.6, "sine", 0.07, i * 0.1))
  };
})();

/* 2. State & Quests */
const state = {
  phase: "FLASH",
  grayscale: 0,
  dialogueActive: false,
  dialogueQueue: [],
  dialogueIndex: 0,
  dialogueOnComplete: null,
  questStep: 0,
  hasScarf: false,
  hasKey: false,
  hasLocket: false,
  gateUnlocked: false,
  stamina: 100,
  velY: 0,
  grounded: true,
  isSwimming: false,
  rippleTimer: 0,
  lastSafePos: { x: 0, y: 0, z: 14 },
  windForceX: 0,
  windTimer: 0,
  meteorTimer: 0,
  camYaw: 0,
  camPitch: 0.36,
  keys: {},
  isDragging: false,
  lastMouseX: 0,
  lastMouseY: 0,
  nearbyInteractable: null
};

const QUEST_INFO = {
  0: { title: "The Separation", desc: "Listen to Jane..." },
  1: { title: "Follow Jane's Footsteps", desc: "Speak to Sora at her flower stall in Lantern Town." },
  2: { title: "Cross the Rushing River", desc: "Swim or hop the river rocks to recover Jane's Red Scarf." },
  3: { title: "Find the Sky Key", desc: "Climb the East Mountain Cliff & dodge falling meteors for the Sky Key." },
  4: { title: "Unlock the Summit Gate", desc: "Bring the Sky Key to the Summit Gate & claim Jane's Locket." },
  5: { title: "Swim the Tidal Cove", desc: "Swim across the ocean sandbars to reach Sunset Beach." },
  6: { title: "Find Jane at Sunset Beach", desc: "Walk beside Jane on the sand and tell her how sorry you are." },
  7: { title: "Color Returned", desc: "Eric & Jane watching the sunset together." }
};

/* 3. Three.js Renderer, Tone Mapping & Fog */
const canvas = document.getElementById("worldCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x2a1f36, 0.013);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 360);

const hemiLight = new THREE.HemisphereLight(0xa78bfa, 0x1c1917, 0.68);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffb36b, 1.35);
sunLight.position.set(16, 26, 28);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 140;
const sRange = 36;
sunLight.shadow.camera.left = -sRange;
sunLight.shadow.camera.right = sRange;
sunLight.shadow.camera.top = sRange;
sunLight.shadow.camera.bottom = -sRange;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);
scene.add(sunLight.target);

const heroWarmLight = new THREE.PointLight(0xfbbf24, 0.72, 11);
scene.add(heroWarmLight);

/* 4. Procedural Textures */
function makeTileTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const cx = c.getContext("2d");
  cx.fillStyle = "#57483d";
  cx.fillRect(0, 0, 256, 256);
  const colors = ["#c2956e", "#b0825c", "#a37451", "#c99f77"];
  const step = 64;
  for (let y = 0; y < 256; y += step) {
    for (let x = 0; x < 256; x += step) {
      cx.fillStyle = colors[((x + y) / step) % colors.length];
      cx.fillRect(x + 3, y + 3, step - 6, step - 6);
      cx.fillStyle = "rgba(255, 240, 215, 0.12)";
      cx.fillRect(x + 4, y + 4, step - 8, 6);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

function makeWoodTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const cx = c.getContext("2d");
  cx.fillStyle = "#6e472b";
  cx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    cx.fillStyle = y % 64 === 0 ? "#7c5132" : "#613d24";
    cx.fillRect(0, y + 2, 256, 29);
    cx.fillStyle = "rgba(0,0,0,0.22)";
    cx.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const tileTex = makeTileTexture();
const woodTex = makeWoodTexture();

function cozyMat(color, roughness = 0.82, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05, ...extra });
}

/* 5. Sunset Sky Dome & Ocean Sun */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x161229) },
    midColor: { value: new THREE.Color(0x5b376b) },
    bottomColor: { value: new THREE.Color(0xea7c4f) }
  },
  vertexShader: `
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 bottomColor;
    varying vec3 vWorldPos;
    void main() {
      float h = normalize(vWorldPos).y;
      vec3 col = mix(bottomColor, midColor, smoothstep(-0.05, 0.25, h));
      col = mix(col, topColor, smoothstep(0.25, 0.85, h));
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(260, 32, 24), skyMat));

const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(24, 32),
  new THREE.MeshBasicMaterial({ color: 0xfde047, fog: false })
);
sunDisc.position.set(0, 20, 245);
sunDisc.rotation.y = Math.PI;
scene.add(sunDisc);

const sunHalo = new THREE.Mesh(
  new THREE.CircleGeometry(40, 32),
  new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.34, fog: false })
);
sunHalo.position.set(0, 20, 246);
sunHalo.rotation.y = Math.PI;
scene.add(sunHalo);

/* 6. Multi-Biome Terrain & Water Surface Math */
function mountainTrailX(z) {
  if (z < 42 || z > 110) return 0;
  return Math.sin(((z - 42) / 68) * Math.PI * 2) * 10.5;
}

function getTerrainHeight(x, z) {
  let h = 0;
  if (z < 18) {
    h = 0;
    const edge = Math.max(0, Math.abs(x) - 24);
    h += Math.pow(edge, 1.35) * 0.32;
  }
  if (z >= 17 && z <= 39) {
    const t = Math.sin(((z - 17) / 22) * Math.PI);
    h -= t * 2.1;
  }
  if (z >= 40 && z <= 112) {
    const ridgeT = Math.sin(((z - 40) / 72) * Math.PI);
    const baseHeight = Math.pow(ridgeT, 1.15) * 11.5;
    const tx = mountainTrailX(z);
    const distFromTrail = Math.abs(x - tx);
    const cliffBump = distFromTrail > 3.7 ? Math.min(9, (distFromTrail - 3.7) * 1.45) : 0;
    h = baseHeight + cliffBump;
  }
  if (z > 112 && z <= 150) {
    const seaT = Math.sin(((z - 112) / 38) * Math.PI);
    h = -seaT * 2.3;
    const d1 = Math.hypot(x + 4.5, z - 122);
    const d2 = Math.hypot(x - 4.5, z - 132);
    const d3 = Math.hypot(x + 1.5, z - 141);
    if (d1 < 4.5) h = Math.max(h, (1 - d1 / 4.5) * 1.1 - 0.1);
    if (d2 < 4.8) h = Math.max(h, (1 - d2 / 4.8) * 1.2 - 0.1);
    if (d3 < 4.5) h = Math.max(h, (1 - d3 / 4.5) * 1.1 - 0.1);
  }
  if (z > 150) {
    if (z <= 165) {
      const beachT = Math.sin(((z - 150) / 15) * Math.PI);
      h = beachT * 1.15;
    } else {
      h = -2.6;
    }
  }
  return h;
}

function getWaterHeight(x, z, time) {
  return SEA_LEVEL + Math.sin(time * 2.4 + x * 0.28 + z * 0.22) * 0.11 + Math.cos(time * 1.7 - z * 0.2) * 0.06;
}

const terrainGeo = new THREE.PlaneGeometry(108, 220, 100, 180);
terrainGeo.rotateX(-Math.PI / 2);
terrainGeo.translate(0, 0, 75);

const posAttr = terrainGeo.attributes.position;
const colArr = new Float32Array(posAttr.count * 3);
const cTownGrass = new THREE.Color(0x3f7a58);
const cPlaza = new THREE.Color(0xb58d67);
const cMountain = new THREE.Color(0x4a4e5e);
const cSummit = new THREE.Color(0x528065);
const cSand = new THREE.Color(0xdcb87c);
const cSeaBed = new THREE.Color(0x164e63);

for (let i = 0; i < posAttr.count; i++) {
  const vx = posAttr.getX(i);
  const vz = posAttr.getZ(i);
  const vy = getTerrainHeight(vx, vz);
  posAttr.setY(i, vy);

  let col = cTownGrass;
  if (vz < 16 && Math.hypot(vx, vz + 4) < 8.6) col = cPlaza;
  else if (vz >= 17 && vz <= 39 && vy < 0.1) col = cSand;
  else if (vz >= 40 && vz <= 112) {
    col = Math.abs(vx - mountainTrailX(vz)) < 3.6 ? (vy > 8 ? cSummit : cSand) : cMountain;
  } else if (vz > 112) {
    col = vy > -0.15 ? cSand : cSeaBed;
  }
  colArr[i * 3] = col.r; colArr[i * 3 + 1] = col.g; colArr[i * 3 + 2] = col.b;
}
terrainGeo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
terrainGeo.computeVertexNormals();
const terrainMesh = new THREE.Mesh(terrainGeo, cozyMat(0xffffff, 0.92, { vertexColors: true }));
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

const tiledPlaza = new THREE.Mesh(
  new THREE.CylinderGeometry(8.5, 8.6, 0.08, 36),
  cozyMat(0xffffff, 0.78, { map: tileTex })
);
tiledPlaza.position.set(0, 0.03, -4);
tiledPlaza.receiveShadow = true;
scene.add(tiledPlaza);

const mainRoad = new THREE.Mesh(
  new THREE.BoxGeometry(4.4, 0.06, 20),
  cozyMat(0xd6c0a1, 0.85, { map: tileTex })
);
mainRoad.position.set(0, 0.02, 7.5);
mainRoad.receiveShadow = true;
scene.add(mainRoad);

const waterGeo = new THREE.PlaneGeometry(140, 220, 42, 64);
waterGeo.rotateX(-Math.PI / 2);
waterGeo.translate(0, SEA_LEVEL, 105);
const waterMesh = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({
    color: 0x0e7490,
    roughness: 0.14,
    metalness: 0.28,
    transparent: true,
    opacity: 0.86
  })
);
waterMesh.receiveShadow = true;
scene.add(waterMesh);

/* 7. Water Physics Visuals */
const waterRipples = [];
const waterSplashes = [];
const riverFoamStreaks = [];

function spawnRipple(x, z, maxScale = 2.6) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.44, 20),
    new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, SEA_LEVEL + 0.14, z);
  scene.add(ring);
  waterRipples.push({ mesh: ring, life: 0, maxLife: 0.85, maxScale });
}

function spawnSplash(x, z, count = 10) {
  for (let i = 0; i < count; i++) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.9 })
    );
    drop.position.set(x + (Math.random() - 0.5) * 0.5, SEA_LEVEL + 0.2, z + (Math.random() - 0.5) * 0.5);
    scene.add(drop);
    waterSplashes.push({
      mesh: drop,
      vx: (Math.random() - 0.5) * 3.5,
      vy: 2.8 + Math.random() * 2.5,
      vz: (Math.random() - 0.5) * 3.5,
      life: 0.55
    });
  }
}

for (let i = 0; i < 24; i++) {
  const streak = new THREE.Mesh(
    new THREE.BoxGeometry(1.6 + Math.random() * 1.4, 0.04, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.55 })
  );
  streak.position.set((Math.random() - 0.5) * 36, SEA_LEVEL + 0.13, 20 + Math.random() * 16);
  scene.add(streak);
  riverFoamStreaks.push({ mesh: streak, speed: 2.2 + Math.random() * 1.4 });
}

const shoreFoam = new THREE.Mesh(
  new THREE.PlaneGeometry(76, 1.8),
  new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
);
shoreFoam.rotation.x = -Math.PI / 2;
shoreFoam.position.set(0, SEA_LEVEL + 0.12, 164.5);
scene.add(shoreFoam);

/* 8. Dense Town, Mountain Forest, Instanced Grass & Sunset Beach */
const colliders = [];
const platforms = [];
const boxPlatforms = [];
const activeMeteors = [];
const chimneySmokes = [];
const palmTops = [];
const bonfireSparks = [];
let petalSystem = null;

function addPlatformRock(x, z, y, r = 1.7) {
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 1.1, 1.4, 8), cozyMat(0x64748b, 0.9));
  rock.position.set(x, y - 0.7, z);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  platforms.push({ x, z, y, r });
}

function createDioramaCottage(x, z, wallColor, roofColor, rotY = 0, w = 5.8, h = 4.4, d = 4.8) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cozyMat(wallColor, 0.85, { map: woodTex }));
  base.position.y = h / 2; base.castShadow = true; base.receiveShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, 2.8, 4), cozyMat(roofColor, 0.88));
  roof.position.y = h + 1.4; roof.rotation.y = Math.PI / 4; roof.castShadow = true;

  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), cozyMat(0x57534e, 0.9));
  chim.position.set(w * 0.25, h + 1.6, -d * 0.15); chim.castShadow = true;

  const win1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), new THREE.MeshBasicMaterial({ color: 0xfde68a }));
  win1.position.set(-w * 0.22, h * 0.52, d / 2 + 0.02);
  const win2 = win1.clone();
  win2.position.set(w * 0.22, h * 0.52, d / 2 + 0.02);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.12), cozyMat(0x451a03, 0.9));
  door.position.set(0, 0.95, d / 2 + 0.03);

  g.add(base, roof, chim, win1, win2, door);
  g.position.set(x, getTerrainHeight(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  colliders.push({ x, z, r: Math.max(w, d) * 0.58 });

  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xe7e5e4, transparent: true, opacity: 0.45 })
  );
  smoke.position.set(x + Math.cos(rotY) * (w * 0.25), h + 2.7, z - Math.sin(rotY) * (w * 0.25));
  scene.add(smoke);
  chimneySmokes.push({ mesh: smoke, baseY: h + 2.7, offset: Math.random() * 10 });
}

function createStylizedTree(x, z, type = "sakura", scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 3.4, 8), cozyMat(0x4a2c18, 0.92));
  trunk.position.y = 1.7; trunk.castShadow = true;

  if (type === "pine") {
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.2, 7), cozyMat(0x2d5a43, 0.88));
    c1.position.y = 3.6; c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 7), cozyMat(0x3b7355, 0.88));
    c2.position.y = 5.1; c2.castShadow = true;
    g.add(trunk, c1, c2);
  } else {
    const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), cozyMat(0xf472b6, 0.85));
    c1.position.y = 4.0; c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), cozyMat(0xf9a8d4, 0.85));
    c2.position.set(1.0, 3.4, 0.5); c2.castShadow = true;
    g.add(trunk, c1, c2);
  }
  g.scale.setScalar(scale);
  g.position.set(x, getTerrainHeight(x, z), z);
  scene.add(g);
  colliders.push({ x, z, r: 0.95 * scale });
}

function createLanternPost(x, z, withPointLight = false) {
  const y = getTerrainHeight(x, z);
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 4.6), cozyMat(0x27272a, 0.7));
  pole.position.y = 2.3; pole.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 6), cozyMat(0x18181b));
  cap.position.y = 4.75;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  bulb.position.y = 4.4;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.8, 4.5, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 2.25;
  g.add(pole, cap, bulb, beam);
  if (withPointLight) {
    const pt = new THREE.PointLight(0xffb74d, 1.4, 16);
    pt.position.y = 4.2;
    g.add(pt);
  }
  g.position.set(x, y, z);
  scene.add(g);
}

function createBench(x, z, rotY = 0) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.75), cozyMat(0x92400e, 0.85, { map: woodTex }));
  seat.position.y = 0.55; seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 0.15), cozyMat(0x78350f, 0.85, { map: woodTex }));
  back.position.set(0, 0.95, -0.32); back.castShadow = true;
  g.add(seat, back);
  g.position.set(x, getTerrainHeight(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  colliders.push({ x, z, r: 1.1 });
}

function createPalmTree(x, z) {
  const g = new THREE.Group();
  const y = getTerrainHeight(x, z);
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.02, 0.25 - i * 0.02, 1.1, 7), cozyMat(0x78350f, 0.9));
    seg.position.set(Math.sin(i * 0.25) * 0.35, 0.55 + i * 0.95, 0);
    seg.rotation.z = -0.08 * i; seg.castShadow = true;
    g.add(seg);
  }
  const crown = new THREE.Group();
  crown.position.set(0.35, 5.1, 0);
  for (let a = 0; a < 6; a++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.8, 5), cozyMat(0x2e7d32, 0.85));
    leaf.rotation.z = Math.PI / 2.6;
    leaf.rotation.y = (a / 6) * Math.PI * 2;
    leaf.position.set(Math.cos((a / 6) * Math.PI * 2) * 1.1, -0.2, Math.sin((a / 6) * Math.PI * 2) * 1.1);
    leaf.castShadow = true;
    crown.add(leaf);
  }
  g.add(crown);
  palmTops.push(crown);
  g.position.set(x, y, z);
  scene.add(g);
  colliders.push({ x, z, r: 0.7 });
}

// Town Buildings, Benches, Stalls & Lanterns
createDioramaCottage(-15, -13, 0xd6b89c, 0x9f1239, 0.45);
createDioramaCottage(15, -13, 0xcbd5e1, 0x3730a3, -0.45);
createDioramaCottage(-16, -2, 0xe7d4c0, 0xbe123c, 1.25, 5.2, 4.0, 4.4);
createDioramaCottage(16, -2, 0xfef3c7, 0x0f766e, -1.25, 5.4, 4.2, 4.4);
createDioramaCottage(-14, 9, 0xfce7f3, 0xb45309, 0.85, 5.0, 3.8, 4.2);
createDioramaCottage(14, 9, 0xe0f2fe, 0x4338ca, -0.85, 5.0, 3.8, 4.2);
createDioramaCottage(-6, -18, 0xe2e8f0, 0x881337, 0.1, 5.4, 4.2, 4.2);
createDioramaCottage(7, -18, 0xfde68a, 0x1e40af, -0.1, 5.2, 4.0, 4.2);
createDioramaCottage(-22, -7, 0xd6b89c, 0x7c2d12, 1.4);
createDioramaCottage(22, -7, 0xe7d4c0, 0x312e81, -1.4);

createBench(-6.2, -10, 0.6);
createBench(6.2, -10, -0.6);
createBench(-5.5, 4, Math.PI / 2);
createBench(5.5, 4, -Math.PI / 2);

createLanternPost(-6.5, -1, true);
createLanternPost(6.5, -1, false);
createLanternPost(-2.8, 16.2, false);
createLanternPost(2.8, 16.2, false);

const stall = new THREE.Group();
const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.4, 1.6), cozyMat(0xb45309, 0.85, { map: woodTex }));
counter.position.y = 0.7; counter.castShadow = true;
const awning = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 2.4), cozyMat(0xe11d48, 0.8));
awning.position.set(0, 3.2, 0.1); awning.rotation.x = 0.2;
stall.add(counter, awning);
stall.position.set(-9.5, 0, -4.5);
stall.rotation.y = Math.PI / 3;
scene.add(stall);
colliders.push({ x: -9.5, z: -4.5, r: 2.1 });
createLanternPost(-7.5, -5.5, true);

const bakery = new THREE.Group();
const bCounter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 1.5), cozyMat(0x92400e, 0.85, { map: woodTex }));
bCounter.position.y = 0.65; bCounter.castShadow = true;
const bAwning = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.26, 2.2), cozyMat(0x0284c7, 0.8));
bAwning.position.set(0, 3.0, 0.1); bAwning.rotation.x = 0.2;
bakery.add(bCounter, bAwning);
bakery.position.set(9.5, 0, -4.5);
bakery.rotation.y = -Math.PI / 3;
scene.add(bakery);
colliders.push({ x: 9.5, z: -4.5, r: 2.0 });

// Walkable Broken Bridge Piers
[18, 38].forEach((bz) => {
  const pier = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 2.4), cozyMat(0x78350f, 0.9, { map: woodTex }));
  pier.position.set(0, 0.2, bz);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  boxPlatforms.push({ x: 0, z: bz, y: 0.5, halfW: 2.2, halfD: 1.2 });
});

addPlatformRock(-1.6, 22.0, 0.1, 1.5);
addPlatformRock(1.4, 25.5, 0.1, 1.5);
addPlatformRock(-5.8, 28.0, 0.25, 2.1);
addPlatformRock(0.8, 30.5, 0.1, 1.5);
addPlatformRock(-1.2, 34.5, 0.1, 1.5);

const keyCliffY = getTerrainHeight(10.5, 59) + 0.8;
addPlatformRock(14.2, 59, keyCliffY, 2.5);

const summitY = getTerrainHeight(0, 76);
const gateGroup = new THREE.Group();
const toriiL = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.8), cozyMat(0xbe123c, 0.8, { map: woodTex }));
toriiL.position.set(-2.2, 2.4, 0);
const toriiR = toriiL.clone();
toriiR.position.set(2.2, 2.4, 0);
const toriiTop = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.55, 0.7), cozyMat(0xbe123c, 0.8));
toriiTop.position.set(0, 4.7, 0);
const gateDoor = new THREE.Mesh(
  new THREE.BoxGeometry(4.0, 3.8, 0.35),
  new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.42 })
);
gateDoor.position.set(0, 1.9, 0);
gateGroup.add(toriiL, toriiR, toriiTop, gateDoor);
gateGroup.position.set(0, summitY, 75);
scene.add(gateGroup);

const summitLight = new THREE.PointLight(0xfbbf24, 1.4, 18);
summitLight.position.set(0, summitY + 4, 76);
scene.add(summitLight);

// Mountain Forest (38 trees)
for (let i = 0; i < 38; i++) {
  const mz = 43 + (i / 38) * 65;
  const side = i % 2 === 0 ? 1 : -1;
  const mx = mountainTrailX(mz) + side * (5.2 + (i % 5) * 3.1);
  if (Math.hypot(mx - 14.2, mz - 59) < 3.6) continue;
  if (Math.hypot(mx, mz - 76) < 5.0) continue;
  if (Math.abs(mx) > 36) continue;
  createStylizedTree(mx, mz, i % 4 === 0 ? "sakura" : "pine", 0.85 + (i % 3) * 0.22);
}

[[-11, -15, "sakura"], [11, -15, "sakura"], [-9, 13, "pine"], [9, 13, "sakura"]].forEach(([x, z, t]) =>
  createStylizedTree(x, z, t)
);

// Beach Props
createPalmTree(-12, 155);
createPalmTree(13, 156);
createPalmTree(-17, 159);
createPalmTree(18, 158);

const beachPier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 9.0), cozyMat(0x78350f, 0.88, { map: woodTex }));
beachPier.position.set(-8.5, 0.5, 162);
beachPier.castShadow = true; beachPier.receiveShadow = true;
scene.add(beachPier);
boxPlatforms.push({ x: -8.5, z: 162, y: 0.68, halfW: 1.6, halfD: 4.5 });

const boat = new THREE.Group();
const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), cozyMat(0x92400e, 0.85, { map: woodTex }));
hull.castShadow = true;
const seatPlank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), cozyMat(0xb45309));
seatPlank.position.y = 0.25;
boat.add(hull, seatPlank);
boat.position.set(9.5, getTerrainHeight(9.5, 159) + 0.25, 159);
boat.rotation.set(0.08, -0.45, 0.12);
scene.add(boat);
colliders.push({ x: 9.5, z: 159, r: 2.0 });

const umbrellaGroup = new THREE.Group();
const uPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8), cozyMat(0xe2e8f0));
uPole.position.y = 1.4;
const uTop = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 8), cozyMat(0xf43f5e));
uTop.position.y = 2.7; uTop.castShadow = true;
umbrellaGroup.add(uPole, uTop);
umbrellaGroup.position.set(5.5, getTerrainHeight(5.5, 155), 155);
scene.add(umbrellaGroup);

const firePos = { x: -2.8, z: 157.5, y: getTerrainHeight(-2.8, 157.5) };
for (let i = 0; i < 6; i++) {
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24), cozyMat(0x57534e));
  stone.position.set(firePos.x + Math.cos((i / 6) * Math.PI * 2) * 0.65, firePos.y + 0.15, firePos.z + Math.sin((i / 6) * Math.PI * 2) * 0.65);
  scene.add(stone);
}
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 6), new THREE.MeshBasicMaterial({ color: 0xfb923c }));
flame.position.set(firePos.x, firePos.y + 0.45, firePos.z);
scene.add(flame);
const beachFireLight = new THREE.PointLight(0xfb923c, 1.8, 20);
beachFireLight.position.set(firePos.x, firePos.y + 1.4, firePos.z);
scene.add(beachFireLight);

for (let i = 0; i < 14; i++) {
  const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  sp.position.set(firePos.x, firePos.y + 0.5 + Math.random() * 2, firePos.z);
  scene.add(sp);
  bonfireSparks.push({ mesh: sp, speed: 0.7 + Math.random() * 0.9, phase: Math.random() * 6 });
}

// Instanced Grass
const grassPositions = [];
for (let i = 0; i < 1400; i++) {
  const gx = (Math.random() - 0.5) * 76;
  const gz = -22 + Math.random() * 130;
  const gy = getTerrainHeight(gx, gz);
  if (gy < 0.15) continue;
  if (gz < 16 && Math.hypot(gx, gz + 4) < 9.0) continue;
  if (gz < 18 && Math.abs(gx) < 2.8) continue;
  if (gz >= 40 && Math.abs(gx - mountainTrailX(gz)) < 3.8) continue;
  grassPositions.push({ x: gx, y: gy, z: gz });
}

const grassGeo = new THREE.ConeGeometry(0.14, 0.62, 4);
grassGeo.translate(0, 0.31, 0);
const grassMesh = new THREE.InstancedMesh(grassGeo, cozyMat(0xffffff, 0.9), grassPositions.length);
grassMesh.receiveShadow = true;

const dummy = new THREE.Object3D();
const grassShades = [new THREE.Color(0x4d8b5c), new THREE.Color(0x3a7048), new THREE.Color(0x65a36c), new THREE.Color(0x7ca965)];
grassPositions.forEach((p, idx) => {
  dummy.position.set(p.x, p.y - 0.04, p.z);
  dummy.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25);
  const sc = 0.7 + Math.random() * 0.75;
  dummy.scale.set(sc, sc, sc);
  dummy.updateMatrix();
  grassMesh.setMatrixAt(idx, dummy.matrix);
  grassMesh.setColorAt(idx, grassShades[idx % grassShades.length]);
});
grassMesh.instanceMatrix.needsUpdate = true;
if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
scene.add(grassMesh);

const dustCount = 160;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 44;
  dustPos[i * 3 + 1] = Math.random() * 14 + 0.5;
  dustPos[i * 3 + 2] = Math.random() * 195 - 20;
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dustSystem = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({ color: 0xfef3c7, size: 0.14, transparent: true, opacity: 0.55 })
);
scene.add(dustSystem);

/* 9. Articulated 3D Human Character Builder (Lathe Torso, Jointed Limbs, Sculpted Hair) */
function createHumanCharacter({ topColor, bottomColor = 0x1e293b, hairColor = 0x1c1917, skin = 0xffe0c4, scarf = 0xf43f5e, isFemale = false }) {
  const g = new THREE.Group();
  const skinMat = cozyMat(skin, 0.72);
  const topMat = cozyMat(topColor, 0.76);
  const pantMat = cozyMat(bottomColor, 0.85);
  const shoeMat = cozyMat(0x27272a, 0.7);
  const hairMat = cozyMat(hairColor, 0.82);

  // 1. Jointed Legs (Hip -> Thigh -> Knee -> Shin -> Sneaker)
  const thighGeo = new THREE.CapsuleGeometry(0.086, 0.24, 6, 12);
  thighGeo.translate(0, -0.20, 0);
  const shinGeo = new THREE.CapsuleGeometry(0.072, 0.23, 6, 12);
  shinGeo.translate(0, -0.19, 0);
  const shoeGeo = new THREE.CapsuleGeometry(0.075, 0.12, 6, 10);
  shoeGeo.rotateX(Math.PI / 2);

  function makeLeg(sideX) {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(sideX, 0.82, 0);

    const thigh = new THREE.Mesh(thighGeo, isFemale ? skinMat : pantMat);
    thigh.castShadow = true;

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.38, 0);

    const shin = new THREE.Mesh(shinGeo, isFemale ? skinMat : pantMat);
    shin.castShadow = true;

    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.37, 0.05);
    shoe.castShadow = true;

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.25), cozyMat(0xf8fafc, 0.8));
    sole.position.set(0, -0.43, 0.05);

    kneeGroup.add(shin, shoe, sole);
    hipGroup.add(thigh, kneeGroup);
    return { hipGroup, kneeGroup };
  }

  const left = makeLeg(-0.125);
  const right = makeLeg(0.125);
  g.add(left.hipGroup, right.hipGroup);

  // 2. Sculpted Human Torso via LatheGeometry (Waist, Chest, Shoulders, Coat/Skirt)
  const profile = isFemale
    ? [
        new THREE.Vector2(0.01, 0.64),
        new THREE.Vector2(0.28, 0.66),
        new THREE.Vector2(0.22, 0.86),
        new THREE.Vector2(0.16, 1.03), // Fitted waist
        new THREE.Vector2(0.21, 1.22), // Chest
        new THREE.Vector2(0.19, 1.35), // Shoulders
        new THREE.Vector2(0.08, 1.39)  // Collar
      ]
    : [
        new THREE.Vector2(0.01, 0.76),
        new THREE.Vector2(0.22, 0.78),
        new THREE.Vector2(0.19, 0.96), // Waist
        new THREE.Vector2(0.24, 1.24), // Chest / Shoulders
        new THREE.Vector2(0.22, 1.36),
        new THREE.Vector2(0.09, 1.40)  // Collar
      ];

  const torsoGeo = new THREE.LatheGeometry(profile, 18);
  const torso = new THREE.Mesh(torsoGeo, topMat);
  torso.scale.set(1.08, 1, 0.75); // Natural human oval cross-section!
  torso.castShadow = true;
  g.add(torso);

  // Cozy Scarf + Back Tail
  const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 18), cozyMat(scarf, 0.8));
  scarfRing.rotation.x = Math.PI / 2;
  scarfRing.position.set(0, 1.39, 0.01);
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.04), cozyMat(scarf, 0.8));
  scarfTail.position.set(0.06, 1.22, -0.17);
  scarfTail.rotation.x = 0.16;
  g.add(scarfRing, scarfTail);

  // 3. Jointed Arms (Shoulder -> Upper Arm -> Elbow -> Forearm -> Hand)
  const upperArmGeo = new THREE.CapsuleGeometry(0.062, 0.19, 6, 10);
  upperArmGeo.translate(0, -0.12, 0);
  const forearmGeo = new THREE.CapsuleGeometry(0.055, 0.18, 6, 10);
  forearmGeo.translate(0, -0.11, 0);

  function makeArm(sideX) {
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(sideX, 1.31, 0);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 10), topMat);
    const upperArm = new THREE.Mesh(upperArmGeo, topMat);
    upperArm.castShadow = true;

    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, -0.25, 0);
    elbowGroup.rotation.x = -0.18;

    const forearm = new THREE.Mesh(forearmGeo, topMat);
    forearm.castShadow = true;

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), skinMat);
    hand.position.set(0, -0.23, 0);

    elbowGroup.add(forearm, hand);
    shoulderGroup.add(shoulderCap, upperArm, elbowGroup);
    return { shoulderGroup, elbowGroup };
  }

  const leftArm = makeArm(isFemale ? -0.24 : -0.27);
  const rightArm = makeArm(isFemale ? 0.24 : 0.27);
  g.add(leftArm.shoulderGroup, rightArm.shoulderGroup);

  // 4. Neck, Human Head, Ears & Face
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.16, 12), skinMat);
  neck.position.set(0, 1.44, 0);
  g.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.66, 0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 24, 24), skinMat);
  head.scale.set(0.93, 1.07, 0.96);
  head.castShadow = true;
  headGroup.add(head);

  // Ears
  [-0.21, 0.21].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 10), skinMat);
    ear.scale.set(0.55, 1.0, 0.8);
    ear.position.set(ex, -0.01, -0.01);
    headGroup.add(ear);
  });

  // Expressive Anime Eyes + Eyebrows + Tiny Nose + Blush
  [-0.085, 0.085].forEach((ex) => {
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 10), new THREE.MeshBasicMaterial({ color: 0x1e1b4b }));
    iris.scale.set(0.85, 1.25, 0.45);
    iris.position.set(ex, -0.01, 0.205);

    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    sparkle.position.set(ex + 0.012, 0.01, 0.22);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.015), hairMat);
    brow.position.set(ex, 0.065, 0.205);

    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfda4af }));
    blush.scale.set(1.3, 0.55, 0.3);
    blush.position.set(ex * 1.45, -0.065, 0.195);

    headGroup.add(iris, sparkle, brow, blush);
  });

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), skinMat);
  nose.position.set(0, -0.04, 0.225);
  headGroup.add(nose);

  // 5. Sculpted Anime Hair (Short Layered vs Flowing Long Hair)
  const scalp = new THREE.Mesh(
    new THREE.SphereGeometry(0.242, 22, 22, 0, Math.PI * 2, 0, Math.PI * 0.64),
    hairMat
  );
  scalp.scale.set(0.96, 1.05, 1.0);
  scalp.rotation.x = -0.35; // Covers top and back of skull cleanly
  scalp.position.set(0, 0.015, -0.015);
  scalp.castShadow = true;
  headGroup.add(scalp);

  // Front Bangs Locks
  [-0.12, -0.05, 0.02, 0.09, 0.14].forEach((bx, idx) => {
    const bang = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 6), hairMat);
    bang.position.set(bx, 0.13, 0.18 - Math.abs(bx) * 0.3);
    bang.rotation.set(Math.PI - 0.28, 0, (idx - 2) * 0.12);
    headGroup.add(bang);
  });

  if (isFemale) {
    // Flowing Back Hair + Side Locks
    const backCurtain = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.36, 8, 14), hairMat);
    backCurtain.scale.set(1.18, 1.0, 0.55);
    backCurtain.position.set(0, -0.18, -0.14);
    backCurtain.rotation.x = 0.12;
    backCurtain.castShadow = true;
    headGroup.add(backCurtain);

    [-0.19, 0.19].forEach((sx) => {
      const sideLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.26, 6, 8), hairMat);
      sideLock.position.set(sx, -0.12, 0.08);
      headGroup.add(sideLock);
    });

    // Cute Hair Ribbon on Back
    const ribbonTie = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 12), cozyMat(scarf, 0.7));
    ribbonTie.position.set(0, -0.02, -0.23);
    headGroup.add(ribbonTie);
  } else {
    // Short Tousled Male Hair at Back of Neck
    [-0.1, -0.03, 0.04, 0.1].forEach((nx, idx) => {
      const lock = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 6), hairMat);
      lock.position.set(nx, -0.08, -0.19);
      lock.rotation.set(Math.PI + 0.2, 0, (idx - 1.5) * 0.15);
      headGroup.add(lock);
    });
  }

  g.add(headGroup);

  g.userData = {
    leftHip: left.hipGroup,
    rightHip: right.hipGroup,
    leftKnee: left.kneeGroup,
    rightKnee: right.kneeGroup,
    leftShoulder: leftArm.shoulderGroup,
    rightShoulder: rightArm.shoulderGroup,
    leftElbow: leftArm.elbowGroup,
    rightElbow: rightArm.elbowGroup,
    headGroup,
    walkCycle: 0,
    sitting: false
  };
  scene.add(g);
  return g;
}

function setCharacterSitting(char, isSitting) {
  const u = char.userData;
  u.sitting = isSitting;
  if (isSitting) {
    u.leftHip.rotation.x = -Math.PI / 2.15;
    u.rightHip.rotation.x = -Math.PI / 2.15;
    u.leftKnee.rotation.x = Math.PI / 2.3;
    u.rightKnee.rotation.x = Math.PI / 2.3;
    u.leftShoulder.rotation.x = -0.35;
    u.rightShoulder.rotation.x = -0.35;
    u.leftElbow.rotation.x = -0.5;
    u.rightElbow.rotation.x = -0.5;
  }
}

function animateCharacterPose(char, isMoving, isSwimming, dt) {
  const u = char.userData;
  if (u.sitting) return;

  if (isSwimming) {
    u.walkCycle += dt * 7;
    u.leftShoulder.rotation.x = -Math.PI / 2 + Math.sin(u.walkCycle) * 0.7;
    u.rightShoulder.rotation.x = -Math.PI / 2 + Math.cos(u.walkCycle) * 0.7;
    u.leftHip.rotation.x = Math.sin(u.walkCycle * 1.4) * 0.45;
    u.rightHip.rotation.x = -Math.sin(u.walkCycle * 1.4) * 0.45;
    u.leftKnee.rotation.x = 0.25;
    u.rightKnee.rotation.x = 0.25;
  } else if (isMoving) {
    u.walkCycle += dt * 10.5;
    const s = Math.sin(u.walkCycle) * 0.55;
    u.leftHip.rotation.x = s;
    u.rightHip.rotation.x = -s;
    u.leftKnee.rotation.x = Math.max(0, -s * 0.75);
    u.rightKnee.rotation.x = Math.max(0, s * 0.75);
    u.leftShoulder.rotation.x = -s * 0.65;
    u.rightShoulder.rotation.x = s * 0.65;
  } else {
    u.leftHip.rotation.x *= 0.84;
    u.rightHip.rotation.x *= 0.84;
    u.leftKnee.rotation.x *= 0.84;
    u.rightKnee.rotation.x *= 0.84;
    u.leftShoulder.rotation.x *= 0.84;
    u.rightShoulder.rotation.x *= 0.84;
  }
}

// Main Story Cast
const eric = createHumanCharacter({ topColor: 0x3b82f6, bottomColor: 0x1e293b, hairColor: 0x1c1917, scarf: 0xfbbf24, isFemale: false });
eric.position.set(-1.3, 0, -4);
eric.rotation.y = Math.PI / 2;

const jane = createHumanCharacter({ topColor: 0xfb7185, hairColor: 0x451a03, scarf: 0xf43f5e, isFemale: true });
jane.position.set(1.3, 0, -4);
jane.rotation.y = -Math.PI / 2;

const sora = createHumanCharacter({ topColor: 0xfacc15, hairColor: 0x57361a, scarf: 0xe11d48, isFemale: true });
sora.position.set(-8.0, 0, -3.2);
sora.rotation.y = Math.PI / 3;

// Lively Townspeople
const villagers = [
  { mesh: createHumanCharacter({ topColor: 0x10b981, hairColor: 0x292524, scarf: 0xfef3c7, isFemale: false }), type: "orbit", cx: 0, cz: -4, r: 6.4, angle: 0.4, speed: 0.35 },
  { mesh: createHumanCharacter({ topColor: 0x8b5cf6, hairColor: 0x451a03, scarf: 0x38bdf8, isFemale: true }), type: "orbit", cx: 0, cz: -4, r: 6.8, angle: 3.5, speed: -0.3 },
  { mesh: createHumanCharacter({ topColor: 0xea580c, hairColor: 0x1c1917, scarf: 0xfde047, isFemale: false }), type: "patrol", x1: -8, z1: 11, x2: 8, z2: 11, t: 0.2, dir: 1, speed: 0.16 },
  { mesh: createHumanCharacter({ topColor: 0x14b8a6, hairColor: 0x78350f, scarf: 0xf472b6, isFemale: true }), type: "patrol", x1: -9, z1: -14, x2: 9, z2: -14, t: 0.7, dir: -1, speed: 0.14 },
  { mesh: createHumanCharacter({ topColor: 0xf97316, hairColor: 0x451a03, scarf: 0xffffff, isFemale: true }), type: "idle", x: 8.2, z: -3.3, rotY: -Math.PI / 3 },
  { mesh: createHumanCharacter({ topColor: 0x6366f1, hairColor: 0x1c1917, scarf: 0xfb7185, isFemale: false }), type: "idle", x: 6.5, z: -9.0, rotY: -0.5 }
];
villagers.forEach((v) => {
  if (v.type === "idle") {
    v.mesh.position.set(v.x, getTerrainHeight(v.x, v.z), v.z);
    v.mesh.rotation.y = v.rotY;
  }
});

/* 10. Collectibles, Waypoint & Falling Meteors */
const scarfItem = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.32, 0.09, 36, 8),
  new THREE.MeshBasicMaterial({ color: 0xf43f5e })
);
scarfItem.position.set(-5.8, 0.9, 28);
scarfItem.visible = false;
scene.add(scarfItem);

const keyItem = new THREE.Mesh(
  new THREE.TorusGeometry(0.32, 0.09, 8, 16),
  new THREE.MeshBasicMaterial({ color: 0xfde047 })
);
keyItem.position.set(14.2, keyCliffY + 0.9, 59);
keyItem.visible = false;
scene.add(keyItem);

const locketItem = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.4),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
);
locketItem.position.set(0, summitY + 1.1, 78);
locketItem.visible = false;
scene.add(locketItem);

const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.45, 0.45, 22, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
);
beacon.visible = false;
scene.add(beacon);

function spawnMeteorNearPlayer() {
  const tx = eric.position.x + (Math.random() - 0.5) * 5;
  const tz = eric.position.z + (Math.random() - 0.5) * 6 + 2;
  const ty = getTerrainHeight(tx, tz);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(tx, ty + 0.15, tz);
  scene.add(ring);

  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75), cozyMat(0x475569));
  rock.position.set(tx, ty + 18, tz);
  scene.add(rock);

  activeMeteors.push({ ring, rock, tx, ty, tz, timer: 1.35, hit: false });
}

/* 11. Color Filter & Petals */
function setWorldGrayscale(pct) {
  state.grayscale = pct;
  canvas.style.filter = `grayscale(${pct}%) contrast(${pct > 50 ? 1.12 : 1.04}) saturate(${pct === 0 ? 1.15 : 1})`;
  document.getElementById("colorMeter").textContent = `Color: ${Math.round(100 - pct)}%`;
}

function spawnColorPetals() {
  const count = 130;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const cols = new Float32Array(count * 3);
  const pal = [new THREE.Color(0xfb7185), new THREE.Color(0xfbbf24), new THREE.Color(0x38bdf8), new THREE.Color(0xc084fc)];

  for (let i = 0; i < count; i++) {
    pos[i * 3] = eric.position.x + (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = eric.position.y + Math.random() * 8 + 0.5;
    pos[i * 3 + 2] = eric.position.z + (Math.random() - 0.5) * 18;
    const c = pal[i % pal.length];
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  petalSystem = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.25, vertexColors: true, transparent: true, opacity: 0.9 }));
  scene.add(petalSystem);
}

/* 12. Dialogue & Quests */
function startDialogue(lines, onComplete = null) {
  state.dialogueActive = true;
  state.dialogueQueue = lines;
  state.dialogueIndex = 0;
  state.dialogueOnComplete = onComplete;
  document.getElementById("choiceGroup").hidden = true;
  document.getElementById("dialogueHint").hidden = false;
  document.getElementById("dialogueBox").hidden = false;
  renderDialogueLine();
}

function renderDialogueLine() {
  const line = state.dialogueQueue[state.dialogueIndex];
  document.getElementById("speakerName").textContent = line.speaker;
  document.getElementById("speakerRole").textContent = line.role || "";
  document.getElementById("dialogueText").textContent = line.text;
  AudioEngine.blip();

  const cg = document.getElementById("choiceGroup");
  if (line.choices) {
    cg.innerHTML = "";
    cg.hidden = false;
    document.getElementById("dialogueHint").hidden = true;
    line.choices.forEach((ch) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = ch.label;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        AudioEngine.blip();
        cg.hidden = true;
        document.getElementById("dialogueHint").hidden = false;
        ch.onPick();
      });
      cg.appendChild(btn);
    });
  } else {
    cg.hidden = true;
    document.getElementById("dialogueHint").hidden = false;
  }
}

function advanceDialogue() {
  if (!state.dialogueActive) return;
  if (state.dialogueQueue[state.dialogueIndex]?.choices) return;

  state.dialogueIndex++;
  if (state.dialogueIndex < state.dialogueQueue.length) {
    renderDialogueLine();
  } else {
    document.getElementById("dialogueBox").hidden = true;
    state.dialogueActive = false;
    const cb = state.dialogueOnComplete;
    state.dialogueOnComplete = null;
    if (cb) cb();
  }
}

function updateQuestUI(step) {
  state.questStep = step;
  const info = QUEST_INFO[step];
  document.getElementById("questTitle").textContent = info.title;
  document.getElementById("questDesc").textContent = info.desc;
  document.getElementById("compassLine").hidden = step === 0 || step === 7;
  document.getElementById("badgeScarf").classList.toggle("owned", state.hasScarf);
  document.getElementById("badgeKey").classList.toggle("owned", state.hasKey);
  document.getElementById("badgeLocket").classList.toggle("owned", state.hasLocket);
}

function showAlert(msg, ms = 2400) {
  const el = document.getElementById("alertBanner");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, ms);
}

/* 13. Cutscenes & Interactions */
function beginOpeningQuarrel() {
  state.phase = "QUARREL";
  document.getElementById("hud").hidden = false;
  updateQuestUI(0);
  setWorldGrayscale(0);

  startDialogue(
    [
      { speaker: "Jane", role: "Hurt", text: "You kept talking about your dreams, Eric, and forgot I was standing right next to you." },
      { speaker: "Eric", role: "You", text: "I'm working hard for both of us, Jane! Why can't you see how stressed I am?" },
      { speaker: "Jane", role: "", text: "I believed in you when nobody else did. Now I just feel completely alone beside you." },
      { speaker: "Jane", role: "", text: "I'm going away. Don't bother looking for me." }
    ],
    () => {
      state.phase = "JANE_LEAVING";
      document.getElementById("questDesc").textContent = "Jane is walking away...";
      AudioEngine.colorDrain();
      setWorldGrayscale(100);
    }
  );
}

function finishJaneLeaving() {
  const beachZ = 158;
  const beachY = getTerrainHeight(0, beachZ);
  jane.position.set(-0.45, beachY - 0.52, beachZ);
  jane.rotation.y = 0;
  setCharacterSitting(jane, true);

  state.phase = "EXPLORE";
  updateQuestUI(1);
  document.getElementById("staminaBox").hidden = false;
  document.getElementById("controlsHint").hidden = false;
  if ("ontouchstart" in window || window.innerWidth <= 768) {
    document.getElementById("mobilePad").hidden = false;
  }

  startDialogue([
    { speaker: "Eric", role: "Inner Voice", text: "The whole world just turned black and white..." },
    { speaker: "Eric", role: "Inner Voice", text: "I was wrong. No matter how far she went, I have to find Jane and tell her I'm sorry." }
  ]);
}

function interactWithTarget(target) {
  if (target.id === "sora" && state.questStep === 1) {
    startDialogue(
      [
        { speaker: "Sora", role: "Lantern Keeper", text: "Eric! Jane hurried north out of town crying—the river bridge collapsed, so she crossed the rocks!" },
        { speaker: "Sora", role: "Lantern Keeper", text: "I saw her red scarf snag out in the rushing river. Watch your stamina in the water, and watch for falling meteors up on Storm Ridge!" }
      ],
      () => {
        scarfItem.visible = true;
        updateQuestUI(2);
      }
    );
  } else if (target.id === "sora") {
    startDialogue([{ speaker: "Sora", role: "Lantern Keeper", text: "Follow the warm beacon north, Eric. She's waiting beyond the ridge by the ocean!" }]);
  } else if (target.id === "scarf" && state.questStep === 2) {
    scarfItem.visible = false;
    state.hasScarf = true;
    AudioEngine.sparkle();
    setWorldGrayscale(75);
    keyItem.visible = true;
    updateQuestUI(3);
    startDialogue([
      { speaker: "Eric", role: "", text: "Jane's Red Scarf... Holding it brings back a spark of warm light." },
      { speaker: "Eric", role: "", text: "The Summit Gate ahead is locked. I need the Sky Key from the East Cliff ledge!" }
    ]);
  } else if (target.id === "key" && state.questStep === 3) {
    keyItem.visible = false;
    state.hasKey = true;
    AudioEngine.sparkle();
    setWorldGrayscale(55);
    updateQuestUI(4);
    startDialogue([{ speaker: "Eric", role: "", text: "Got the Sky Key! Now I can unlock the Summit Torii Gate at the top of the ridge!" }]);
  } else if (target.id === "gate" && state.questStep === 4) {
    state.gateUnlocked = true;
    gateDoor.visible = false;
    locketItem.visible = true;
    AudioEngine.sparkle();
    showAlert("🗝️ Summit Gate Unlocked!", 2200);
  } else if (target.id === "locket" && state.questStep === 4) {
    locketItem.visible = false;
    state.hasLocket = true;
    AudioEngine.sparkle();
    setWorldGrayscale(30);
    updateQuestUI(5);
    startDialogue([
      { speaker: "Eric", role: "", text: "Her Silver Locket! Look past the cliffs—I can see the Tidal Cove and the beach!" },
      { speaker: "Eric", role: "", text: "Swim across the sandbars to reach Jane before the sun sets!" }
    ]);
  } else if (target.id === "jane" && (state.questStep === 5 || state.questStep === 6)) {
    startDialogue([
      { speaker: "Jane", role: "Facing the sunset", text: "...Eric? You actually climbed the ridge and swam all the way out here?" },
      {
        speaker: "Eric",
        role: "Say what you couldn't before",
        text: "Stand beside Jane and speak from your heart:",
        choices: [
          {
            label: "1. \"I'm sorry, Jane. No words can describe how sorry I feel. Seeing things from your perspective saddens me.\"",
            onPick: () => triggerSunsetFinale()
          },
          {
            label: "2. \"My world had no color without you. I'm truly sorry for taking you for granted.\"",
            onPick: () => triggerSunsetFinale()
          }
        ]
      }
    ]);
  }
}

function triggerSunsetFinale() {
  const beachY = getTerrainHeight(0.45, 158);
  eric.position.set(0.45, beachY - 0.52, 158);
  eric.rotation.y = 0;
  setCharacterSitting(eric, true);

  startDialogue(
    [
      { speaker: "Eric", role: "", text: "I brought your scarf and your locket. As long as we hold tight and walk together, I won't ever let go again." },
      { speaker: "Jane", role: "Smiling with tears", text: "You really went through all of that just to say you're sorry..." },
      { speaker: "Jane", role: "", text: "Sit down with me, Eric. Look at the sunset." }
    ],
    () => {
      AudioEngine.colorReturn();
      setWorldGrayscale(0);
      spawnColorPetals();
      updateQuestUI(7);
      state.phase = "ENDING";
      document.getElementById("staminaBox").hidden = true;
      setTimeout(() => {
        document.getElementById("endingOverlay").hidden = false;
      }, 2200);
    }
  );
}

/* 14. Support Height, Walkable Planks & Colliders */
function getSupportHeight(x, z, currentY) {
  let y = getTerrainHeight(x, z);
  for (const p of platforms) {
    const onRock = Math.hypot(x - p.x, z - p.z) <= p.r;
    if (onRock && (currentY >= p.y - 1.45 || (state.isSwimming && p.y <= 0.75))) {
      y = Math.max(y, p.y);
    }
  }
  for (const b of boxPlatforms) {
    const onBox = Math.abs(x - b.x) <= b.halfW && Math.abs(z - b.z) <= b.halfD;
    if (onBox && (currentY >= b.y - 1.45 || (state.isSwimming && b.y <= 0.75))) {
      y = Math.max(y, b.y);
    }
  }
  return y;
}

function canMoveTo(nx, nz, currentY) {
  if (nx < -36 || nx > 36 || nz < -24 || nz > 165) return false;
  if (!state.gateUnlocked && nz >= 74.2 && nz <= 76.2 && Math.abs(nx) < 4.5) return false;
  for (const c of colliders) {
    if (Math.hypot(nx - c.x, nz - c.z) < c.r) return false;
  }
  const targetH = getSupportHeight(nx, nz, currentY);
  const maxStepUp = state.isSwimming ? 1.85 : 0.9;
  if (targetH - currentY > maxStepUp) return false;
  return true;
}

function getCurrentObjectivePos() {
  if (state.questStep === 1) return { x: sora.position.x, z: sora.position.z };
  if (state.questStep === 2) return { x: scarfItem.position.x, z: scarfItem.position.z };
  if (state.questStep === 3) return { x: keyItem.position.x, z: keyItem.position.z };
  if (state.questStep === 4) {
    return state.gateUnlocked ? { x: locketItem.position.x, z: locketItem.position.z } : { x: 0, z: 74 };
  }
  if (state.questStep === 5 || state.questStep === 6) return { x: jane.position.x, z: jane.position.z };
  return null;
}

function findNearbyInteractable() {
  if (state.phase !== "EXPLORE" || state.dialogueActive) return null;
  const px = eric.position.x;
  const pz = eric.position.z;

  if (Math.hypot(px - sora.position.x, pz - sora.position.z) < 3.2) return { id: "sora", label: "Talk to Sora" };
  if (state.questStep === 2 && scarfItem.visible && Math.hypot(px - scarfItem.position.x, pz - scarfItem.position.z) < 2.6) {
    return { id: "scarf", label: "Take Red Scarf" };
  }
  if (state.questStep === 3 && keyItem.visible && Math.hypot(px - keyItem.position.x, pz - keyItem.position.z) < 2.6) {
    return { id: "key", label: "Pick up Sky Key" };
  }
  if (state.questStep === 4 && !state.gateUnlocked && Math.hypot(px, pz - 74.2) < 3.2) {
    return { id: "gate", label: "Unlock Summit Gate" };
  }
  if (state.questStep === 4 && state.gateUnlocked && locketItem.visible && Math.hypot(px - locketItem.position.x, pz - locketItem.position.z) < 2.8) {
    return { id: "locket", label: "Claim Silver Locket" };
  }
  if ((state.questStep === 5 || state.questStep === 6) && Math.hypot(px - jane.position.x, pz - jane.position.z) < 3.5) {
    return { id: "jane", label: "Speak to Jane" };
  }
  return null;
}

/* 15. Input Listeners */
window.addEventListener("keydown", (e) => {
  AudioEngine.unlock();
  const k = e.key.toLowerCase();
  state.keys[k] = true;

  if (e.key === " " || e.key === "Enter") {
    if (state.dialogueActive) {
      e.preventDefault();
      advanceDialogue();
    } else if (e.key === " " && state.phase === "EXPLORE" && (state.grounded || state.isSwimming)) {
      e.preventDefault();
      if (state.isSwimming) {
        eric.position.y = Math.max(eric.position.y, SEA_LEVEL - 0.12);
        state.isSwimming = false;
      }
      state.velY = 9.8;
      state.grounded = false;
      AudioEngine.jump();
    }
  }
  if (k === "e" && state.nearbyInteractable && !state.dialogueActive) {
    interactWithTarget(state.nearbyInteractable);
  }
});
window.addEventListener("keyup", (e) => { state.keys[e.key.toLowerCase()] = false; });

document.getElementById("dialogueBox").addEventListener("click", () => { AudioEngine.unlock(); advanceDialogue(); });
document.getElementById("interactPrompt").addEventListener("click", () => {
  AudioEngine.unlock();
  if (state.nearbyInteractable) interactWithTarget(state.nearbyInteractable);
});
document.getElementById("mobileActionBtn").addEventListener("click", () => {
  AudioEngine.unlock();
  if (state.dialogueActive) advanceDialogue();
  else if (state.nearbyInteractable) interactWithTarget(state.nearbyInteractable);
});
document.getElementById("mobileJumpBtn").addEventListener("click", () => {
  AudioEngine.unlock();
  if (state.phase === "EXPLORE" && (state.grounded || state.isSwimming)) {
    if (state.isSwimming) {
      eric.position.y = Math.max(eric.position.y, SEA_LEVEL - 0.12);
      state.isSwimming = false;
    }
    state.velY = 9.8;
    state.grounded = false;
    AudioEngine.jump();
  }
});

document.querySelectorAll(".pad-btn").forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); AudioEngine.unlock(); state.keys[k] = true; };
  const off = () => { state.keys[k] = false; };
  btn.addEventListener("mousedown", on);
  btn.addEventListener("touchstart", on, { passive: false });
  btn.addEventListener("mouseup", off);
  btn.addEventListener("mouseleave", off);
  btn.addEventListener("touchend", off);
});

canvas.addEventListener("mousedown", (e) => { AudioEngine.unlock(); state.isDragging = true; state.lastMouseX = e.clientX; state.lastMouseY = e.clientY; });
window.addEventListener("mousemove", (e) => {
  if (!state.isDragging) return;
  state.camYaw -= (e.clientX - state.lastMouseX) * 0.006;
  state.camPitch = Math.max(0.14, Math.min(0.85, state.camPitch + (e.clientY - state.lastMouseY) * 0.004));
  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;
});
window.addEventListener("mouseup", () => { state.isDragging = false; });

document.getElementById("muteBtn").addEventListener("click", (e) => {
  e.target.textContent = AudioEngine.toggleMute() ? "🔇 Muted" : "🔊 Sound On";
});
document.getElementById("restartBtn").addEventListener("click", () => location.reload());
document.getElementById("playAgainBtn").addEventListener("click", () => location.reload());
document.getElementById("exploreFreeBtn").addEventListener("click", () => {
  document.getElementById("endingOverlay").hidden = true;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* 16. Main Loop */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  const wPos = waterGeo.attributes.position;
  for (let i = 0; i < wPos.count; i++) {
    wPos.setY(i, getWaterHeight(wPos.getX(i), wPos.getZ(i), elapsed));
  }
  wPos.needsUpdate = true;

  shoreFoam.position.z = 164.4 + Math.sin(elapsed * 1.9) * 0.65;
  shoreFoam.material.opacity = 0.35 + Math.sin(elapsed * 1.9) * 0.14;

  riverFoamStreaks.forEach((s) => {
    s.mesh.position.x += s.speed * dt;
    s.mesh.position.y = getWaterHeight(s.mesh.position.x, s.mesh.position.z, elapsed) + 0.04;
    if (s.mesh.position.x > 22) s.mesh.position.x = -22;
  });

  for (let i = waterRipples.length - 1; i >= 0; i--) {
    const r = waterRipples[i];
    r.life += dt;
    const prog = r.life / r.maxLife;
    if (prog >= 1) {
      scene.remove(r.mesh);
      waterRipples.splice(i, 1);
    } else {
      const sc = 1 + prog * r.maxScale;
      r.mesh.scale.set(sc, sc, 1);
      r.mesh.material.opacity = 0.72 * (1 - prog);
    }
  }

  for (let i = waterSplashes.length - 1; i >= 0; i--) {
    const s = waterSplashes[i];
    s.life -= dt;
    s.vy -= 12 * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    if (s.life <= 0) {
      scene.remove(s.mesh);
      waterSplashes.splice(i, 1);
    }
  }

  chimneySmokes.forEach((cs) => {
    const cycle = (elapsed * 0.45 + cs.offset) % 1;
    cs.mesh.position.y = cs.baseY + cycle * 2.6;
    cs.mesh.scale.setScalar(0.8 + cycle * 1.4);
    cs.mesh.material.opacity = 0.45 * (1 - cycle);
  });

  palmTops.forEach((pt, idx) => {
    pt.rotation.z = Math.sin(elapsed * 1.6 + idx) * 0.06;
  });

  flame.scale.set(1 + Math.sin(elapsed * 12) * 0.12, 1 + Math.cos(elapsed * 14) * 0.16, 1);
  beachFireLight.intensity = 1.6 + Math.sin(elapsed * 10) * 0.35;
  bonfireSparks.forEach((sp) => {
    sp.mesh.position.y += sp.speed * dt;
    sp.mesh.position.x = firePos.x + Math.sin(elapsed * 3 + sp.phase) * 0.32;
    if (sp.mesh.position.y > firePos.y + 3.2) sp.mesh.position.y = firePos.y + 0.4;
  });

  villagers.forEach((v) => {
    if (v.type === "orbit") {
      v.angle += v.speed * dt;
      const nx = v.cx + Math.cos(v.angle) * v.r;
      const nz = v.cz + Math.sin(v.angle) * v.r;
      const dx = nx - v.mesh.position.x;
      const dz = nz - v.mesh.position.z;
      v.mesh.position.set(nx, getTerrainHeight(nx, nz), nz);
      v.mesh.rotation.y = Math.atan2(dx, dz);
      animateCharacterPose(v.mesh, true, false, dt);
    } else if (v.type === "patrol") {
      v.t += v.dir * v.speed * dt;
      if (v.t >= 1) { v.t = 1; v.dir = -1; }
      if (v.t <= 0) { v.t = 0; v.dir = 1; }
      const nx = v.x1 + (v.x2 - v.x1) * v.t;
      const nz = v.z1 + (v.z2 - v.z1) * v.t;
      const dx = (v.x2 - v.x1) * v.dir;
      const dz = (v.z2 - v.z1) * v.dir;
      v.mesh.position.set(nx, getTerrainHeight(nx, nz), nz);
      v.mesh.rotation.y = Math.atan2(dx, dz);
      animateCharacterPose(v.mesh, true, false, dt);
    }
  });

  const dPos = dustGeo.attributes.position;
  for (let i = 0; i < dPos.count; i++) {
    let dy = dPos.getY(i) + Math.sin(elapsed + i) * dt * 0.25;
    if (dy > 15) dy = 0.5;
    dPos.setY(i, dy);
  }
  dPos.needsUpdate = true;

  if (scarfItem.visible) { scarfItem.rotation.y += dt * 2.5; scarfItem.position.y = 0.9 + Math.sin(elapsed * 3) * 0.14; }
  if (keyItem.visible) { keyItem.rotation.y += dt * 2.5; keyItem.position.y = keyCliffY + 0.9 + Math.sin(elapsed * 3) * 0.14; }
  if (locketItem.visible) { locketItem.rotation.y += dt * 2.5; locketItem.position.y = summitY + 1.1 + Math.sin(elapsed * 3) * 0.14; }

  if (petalSystem) {
    const pAttr = petalSystem.geometry.attributes.position;
    for (let i = 0; i < pAttr.count; i++) {
      let py = pAttr.getY(i) - dt * 0.9;
      if (py < 0.2) py = 8.5;
      pAttr.setY(i, py);
      pAttr.setX(i, pAttr.getX(i) + Math.sin(elapsed + i) * dt * 0.45);
    }
    pAttr.needsUpdate = true;
  }

  for (let i = activeMeteors.length - 1; i >= 0; i--) {
    const m = activeMeteors[i];
    m.timer -= dt;
    m.rock.position.y = m.ty + Math.max(0, (m.timer / 1.35) * 18);
    m.rock.rotation.x += dt * 4;
    if (m.timer <= 0) {
      if (!m.hit && Math.hypot(eric.position.x - m.tx, eric.position.z - m.tz) < 1.85) {
        m.hit = true;
        AudioEngine.hit();
        state.stamina = Math.max(10, state.stamina - 28);
        eric.position.z -= 1.6;
        showAlert("☄️ Hit by a falling meteor!", 1800);
      }
      scene.remove(m.ring, m.rock);
      activeMeteors.splice(i, 1);
    }
  }

  if (state.phase === "JANE_LEAVING") {
    jane.position.x += (0 - jane.position.x) * dt * 1.6;
    jane.position.z += dt * 4.8;
    jane.rotation.y = 0;
    animateCharacterPose(jane, true, false, dt);
    if (jane.position.z >= 18.5) {
      animateCharacterPose(jane, false, false, dt);
      finishJaneLeaving();
    }
  }

  let playerMoving = false;
  if (state.phase === "EXPLORE" && !state.dialogueActive) {
    if (state.keys["q"]) state.camYaw += dt * 2.0;

    const pz = eric.position.z;
    document.getElementById("zoneLabel").textContent =
      pz < 17 ? "Lantern Town" : pz < 40 ? "Rushing River" : pz < 112 ? "Storm Ridge" : pz < 150 ? "Tidal Cove" : "Sunset Beach";

    if (pz >= 150 && state.questStep === 5) updateQuestUI(6);

    if (pz >= 44 && pz <= 108) {
      state.windTimer += dt;
      state.meteorTimer += dt;
      if (state.windTimer > 7) {
        state.windForceX = Math.sin(elapsed) > 0 ? 3.2 : -3.2;
        showAlert("💨 Mountain Wind Gust!", 2000);
        state.windTimer = 0;
      } else if (state.windTimer > 2.4) {
        state.windForceX = 0;
      }
      if (state.meteorTimer > 3.6) {
        state.meteorTimer = 0;
        spawnMeteorNearPlayer();
      }
    } else {
      state.windForceX = 0;
    }

    const supportY = getSupportHeight(eric.position.x, eric.position.z, eric.position.y);
    const inWater = supportY < SEA_LEVEL - 0.35 && eric.position.y <= SEA_LEVEL - 0.15 && state.velY <= 0;
    if (inWater && !state.isSwimming) {
      AudioEngine.splash();
      spawnSplash(eric.position.x, eric.position.z, 12);
      spawnRipple(eric.position.x, eric.position.z, 3.2);
    }
    state.isSwimming = inWater;

    if (!inWater && state.grounded) {
      state.lastSafePos = { x: eric.position.x, y: eric.position.y, z: eric.position.z };
    }

    let fwd = 0, side = 0;
    if (state.keys["w"] || state.keys["arrowup"]) fwd += 1;
    if (state.keys["s"] || state.keys["arrowdown"]) fwd -= 1;
    if (state.keys["a"] || state.keys["arrowleft"]) side -= 1;
    if (state.keys["d"] || state.keys["arrowright"]) side += 1;

    const wantsSprint = state.keys["shift"] && state.stamina > 5 && !inWater;
    const isMovingInput = fwd !== 0 || side !== 0;

    if (inWater) {
      state.stamina = Math.max(0, state.stamina - dt * (isMovingInput ? 12 : 6));
      if (state.stamina <= 0) {
        showAlert("Exhausted by the tide! Swept back to shore.", 2500);
        eric.position.set(state.lastSafePos.x, state.lastSafePos.y + 0.3, state.lastSafePos.z);
        state.stamina = 45;
      }
      state.rippleTimer += dt;
      if (state.rippleTimer > (isMovingInput ? 0.25 : 0.65)) {
        state.rippleTimer = 0;
        spawnRipple(eric.position.x, eric.position.z, isMovingInput ? 2.6 : 1.6);
      }
    } else if (wantsSprint && isMovingInput) {
      state.stamina = Math.max(0, state.stamina - dt * 20);
    } else {
      state.stamina = Math.min(100, state.stamina + dt * 26);
    }

    const stamEl = document.getElementById("staminaFill");
    stamEl.style.width = `${state.stamina}%`;
    stamEl.style.background = state.stamina < 25 ? "#ef4444" : state.stamina < 55 ? "#eab308" : "#22c55e";
    document.getElementById("staminaState").textContent = inWater ? "Swimming" : wantsSprint && isMovingInput ? "Sprinting" : "Ready";

    let moveX = state.windForceX * dt;
    let moveZ = 0;
    if (inWater && pz >= 18 && pz <= 39) moveX += 2.2 * dt;
    if (inWater && pz > 112 && pz <= 150) moveX += Math.sin(elapsed * 0.9) * 1.1 * dt;

    if (isMovingInput) {
      const len = Math.hypot(fwd, side);
      fwd /= len; side /= len;
      const sinY = Math.sin(state.camYaw);
      const cosY = Math.cos(state.camYaw);
      const dirX = -sinY * fwd + cosY * side;
      const dirZ = -cosY * fwd - sinY * side;
      const speed = inWater ? 4.4 : wantsSprint ? 9.4 : 6.0;
      moveX += dirX * speed * dt;
      moveZ += dirZ * speed * dt;
      eric.rotation.y = Math.atan2(dirX, dirZ);
      playerMoving = true;
    }

    const nx = eric.position.x + moveX;
    const nz = eric.position.z + moveZ;
    if (canMoveTo(nx, eric.position.z, eric.position.y)) eric.position.x = nx;
    if (canMoveTo(eric.position.x, nz, eric.position.y)) eric.position.z = nz;

    const floorY = getSupportHeight(eric.position.x, eric.position.z, eric.position.y);
    if (state.isSwimming) {
      const waveY = getWaterHeight(eric.position.x, eric.position.z, elapsed);
      eric.position.y += (waveY - 0.72 - eric.position.y) * dt * 8;
      state.velY = 0;
      state.grounded = false;
    } else if (eric.position.y < floorY - 0.15 && state.velY <= 0) {
      eric.position.y = Math.min(floorY, eric.position.y + dt * 11);
      state.velY = 0;
      state.grounded = eric.position.y >= floorY - 0.02;
    } else {
      state.velY -= 24 * dt;
      eric.position.y += state.velY * dt;
      if (eric.position.y <= floorY) {
        eric.position.y = floorY;
        state.velY = 0;
        state.grounded = true;
      } else {
        state.grounded = false;
      }
    }

    state.nearbyInteractable = findNearbyInteractable();
    const promptBtn = document.getElementById("interactPrompt");
    if (state.nearbyInteractable) {
      promptBtn.hidden = false;
      promptBtn.innerHTML = `Press <kbd>E</kbd> / Tap: <strong>${state.nearbyInteractable.label}</strong>`;
    } else {
      promptBtn.hidden = true;
    }

    const obj = getCurrentObjectivePos();
    if (obj) {
      const oy = getTerrainHeight(obj.x, obj.z);
      beacon.visible = true;
      beacon.position.set(obj.x, oy + 11, obj.z);
      const dist = Math.round(Math.hypot(obj.x - eric.position.x, obj.z - eric.position.z));
      document.getElementById("compassDist").textContent = `${dist}m to objective`;
      const ang = Math.atan2(obj.x - eric.position.x, obj.z - eric.position.z);
      document.getElementById("compassArrow").style.transform = `rotate(${-((ang - state.camYaw) * 180) / Math.PI - 90}deg)`;
    } else {
      beacon.visible = false;
    }
  } else {
    beacon.visible = false;
    document.getElementById("interactPrompt").hidden = true;
  }

  animateCharacterPose(eric, playerMoving, state.isSwimming, dt);
  heroWarmLight.position.set(eric.position.x, eric.position.y + 2.4, eric.position.z);
  sunLight.position.set(eric.position.x + 18, eric.position.y + 30, eric.position.z + 24);

  if (state.phase === "FLASH" || state.phase === "QUARREL" || state.phase === "JANE_LEAVING") {
    camera.position.lerp(new THREE.Vector3(0, 3.4, 3.8), 0.06);
    camera.lookAt(0, 1.25, -4);
  } else if (state.phase === "ENDING") {
    const orbitX = Math.sin(elapsed * 0.18) * 4.5;
    camera.position.lerp(new THREE.Vector3(orbitX, eric.position.y + 2.1, 152.2), 0.04);
    camera.lookAt(0, eric.position.y + 1.15, 175);
  } else {
    const camDist = 10.6;
    const tx = eric.position.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * camDist;
    const ty = eric.position.y + 2.1 + Math.sin(state.camPitch) * camDist;
    const tz = eric.position.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * camDist;
    camera.position.lerp(new THREE.Vector3(tx, ty, tz), 0.12);
    camera.lookAt(eric.position.x, eric.position.y + 1.2, eric.position.z);
  }

  renderer.render(scene, camera);
}

/* 17. Safe Startup */
function startGame() {
  try {
    setWorldGrayscale(0);
    animate();
    setTimeout(() => {
      document.getElementById("titleFlash").hidden = true;
      beginOpeningQuarrel();
    }, 4000);
  } catch (err) {
    document.getElementById("titleFlash").hidden = true;
    alert("Startup error: " + err.message);
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startGame);
} else {
  startGame();
}
