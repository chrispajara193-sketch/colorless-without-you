/* =========================================================
   COLORLESS WITHOUT YOU — Anime Cel-Shaded 3D Adventure
   Town -> Rushing River -> Mountain Climb -> Sunset Beach
========================================================= */

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
    jump: () => playTone(310, 0.12, "sine", 0.05),
    splash: () => playTone(160, 0.18, "triangle", 0.05),
    colorDrain: () => [440, 392, 330, 247].forEach((f, i) => playTone(f, 0.45, "sine", 0.06, i * 0.22)),
    sparkle: () => [523, 659, 880].forEach((f, i) => playTone(f, 0.28, "triangle", 0.06, i * 0.09)),
    colorReturn: () => [261, 329, 392, 493, 587, 659, 784, 987].forEach((f, i) => playTone(f, 0.6, "sine", 0.07, i * 0.1))
  };
})();

/* 2. Game State & Quest Definitions */
const SEA_LEVEL = -0.25;

const state = {
  phase: "FLASH", // FLASH | QUARREL | LADY_LEAVING | EXPLORE | ENDING
  grayscale: 0,
  dialogueActive: false,
  dialogueQueue: [],
  dialogueIndex: 0,
  dialogueOnComplete: null,
  questStep: 0,
  stamina: 100,
  velY: 0,
  grounded: true,
  isSwimming: false,
  lastSafePos: { x: 0, y: 0, z: 14 },
  windForceX: 0,
  windTimer: 0,
  camYaw: 0,
  camPitch: 0.34,
  keys: {},
  isDragging: false,
  lastMouseX: 0,
  lastMouseY: 0,
  nearbyInteractable: null
};

const QUEST_INFO = {
  0: { title: "The Quarrel", desc: "Listen to Maya..." },
  1: { title: "Ask the Florist", desc: "Talk to Clara at the town flower stall." },
  2: { title: "Cross the Rushing River", desc: "Jump rocks or swim the river current to grab Maya's Crimson Scarf." },
  3: { title: "Climb the Storm Ridge", desc: "Ascend the winding mountain pass & braving winds, claim her Silver Locket at the summit." },
  4: { title: "Swim the Tidal Cove", desc: "Descend to the ocean cove, swim across the sandbars, and grab the Tide Shell." },
  5: { title: "Find Maya at Sunset Beach", desc: "Reach the golden beach ahead and tell Maya how sorry you are." },
  6: { title: "Color Returned", desc: "Watching the sunset together." }
};

/* 3. Three.js Renderer, Scene & Cel-Shading Gradient */
const canvas = document.getElementById("worldCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xfdba74, 0.0068);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 350);

// 3-Tone Anime Cel-Shading Ramp (RGBAFormat for universal WebGL1/2 support)
const toonData = new Uint8Array([
  105, 105, 105, 255,
  190, 190, 190, 255,
  255, 255, 255, 255
]);
const toonGradient = new THREE.DataTexture(toonData, 3, 1, THREE.RGBAFormat);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

function toonMat(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra });
}

// Lighting
const hemiLight = new THREE.HemisphereLight(0xfde68a, 0x3b82f6, 0.72);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffedd5, 1.25);
sunLight.position.set(20, 32, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 140;
const sRange = 42;
sunLight.shadow.camera.left = -sRange;
sunLight.shadow.camera.right = sRange;
sunLight.shadow.camera.top = sRange;
sunLight.shadow.camera.bottom = -sRange;
scene.add(sunLight);
scene.add(sunLight.target);

/* 4. Anime Sunset Sky Dome Shader + Giant Horizon Sun */
const skyGeo = new THREE.SphereGeometry(260, 32, 24);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x1e1b4b) },
    midColor: { value: new THREE.Color(0xc084fc) },
    bottomColor: { value: new THREE.Color(0xfb923c) }
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
      col = mix(col, topColor, smoothstep(0.25, 0.8, h));
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Giant Glowing Sunset Disc over the Northern Ocean
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(24, 32),
  new THREE.MeshBasicMaterial({ color: 0xfde047, fog: false })
);
sunDisc.position.set(0, 22, 245);
sunDisc.rotation.y = Math.PI;
scene.add(sunDisc);

const sunHalo = new THREE.Mesh(
  new THREE.CircleGeometry(38, 32),
  new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.35, fog: false })
);
sunHalo.position.set(0, 22, 246);
sunHalo.rotation.y = Math.PI;
scene.add(sunHalo);

/* 5. Multi-Biome Terrain Math (Town -> River -> Mountain -> Sea -> Beach) */
function mountainTrailX(z) {
  if (z < 42 || z > 110) return 0;
  return Math.sin(((z - 42) / 68) * Math.PI * 2) * 10.5;
}

function getTerrainHeight(x, z) {
  let h = 0;

  // Town Valley (Z: -25 to 17)
  if (z < 18) {
    h = 0;
    // Rolling side hills far from town center
    const edge = Math.max(0, Math.abs(x) - 18);
    h += Math.pow(edge, 1.35) * 0.32;
  }

  // Rushing River Gorge (Z: 18 to 38)
  if (z >= 17 && z <= 39) {
    const t = Math.sin(((z - 17) / 22) * Math.PI);
    h -= t * 2.1;
  }

  // Mountain Pass (Z: 40 to 112)
  if (z >= 40 && z <= 112) {
    const ridgeT = Math.sin(((z - 40) / 72) * Math.PI);
    const baseHeight = Math.pow(ridgeT, 1.15) * 11.5;
    const tx = mountainTrailX(z);
    const distFromTrail = Math.abs(x - tx);
    // Raise steep jagged cliffs outside the winding trail
    const cliffBump = distFromTrail > 3.6 ? Math.min(9, (distFromTrail - 3.6) * 1.45) : 0;
    h = baseHeight + cliffBump;
  }

  // Tidal Sea Cove (Z: 112 to 150)
  if (z > 112 && z <= 150) {
    const seaT = Math.sin(((z - 112) / 38) * Math.PI);
    h = -seaT * 2.3;
    // 3 Sandbar Islands in the Cove
    const d1 = Math.hypot(x + 4.5, z - 122);
    const d2 = Math.hypot(x - 4.5, z - 132);
    const d3 = Math.hypot(x + 1.5, z - 141);
    if (d1 < 4.5) h = Math.max(h, (1 - d1 / 4.5) * 1.1 - 0.1);
    if (d2 < 4.8) h = Math.max(h, (1 - d2 / 4.8) * 1.2 - 0.1);
    if (d3 < 4.5) h = Math.max(h, (1 - d3 / 4.5) * 1.1 - 0.1);
  }

  // Sunset Beach (Z: 150 to 166) -> Open Ocean (Z > 166)
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

// Build Displaced Vertex-Colored Terrain Mesh
const terrainGeo = new THREE.PlaneGeometry(96, 220, 96, 180);
terrainGeo.rotateX(-Math.PI / 2);
terrainGeo.translate(0, 0, 75); // Covers Z: -35 to +185

const posAttr = terrainGeo.attributes.position;
const colArr = new Float32Array(posAttr.count * 3);
const cTownGrass = new THREE.Color(0x34d399);
const cPlaza = new THREE.Color(0xfef3c7);
const cMountain = new THREE.Color(0x64748b);
const cSummit = new THREE.Color(0xa7f3d0);
const cSand = new THREE.Color(0xfde68a);
const cSeaBed = new THREE.Color(0x0284c7);

for (let i = 0; i < posAttr.count; i++) {
  const vx = posAttr.getX(i);
  const vz = posAttr.getZ(i);
  const vy = getTerrainHeight(vx, vz);
  posAttr.setY(i, vy);

  let col = cTownGrass;
  if (vz < 16 && Math.hypot(vx, vz + 4) < 8.6) col = cPlaza;
  else if (vz >= 17 && vz <= 39 && vy < 0.1) col = cSand;
  else if (vz >= 40 && vz <= 112) {
    col = Math.abs(vx - mountainTrailX(vz)) < 3.5 ? (vy > 8 ? cSummit : cSand) : cMountain;
  } else if (vz > 112) {
    col = vy > -0.15 ? cSand : cSeaBed;
  }

  colArr[i * 3] = col.r;
  colArr[i * 3 + 1] = col.g;
  colArr[i * 3 + 2] = col.b;
}

terrainGeo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
terrainGeo.computeVertexNormals();

const terrainMesh = new THREE.Mesh(
  terrainGeo,
  toonMat(0xffffff, { vertexColors: true })
);
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

// Animated Ocean & River Water Plane
const waterGeo = new THREE.PlaneGeometry(140, 220, 36, 56);
waterGeo.rotateX(-Math.PI / 2);
waterGeo.translate(0, SEA_LEVEL, 105);
const waterBaseY = new Float32Array(waterGeo.attributes.position.count);
for (let i = 0; i < waterBaseY.length; i++) waterBaseY[i] = SEA_LEVEL;

const waterMesh = new THREE.Mesh(
  waterGeo,
  new THREE.MeshToonMaterial({
    color: 0x0ea5e9,
    gradientMap: toonGradient,
    transparent: true,
    opacity: 0.84
  })
);
waterMesh.receiveShadow = true;
scene.add(waterMesh);

/* 6. Props, Platforms, Cottages & Landmarks */
const colliders = [];     // { x, z, r }
const platforms = [];     // { x, z, y, r } walkable elevated rocks
const windParticles = [];
let petalSystem = null;

function addPlatformRock(x, z, y, r = 1.7) {
  const rock = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.92, r * 1.1, 1.4, 7),
    toonMat(0x94a3b8)
  );
  rock.position.set(x, y - 0.7, z);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  platforms.push({ x, z, y, r });
}

function createCottage(x, z, wallColor, roofColor, rotY = 0) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.6, 4.4), toonMat(wallColor));
  base.position.y = 1.8;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.5, 4), toonMat(roofColor));
  roof.position.y = 4.8;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  // Warm Glowing Anime Window
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  win.position.set(0, 2.0, 2.22);
  g.add(win);

  g.position.set(x, getTerrainHeight(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  colliders.push({ x, z, r: 3.1 });
}

function createStylizedTree(x, z, type = "sakura") {
  const g = new THREE.Group();
  const y = getTerrainHeight(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 2.8, 7), toonMat(0x78350f));
  trunk.position.y = 1.4;
  trunk.castShadow = true;
  g.add(trunk);

  const c1 = type === "sakura" ? 0xf9a8d4 : 0x16a34a;
  const c2 = type === "sakura" ? 0xf472b6 : 0x22c55e;
  const canopy1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9), toonMat(c1));
  canopy1.position.y = 3.5;
  canopy1.castShadow = true;
  const canopy2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3), toonMat(c2));
  canopy2.position.set(0.85, 2.9, 0.4);
  canopy2.castShadow = true;
  g.add(canopy1, canopy2);

  g.position.set(x, y, z);
  scene.add(g);
  colliders.push({ x, z, r: 0.9 });
}

function createStreetLamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6), toonMat(0x1e293b));
  pole.position.y = 1.8;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  bulb.position.y = 3.7;
  g.add(pole, bulb);
  g.position.set(x, getTerrainHeight(x, z), z);
  scene.add(g);
}

// Build Town Landmarks
createCottage(-14, -10, 0xfef3c7, 0xf43f5e, 0.4);
createCottage(14, -10, 0xe0f2fe, 0x6366f1, -0.4);
createCottage(-14, 3, 0xfce7f3, 0xfb7185, 1.2);
createStreetLamp(-6.5, -1);
createStreetLamp(6.5, -1);
createStreetLamp(-2.5, 16);
createStreetLamp(2.5, 16);

// Florist Stall
const stall = new THREE.Group();
const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.4), toonMat(0xb45309));
counter.position.y = 0.55;
counter.castShadow = true;
const awning = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 2.1), toonMat(0xf43f5e));
awning.position.set(0, 2.7, 0.1);
awning.rotation.x = 0.2;
stall.add(counter, awning);
stall.position.set(-9.5, 0, -4.5);
stall.rotation.y = Math.PI / 3;
scene.add(stall);
colliders.push({ x: -9.5, z: -4.5, r: 1.9 });

// Broken Bridge Piers (Z = 18 & 38)
[18, 38].forEach((bz) => {
  const pier = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 2.2), toonMat(0x78350f));
  pier.position.set(0, 0.2, bz);
  pier.castShadow = true;
  scene.add(pier);
});

// River Stepping Stone Rocks (Challenge: hop across or swim current!)
addPlatformRock(-1.6, 22.0, 0.1, 1.5);
addPlatformRock(1.4, 25.5, 0.1, 1.5);
addPlatformRock(-5.8, 28.0, 0.25, 2.1); // Scarf Island!
addPlatformRock(0.8, 30.5, 0.1, 1.5);
addPlatformRock(-1.2, 34.5, 0.1, 1.5);

// Summit Shrine on Mountain Peak (0, 76)
const summitY = getTerrainHeight(0, 76);
const shrine = new THREE.Group();
const shrineBase = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.2, 0.5, 8), toonMat(0xe2e8f0));
const toriiL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.2), toonMat(0xf43f5e));
toriiL.position.set(-1.6, 2.1, 0);
const toriiR = toriiL.clone();
toriiR.position.set(1.6, 2.1, 0);
const toriiTop = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.45, 0.55), toonMat(0xf43f5e));
toriiTop.position.set(0, 4.1, 0);
shrine.add(shrineBase, toriiL, toriiR, toriiTop);
shrine.position.set(0, summitY, 76);
scene.add(shrine);

// Trees across Town & Mountain Ridge
[
  [-12, -15, "sakura"], [12, -15, "sakura"], [13, 3, "sakura"],
  [-9, 10, "pine"], [9, 10, "sakura"], [-12, 46, "pine"], [12, 48, "pine"],
  [-15, 76, "sakura"], [15, 76, "sakura"], [-11, 102, "pine"], [11, 104, "sakura"]
].forEach(([x, z, t]) => createStylizedTree(x, z, t));

/* 7. Anime Character Builder (with Ink Outlines & Sitting Pose) */
function addInkOutline(mesh, scale = 1.08) {
  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.BackSide })
  );
  outline.scale.setScalar(scale);
  mesh.add(outline);
}

function createAnimeCharacter({ coat, pants, hair, skin = 0xfed7aa, isDress = false, scarf = null }) {
  const g = new THREE.Group();

  const legGeo = new THREE.BoxGeometry(0.22, 0.85, 0.24);
  legGeo.translate(0, -0.425, 0); // Pivot at hip for clean sitting & walking!
  const legMat = toonMat(isDress ? skin : pants);

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.15, 0.85, 0);
  leftLeg.castShadow = true;

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.15, 0.85, 0);
  rightLeg.castShadow = true;
  g.add(leftLeg, rightLeg);

  const torso = new THREE.Mesh(
    isDress ? new THREE.ConeGeometry(0.45, 1.05, 10) : new THREE.BoxGeometry(0.58, 0.88, 0.34),
    toonMat(coat)
  );
  torso.position.y = isDress ? 1.15 : 1.28;
  torso.castShadow = true;
  addInkOutline(torso, 1.06);
  g.add(torso);

  if (scarf) {
    const scarfM = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.08, 8, 16), toonMat(scarf));
    scarfM.rotation.x = Math.PI / 2;
    scarfM.position.y = 1.72;
    g.add(scarfM);
  }

  const armGeo = new THREE.BoxGeometry(0.17, 0.72, 0.18);
  armGeo.translate(0, -0.32, 0);
  const leftArm = new THREE.Mesh(armGeo, toonMat(coat));
  leftArm.position.set(-0.4, 1.62, 0);
  const rightArm = new THREE.Mesh(armGeo, toonMat(coat));
  rightArm.position.set(0.4, 1.62, 0);
  g.add(leftArm, rightArm);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), toonMat(skin));
  head.position.y = 2.02;
  head.castShadow = true;
  addInkOutline(head, 1.06);
  g.add(head);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    toonMat(hair)
  );
  hairCap.position.y = 2.04;
  hairCap.rotation.x = -0.25;
  g.add(hairCap);

  if (isDress) {
    const longHair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.16), toonMat(hair));
    longHair.position.set(0, 1.72, -0.24);
    g.add(longHair);
  }

  [-0.1, 0.1].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    eye.position.set(ex, 2.02, 0.28);
    g.add(eye);
  });

  g.userData = { leftLeg, rightLeg, leftArm, rightArm, walkCycle: 0, sitting: false };
  scene.add(g);
  return g;
}

function setCharacterSitting(char, isSitting) {
  const u = char.userData;
  u.sitting = isSitting;
  if (isSitting) {
    u.leftLeg.rotation.x = -Math.PI / 2.1;
    u.rightLeg.rotation.x = -Math.PI / 2.1;
    u.leftArm.rotation.x = -0.35;
    u.rightArm.rotation.x = -0.35;
  }
}

function animateCharacterPose(char, isMoving, isSwimming, dt) {
  const u = char.userData;
  if (u.sitting) return;

  if (isSwimming) {
    u.walkCycle += dt * 7;
    u.leftArm.rotation.x = -Math.PI / 2 + Math.sin(u.walkCycle) * 0.7;
    u.rightArm.rotation.x = -Math.PI / 2 + Math.cos(u.walkCycle) * 0.7;
    u.leftLeg.rotation.x = Math.sin(u.walkCycle * 1.4) * 0.5;
    u.rightLeg.rotation.x = -Math.sin(u.walkCycle * 1.4) * 0.5;
  } else if (isMoving) {
    u.walkCycle += dt * 10;
    const s = Math.sin(u.walkCycle) * 0.55;
    u.leftLeg.rotation.x = s;
    u.rightLeg.rotation.x = -s;
    u.leftArm.rotation.x = -s * 0.75;
    u.rightArm.rotation.x = s * 0.75;
  } else {
    u.leftLeg.rotation.x *= 0.84;
    u.rightLeg.rotation.x *= 0.84;
    u.leftArm.rotation.x *= 0.84;
    u.rightArm.rotation.x *= 0.84;
  }
}

/* 8. Actors & Quest Keepsakes */
const player = createAnimeCharacter({ coat: 0x3b82f6, pants: 0x1e293b, hair: 0x0f172a });
player.position.set(-1.3, 0, -4);
player.rotation.y = Math.PI / 2;

const maya = createAnimeCharacter({ coat: 0xfb7185, hair: 0x451a03, isDress: true, scarf: 0xf43f5e });
maya.position.set(1.3, 0, -4);
maya.rotation.y = -Math.PI / 2;

const clara = createAnimeCharacter({ coat: 0xfbbf24, hair: 0x78350f, isDress: true });
clara.position.set(-8.0, 0, -3.2);
clara.rotation.y = Math.PI / 3;

// Quest Keepsakes
const scarfItem = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.32, 0.09, 36, 8),
  new THREE.MeshBasicMaterial({ color: 0xf43f5e })
);
scarfItem.position.set(-5.8, 0.9, 28);
scarfItem.visible = false;
scene.add(scarfItem);

const locketItem = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.4),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
);
locketItem.position.set(0, summitY + 1.1, 76);
locketItem.visible = false;
scene.add(locketItem);

const shellItem = new THREE.Mesh(
  new THREE.DodecahedronGeometry(0.38),
  new THREE.MeshBasicMaterial({ color: 0xfde047 })
);
shellItem.position.set(4.5, getTerrainHeight(4.5, 132) + 0.85, 132);
shellItem.visible = false;
scene.add(shellItem);

// Waypoint Light Pillar
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.5, 0.5, 22, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
);
beacon.visible = false;
scene.add(beacon);

/* 9. Color Filter & Petals */
function setWorldGrayscale(pct) {
  state.grayscale = pct;
  canvas.style.filter = `grayscale(${pct}%) contrast(${pct > 50 ? 1.08 : 1}) saturate(${pct === 0 ? 1.18 : 1})`;
  document.getElementById("colorMeter").textContent = `Color: ${Math.round(100 - pct)}%`;
}

function spawnColorPetals() {
  const count = 120;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const cols = new Float32Array(count * 3);
  const pal = [new THREE.Color(0xfb7185), new THREE.Color(0xfbbf24), new THREE.Color(0x38bdf8), new THREE.Color(0xc084fc)];

  for (let i = 0; i < count; i++) {
    pos[i * 3] = player.position.x + (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = player.position.y + Math.random() * 8 + 0.5;
    pos[i * 3 + 2] = player.position.z + (Math.random() - 0.5) * 18;
    const c = pal[i % pal.length];
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  petalSystem = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.9 }));
  scene.add(petalSystem);
}

/* 10. Dialogue & Quest Flow */
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
  document.getElementById("compassLine").hidden = step === 0 || step === 6;
}

function showAlert(msg, ms = 2400) {
  const el = document.getElementById("alertBanner");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, ms);
}

/* 11. Story Cutscenes */
function beginOpeningQuarrel() {
  state.phase = "QUARREL";
  document.getElementById("hud").hidden = false;
  updateQuestUI(0);
  setWorldGrayscale(0);

  startDialogue(
    [
      { speaker: "Maya", role: "Hurt", text: "You promised we'd watch the sunset by the ocean together, Leo. Instead you shut me out all day." },
      { speaker: "Leo", role: "You", text: "I had a lot on my mind! Why can't you just give me space without turning it into a drama?" },
      { speaker: "Maya", role: "", text: "...You're right. Maybe I shouldn't keep asking someone to care when they don't want to." },
      { speaker: "Maya", role: "", text: "Goodbye, Leo. Don't follow me." }
    ],
    () => {
      state.phase = "LADY_LEAVING";
      document.getElementById("questDesc").textContent = "Maya is leaving town...";
      AudioEngine.colorDrain();
      setWorldGrayscale(100);
    }
  );
}

function finishLadyLeaving() {
  // Place Maya sitting on the distant Sunset Beach facing the ocean sun (+Z)
  const beachZ = 158;
  const beachY = getTerrainHeight(0, beachZ);
  maya.position.set(0, beachY - 0.55, beachZ);
  maya.rotation.y = 0; // Facing +Z (towards the giant sunset)
  setCharacterSitting(maya, true);

  state.phase = "EXPLORE";
  updateQuestUI(1);
  document.getElementById("staminaBox").hidden = false;
  document.getElementById("controlsHint").hidden = false;
  if ("ontouchstart" in window || window.innerWidth <= 768) {
    document.getElementById("mobilePad").hidden = false;
  }

  startDialogue([
    { speaker: "Leo", role: "Inner Voice", text: "Everything... just turned black and white." },
    { speaker: "Leo", role: "Inner Voice", text: "I didn't mean to push her away. I have to find Maya—no matter how far she went." }
  ]);
}

function interactWithTarget(target) {
  if (target.id === "clara" && state.questStep === 1) {
    startDialogue(
      [
        { speaker: "Clara", role: "Florist", text: "Leo! Maya ran north out of town—she looked heartbroken." },
        { speaker: "Clara", role: "Florist", text: "The river bridge collapsed in yesterday's storm, so you'll have to hop across the rocks or swim through the current!" },
        { speaker: "Clara", role: "Florist", text: "I saw her red scarf catch on a rock out in the river. Start there, then follow the mountain pass toward the sea!" }
      ],
      () => {
        scarfItem.visible = true;
        updateQuestUI(2);
      }
    );
  } else if (target.id === "clara") {
    startDialogue([{ speaker: "Clara", role: "Florist", text: "Follow the golden light north—watch your stamina in the river and brace against mountain winds!" }]);
  } else if (target.id === "scarf" && state.questStep === 2) {
    scarfItem.visible = false;
    AudioEngine.sparkle();
    setWorldGrayscale(75);
    locketItem.visible = true;
    updateQuestUI(3);
    startDialogue([
      { speaker: "Leo", role: "", text: "I got her crimson scarf! A tiny bit of warmth returned to the world." },
      { speaker: "Leo", role: "", text: "The footprints lead straight up the Storm Ridge mountains. Time to climb." }
    ]);
  } else if (target.id === "locket" && state.questStep === 3) {
    locketItem.visible = false;
    AudioEngine.sparkle();
    setWorldGrayscale(45);
    shellItem.visible = true;
    updateQuestUI(4);
    startDialogue([
      { speaker: "Leo", role: "", text: "Her Silver Locket! Look from up here—I can see the ocean past the ridge." },
      { speaker: "Leo", role: "", text: "She must be down at the beach beyond the Tidal Cove!" }
    ]);
  } else if (target.id === "shell" && state.questStep === 4) {
    shellItem.visible = false;
    AudioEngine.sparkle();
    setWorldGrayscale(25);
    updateQuestUI(5);
    startDialogue([{ speaker: "Leo", role: "", text: "Just across the last stretch of water... I can see her sitting on the beach ahead!" }]);
  } else if (target.id === "maya" && state.questStep === 5) {
    startDialogue([
      { speaker: "Maya", role: "Looking at the ocean", text: "...I thought I told you not to follow me, Leo." },
      { speaker: "Maya", role: "", text: "Wait—you crossed the river and climbed the storm ridge just to get here?" },
      {
        speaker: "Leo",
        role: "Speak from the heart",
        text: "Stand beside Maya and choose what to say:",
        choices: [
          {
            label: "1. \"I'm so sorry, Maya. My world literally lost all its color the moment you walked away.\"",
            onPick: () => triggerSunsetFinale()
          },
          {
            label: "2. \"You were right. I took you for granted, and I brought back everything you left behind.\"",
            onPick: () => triggerSunsetFinale()
          }
        ]
      }
    ]);
  }
}

function triggerSunsetFinale() {
  // Leo sits right beside Maya facing the sunset!
  const beachY = getTerrainHeight(1.2, 158);
  player.position.set(1.2, beachY - 0.55, 158);
  player.rotation.y = 0;
  setCharacterSitting(player, true);

  startDialogue(
    [
      { speaker: "Leo", role: "", text: "I brought your scarf, your locket, and a promise to truly listen from now on. I'm really sorry." },
      { speaker: "Maya", role: "Tearing up, smiling", text: "You're soaked, exhausted, and covered in mountain dust... and you still kept your promise to watch the sunset with me." },
      { speaker: "Maya", role: "", text: "Sit down with me, Leo. Let's watch it together." }
    ],
    () => {
      AudioEngine.colorReturn();
      setWorldGrayscale(0);
      spawnColorPetals();
      updateQuestUI(6);
      state.phase = "ENDING";
      document.getElementById("staminaBox").hidden = true;
      setTimeout(() => {
        document.getElementById("endingOverlay").hidden = false;
      }, 2200);
    }
  );
}

/* 12. Support Height, Slope Check & Interactables */
function getSupportHeight(x, z, currentY) {
  let y = getTerrainHeight(x, z);
  for (const p of platforms) {
    if (Math.hypot(x - p.x, z - p.z) <= p.r && currentY >= p.y - 0.9) {
      y = Math.max(y, p.y);
    }
  }
  return y;
}

function canMoveTo(nx, nz, currentY) {
  if (nx < -36 || nx > 36 || nz < -24 || nz > 165) return false;
  for (const c of colliders) {
    if (Math.hypot(nx - c.x, nz - c.z) < c.r) return false;
  }
  const targetH = getSupportHeight(nx, nz, currentY);
  // Prevent walking straight up sheer vertical mountain cliffs
  if (targetH - currentY > 0.85) return false;
  return true;
}

function getCurrentObjectivePos() {
  if (state.questStep === 1) return { x: clara.position.x, z: clara.position.z };
  if (state.questStep === 2) return { x: scarfItem.position.x, z: scarfItem.position.z };
  if (state.questStep === 3) return { x: locketItem.position.x, z: locketItem.position.z };
  if (state.questStep === 4) return { x: shellItem.position.x, z: shellItem.position.z };
  if (state.questStep === 5) return { x: maya.position.x, z: maya.position.z };
  return null;
}

function findNearbyInteractable() {
  if (state.phase !== "EXPLORE" || state.dialogueActive) return null;
  const px = player.position.x;
  const pz = player.position.z;

  if (Math.hypot(px - clara.position.x, pz - clara.position.z) < 3.2) return { id: "clara", label: "Talk to Clara" };
  if (state.questStep === 2 && scarfItem.visible && Math.hypot(px - scarfItem.position.x, pz - scarfItem.position.z) < 2.6) {
    return { id: "scarf", label: "Grab Crimson Scarf" };
  }
  if (state.questStep === 3 && locketItem.visible && Math.hypot(px - locketItem.position.x, pz - locketItem.position.z) < 2.8) {
    return { id: "locket", label: "Take Silver Locket" };
  }
  if (state.questStep === 4 && shellItem.visible && Math.hypot(px - shellItem.position.x, pz - shellItem.position.z) < 2.8) {
    return { id: "shell", label: "Pick up Tide Shell" };
  }
  if (state.questStep === 5 && Math.hypot(px - maya.position.x, pz - maya.position.z) < 3.4) {
    return { id: "maya", label: "Speak to Maya" };
  }
  return null;
}

/* 13. Input Events */
window.addEventListener("keydown", (e) => {
  AudioEngine.unlock();
  const k = e.key.toLowerCase();
  state.keys[k] = true;

  if (e.key === " " || e.key === "Enter") {
    if (state.dialogueActive) {
      e.preventDefault();
      advanceDialogue();
    } else if (e.key === " " && state.phase === "EXPLORE" && state.grounded && !state.isSwimming) {
      e.preventDefault();
      state.velY = 9.2;
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
  if (state.phase === "EXPLORE" && state.grounded && !state.isSwimming) {
    state.velY = 9.2;
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
  state.camPitch = Math.max(0.12, Math.min(0.85, state.camPitch + (e.clientY - state.lastMouseY) * 0.004));
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

/* 14. Main Game Loop */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  // Animate Ocean & River Waves
  const wPos = waterGeo.attributes.position;
  for (let i = 0; i < wPos.count; i++) {
    const wx = wPos.getX(i);
    const wz = wPos.getZ(i);
    wPos.setY(i, waterBaseY[i] + Math.sin(elapsed * 2.2 + wx * 0.25 + wz * 0.2) * 0.09);
  }
  wPos.needsUpdate = true;

  // Floating Keepsakes
  if (scarfItem.visible) { scarfItem.rotation.y += dt * 2.5; scarfItem.position.y = 0.9 + Math.sin(elapsed * 3) * 0.14; }
  if (locketItem.visible) { locketItem.rotation.y += dt * 2.5; locketItem.position.y = summitY + 1.1 + Math.sin(elapsed * 3) * 0.14; }
  if (shellItem.visible) { shellItem.rotation.y += dt * 2.5; shellItem.position.y = getTerrainHeight(4.5, 132) + 0.85 + Math.sin(elapsed * 3) * 0.14; }

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

  // Opening Cutscene: Maya leaves town across the bridge ruins
  if (state.phase === "LADY_LEAVING") {
    maya.position.x += (0 - maya.position.x) * dt * 1.6;
    maya.position.z += dt * 4.8;
    maya.rotation.y = 0;
    animateCharacterPose(maya, true, false, dt);
    if (maya.position.z >= 18.5) {
      animateCharacterPose(maya, false, false, dt);
      finishLadyLeaving();
    }
  }

  // Player Exploration Physics (Walk / Jump / Swim / Wind Gusts)
  let playerMoving = false;
  if (state.phase === "EXPLORE" && !state.dialogueActive) {
    if (state.keys["q"]) state.camYaw += dt * 2.0;

    // Update Zone Label
    const pz = player.position.z;
    document.getElementById("zoneLabel").textContent =
      pz < 17 ? "Sunset Town" : pz < 40 ? "Rushing River" : pz < 112 ? "Storm Ridge" : pz < 150 ? "Tidal Cove" : "Sunset Beach";

    // Mountain Wind Gusts (Z = 44 to 108)
    if (pz >= 44 && pz <= 108) {
      state.windTimer += dt;
      if (state.windTimer > 7) {
        state.windForceX = Math.sin(elapsed) > 0 ? 3.2 : -3.2;
        showAlert("💨 Strong Mountain Wind Gust!", 2200);
        state.windTimer = 0;
      } else if (state.windTimer > 2.5) {
        state.windForceX = 0;
      }
    } else {
      state.windForceX = 0;
    }

    const supportY = getSupportHeight(player.position.x, player.position.z, player.position.y);
    const inWater = supportY < SEA_LEVEL - 0.35 && player.position.y <= SEA_LEVEL - 0.1;
    if (inWater && !state.isSwimming) AudioEngine.splash();
    state.isSwimming = inWater;

    if (!inWater && state.grounded) {
      state.lastSafePos = { x: player.position.x, y: player.position.y, z: player.position.z };
    }

    let fwd = 0, side = 0;
    if (state.keys["w"] || state.keys["arrowup"]) fwd += 1;
    if (state.keys["s"] || state.keys["arrowdown"]) fwd -= 1;
    if (state.keys["a"] || state.keys["arrowleft"]) side -= 1;
    if (state.keys["d"] || state.keys["arrowright"]) side += 1;

    const wantsSprint = state.keys["shift"] && state.stamina > 5 && !inWater;
    const isMovingInput = fwd !== 0 || side !== 0;

    // Stamina Management
    if (inWater) {
      state.stamina = Math.max(0, state.stamina - dt * (isMovingInput ? 12 : 6));
      if (state.stamina <= 0) {
        showAlert("Exhausted by the current! Swept back to shore.", 2600);
        player.position.set(state.lastSafePos.x, state.lastSafePos.y + 0.3, state.lastSafePos.z);
        state.stamina = 45;
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

    // River Current pushes +X in the river gorge
    if (inWater && pz >= 18 && pz <= 39) {
      moveX += 2.1 * dt;
    }

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
      player.rotation.y = Math.atan2(dirX, dirZ);
      playerMoving = true;
    }

    const nx = player.position.x + moveX;
    const nz = player.position.z + moveZ;
    if (canMoveTo(nx, player.position.z, player.position.y)) player.position.x = nx;
    if (canMoveTo(player.position.x, nz, player.position.y)) player.position.z = nz;

    // Vertical Physics (Gravity / Floating in Water)
    const floorY = getSupportHeight(player.position.x, player.position.z, player.position.y);
    if (state.isSwimming) {
      const targetSwimY = SEA_LEVEL - 0.85 + Math.sin(elapsed * 3) * 0.06;
      player.position.y += (targetSwimY - player.position.y) * dt * 8;
      state.velY = 0;
      state.grounded = false;
    } else {
      state.velY -= 24 * dt;
      player.position.y += state.velY * dt;
      if (player.position.y <= floorY) {
        player.position.y = floorY;
        state.velY = 0;
        state.grounded = true;
      } else {
        state.grounded = false;
      }
    }

    // Interactables & Compass
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
      const dist = Math.round(Math.hypot(obj.x - player.position.x, obj.z - player.position.z));
      document.getElementById("compassDist").textContent = `${dist}m to objective`;
      const ang = Math.atan2(obj.x - player.position.x, obj.z - player.position.z);
      document.getElementById("compassArrow").style.transform = `rotate(${-((ang - state.camYaw) * 180) / Math.PI - 90}deg)`;
    } else {
      beacon.visible = false;
    }
  } else {
    beacon.visible = false;
    document.getElementById("interactPrompt").hidden = true;
  }

  animateCharacterPose(player, playerMoving, state.isSwimming, dt);

  // Dynamic Sun Shadow Follows Player Across the 200-Unit World
  sunLight.position.set(player.position.x + 20, player.position.y + 34, player.position.z + 24);

  // Camera Tracking
  if (state.phase === "FLASH" || state.phase === "QUARREL" || state.phase === "LADY_LEAVING") {
    camera.position.lerp(new THREE.Vector3(0, 3.8, 3.2), 0.06);
    camera.lookAt(0, 1.5, -4);
  } else if (state.phase === "ENDING") {
    // Cinematic Orbit Looking Toward Couple & Sunset Ocean
    const orbitX = Math.sin(elapsed * 0.18) * 5.2;
    camera.position.lerp(new THREE.Vector3(orbitX, player.position.y + 2.6, 152.5), 0.04);
    camera.lookAt(0.6, player.position.y + 1.4, 175);
  } else {
    const camDist = 8.8;
    const tx = player.position.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * camDist;
    const ty = player.position.y + 2.2 + Math.sin(state.camPitch) * camDist;
    const tz = player.position.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * camDist;
    camera.position.lerp(new THREE.Vector3(tx, ty, tz), 0.12);
    camera.lookAt(player.position.x, player.position.y + 1.5, player.position.z);
  }

  renderer.render(scene, camera);
}

/* 15. Safe Startup */
function startGame() {
  try {
    setWorldGrayscale(0);
    animate();
    setTimeout(() => {
      document.getElementById("titleFlash").hidden = true;
      beginOpeningQuarrel();
    }, 3800);
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
