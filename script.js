/* =========================================================
   FINDING JANE — Realistic Atmospheric PBR & Sunset Edition
   IBL Sky Reflections + Endless Shimmering Ocean + Smooth Terrain + Refined Humans
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
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.015);
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
    step: () => playTone(105, 0.045, "triangle", 0.022),
    jump: () => playTone(320, 0.12, "sine", 0.045),
    land: () => playTone(90, 0.09, "sine", 0.045),
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
  vx: 0,
  vz: 0,
  velY: 0,
  facingYaw: Math.PI / 2,
  bankAngle: 0,
  landSquash: 0,
  grounded: true,
  isSwimming: false,
  rippleTimer: 0,
  lastStepHalf: 0,
  lastSafePos: { x: 0, y: 0, z: 14 },
  windForceX: 0,
  windTimer: 0,
  meteorTimer: 0,
  camYaw: 0,
  camPitch: 0.34,
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

/* 3. Three.js Renderer with sRGB Output & Filmic Tone Mapping */
const canvas = document.getElementById("worldCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
// Warm horizon-matched atmospheric haze (eliminates hard horizon cutoffs!)
scene.fog = new THREE.FogExp2(0xd6846e, 0.0048);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 550);

const hemiLight = new THREE.HemisphereLight(0xf3d4b8, 0x262936, 0.55);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffcb99, 1.85);
sunLight.position.set(14, 24, 34);
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

const heroWarmLight = new THREE.PointLight(0xffcf87, 0.55, 10);
scene.add(heroWarmLight);

/* 4. Realistic Atmospheric Sunset Sky Shader + IBL Environment Map */
const skyShaderMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    sunDir: { value: new THREE.Vector3(0.0, 0.095, 1.0).normalize() }
  },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 sunDir;
    varying vec3 vDir;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.05;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -0.2, 1.0);

      vec3 horizonCol = vec3(0.92, 0.56, 0.42);
      vec3 midCol     = vec3(0.46, 0.34, 0.52);
      vec3 zenithCol  = vec3(0.11, 0.14, 0.28);

      vec3 sky = mix(horizonCol, midCol, smoothstep(0.0, 0.28, h));
      sky = mix(sky, zenithCol, smoothstep(0.24, 0.85, h));

      // Soft Wispy Sunset Clouds
      if (h > 0.02) {
        vec2 uv = d.xz / (h + 0.16) * 1.4;
        float c = fbm(uv + vec2(1.3, 2.7));
        float cloudMask = smoothstep(0.48, 0.78, c) * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.45, 0.85, h));
        vec3 cloudLit = mix(vec3(0.55, 0.42, 0.58), vec3(1.0, 0.78, 0.55), pow(max(dot(d, sunDir), 0.0), 2.5));
        sky = mix(sky, cloudLit, cloudMask * 0.55);
      }

      // Realistic Glowing Sun Disc + Atmospheric Mie Scattering Bloom
      float sunDot = max(dot(d, sunDir), 0.0);
      float sunCore = smoothstep(0.9978, 0.9993, sunDot);
      float innerGlow = pow(sunDot, 36.0) * 0.75;
      float outerGlow = pow(sunDot, 5.0) * 0.35;

      sky += vec3(1.0, 0.65, 0.35) * outerGlow;
      sky += vec3(1.0, 0.86, 0.60) * innerGlow;
      sky = mix(sky, vec3(1.0, 0.97, 0.88) * 1.4, sunCore);

      gl_FragColor = vec4(sky, 1.0);
    }
  `
});

const skyDome = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), skyShaderMat);
scene.add(skyDome);

// Generate Real Image-Based Lighting (IBL) from the Sunset Sky for Natural Ocean & Surface Reflections
(() => {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 24), skyShaderMat));
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
})();

/* 5. Smooth Procedural PBR Textures (Zero Blocky Pixels!) */
function makeTileTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const cx = c.getContext("2d");
  cx.fillStyle = "#5c4d42";
  cx.fillRect(0, 0, 512, 512);
  const colors = ["#b8906a", "#a9815d", "#9f7856", "#bf9872"];
  const step = 64;
  for (let y = 0; y < 512; y += step) {
    for (let x = 0; x < 512; x += step) {
      cx.fillStyle = colors[((x + y) / step) % colors.length];
      cx.fillRect(x + 2, y + 2, step - 4, step - 4);
      cx.fillStyle = "rgba(255, 244, 224, 0.08)";
      cx.fillRect(x + 3, y + 3, step - 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

function makeWoodTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const cx = c.getContext("2d");
  cx.fillStyle = "#6b462b";
  cx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) {
    cx.fillStyle = y % 64 === 0 ? "#774f32" : "#5e3c23";
    cx.fillRect(0, y + 2, 512, 29);
    cx.fillStyle = "rgba(0,0,0,0.18)";
    cx.fillRect(0, y, 512, 2);
  }
  // Fine subtle wood grain fibers
  for (let i = 0; i < 600; i++) {
    cx.fillStyle = i % 2 === 0 ? "rgba(255,225,190,0.04)" : "rgba(0,0,0,0.06)";
    cx.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 80, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeSmoothGroundTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const cx = c.getContext("2d");
  cx.fillStyle = "#f2f2f2";
  cx.fillRect(0, 0, 512, 512);

  // Soft airbrushed organic variation (no hard pixel squares!)
  for (let i = 0; i < 360; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 14 + Math.random() * 34;
    const grad = cx.createRadialGradient(x, y, 0, x, y, r);
    const v = 225 + Math.floor(Math.random() * 28);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    cx.fillStyle = grad;
    cx.beginPath();
    cx.arc(x, y, r, 0, Math.PI * 2);
    cx.fill();
  }

  // Ultra-fine sand/soil micro-specks
  for (let i = 0; i < 4500; i++) {
    const v = 212 + Math.floor(Math.random() * 40);
    cx.fillStyle = `rgba(${v},${v},${v},0.22)`;
    cx.fillRect(Math.random() * 512, Math.random() * 512, 1.2, 1.2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 32);
  return tex;
}

function makeWaterNormalTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const cx = c.getContext("2d");
  const img = cx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = (x / 256) * Math.PI * 2;
      const v = (y / 256) * Math.PI * 2;
      const dx = Math.cos(u * 4 + Math.sin(v * 2)) * 0.45 + Math.cos(u * 7 - v * 3) * 0.25;
      const dy = Math.sin(v * 5 + Math.cos(u * 3)) * 0.45 + Math.sin(v * 8 + u * 2) * 0.25;
      const idx = (y * 256 + x) * 4;
      img.data[idx] = Math.floor((dx * 0.5 + 0.5) * 255);
      img.data[idx + 1] = Math.floor((dy * 0.5 + 0.5) * 255);
      img.data[idx + 2] = 255;
      img.data[idx + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 36);
  return tex;
}

const tileTex = makeTileTexture();
const woodTex = makeWoodTexture();
const groundTex = makeSmoothGroundTexture();
const waterNormalTex = makeWaterNormalTexture();

function pbrMat(color, roughness = 0.82, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, ...extra });
}

/* 6. Multi-Biome Terrain & Endless Ocean */
function mountainTrailX(z) {
  if (z < 42 || z > 110) return 0;
  return Math.sin(((z - 42) / 68) * Math.PI * 2) * 10.5;
}

function organicNoise(x, z) {
  return (
    Math.sin(x * 0.23 + z * 0.19) * 0.22 +
    Math.cos(x * 0.43 - z * 0.31) * 0.14 +
    Math.sin(x * 0.71 + z * 0.67) * 0.06
  );
}

function getTerrainHeight(x, z) {
  let h = 0;
  const n = organicNoise(x, z);

  if (z < 18) {
    h = 0;
    const distFromCenter = Math.hypot(x, z + 4);
    if (distFromCenter > 13 && Math.abs(x) > 4.5 && z > -16) {
      h += Math.max(0, n) * 0.65;
    }
    const edge = Math.max(0, Math.abs(x) - 24);
    h += Math.pow(edge, 1.35) * 0.34 + (edge > 0 ? n * 0.7 : 0);
  }
  if (z >= 17 && z <= 39) {
    const t = Math.sin(((z - 17) / 22) * Math.PI);
    h -= t * 2.15;
    h += n * 0.25;
  }
  if (z >= 40 && z <= 112) {
    const ridgeT = Math.sin(((z - 40) / 72) * Math.PI);
    const baseHeight = Math.pow(ridgeT, 1.15) * 11.5;
    const tx = mountainTrailX(z);
    const distFromTrail = Math.abs(x - tx);
    const cliffBump = distFromTrail > 3.7 ? Math.min(9.5, (distFromTrail - 3.7) * 1.48) + n * 1.6 : n * 0.18;
    h = baseHeight + cliffBump;
  }
  if (z > 112 && z <= 150) {
    const seaT = Math.sin(((z - 112) / 38) * Math.PI);
    h = -seaT * 2.3 + n * 0.2;
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
      // Keep central seating spot (|x| < 2.2) level so Eric & Jane sit evenly side-by-side!
      const duneRipple = Math.sin(x * 0.32) * 0.15 + Math.cos(x * 0.18 + z * 0.25) * 0.08;
      const flatFactor = Math.min(1, Math.max(0, (Math.abs(x) - 1.8) / 2.5));
      h = beachT * 1.18 + duneRipple * flatFactor;
    } else {
      h = -2.6;
    }
  }
  return h;
}

function getWaterHeight(x, z, time) {
  return SEA_LEVEL + Math.sin(time * 2.2 + x * 0.22 + z * 0.18) * 0.1 + Math.cos(time * 1.6 - z * 0.16) * 0.05;
}

const terrainGeo = new THREE.PlaneGeometry(114, 220, 140, 230);
terrainGeo.rotateX(-Math.PI / 2);
terrainGeo.translate(0, 0, 75);

const posAttr = terrainGeo.attributes.position;
const colArr = new Float32Array(posAttr.count * 3);
const cTownGrass = new THREE.Color(0x3a6e4c);
const cDeepGrass = new THREE.Color(0x2b5539);
const cPlaza = new THREE.Color(0xa6825e);
const cMountainRock = new THREE.Color(0x4a4f5c);
const cDarkRock = new THREE.Color(0x353944);
const cSummit = new THREE.Color(0x5b8264);
const cSand = new THREE.Color(0xd2b07a);
const cWetSand = new THREE.Color(0x9b794a);
const cSeaBed = new THREE.Color(0x16425b);

for (let i = 0; i < posAttr.count; i++) {
  const vx = posAttr.getX(i);
  const vz = posAttr.getZ(i);
  const vy = getTerrainHeight(vx, vz);
  posAttr.setY(i, vy);

  const n = organicNoise(vx, vz);
  let col = n > 0 ? cTownGrass : cDeepGrass;

  if (vz < 16 && Math.hypot(vx, vz + 4) < 8.6) col = cPlaza;
  else if (vz >= 17 && vz <= 39) col = vy < 0.05 ? cWetSand : cSand;
  else if (vz >= 40 && vz <= 112) {
    const onTrail = Math.abs(vx - mountainTrailX(vz)) < 3.6;
    col = onTrail ? (vy > 8.5 ? cSummit : cSand) : (vy > 11 ? cSummit : n > 0 ? cMountainRock : cDarkRock);
  } else if (vz > 112) {
    col = vy > 0.2 ? cSand : vy > -0.22 ? cWetSand : cSeaBed;
  }
  colArr[i * 3] = col.r; colArr[i * 3 + 1] = col.g; colArr[i * 3 + 2] = col.b;
}
terrainGeo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
terrainGeo.computeVertexNormals();

const terrainMesh = new THREE.Mesh(
  terrainGeo,
  pbrMat(0xffffff, 0.94, {
    vertexColors: true,
    map: groundTex,
    bumpMap: groundTex,
    bumpScale: 0.05 // Subtle micro-grain without blocky pixel squares!
  })
);
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

const tiledPlaza = new THREE.Mesh(
  new THREE.CylinderGeometry(8.5, 8.6, 0.08, 36),
  pbrMat(0xffffff, 0.82, { map: tileTex, bumpMap: tileTex, bumpScale: 0.05 })
);
tiledPlaza.position.set(0, 0.03, -4);
tiledPlaza.receiveShadow = true;
scene.add(tiledPlaza);

const mainRoad = new THREE.Mesh(
  new THREE.BoxGeometry(4.4, 0.06, 20),
  pbrMat(0xd6c0a1, 0.86, { map: tileTex, bumpMap: tileTex, bumpScale: 0.04 })
);
mainRoad.position.set(0, 0.02, 7.5);
mainRoad.receiveShadow = true;
scene.add(mainRoad);

// Endless Ocean & River Water Surface (stretches cleanly to horizon!)
const waterGeo = new THREE.PlaneGeometry(540, 480, 64, 80);
waterGeo.rotateX(-Math.PI / 2);
waterGeo.translate(0, SEA_LEVEL, 235);
const waterMesh = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({
    color: 0x0b4b66,
    roughness: 0.09,
    metalness: 0.22,
    normalMap: waterNormalTex,
    normalScale: new THREE.Vector2(0.55, 0.55),
    envMapIntensity: 1.85,
    transparent: true,
    opacity: 0.9
  })
);
waterMesh.receiveShadow = true;
scene.add(waterMesh);

/* 7. Water & Footstep Dust Visuals */
const waterRipples = [];
const waterSplashes = [];
const dustPuffs = [];
const riverFoamStreaks = [];

function spawnRipple(x, z, maxScale = 2.6) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.44, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe4c4, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, SEA_LEVEL + 0.14, z);
  scene.add(ring);
  waterRipples.push({ mesh: ring, life: 0, maxLife: 0.85, maxScale });
}

function spawnSplash(x, z, count = 10) {
  for (let i = 0; i < count; i++) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.85 })
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

function spawnDustPuff(x, y, z, count = 4) {
  for (let i = 0; i < count; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.11 + Math.random() * 0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xe7d8c3, transparent: true, opacity: 0.5 })
    );
    puff.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.12, z + (Math.random() - 0.5) * 0.4);
    scene.add(puff);
    dustPuffs.push({
      mesh: puff,
      vx: (Math.random() - 0.5) * 1.4,
      vy: 0.6 + Math.random() * 0.9,
      vz: (Math.random() - 0.5) * 1.4,
      life: 0.42,
      maxLife: 0.42
    });
  }
}

for (let i = 0; i < 24; i++) {
  const streak = new THREE.Mesh(
    new THREE.BoxGeometry(1.6 + Math.random() * 1.4, 0.03, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.35 })
  );
  streak.position.set((Math.random() - 0.5) * 36, SEA_LEVEL + 0.13, 20 + Math.random() * 16);
  scene.add(streak);
  riverFoamStreaks.push({ mesh: streak, speed: 2.2 + Math.random() * 1.4 });
}

const shoreFoam = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 1.5),
  new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
);
shoreFoam.rotation.x = -Math.PI / 2;
shoreFoam.position.set(0, SEA_LEVEL + 0.11, 164.5);
scene.add(shoreFoam);

/* 8. Landmarks, Town, Forest, Smooth Rocks & Beach */
const colliders = [];
const platforms = [];
const boxPlatforms = [];
const activeMeteors = [];
const chimneySmokes = [];
const palmTops = [];
const bonfireSparks = [];
let petalSystem = null;

function makeNaturalRockGeo(radius = 1, detail = 2) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + (Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7)) * 0.16;
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

function addPlatformRock(x, z, y, r = 1.7) {
  const rock = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.9, r * 1.12, 1.4, 16),
    pbrMat(0x64748b, 0.88, { map: groundTex, bumpMap: groundTex, bumpScale: 0.08 })
  );
  rock.position.set(x, y - 0.7, z);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  platforms.push({ x, z, y, r });
}

function createDioramaCottage(x, z, wallColor, roofColor, rotY = 0, w = 5.8, h = 4.4, d = 4.8) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pbrMat(wallColor, 0.85, { map: woodTex }));
  base.position.y = h / 2; base.castShadow = true; base.receiveShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, 2.8, 4), pbrMat(roofColor, 0.86));
  roof.position.y = h + 1.4; roof.rotation.y = Math.PI / 4; roof.castShadow = true;

  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), pbrMat(0x57534e, 0.9));
  chim.position.set(w * 0.25, h + 1.6, -d * 0.15); chim.castShadow = true;

  const win1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), new THREE.MeshBasicMaterial({ color: 0xfde68a }));
  win1.position.set(-w * 0.22, h * 0.52, d / 2 + 0.02);
  const win2 = win1.clone();
  win2.position.set(w * 0.22, h * 0.52, d / 2 + 0.02);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.12), pbrMat(0x451a03, 0.9));
  door.position.set(0, 0.95, d / 2 + 0.03);

  g.add(base, roof, chim, win1, win2, door);
  g.position.set(x, getTerrainHeight(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  colliders.push({ x, z, r: Math.max(w, d) * 0.58 });

  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xe7e5e4, transparent: true, opacity: 0.35 })
  );
  smoke.position.set(x + Math.cos(rotY) * (w * 0.25), h + 2.7, z - Math.sin(rotY) * (w * 0.25));
  scene.add(smoke);
  chimneySmokes.push({ mesh: smoke, baseY: h + 2.7, offset: Math.random() * 10 });
}

function createStylizedTree(x, z, type = "sakura", scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.48, 3.4, 10), pbrMat(0x4a2c18, 0.92, { map: woodTex }));
  trunk.position.y = 1.7; trunk.castShadow = true;

  if (type === "pine") {
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.2, 12), pbrMat(0x28543c, 0.88));
    c1.position.y = 3.6; c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 12), pbrMat(0x346b4d, 0.88));
    c2.position.y = 5.1; c2.castShadow = true;
    g.add(trunk, c1, c2);
  } else {
    const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 2), pbrMat(0xf472b6, 0.85));
    c1.position.y = 4.0; c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 2), pbrMat(0xf9a8d4, 0.85));
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
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 4.6, 10), pbrMat(0x27272a, 0.55, { metalness: 0.35 }));
  pole.position.y = 2.3; pole.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 8), pbrMat(0x18181b, 0.5));
  cap.position.y = 4.75;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  bulb.position.y = 4.4;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.8, 4.5, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
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

function createStonePathLantern(x, z) {
  const y = getTerrainHeight(x, z);
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), pbrMat(0x64748b, 0.9));
  post.position.y = 0.55;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  glow.position.y = 1.2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.25, 4), pbrMat(0x475569, 0.9));
  cap.position.y = 1.45; cap.rotation.y = Math.PI / 4;
  g.add(post, glow, cap);
  g.position.set(x, y, z);
  scene.add(g);
}

function createTrailSignpost(x, z, rotY = 0) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8), pbrMat(0x78350f, 0.9));
  post.position.y = 0.9;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.12), pbrMat(0xb45309, 0.85, { map: woodTex }));
  board.position.set(0.2, 1.5, 0);
  g.add(post, board);
  g.position.set(x, getTerrainHeight(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
}

function createBench(x, z, rotY = 0) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.75), pbrMat(0x92400e, 0.85, { map: woodTex }));
  seat.position.y = 0.55; seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 0.15), pbrMat(0x78350f, 0.85, { map: woodTex }));
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
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.02, 0.25 - i * 0.02, 1.1, 9), pbrMat(0x78350f, 0.9));
    seg.position.set(Math.sin(i * 0.25) * 0.35, 0.55 + i * 0.95, 0);
    seg.rotation.z = -0.08 * i; seg.castShadow = true;
    g.add(seg);
  }
  const crown = new THREE.Group();
  crown.position.set(0.35, 5.1, 0);
  for (let a = 0; a < 6; a++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.8, 6), pbrMat(0x2e7d32, 0.85));
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
const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.4, 1.6), pbrMat(0xb45309, 0.85, { map: woodTex }));
counter.position.y = 0.7; counter.castShadow = true;
const awning = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 2.4), pbrMat(0xe11d48, 0.8));
awning.position.set(0, 3.2, 0.1); awning.rotation.x = 0.2;
stall.add(counter, awning);
stall.position.set(-9.5, 0, -4.5);
stall.rotation.y = Math.PI / 3;
scene.add(stall);
colliders.push({ x: -9.5, z: -4.5, r: 2.1 });
createLanternPost(-7.5, -5.5, true);

const bakery = new THREE.Group();
const bCounter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 1.5), pbrMat(0x92400e, 0.85, { map: woodTex }));
bCounter.position.y = 0.65; bCounter.castShadow = true;
const bAwning = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.26, 2.2), pbrMat(0x0284c7, 0.8));
bAwning.position.set(0, 3.0, 0.1); bAwning.rotation.x = 0.2;
bakery.add(bCounter, bAwning);
bakery.position.set(9.5, 0, -4.5);
bakery.rotation.y = -Math.PI / 3;
scene.add(bakery);
colliders.push({ x: 9.5, z: -4.5, r: 2.0 });

[18, 38].forEach((bz) => {
  const pier = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 2.4), pbrMat(0x78350f, 0.9, { map: woodTex }));
  pier.position.set(0, 0.2, bz);
  pier.castShadow = true; pier.receiveShadow = true;
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
const toriiL = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.8, 12), pbrMat(0xbe123c, 0.8, { map: woodTex }));
toriiL.position.set(-2.2, 2.4, 0);
const toriiR = toriiL.clone();
toriiR.position.set(2.2, 2.4, 0);
const toriiTop = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.55, 0.7), pbrMat(0xbe123c, 0.8));
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

for (let sz = 68; sz <= 74; sz += 1.4) {
  const sx = mountainTrailX(sz);
  const sy = getTerrainHeight(sx, sz);
  const step = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 1.1), pbrMat(0x94a3b8, 0.9, { map: groundTex }));
  step.position.set(sx, sy + 0.05, sz);
  step.receiveShadow = true;
  scene.add(step);
}

[44, 52, 60, 68, 84, 93, 102].forEach((lz, i) => {
  const lx = mountainTrailX(lz) + (i % 2 === 0 ? -3.4 : 3.4);
  createStonePathLantern(lx, lz);
});
createTrailSignpost(-3.2, 41.5, 0.3);
createTrailSignpost(mountainTrailX(59) - 3.6, 59, -0.4);
createTrailSignpost(3.2, 110.5, -0.25);

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

createPalmTree(-12, 155);
createPalmTree(13, 156);
createPalmTree(-17, 159);
createPalmTree(18, 158);

const beachPier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 9.0), pbrMat(0x78350f, 0.88, { map: woodTex }));
beachPier.position.set(-8.5, 0.5, 162);
beachPier.castShadow = true; beachPier.receiveShadow = true;
scene.add(beachPier);
boxPlatforms.push({ x: -8.5, z: 162, y: 0.68, halfW: 1.6, halfD: 4.5 });

const boat = new THREE.Group();
const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), pbrMat(0x92400e, 0.85, { map: woodTex }));
hull.castShadow = true;
const seatPlank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), pbrMat(0xb45309));
seatPlank.position.y = 0.25;
boat.add(hull, seatPlank);
boat.position.set(9.5, getTerrainHeight(9.5, 159) + 0.25, 159);
boat.rotation.set(0.08, -0.45, 0.12);
scene.add(boat);
colliders.push({ x: 9.5, z: 159, r: 2.0 });

[[-5.5, 155.5, 0.4], [14.5, 161.5, -0.7]].forEach(([dx, dz, rot]) => {
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.8, 10), pbrMat(0x785a40, 0.9, { map: woodTex }));
  log.rotation.set(Math.PI / 2, 0, rot);
  log.position.set(dx, getTerrainHeight(dx, dz) + 0.15, dz);
  log.castShadow = true;
  scene.add(log);
});

const umbrellaGroup = new THREE.Group();
const uPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8), pbrMat(0xe2e8f0));
uPole.position.y = 1.4;
const uTop = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 12), pbrMat(0xf43f5e));
uTop.position.y = 2.7; uTop.castShadow = true;
umbrellaGroup.add(uPole, uTop);
umbrellaGroup.position.set(5.5, getTerrainHeight(5.5, 155), 155);
scene.add(umbrellaGroup);

// Realistic Weathered Sea Stacks framing the ocean
const seaStackGeo = makeNaturalRockGeo(1, 2);
[[-22, 178, 4.2], [23, 175, 4.5], [-29, 156, 3.4], [28, 154, 3.8], [-25, 134, 3.0], [26, 128, 3.2]].forEach(([sx, sz, sr]) => {
  const stack = new THREE.Mesh(seaStackGeo, pbrMat(0x475569, 0.92, { map: groundTex, bumpMap: groundTex, bumpScale: 0.1 }));
  stack.scale.set(sr * 1.1, sr * 1.8, sr);
  stack.position.set(sx, sr * 0.35, sz);
  stack.castShadow = true;
  scene.add(stack);
});

const firePos = { x: -3.2, z: 157.5, y: getTerrainHeight(-3.2, 157.5) };
const fireStoneGeo = makeNaturalRockGeo(0.24, 1);
for (let i = 0; i < 6; i++) {
  const stone = new THREE.Mesh(fireStoneGeo, pbrMat(0x57534e));
  stone.position.set(firePos.x + Math.cos((i / 6) * Math.PI * 2) * 0.65, firePos.y + 0.15, firePos.z + Math.sin((i / 6) * Math.PI * 2) * 0.65);
  scene.add(stone);
}
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xfb923c }));
flame.position.set(firePos.x, firePos.y + 0.45, firePos.z);
scene.add(flame);
const beachFireLight = new THREE.PointLight(0xfb923c, 1.8, 20);
beachFireLight.position.set(firePos.x, firePos.y + 1.4, firePos.z);
scene.add(beachFireLight);

for (let i = 0; i < 14; i++) {
  const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  sp.position.set(firePos.x, firePos.y + 0.5 + Math.random() * 2, firePos.z);
  scene.add(sp);
  bonfireSparks.push({ mesh: sp, speed: 0.7 + Math.random() * 0.9, phase: Math.random() * 6 });
}

/* INSTANCED TERRAIN DETAILS */
const dummy = new THREE.Object3D();

const grassPositions = [];
for (let i = 0; i < 1500; i++) {
  const gx = (Math.random() - 0.5) * 78;
  const gz = -22 + Math.random() * 130;
  const gy = getTerrainHeight(gx, gz);
  if (gy < 0.15) continue;
  if (gz < 16 && Math.hypot(gx, gz + 4) < 9.0) continue;
  if (gz < 18 && Math.abs(gx) < 2.8) continue;
  if (gz >= 40 && Math.abs(gx - mountainTrailX(gz)) < 3.8) continue;
  grassPositions.push({ x: gx, y: gy, z: gz });
}
const grassGeo = new THREE.ConeGeometry(0.11, 0.58, 4);
grassGeo.translate(0, 0.29, 0);
const grassMesh = new THREE.InstancedMesh(grassGeo, pbrMat(0xffffff, 0.88), grassPositions.length);
grassMesh.receiveShadow = true;
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

const flowerPos = [];
for (let i = 0; i < 360; i++) {
  const fx = (Math.random() - 0.5) * 68;
  const fz = -20 + Math.random() * 126;
  const fy = getTerrainHeight(fx, fz);
  if (fy < 0.12) continue;
  if (fz < 16 && Math.hypot(fx, fz + 4) < 9.2) continue;
  if (fz < 18 && Math.abs(fx) < 3.0) continue;
  if (fz >= 40 && Math.abs(fx - mountainTrailX(fz)) < 4.0) continue;
  flowerPos.push({ x: fx, y: fy, z: fz });
}
const flowerGeo = new THREE.ConeGeometry(0.16, 0.22, 6);
flowerGeo.rotateX(Math.PI);
flowerGeo.translate(0, 0.24, 0);
const flowerMesh = new THREE.InstancedMesh(flowerGeo, pbrMat(0xffffff, 0.7), flowerPos.length);
const flowerPalette = [new THREE.Color(0xf472b6), new THREE.Color(0xfde047), new THREE.Color(0x38bdf8), new THREE.Color(0xfb7185)];
flowerPos.forEach((p, idx) => {
  dummy.position.set(p.x, p.y, p.z);
  dummy.rotation.set(0, Math.random() * Math.PI, 0);
  dummy.scale.setScalar(0.8 + Math.random() * 0.6);
  dummy.updateMatrix();
  flowerMesh.setMatrixAt(idx, dummy.matrix);
  flowerMesh.setColorAt(idx, flowerPalette[idx % flowerPalette.length]);
});
flowerMesh.instanceMatrix.needsUpdate = true;
if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
scene.add(flowerMesh);

// Smooth Weathered Cliff Boulders (No blocky low-poly facets!)
const rockPos = [];
for (let i = 0; i < 140; i++) {
  const rz = i < 25 ? (i % 2 === 0 ? 17.5 + Math.random() * 2 : 36.5 + Math.random() * 2) : 41 + Math.random() * 68;
  const rx = (Math.random() - 0.5) * 72;
  if (rz >= 40 && Math.abs(rx - mountainTrailX(rz)) < 4.5) continue;
  if (rz < 40 && Math.abs(rx) < 3.8) continue;
  if (Math.hypot(rx - 14.2, rz - 59) < 3.8) continue;
  const ry = getTerrainHeight(rx, rz);
  rockPos.push({ x: rx, y: ry, z: rz, sc: 0.7 + Math.random() * 1.9 });
}
const cliffRockGeo = makeNaturalRockGeo(0.8, 2);
const cliffRockMesh = new THREE.InstancedMesh(cliffRockGeo, pbrMat(0x525866, 0.92, { map: groundTex, bumpMap: groundTex, bumpScale: 0.08 }), rockPos.length);
cliffRockMesh.castShadow = true; cliffRockMesh.receiveShadow = true;
rockPos.forEach((p, idx) => {
  dummy.position.set(p.x, p.y - 0.2, p.z);
  dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  dummy.scale.set(p.sc * 1.2, p.sc * 0.85, p.sc);
  dummy.updateMatrix();
  cliffRockMesh.setMatrixAt(idx, dummy.matrix);
});
cliffRockMesh.instanceMatrix.needsUpdate = true;
scene.add(cliffRockMesh);

const reedPos = [];
for (let i = 0; i < 90; i++) {
  const rz = (i % 2 === 0 ? 18.2 : 37.5) + (Math.random() - 0.5) * 1.5;
  const rx = (Math.random() - 0.5) * 44;
  if (Math.abs(rx) < 3.2) continue;
  reedPos.push({ x: rx, y: getTerrainHeight(rx, rz), z: rz });
}
const reedGeo = new THREE.CylinderGeometry(0.03, 0.05, 1.3, 6);
reedGeo.translate(0, 0.65, 0);
const reedMesh = new THREE.InstancedMesh(reedGeo, pbrMat(0x4d7c0f, 0.85), reedPos.length);
reedPos.forEach((p, idx) => {
  dummy.position.set(p.x, p.y - 0.1, p.z);
  dummy.rotation.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25);
  dummy.scale.setScalar(0.8 + Math.random() * 0.5);
  dummy.updateMatrix();
  reedMesh.setMatrixAt(idx, dummy.matrix);
});
reedMesh.instanceMatrix.needsUpdate = true;
scene.add(reedMesh);

const bushPos = [];
for (let i = 0; i < 65; i++) {
  const bz = -20 + Math.random() * 64;
  const bx = (Math.random() - 0.5) * 60;
  if (bz < 16 && Math.hypot(bx, bz + 4) < 10.5) continue;
  if (bz > 16 && bz < 40) continue;
  if (Math.abs(bx) < 4.0) continue;
  const by = getTerrainHeight(bx, bz);
  if (by < 0.0) continue;
  bushPos.push({ x: bx, y: by, z: bz });
}
const bushGeo = new THREE.IcosahedronGeometry(0.65, 2);
const bushMesh = new THREE.InstancedMesh(bushGeo, pbrMat(0x2d6a4f, 0.9), bushPos.length);
bushMesh.castShadow = true; bushMesh.receiveShadow = true;
bushPos.forEach((p, idx) => {
  dummy.position.set(p.x, p.y + 0.3, p.z);
  dummy.rotation.set(0, Math.random() * Math.PI, 0);
  const sc = 0.75 + Math.random() * 0.7;
  dummy.scale.set(sc * 1.2, sc * 0.8, sc);
  dummy.updateMatrix();
  bushMesh.setMatrixAt(idx, dummy.matrix);
});
bushMesh.instanceMatrix.needsUpdate = true;
scene.add(bushMesh);

// Beach Shells & Pebbles (keep center camera foreground clear!)
const shellPos = [];
for (let i = 0; i < 70; i++) {
  const sx = (Math.random() - 0.5) * 44;
  const sz = 152 + Math.random() * 11;
  if (Math.abs(sx) < 3.2 && sz < 160) continue;
  shellPos.push({ x: sx, y: getTerrainHeight(sx, sz), z: sz });
}
const shellGeo = new THREE.SphereGeometry(0.11, 8, 8);
shellGeo.scale(1.2, 0.5, 1.0);
const shellMesh = new THREE.InstancedMesh(shellGeo, pbrMat(0xffffff, 0.65), shellPos.length);
const shellPal = [new THREE.Color(0xfef3c7), new THREE.Color(0xfda4af), new THREE.Color(0xfdba74)];
shellPos.forEach((p, i) => {
  dummy.position.set(p.x, p.y + 0.03, p.z);
  dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
  dummy.scale.setScalar(0.7 + Math.random() * 0.8);
  dummy.updateMatrix();
  shellMesh.setMatrixAt(i, dummy.matrix);
  shellMesh.setColorAt(i, shellPal[i % shellPal.length]);
});
shellMesh.instanceMatrix.needsUpdate = true;
if (shellMesh.instanceColor) shellMesh.instanceColor.needsUpdate = true;
scene.add(shellMesh);

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
  new THREE.PointsMaterial({ color: 0xfef3c7, size: 0.12, transparent: true, opacity: 0.45 })
);
scene.add(dustSystem);

/* 9. Refined Humanoid Character Rig (Tucked Bangs, Smooth Shoulders, Natural Sitting) */
function createHumanCharacter({ topColor, bottomColor = 0x1e293b, hairColor = 0x1c1917, skin = 0xffdfc4, scarf = 0xf43f5e, isFemale = false }) {
  const g = new THREE.Group();
  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 0.84, 0);
  g.add(bodyPivot);

  const skinMat = pbrMat(skin, 0.65);
  const topMat = pbrMat(topColor, 0.78);
  const pantMat = pbrMat(bottomColor, 0.86);
  const shoeMat = pbrMat(0x27272a, 0.55);
  const hairMat = pbrMat(hairColor, 0.62);

  // Legs
  const thighGeo = new THREE.CapsuleGeometry(0.082, 0.26, 8, 14);
  thighGeo.translate(0, -0.21, 0);
  const shinGeo = new THREE.CapsuleGeometry(0.068, 0.25, 8, 14);
  shinGeo.translate(0, -0.20, 0);
  const shoeGeo = new THREE.CapsuleGeometry(0.072, 0.13, 6, 12);
  shoeGeo.rotateX(Math.PI / 2);

  function makeLeg(sideX) {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(sideX, 0, 0);
    const thigh = new THREE.Mesh(thighGeo, isFemale ? skinMat : pantMat);
    thigh.castShadow = true;

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.40, 0);
    const shin = new THREE.Mesh(shinGeo, isFemale ? skinMat : pantMat);
    shin.castShadow = true;

    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.39, 0.05);
    shoe.castShadow = true;

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.24), pbrMat(0xf1f5f9, 0.75));
    sole.position.set(0, -0.44, 0.05);

    kneeGroup.add(shin, shoe, sole);
    hipGroup.add(thigh, kneeGroup);
    return { hipGroup, kneeGroup };
  }

  const left = makeLeg(-0.115);
  const right = makeLeg(0.115);
  bodyPivot.add(left.hipGroup, right.hipGroup);

  // Tailored Torso via LatheGeometry
  const profile = isFemale
    ? [
        new THREE.Vector2(0.01, 0.66),
        new THREE.Vector2(0.26, 0.68),
        new THREE.Vector2(0.20, 0.88),
        new THREE.Vector2(0.15, 1.05),
        new THREE.Vector2(0.19, 1.24),
        new THREE.Vector2(0.17, 1.37),
        new THREE.Vector2(0.075, 1.41)
      ]
    : [
        new THREE.Vector2(0.01, 0.78),
        new THREE.Vector2(0.20, 0.80),
        new THREE.Vector2(0.18, 0.98),
        new THREE.Vector2(0.22, 1.26),
        new THREE.Vector2(0.20, 1.38),
        new THREE.Vector2(0.08, 1.42)
      ];

  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 22), topMat);
  torso.position.y = -0.84;
  torso.scale.set(1.06, 1, 0.74);
  torso.castShadow = true;
  bodyPivot.add(torso);

  const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.044, 10, 20), pbrMat(scarf, 0.85));
  scarfRing.rotation.x = Math.PI / 2;
  scarfRing.position.set(0, 0.56, 0.01);
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.30, 0.035), pbrMat(scarf, 0.85));
  scarfTail.position.set(0.05, 0.40, -0.15);
  scarfTail.rotation.x = 0.14;
  bodyPivot.add(scarfRing, scarfTail);

  // Smoothly Tucked Shoulders & Arms
  const upperArmGeo = new THREE.CapsuleGeometry(0.056, 0.21, 8, 12);
  upperArmGeo.translate(0, -0.13, 0);
  const forearmGeo = new THREE.CapsuleGeometry(0.050, 0.19, 8, 12);
  forearmGeo.translate(0, -0.12, 0);

  function makeArm(sideX) {
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(sideX, 0.48, 0);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), topMat);
    const upperArm = new THREE.Mesh(upperArmGeo, topMat);
    upperArm.castShadow = true;

    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, -0.26, 0);
    elbowGroup.rotation.x = -0.18;

    const forearm = new THREE.Mesh(forearmGeo, topMat);
    forearm.castShadow = true;

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 10), skinMat);
    hand.position.set(0, -0.24, 0);

    elbowGroup.add(forearm, hand);
    shoulderGroup.add(shoulderCap, upperArm, elbowGroup);
    return { shoulderGroup, elbowGroup };
  }

  const leftArm = makeArm(isFemale ? -0.205 : -0.235);
  const rightArm = makeArm(isFemale ? 0.205 : 0.235);
  bodyPivot.add(leftArm.shoulderGroup, rightArm.shoulderGroup);

  // Realistic Head Proportions
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.075, 0.16, 12), skinMat);
  neck.position.set(0, 0.63, 0);
  bodyPivot.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.82, 0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.195, 24, 24), skinMat);
  head.scale.set(0.92, 1.08, 0.96);
  head.castShadow = true;
  headGroup.add(head);

  [-0.175, 0.175].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 10), skinMat);
    ear.scale.set(0.55, 1.0, 0.8);
    ear.position.set(ex, -0.01, -0.01);
    headGroup.add(ear);
  });

  [-0.072, 0.072].forEach((ex) => {
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), new THREE.MeshBasicMaterial({ color: 0x1e1b4b }));
    iris.scale.set(0.85, 1.2, 0.45);
    iris.position.set(ex, -0.01, 0.176);

    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    sparkle.position.set(ex + 0.01, 0.008, 0.19);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), hairMat);
    brow.position.set(ex, 0.05, 0.175);

    headGroup.add(iris, sparkle, brow);
  });

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), skinMat);
  nose.position.set(0, -0.035, 0.192);
  headGroup.add(nose);

  // Clean Sculpted Hair (Zero tips poking above scalp!)
  const scalp = new THREE.Mesh(
    new THREE.SphereGeometry(0.208, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.65),
    hairMat
  );
  scalp.scale.set(0.95, 1.05, 1.0);
  scalp.rotation.x = -0.38;
  scalp.position.set(0, 0.012, -0.012);
  scalp.castShadow = true;
  headGroup.add(scalp);

  // Tucked Forehead Bangs (angled downward inside hairline)
  [-0.09, -0.03, 0.03, 0.09].forEach((bx) => {
    const bang = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.07, 4, 8), hairMat);
    bang.position.set(bx, 0.085, 0.155 - Math.abs(bx) * 0.2);
    bang.rotation.x = 0.45;
    headGroup.add(bang);
  });

  if (isFemale) {
    const backHair = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.34, 8, 16), hairMat);
    backHair.scale.set(1.22, 1.0, 0.52);
    backHair.position.set(0, -0.15, -0.12);
    backHair.rotation.x = 0.1;
    backHair.castShadow = true;
    headGroup.add(backHair);

    [-0.16, 0.16].forEach((sx) => {
      const sideLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.24, 6, 8), hairMat);
      sideLock.position.set(sx, -0.10, 0.06);
      headGroup.add(sideLock);
    });
  } else {
    [-0.08, -0.02, 0.04, 0.09].forEach((nx, idx) => {
      const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.09, 4, 8), hairMat);
      lock.position.set(nx, -0.07, -0.165);
      lock.rotation.set(0.25, 0, (idx - 1.5) * 0.15);
      headGroup.add(lock);
    });
  }

  bodyPivot.add(headGroup);

  g.userData = {
    bodyPivot,
    scarfTail,
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
    idlePhase: Math.random() * 6,
    sitting: false
  };
  scene.add(g);
  return g;
}

function setCharacterSitting(char, isSitting) {
  const u = char.userData;
  u.sitting = isSitting;
  if (isSitting) {
    u.bodyPivot.position.y = 0.84;
    u.bodyPivot.rotation.set(-0.08, 0, 0);
    u.headGroup.rotation.set(-0.06, 0, 0);
    u.leftHip.rotation.x = -Math.PI / 2.15;
    u.rightHip.rotation.x = -Math.PI / 2.15;
    u.leftKnee.rotation.x = Math.PI / 2.3;
    u.rightKnee.rotation.x = Math.PI / 2.3;
    u.leftShoulder.rotation.set(-0.32, 0, 0.06);
    u.rightShoulder.rotation.set(-0.32, 0, -0.06);
    u.leftElbow.rotation.x = -0.5;
    u.rightElbow.rotation.x = -0.5;
  }
}

function animateHumanPhysics(char, { speed = 0, grounded = true, velY = 0, isSwimming = false, landSquash = 0, bank = 0, dt = 0.016, time = 0, emitFootsteps = false }) {
  const u = char.userData;
  if (u.sitting) {
    u.headGroup.rotation.x = -0.06 + Math.sin(time * 1.6 + u.idlePhase) * 0.025;
    return;
  }

  const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);
  const k = dt * 12;

  let bodyY = 0.84;
  let bodyPitch = 0;
  let bodyRoll = bank;
  let headPitch = 0;
  let lHip = 0, rHip = 0, lKnee = 0, rKnee = 0;
  let lShoX = 0, rShoX = 0, lShoZ = 0.06, rShoZ = -0.06;
  let lElb = -0.18, rElb = -0.18;
  let scarfPitch = 0.14;

  if (isSwimming) {
    const swimFactor = Math.min(1, speed / 3.5);
    u.walkCycle += dt * (4.5 + swimFactor * 5.0);
    bodyPitch = lerp(0.18, 1.12, swimFactor);
    bodyY = 0.84 + Math.sin(u.walkCycle) * 0.04;
    headPitch = -bodyPitch * 0.68;

    if (swimFactor > 0.15) {
      lShoX = -1.6 + Math.sin(u.walkCycle) * 0.9;
      rShoX = -1.6 + Math.sin(u.walkCycle + Math.PI) * 0.9;
      lShoZ = 0.35 + Math.cos(u.walkCycle) * 0.25;
      rShoZ = -0.35 - Math.cos(u.walkCycle + Math.PI) * 0.25;
      lElb = -0.45 - Math.max(0, Math.sin(u.walkCycle)) * 0.6;
      rElb = -0.45 - Math.max(0, Math.sin(u.walkCycle + Math.PI)) * 0.6;
      lHip = Math.sin(u.walkCycle * 1.6) * 0.55;
      rHip = -Math.sin(u.walkCycle * 1.6) * 0.55;
      lKnee = 0.25 + Math.max(0, -Math.sin(u.walkCycle * 1.6)) * 0.45;
      rKnee = 0.25 + Math.max(0, Math.sin(u.walkCycle * 1.6)) * 0.45;
    } else {
      lShoZ = 0.45 + Math.sin(u.walkCycle) * 0.25;
      rShoZ = -0.45 - Math.sin(u.walkCycle) * 0.25;
      lElb = -0.5; rElb = -0.5;
      lHip = -0.3 + Math.sin(u.walkCycle) * 0.3;
      rHip = -0.3 - Math.sin(u.walkCycle) * 0.3;
      lKnee = 0.6; rKnee = 0.6;
    }
    scarfPitch = 0.55;
  } else if (!grounded) {
    const rising = velY > 1.2;
    bodyPitch = rising ? -0.1 : 0.14;
    headPitch = rising ? -0.1 : 0.1;
    lHip = rising ? -0.82 : -0.45;
    lKnee = rising ? 1.2 : 0.65;
    rHip = rising ? 0.28 : -0.22;
    rKnee = rising ? 0.38 : 0.45;
    lShoX = rising ? -1.15 : -0.55;
    rShoX = rising ? -0.75 : -0.55;
    lShoZ = rising ? 0.28 : 0.52;
    rShoZ = rising ? -0.28 : -0.52;
    lElb = -0.65; rElb = -0.65;
    scarfPitch = rising ? 0.85 : 1.1;
  } else if (speed > 0.35) {
    const runRatio = Math.max(0, Math.min(1, (speed - 5.2) / 4.0));
    const strideFreq = 7.5 + runRatio * 5.2;
    u.walkCycle += dt * strideFreq;

    const hipAmp = 0.48 + runRatio * 0.44;
    const armAmp = 0.42 + runRatio * 0.55;
    const sinC = Math.sin(u.walkCycle);

    bodyPitch = 0.05 + runRatio * 0.22;
    bodyY = 0.84 + Math.abs(sinC) * (0.035 + runRatio * 0.055) - landSquash * 0.18;
    headPitch = -bodyPitch * 0.45;

    lHip = sinC * hipAmp + landSquash * 0.45;
    rHip = -sinC * hipAmp + landSquash * 0.45;
    lKnee = Math.max(0.08, -sinC * (0.65 + runRatio * 0.55)) + landSquash * 0.7;
    rKnee = Math.max(0.08, sinC * (0.65 + runRatio * 0.55)) + landSquash * 0.7;

    lShoX = -sinC * armAmp;
    rShoX = sinC * armAmp;
    lElb = -0.35 - runRatio * 0.92;
    rElb = -0.35 - runRatio * 0.92;
    scarfPitch = 0.22 + runRatio * 0.55 + Math.sin(u.walkCycle * 2) * 0.08;

    if (emitFootsteps) {
      const half = Math.floor(u.walkCycle / Math.PI);
      if (half !== state.lastStepHalf) {
        state.lastStepHalf = half;
        AudioEngine.step();
        if (runRatio > 0.35) {
          spawnDustPuff(char.position.x, char.position.y, char.position.z, 2);
        }
      }
    }
  } else {
    const breath = Math.sin(time * 2.1 + u.idlePhase);
    bodyY = 0.84 + breath * 0.015 - landSquash * 0.22;
    bodyPitch = landSquash * 0.25;
    headPitch = breath * 0.025;
    lHip = landSquash * 0.5;
    rHip = landSquash * 0.5;
    lKnee = landSquash * 0.85;
    rKnee = landSquash * 0.85;
    lShoZ = 0.06 + breath * 0.02;
    rShoZ = -0.06 - breath * 0.02;
  }

  u.bodyPivot.position.y = lerp(u.bodyPivot.position.y, bodyY, k);
  u.bodyPivot.rotation.x = lerp(u.bodyPivot.rotation.x, bodyPitch, k);
  u.bodyPivot.rotation.z = lerp(u.bodyPivot.rotation.z, bodyRoll, k);
  u.headGroup.rotation.x = lerp(u.headGroup.rotation.x, headPitch, k);

  u.leftHip.rotation.x = lerp(u.leftHip.rotation.x, lHip, k);
  u.rightHip.rotation.x = lerp(u.rightHip.rotation.x, rHip, k);
  u.leftKnee.rotation.x = lerp(u.leftKnee.rotation.x, lKnee, k);
  u.rightKnee.rotation.x = lerp(u.rightKnee.rotation.x, rKnee, k);

  u.leftShoulder.rotation.x = lerp(u.leftShoulder.rotation.x, lShoX, k);
  u.rightShoulder.rotation.x = lerp(u.rightShoulder.rotation.x, rShoX, k);
  u.leftShoulder.rotation.z = lerp(u.leftShoulder.rotation.z, lShoZ, k);
  u.rightShoulder.rotation.z = lerp(u.rightShoulder.rotation.z, rShoZ, k);
  u.leftElbow.rotation.x = lerp(u.leftElbow.rotation.x, lElb, k);
  u.rightElbow.rotation.x = lerp(u.rightElbow.rotation.x, rElb, k);
  u.scarfTail.rotation.x = lerp(u.scarfTail.rotation.x, scarfPitch, k);
}

const eric = createHumanCharacter({ topColor: 0x3b82f6, bottomColor: 0x1e293b, hairColor: 0x1c1917, scarf: 0xfbbf24, isFemale: false });
eric.position.set(-1.3, 0, -4);
eric.rotation.y = Math.PI / 2;

const jane = createHumanCharacter({ topColor: 0xfb7185, hairColor: 0x451a03, scarf: 0xf43f5e, isFemale: true });
jane.position.set(1.3, 0, -4);
jane.rotation.y = -Math.PI / 2;

const sora = createHumanCharacter({ topColor: 0xfacc15, hairColor: 0x57361a, scarf: 0xe11d48, isFemale: true });
sora.position.set(-8.0, 0, -3.2);
sora.rotation.y = Math.PI / 3;

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

/* 10. Collectibles, Waypoint & Meteors */
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

  const rock = new THREE.Mesh(makeNaturalRockGeo(0.75, 1), pbrMat(0x475569));
  rock.position.set(tx, ty + 18, tz);
  scene.add(rock);

  activeMeteors.push({ ring, rock, tx, ty, tz, timer: 1.35, hit: false });
}

/* 11. Color Filter & Petals */
function setWorldGrayscale(pct) {
  state.grayscale = pct;
  canvas.style.filter = `grayscale(${pct}%) contrast(${pct > 50 ? 1.12 : 1.03}) saturate(${pct === 0 ? 1.12 : 1})`;
  document.getElementById("colorMeter").textContent = `Color: ${Math.round(100 - pct)}%`;
}

function spawnColorPetals() {
  const count = 110;
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
  petalSystem = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0.85 }));
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
      { speaker: "Jane", role: "Pagod na", text: "Nakakapagod na mag-isip ng solusyon na dapat ikaw mismo yung nakakaisip para sa'tin." },
      { speaker: "Jane", role: "", text: "Minsan nararamdaman ko na ako na yung tumatayong lalaki sa'ting dalawa. Lahat ng desisyon, ang bagsak sa'kin pa rin." },
      { speaker: "Eric", role: "Defending", text: "Iniisip ko naman yun, love. Kaya lang yun yung napagkasunduan, wala na akong magawa." },
      { speaker: "Jane", role: "Hurt", text: "Kaya mong magdesisyon para sa sarili mo, pero pumapayag ka kahit alam mong mahihirapan ka. Akala ko ba para sa'tin 'to?" },
      { speaker: "Jane", role: "", text: "Nakakapagod na minsan magbuhat mag-isa. Feeling ko kahit alam mong hindi ako okay, hinahayaan mo lang ako hanggang ako na ulit ang kumausap sa'yo." },
      { speaker: "Jane", role: "", text: "Kaya nakakatamad na minsan magsabi sa'yo. Bahala ka na muna." }
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
  const beachY = getTerrainHeight(-0.42, beachZ);
  jane.position.set(-0.42, beachY - 0.52, beachZ);
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
    { speaker: "Eric", role: "Realization", text: "Nawalan ng kulay yung buong mundo..." },
    { speaker: "Eric", role: "", text: "Tama siya. Hindi pwedeng maghintay na naman ako na siya yung unang kumausap. Ako ang lalapit at babawi ngayon." }
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
      { speaker: "Jane", role: "Looking at the ocean", text: "O, akala ko ba hahayaan mo lang ulit ako hanggang sa ako na naman ang kumausap sa'yo?" },
      {
        speaker: "Eric",
        role: "Speak sincerely",
        text: "Stand beside Jane and tell her what you really mean:",
        choices: [
          {
            label: "Nakita ko na yung mali ko. Hindi na ako tatakbo sa lahat ng problema, hindi ko na haharapin ng mag isa, haharapin ko na 'to nang kasama ka.'",
            onPick: () => triggerSunsetFinale()
          }
        ]
      }
    ]);
  }
}

function triggerSunsetFinale() {
  const beachY = getTerrainHeight(0.42, 158);
  eric.position.set(0.42, beachY - 0.52, 158);
  eric.rotation.y = 0;
  setCharacterSitting(eric, true);

  startDialogue(
    [
      { speaker: "Eric", role: "", text: "Sorry love, kung paulit-ulit na nawawalan ka ng peace of mind dahil hindi ako nakikinig nang maayos." },
      { speaker: "Eric", role: "", text: "Simula ngayon, ako na yung unang lalapit at gagawa ng paraan." },
      { speaker: "Jane", role: "Smiling softly", text: "Ayoko lang naman maramdaman na mag-isa ako sa relasyon na 'to, love." },
      { speaker: "Jane", role: "", text: "Upo ka na dito sa tabi ko. Panoorin natin yung sunset." }
    ],
    () => {
      AudioEngine.colorReturn();
      setWorldGrayscale(0);
      spawnColorPetals();
      updateQuestUI(7);
      state.phase = "ENDING";
      document.getElementById("staminaBox").hidden = true;
      document.getElementById("mobilePad").hidden = true;
      document.getElementById("controlsHint").hidden = true;
      setTimeout(() => {
        document.getElementById("endingOverlay").hidden = false;
      }, 2400);
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

function triggerJump() {
  if (state.phase !== "EXPLORE" || !(state.grounded || state.isSwimming)) return;
  if (state.isSwimming) {
    eric.position.y = Math.max(eric.position.y, SEA_LEVEL - 0.12);
    state.isSwimming = false;
    spawnSplash(eric.position.x, eric.position.z, 7);
  } else {
    spawnDustPuff(eric.position.x, eric.position.y, eric.position.z, 5);
  }
  state.velY = 9.8;
  state.grounded = false;
  AudioEngine.jump();
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
    } else if (e.key === " ") {
      e.preventDefault();
      triggerJump();
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
  triggerJump();
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

function lerpAngle(current, target, t) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return { angle: current + diff * Math.min(1, t), diff };
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  // Keep sky dome centered on camera so horizon & sunset never clip
  skyDome.position.copy(camera.position);

  // Scroll Water Wave Normal Map + Gentle Vertex Waves
  waterNormalTex.offset.x += dt * 0.032;
  waterNormalTex.offset.y += dt * 0.022;
  const wPos = waterGeo.attributes.position;
  for (let i = 0; i < wPos.count; i++) {
    wPos.setY(i, getWaterHeight(wPos.getX(i), wPos.getZ(i), elapsed));
  }
  wPos.needsUpdate = true;

  shoreFoam.position.z = 164.4 + Math.sin(elapsed * 1.9) * 0.65;
  shoreFoam.material.opacity = 0.32 + Math.sin(elapsed * 1.9) * 0.12;

  riverFoamStreaks.forEach((s) => {
    s.mesh.position.x += s.speed * dt;
    s.mesh.position.y = getWaterHeight(s.mesh.position.x, s.mesh.position.z, elapsed) + 0.04;
    if (s.mesh.position.x > 22) s.mesh.position.x = -22;
  });

  for (let i = waterRipples.length - 1; i >= 0; i--) {
    const r = waterRipples[i];
    r.life += dt;
    const prog = r.life / r.maxLife;
    if (prog >= 1) { scene.remove(r.mesh); waterRipples.splice(i, 1); }
    else {
      const sc = 1 + prog * r.maxScale;
      r.mesh.scale.set(sc, sc, 1);
      r.mesh.material.opacity = 0.55 * (1 - prog);
    }
  }

  for (let i = waterSplashes.length - 1; i >= 0; i--) {
    const s = waterSplashes[i];
    s.life -= dt; s.vy -= 12 * dt;
    s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt; s.mesh.position.z += s.vz * dt;
    if (s.life <= 0) { scene.remove(s.mesh); waterSplashes.splice(i, 1); }
  }

  for (let i = dustPuffs.length - 1; i >= 0; i--) {
    const d = dustPuffs[i];
    d.life -= dt;
    d.mesh.position.x += d.vx * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.position.z += d.vz * dt;
    const p = 1 - d.life / d.maxLife;
    d.mesh.scale.setScalar(1 + p * 1.4);
    d.mesh.material.opacity = 0.5 * (1 - p);
    if (d.life <= 0) { scene.remove(d.mesh); dustPuffs.splice(i, 1); }
  }

  chimneySmokes.forEach((cs) => {
    const cycle = (elapsed * 0.45 + cs.offset) % 1;
    cs.mesh.position.y = cs.baseY + cycle * 2.6;
    cs.mesh.scale.setScalar(0.8 + cycle * 1.4);
    cs.mesh.material.opacity = 0.35 * (1 - cycle);
  });

  palmTops.forEach((pt, idx) => { pt.rotation.z = Math.sin(elapsed * 1.6 + idx) * 0.06; });
  flame.scale.set(1 + Math.sin(elapsed * 12) * 0.12, 1 + Math.cos(elapsed * 14) * 0.16, 1);
  beachFireLight.intensity = 1.6 + Math.sin(elapsed * 10) * 0.35;
  bonfireSparks.forEach((sp) => {
    sp.mesh.position.y += sp.speed * dt;
    sp.mesh.position.x = firePos.x + Math.sin(elapsed * 3 + sp.phase) * 0.32;
    if (sp.mesh.position.y > firePos.y + 3.2) sp.mesh.position.y = firePos.y + 0.4;
  });

  animateHumanPhysics(sora, { speed: 0, grounded: true, dt, time: elapsed });
  villagers.forEach((v) => {
    if (v.type === "orbit") {
      v.angle += v.speed * dt;
      const nx = v.cx + Math.cos(v.angle) * v.r;
      const nz = v.cz + Math.sin(v.angle) * v.r;
      const dx = nx - v.mesh.position.x;
      const dz = nz - v.mesh.position.z;
      v.mesh.position.set(nx, getTerrainHeight(nx, nz), nz);
      v.mesh.rotation.y = Math.atan2(dx, dz);
      animateHumanPhysics(v.mesh, { speed: 3.8, grounded: true, dt, time: elapsed });
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
      animateHumanPhysics(v.mesh, { speed: 3.6, grounded: true, dt, time: elapsed });
    } else {
      animateHumanPhysics(v.mesh, { speed: 0, grounded: true, dt, time: elapsed });
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
    animateHumanPhysics(jane, { speed: 4.8, grounded: true, dt, time: elapsed });
    if (jane.position.z >= 18.5) {
      animateHumanPhysics(jane, { speed: 0, grounded: true, dt, time: elapsed });
      finishJaneLeaving();
    }
  } else {
    animateHumanPhysics(jane, { speed: 0, grounded: true, dt, time: elapsed });
  }

  state.landSquash = Math.max(0, state.landSquash - dt * 4.5);

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
        state.vx = 0; state.vz = 0;
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

    let targetVx = 0, targetVz = 0;
    if (isMovingInput) {
      const len = Math.hypot(fwd, side);
      fwd /= len; side /= len;
      const sinY = Math.sin(state.camYaw);
      const cosY = Math.cos(state.camYaw);
      const dirX = -sinY * fwd + cosY * side;
      const dirZ = -cosY * fwd - sinY * side;
      const topSpeed = inWater ? 4.4 : wantsSprint ? 9.5 : 5.8;
      targetVx = dirX * topSpeed;
      targetVz = dirZ * topSpeed;

      const targetYaw = Math.atan2(dirX, dirZ);
      const turned = lerpAngle(state.facingYaw, targetYaw, dt * (inWater ? 6 : 12));
      state.facingYaw = turned.angle;
      state.bankAngle = Math.max(-0.18, Math.min(0.18, -turned.diff * 0.25));
      eric.rotation.y = state.facingYaw;
    } else {
      state.bankAngle *= 0.85;
    }

    const accel = inWater ? 8.5 : state.grounded ? 26.0 : 11.0;
    const drag = inWater ? 4.5 : state.grounded ? 15.0 : 2.5;
    const rate = isMovingInput ? accel : drag;
    state.vx += (targetVx - state.vx) * Math.min(1, rate * dt);
    state.vz += (targetVz - state.vz) * Math.min(1, rate * dt);

    let envVx = state.windForceX;
    if (inWater && pz >= 18 && pz <= 39) envVx += 2.2;
    if (inWater && pz > 112 && pz <= 150) envVx += Math.sin(elapsed * 0.9) * 1.1;

    const nx = eric.position.x + (state.vx + envVx) * dt;
    const nz = eric.position.z + state.vz * dt;
    if (canMoveTo(nx, eric.position.z, eric.position.y)) eric.position.x = nx;
    else state.vx = 0;
    if (canMoveTo(eric.position.x, nz, eric.position.y)) eric.position.z = nz;
    else state.vz = 0;

    const wasGrounded = state.grounded;
    const floorY = getSupportHeight(eric.position.x, eric.position.z, eric.position.y);
    if (state.isSwimming) {
      const horizSpeed = Math.hypot(state.vx, state.vz);
      const swimDepth = horizSpeed > 1.2 ? 0.88 : 1.18;
      const waveY = getWaterHeight(eric.position.x, eric.position.z, elapsed);
      eric.position.y += (waveY - swimDepth - eric.position.y) * dt * 6;
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
        if (!wasGrounded && state.velY < -3.5) {
          state.landSquash = Math.min(1, Math.abs(state.velY) / 14);
          spawnDustPuff(eric.position.x, floorY, eric.position.z, 6);
          AudioEngine.land();
        }
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
    state.vx = 0; state.vz = 0;
  }

  animateHumanPhysics(eric, {
    speed: Math.hypot(state.vx, state.vz),
    grounded: state.grounded,
    velY: state.velY,
    isSwimming: state.isSwimming,
    landSquash: state.landSquash,
    bank: state.bankAngle,
    dt,
    time: elapsed,
    emitFootsteps: state.phase === "EXPLORE" && !state.dialogueActive
  });

  heroWarmLight.position.set(eric.position.x, eric.position.y + 2.4, eric.position.z);
  sunLight.position.set(eric.position.x + 14, eric.position.y + 24, eric.position.z + 34);

  if (state.phase === "FLASH" || state.phase === "QUARREL" || state.phase === "JANE_LEAVING") {
    camera.position.lerp(new THREE.Vector3(0, 3.3, 3.8), 0.06);
    camera.lookAt(0, 1.25, -4);
  } else if (state.phase === "ENDING") {
    const orbitX = Math.sin(elapsed * 0.16) * 3.8;
    camera.position.lerp(new THREE.Vector3(orbitX, eric.position.y + 1.95, 152.6), 0.04);
    camera.lookAt(0, eric.position.y + 1.15, 195);
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
