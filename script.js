/* =========================================================
   FINDING JANE — Inspired by "Once We Were Us" (2025)
   Eric & Jane: Town -> River -> Meteors & Sky Key -> Sunset Beach
========================================================= */

const NOTES_KEY = "finding_jane_sorry_notes_v1";
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
    jump: () => playTone(320, 0.12, "sine", 0.05),
    splash: () => playTone(165, 0.18, "triangle", 0.05),
    hit: () => { playTone(130, 0.18, "sawtooth", 0.07); playTone(85, 0.22, "sawtooth", 0.06, 0.06); },
    colorDrain: () => [440, 392, 330, 247].forEach((f, i) => playTone(f, 0.45, "sine", 0.06, i * 0.22)),
    sparkle: () => [523, 659, 880].forEach((f, i) => playTone(f, 0.28, "triangle", 0.06, i * 0.09)),
    colorReturn: () => [261, 329, 392, 493, 587, 659, 784, 987].forEach((f, i) => playTone(f, 0.6, "sine", 0.07, i * 0.1))
  };
})();

/* 2. State & Quests */
const state = {
  phase: "FLASH", // FLASH | QUARREL | JANE_LEAVING | EXPLORE | ENDING
  grayscale: 0,
  dialogueActive: false,
  dialogueQueue: [],
  dialogueIndex: 0,
  dialogueOnComplete: null,
  questStep: 0,   // 0=quarrel, 1=talk station keeper, 2=river scarf, 3=sky key, 4=summit gate/locket, 5=sea cove, 6=sunset beach, 7=done
  hasScarf: false,
  hasKey: false,
  hasLocket: false,
  gateUnlocked: false,
  stamina: 100,
  velY: 0,
  grounded: true,
  isSwimming: false,
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
  1: { title: "Follow Jane's Footsteps", desc: "Speak to Sora near the old town stall to ask where Jane went." },
  2: { title: "Cross the Rushing River", desc: "Swim or hop the river rocks to recover Jane's Red Scarf." },
  3: { title: "Find the Sky Key", desc: "Climb the East Mountain Cliff & dodge falling meteors to find the Sky Key." },
  4: { title: "Unlock the Summit Gate", desc: "Bring the Sky Key up the stairway to unlock the Summit Torii Gate & claim her Locket." },
  5: { title: "Swim the Tidal Cove", desc: "Descend to the sea, swim across the sandbars, and reach Sunset Beach." },
  6: { title: "Find Jane at Sunset Beach", desc: "Walk up to Jane on the golden sand and tell her how sorry you are." },
  7: { title: "Color Returned", desc: "Eric & Jane watching the sunset together." }
};

/* 3. Three.js Renderer, Scene & Cel-Shaded Ramp */
const canvas = document.getElementById("worldCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xfdba74, 0.0065);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 360);

const toonData = new Uint8Array([105, 105, 105, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
const toonGradient = new THREE.DataTexture(toonData, 3, 1, THREE.RGBAFormat);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

function toonMat(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra });
}

const hemiLight = new THREE.HemisphereLight(0xfde68a, 0x3b82f6, 0.72);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffedd5, 1.25);
sunLight.position.set(20, 32, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 140;
const sRange = 44;
sunLight.shadow.camera.left = -sRange;
sunLight.shadow.camera.right = sRange;
sunLight.shadow.camera.top = sRange;
sunLight.shadow.camera.bottom = -sRange;
scene.add(sunLight);
scene.add(sunLight.target);

/* 4. Anime Sunset Sky Dome & Ocean Sun */
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
scene.add(new THREE.Mesh(new THREE.SphereGeometry(260, 32, 24), skyMat));

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

/* 5. Multi-Biome Terrain */
function mountainTrailX(z) {
  if (z < 42 || z > 110) return 0;
  return Math.sin(((z - 42) / 68) * Math.PI * 2) * 10.5;
}

function getTerrainHeight(x, z) {
  let h = 0;

  if (z < 18) {
    h = 0;
    const edge = Math.max(0, Math.abs(x) - 18);
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

const terrainGeo = new THREE.PlaneGeometry(96, 220, 96, 180);
terrainGeo.rotateX(-Math.PI / 2);
terrainGeo.translate(0, 0, 75);

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
    col = Math.abs(vx - mountainTrailX(vz)) < 3.6 ? (vy > 8 ? cSummit : cSand) : cMountain;
  } else if (vz > 112) {
    col = vy > -0.15 ? cSand : cSeaBed;
  }

  colArr[i * 3] = col.r; colArr[i * 3 + 1] = col.g; colArr[i * 3 + 2] = col.b;
}
terrainGeo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
terrainGeo.computeVertexNormals();
const terrainMesh = new THREE.Mesh(terrainGeo, toonMat(0xffffff, { vertexColors: true }));
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

const waterGeo = new THREE.PlaneGeometry(140, 220, 36, 56);
waterGeo.rotateX(-Math.PI / 2);
waterGeo.translate(0, SEA_LEVEL, 105);
const waterBaseY = new Float32Array(waterGeo.attributes.position.count).fill(SEA_LEVEL);
const waterMesh = new THREE.Mesh(
  waterGeo,
  new THREE.MeshToonMaterial({ color: 0x0ea5e9, gradientMap: toonGradient, transparent: true, opacity: 0.84 })
);
waterMesh.receiveShadow = true;
scene.add(waterMesh);

/* 6. Landmarks, Stepping Rocks, Locked Gate & Falling Meteors */
const colliders = [];
const platforms = [];
const activeMeteors = [];
let petalSystem = null;

function addPlatformRock(x, z, y, r = 1.7) {
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 1.1, 1.4, 7), toonMat(0x94a3b8));
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
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.5, 4), toonMat(roofColor));
  roof.position.y = 4.8;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  win.position.set(0, 2.0, 2.22);
  g.add(base, roof, win);
  g.position.set(x, getTerrainHeight(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  colliders.push({ x, z, r: 3.1 });
}

function createStylizedTree(x, z, type = "sakura") {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 2.8, 7), toonMat(0x78350f));
  trunk.position.y = 1.4;
  trunk.castShadow = true;
  const c1 = type === "sakura" ? 0xf9a8d4 : 0x16a34a;
  const c2 = type === "sakura" ? 0xf472b6 : 0x22c55e;
  const canopy1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9), toonMat(c1));
  canopy1.position.y = 3.5;
  canopy1.castShadow = true;
  const canopy2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3), toonMat(c2));
  canopy2.position.set(0.85, 2.9, 0.4);
  canopy2.castShadow = true;
  g.add(trunk, canopy1, canopy2);
  g.position.set(x, getTerrainHeight(x, z), z);
  scene.add(g);
  colliders.push({ x, z, r: 0.9 });
}

// Town Buildings & Lamps
createCottage(-14, -10, 0xfef3c7, 0xf43f5e, 0.4);
createCottage(14, -10, 0xe0f2fe, 0x6366f1, -0.4);
createCottage(-14, 3, 0xfce7f3, 0xfb7185, 1.2);

[[-6.5, -1], [6.5, -1], [-2.5, 16], [2.5, 16]].forEach(([lx, lz]) => {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6), toonMat(0x1e293b));
  pole.position.set(lx, 1.8, lz);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  bulb.position.set(lx, 3.7, lz);
  scene.add(pole, bulb);
});

// Florist Stall
const stall = new THREE.Group();
const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.4), toonMat(0xb45309));
counter.position.y = 0.55;
const awning = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 2.1), toonMat(0xf43f5e));
awning.position.set(0, 2.7, 0.1);
awning.rotation.x = 0.2;
stall.add(counter, awning);
stall.position.set(-9.5, 0, -4.5);
stall.rotation.y = Math.PI / 3;
scene.add(stall);
colliders.push({ x: -9.5, z: -4.5, r: 1.9 });

// Broken Bridge Piers
[18, 38].forEach((bz) => {
  const pier = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 2.2), toonMat(0x78350f));
  pier.position.set(0, 0.2, bz);
  scene.add(pier);
});

// River Stepping Stones + Scarf Island
addPlatformRock(-1.6, 22.0, 0.1, 1.5);
addPlatformRock(1.4, 25.5, 0.1, 1.5);
addPlatformRock(-5.8, 28.0, 0.25, 2.1);
addPlatformRock(0.8, 30.5, 0.1, 1.5);
addPlatformRock(-1.2, 34.5, 0.1, 1.5);

// East Cliff Overlook Ledge for Sky Key (Jump up onto this ledge!)
const keyCliffY = getTerrainHeight(10.5, 59) + 0.95;
addPlatformRock(14.2, 59, keyCliffY, 2.3);

// Summit Torii Gate & Barrier Door (Z = 75)
const summitY = getTerrainHeight(0, 76);
const gateGroup = new THREE.Group();
const toriiL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 4.4), toonMat(0xf43f5e));
toriiL.position.set(-2.1, 2.2, 0);
const toriiR = toriiL.clone();
toriiR.position.set(2.1, 2.2, 0);
const toriiTop = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 0.65), toonMat(0xf43f5e));
toriiTop.position.set(0, 4.3, 0);
const gateDoor = new THREE.Mesh(
  new THREE.BoxGeometry(3.8, 3.6, 0.35),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 })
);
gateDoor.position.set(0, 1.8, 0);
gateGroup.add(toriiL, toriiR, toriiTop, gateDoor);
gateGroup.position.set(0, summitY, 75);
scene.add(gateGroup);

[
  [-12, -15, "sakura"], [12, -15, "sakura"], [13, 3, "sakura"],
  [-9, 10, "pine"], [9, 10, "sakura"], [-12, 46, "pine"], [12, 48, "pine"],
  [-15, 76, "sakura"], [15, 76, "sakura"], [-11, 102, "pine"], [11, 104, "sakura"]
].forEach(([x, z, t]) => createStylizedTree(x, z, t));

/* 7. Anime Characters (Eric, Jane & Sora) */
function addInkOutline(mesh, scale = 1.07) {
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
  legGeo.translate(0, -0.425, 0);
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
  addInkOutline(torso);
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
  addInkOutline(head);
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
    u.leftLeg.rotation.x = s; u.rightLeg.rotation.x = -s;
    u.leftArm.rotation.x = -s * 0.75; u.rightArm.rotation.x = s * 0.75;
  } else {
    u.leftLeg.rotation.x *= 0.84; u.rightLeg.rotation.x *= 0.84;
    u.leftArm.rotation.x *= 0.84; u.rightArm.rotation.x *= 0.84;
  }
}

// Cast: Eric (Player), Jane, Sora
const eric = createAnimeCharacter({ coat: 0x3b82f6, pants: 0x1e293b, hair: 0x0f172a });
eric.position.set(-1.3, 0, -4);
eric.rotation.y = Math.PI / 2;

const jane = createAnimeCharacter({ coat: 0xfb7185, hair: 0x451a03, isDress: true, scarf: 0xf43f5e });
jane.position.set(1.3, 0, -4);
jane.rotation.y = -Math.PI / 2;

const sora = createAnimeCharacter({ coat: 0xfbbf24, hair: 0x78350f, isDress: true });
sora.position.set(-8.0, 0, -3.2);
sora.rotation.y = Math.PI / 3;

/* 8. Quest Collectibles & Waypoint */
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
  new THREE.CylinderGeometry(0.5, 0.5, 22, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
);
beacon.visible = false;
scene.add(beacon);

/* 9. Falling Meteor Hazards (Mountain Challenge!) */
function spawnMeteorNearPlayer() {
  const tx = eric.position.x + (Math.random() - 0.5) * 5;
  const tz = eric.position.z + (Math.random() - 0.5) * 6 + 2;
  const ty = getTerrainHeight(tx, tz);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(tx, ty + 0.15, tz);
  scene.add(ring);

  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75), toonMat(0x475569));
  rock.position.set(tx, ty + 18, tz);
  scene.add(rock);

  activeMeteors.push({ ring, rock, tx, ty, tz, timer: 1.35, hit: false });
}

/* 10. Color Filter & Petals */
function setWorldGrayscale(pct) {
  state.grayscale = pct;
  canvas.style.filter = `grayscale(${pct}%) contrast(${pct > 50 ? 1.08 : 1}) saturate(${pct === 0 ? 1.18 : 1})`;
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
  petalSystem = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.9 }));
  scene.add(petalSystem);
}

/* 11. Dialogue & Quest UI */
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

/* 12. Cutscenes & Interactions */
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
  jane.position.set(0, beachY - 0.55, beachZ);
  jane.rotation.y = 0; // Facing +Z toward sunset ocean
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
        { speaker: "Sora", role: "Town Florist", text: "Eric! Jane hurried north out of town crying—the river bridge collapsed in the storm, so she took the rocks!" },
        { speaker: "Sora", role: "Town Florist", text: "I saw her red scarf snag out in the rushing river. Watch your stamina against the current, and watch out for falling meteors on the mountain!" }
      ],
      () => {
        scarfItem.visible = true;
        updateQuestUI(2);
      }
    );
  } else if (target.id === "sora") {
    startDialogue([{ speaker: "Sora", role: "Town Florist", text: "Follow the golden beacon north, Eric. She's waiting beyond the ridge by the ocean!" }]);
  } else if (target.id === "scarf" && state.questStep === 2) {
    scarfItem.visible = false;
    state.hasScarf = true;
    AudioEngine.sparkle();
    setWorldGrayscale(75);
    keyItem.visible = true;
    updateQuestUI(3);
    startDialogue([
      { speaker: "Eric", role: "", text: "Jane's Red Scarf... Holding it brings back a spark of color." },
      { speaker: "Eric", role: "", text: "The path ahead climbs Storm Ridge, and the Summit Gate is locked. I need the Sky Key from the East Cliff ledge!" }
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
    interactWithTarget({ id: "gate_unlocked" });
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
  const beachY = getTerrainHeight(1.2, 158);
  eric.position.set(1.2, beachY - 0.55, 158);
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
      renderSavedNotes();
      setTimeout(() => {
        document.getElementById("endingOverlay").hidden = false;
      }, 2200);
    }
  );
}

/* 13. Support Height, Gate Blocking & Interactables */
function getSupportHeight(x, z, currentY) {
  let y = getTerrainHeight(x, z);
  for (const p of platforms) {
    if (Math.hypot(x - p.x, z - p.z) <= p.r && currentY >= p.y - 0.95) {
      y = Math.max(y, p.y);
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
  if (getSupportHeight(nx, nz, currentY) - currentY > 0.85) return false;
  return true;
}

function getCurrentObjectivePos() {
  if (state.questStep === 1) return { x: sora.position.x, z: sora.position.z };
  if (state.questStep === 2) return { x: scarfItem.position.x, z: scarfItem.position.z };
  if (state.questStep === 3) return { x: keyItem.position.x, z: keyItem.position.z };
  if (state.questStep === 4) {
    return state.gateUnlocked
      ? { x: locketItem.position.x, z: locketItem.position.z }
      : { x: 0, z: 74 };
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

/* 14. Sorry Note Tribute Wall */
function renderSavedNotes() {
  const wrap = document.getElementById("savedNotes");
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); } catch {}
  wrap.innerHTML = "";
  notes.slice(0, 4).forEach((txt) => {
    const div = document.createElement("div");
    div.className = "saved-note-item";
    div.textContent = `"${txt}"`;
    wrap.appendChild(div);
  });
}

document.getElementById("noteForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("sorryNoteInput");
  const val = input.value.trim();
  if (!val) return;
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); } catch {}
  notes.unshift(val);
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes.slice(0, 10)));
  input.value = "";
  renderSavedNotes();
});

/* 15. Input Listeners */
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
      state.velY = 9.4;
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
    state.velY = 9.4;
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

/* 16. Main Loop */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  // Ocean & River Waves
  const wPos = waterGeo.attributes.position;
  for (let i = 0; i < wPos.count; i++) {
    wPos.setY(i, waterBaseY[i] + Math.sin(elapsed * 2.2 + wPos.getX(i) * 0.25 + wPos.getZ(i) * 0.2) * 0.09);
  }
  wPos.needsUpdate = true;

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

  // Active Falling Meteors
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

  // Cutscene: Jane walks away
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
      pz < 17 ? "Sunset Town" : pz < 40 ? "Rushing River" : pz < 112 ? "Storm Ridge" : pz < 150 ? "Tidal Cove" : "Sunset Beach";

    if (pz >= 150 && state.questStep === 5) {
      updateQuestUI(6);
    }

    // Mountain Wind & Falling Meteors (Z = 44 to 108)
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
    const inWater = supportY < SEA_LEVEL - 0.35 && eric.position.y <= SEA_LEVEL - 0.1;
    if (inWater && !state.isSwimming) AudioEngine.splash();
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
    if (inWater && pz >= 18 && pz <= 39) moveX += 2.2 * dt; // River current

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
      eric.position.y += (SEA_LEVEL - 0.85 + Math.sin(elapsed * 3) * 0.06 - eric.position.y) * dt * 8;
      state.velY = 0;
      state.grounded = false;
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
  sunLight.position.set(eric.position.x + 20, eric.position.y + 34, eric.position.z + 24);

  if (state.phase === "FLASH" || state.phase === "QUARREL" || state.phase === "JANE_LEAVING") {
    camera.position.lerp(new THREE.Vector3(0, 3.8, 3.2), 0.06);
    camera.lookAt(0, 1.5, -4);
  } else if (state.phase === "ENDING") {
    const orbitX = Math.sin(elapsed * 0.18) * 5.2;
    camera.position.lerp(new THREE.Vector3(orbitX, eric.position.y + 2.6, 152.5), 0.04);
    camera.lookAt(0.6, eric.position.y + 1.4, 175);
  } else {
    const camDist = 8.8;
    const tx = eric.position.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * camDist;
    const ty = eric.position.y + 2.2 + Math.sin(state.camPitch) * camDist;
    const tz = eric.position.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * camDist;
    camera.position.lerp(new THREE.Vector3(tx, ty, tz), 0.12);
    camera.lookAt(eric.position.x, eric.position.y + 1.5, eric.position.z);
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
