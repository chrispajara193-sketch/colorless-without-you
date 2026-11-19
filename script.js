/* =========================================================
   COLORLESS WITHOUT YOU — 3D Story Adventure (Three.js)
========================================================= */

/* 1. Web Audio Story Chimes */
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
    toggleMute() {
      muted = !muted;
      return muted;
    },
    blip: () => playTone(540, 0.07, "triangle", 0.04),
    colorDrain: () => {
      [440, 392, 330, 261].forEach((f, i) => playTone(f, 0.45, "sine", 0.06, i * 0.22));
    },
    sparkle: () => {
      [523, 659, 784].forEach((f, i) => playTone(f, 0.25, "triangle", 0.06, i * 0.09));
    },
    colorReturn: () => {
      [261, 329, 392, 493, 587, 659, 784].forEach((f, i) => playTone(f, 0.55, "sine", 0.07, i * 0.1));
    }
  };
})();

/* 2. Game State & Quest Definitions */
const state = {
  phase: "FLASH", // FLASH | QUARREL | LADY_LEAVING | EXPLORE | ENDING
  grayscale: 0,   // 0 = full color, 100 = pure black & white
  dialogueActive: false,
  dialogueQueue: [],
  dialogueIndex: 0,
  dialogueOnComplete: null,
  questStep: 0,   // 0=intro, 1=talk florist, 2=find ribbon, 3=gather 3 flowers, 4=find Maya, 5=done
  flowersCollected: 0,
  camYaw: 0,
  camPitch: 0.36,
  keys: {},
  isDragging: false,
  lastMouseX: 0,
  lastMouseY: 0,
  nearbyInteractable: null
};

const QUEST_INFO = {
  0: { title: "The Quarrel", desc: "Listen to Maya..." },
  1: { title: "Where Did She Go?", desc: "Talk to Clara at the Flower Stall in the plaza." },
  2: { title: "Lost Ribbon", desc: "Search near the Old Stone Fountain for Maya's ribbon." },
  3: { title: "A Bouquet of Sorry", desc: "Gather 3 Memory Wildflowers (0/3) around the south meadow." },
  4: { title: "Cross the Bridge", desc: "Find Maya at the Hilltop Gazebo and tell her you're sorry." },
  5: { title: "Color Returned", desc: "You made things right. Enjoy the vibrant valley!" }
};

/* 3. Three.js Scene Setup */
const canvas = document.getElementById("worldCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0xa5d8ff, 0.011);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 180);

// Lighting
const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x4ade80, 0.85);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
sunLight.position.set(22, 34, 14);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 110;
const d = 42;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

/* 4. World Building Helpers */
const colliders = []; // { x, z, r }
const animatedClouds = [];
const worldFlowers = [];
let petalSystem = null;

function mat(color, roughness = 0.85, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

function createGroundAndRiver() {
  // Lush Meadow Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    mat(0x52c45b, 0.95)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Town Stone Plaza (centered at 0, -4)
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(8.5, 8.7, 0.12, 32),
    mat(0xfde68a, 0.9)
  );
  plaza.position.set(0, 0.05, -4);
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Inner Plaza Ring
  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.6, 32),
    mat(0xf59e0b, 0.9, { side: THREE.DoubleSide })
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.set(0, 0.12, -4);
  scene.add(innerRing);

  // Dirt Path South -> Bridge -> Gazebo
  const pathSouth = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 12), mat(0xe7c288));
  pathSouth.position.set(0, 0.04, 6);
  pathSouth.receiveShadow = true;
  scene.add(pathSouth);

  const pathNorth = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 16), mat(0xe7c288));
  pathNorth.position.set(0, 0.04, 24);
  pathNorth.receiveShadow = true;
  scene.add(pathNorth);

  // Sparkling Blue River (Z = 10 to 16)
  const river = new THREE.Mesh(
    new THREE.BoxGeometry(120, 0.25, 6),
    mat(0x0ea5e9, 0.2, { metalness: 0.1 })
  );
  river.position.set(0, -0.06, 13);
  river.receiveShadow = true;
  scene.add(river);

  // Wooden Arch Bridge (X = -2.6 to +2.6, Z = 9.5 to 16.5)
  const bridgeGroup = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.35, 7.6), mat(0x9a5b2c));
  deck.position.set(0, 0.35, 13);
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridgeGroup.add(deck);

  [-2.1, 2.1].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 7.6), mat(0x78350f));
    rail.position.set(rx, 0.95, 13);
    rail.castShadow = true;
    bridgeGroup.add(rail);
  });
  scene.add(bridgeGroup);
}

function createTree(x, z, type = "cherry") {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.4, 7), mat(0x7c4a2d));
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  g.add(trunk);

  const leafColors = type === "cherry"
    ? [0xf9a8d4, 0xf472b6, 0xfbcfe8]
    : [0x16a34a, 0x22c55e, 0x15803d];

  const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7), mat(leafColors[0]));
  c1.position.y = 3.1;
  c1.castShadow = true;
  g.add(c1);

  const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2), mat(leafColors[1]));
  c2.position.set(0.8, 2.6, 0.5);
  c2.castShadow = true;
  g.add(c2);

  g.position.set(x, 0, z);
  scene.add(g);
  colliders.push({ x, z, r: 1.0 });
}

function createFountain(x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.7, 16), mat(0xe2e8f0));
  base.position.y = 0.35;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.55, 16), mat(0x38bdf8, 0.15));
  water.position.y = 0.45;
  g.add(water);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.8, 12), mat(0xcbd5e1));
  pillar.position.y = 1.1;
  pillar.castShadow = true;
  g.add(pillar);

  const topBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.4, 0.4, 16), mat(0xe2e8f0));
  topBowl.position.y = 2.0;
  topBowl.castShadow = true;
  g.add(topBowl);

  g.position.set(x, 0, z);
  scene.add(g);
  colliders.push({ x, z, r: 2.5 });
}

function createFloristStall(x, z) {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.4), mat(0xb45309));
  counter.position.y = 0.55;
  counter.castShadow = true;
  g.add(counter);

  // Striped Awning
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 2.1), mat(0xf43f5e));
  awning.position.set(0, 2.7, 0.1);
  awning.rotation.x = 0.2;
  awning.castShadow = true;
  g.add(awning);

  [-1.45, 1.45].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.7), mat(0x78350f));
    post.position.set(px, 1.35, -0.55);
    g.add(post);
  });

  // Colorful Flower Pots on Stall
  [0xfbbf24, 0xec4899, 0x38bdf8, 0xa855f7].forEach((col, i) => {
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), mat(col));
    pot.position.set(-1.0 + i * 0.65, 1.25, 0.2);
    g.add(pot);
  });

  g.position.set(x, 0, z);
  g.rotation.y = Math.PI / 4;
  scene.add(g);
  colliders.push({ x, z, r: 2.0 });
}

function createGazebo(x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.35, 8), mat(0xf1f5f9));
  base.position.y = 0.17;
  base.receiveShadow = true;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.3, 8), mat(0xfb7185));
  roof.position.y = 4.6;
  roof.castShadow = true;
  g.add(roof);

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const px = Math.cos(angle) * 3.5;
    const pz = Math.sin(angle) * 3.5;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.5), mat(0xffffff));
    col.position.set(px, 1.9, pz);
    col.castShadow = true;
    g.add(col);
  }

  g.position.set(x, 0, z);
  scene.add(g);
}

function createClouds() {
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    const m = mat(0xffffff, 1, { emissive: 0xffffff, emissiveIntensity: 0.2 });
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random(), 8, 8), m);
      puff.position.set((j - 1) * 1.6, Math.random() * 0.6, Math.random() * 0.6);
      c.add(puff);
    }
    c.position.set((Math.random() - 0.5) * 90, 18 + Math.random() * 7, (Math.random() - 0.5) * 90);
    scene.add(c);
    animatedClouds.push({ mesh: c, speed: 0.4 + Math.random() * 0.5 });
  }
}

/* 5. Articulated 3D Character Builder */
function createCharacter({ shirt, pants, hair, skin = 0xfed7aa, isDress = false, scarf = null }) {
  const group = new THREE.Group();

  // Legs
  const legGeo = new THREE.BoxGeometry(0.24, 0.65, 0.24);
  const legMat = mat(isDress ? skin : pants);
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.16, 0.32, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.16, 0.32, 0);
  rightLeg.castShadow = true;
  group.add(leftLeg, rightLeg);

  // Torso / Dress
  const torso = new THREE.Mesh(
    isDress ? new THREE.ConeGeometry(0.46, 1.0, 10) : new THREE.BoxGeometry(0.62, 0.78, 0.34),
    mat(shirt)
  );
  torso.position.y = isDress ? 0.95 : 1.02;
  torso.castShadow = true;
  group.add(torso);

  if (scarf) {
    const scarfMesh = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.08, 8, 16), mat(scarf));
    scarfMesh.rotation.x = Math.PI / 2;
    scarfMesh.position.y = 1.42;
    group.add(scarfMesh);
  }

  // Arms
  const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.18);
  const armMat = mat(shirt);
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.42, 1.05, 0);
  leftArm.castShadow = true;
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.42, 1.05, 0);
  rightArm.castShadow = true;
  group.add(leftArm, rightArm);

  // Head + Hair
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 14), mat(skin));
  head.position.y = 1.7;
  head.castShadow = true;
  group.add(head);

  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
    mat(hair)
  );
  hairMesh.position.y = 1.72;
  hairMesh.rotation.x = -0.25;
  group.add(hairMesh);

  if (isDress) {
    const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.18), mat(hair));
    backHair.position.set(0, 1.5, -0.22);
    group.add(backHair);
  }

  // Eyes
  [-0.1, 0.1].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat(0x0f172a));
    eye.position.set(ex, 1.71, 0.27);
    group.add(eye);
  });

  group.userData = { leftLeg, rightLeg, leftArm, rightArm, walkCycle: 0 };
  scene.add(group);
  return group;
}

function animateCharacterWalk(char, isWalking, dt) {
  const u = char.userData;
  if (isWalking) {
    u.walkCycle += dt * 10;
    const swing = Math.sin(u.walkCycle) * 0.55;
    u.leftLeg.rotation.x = swing;
    u.rightLeg.rotation.x = -swing;
    u.leftArm.rotation.x = -swing * 0.8;
    u.rightArm.rotation.x = swing * 0.8;
  } else {
    u.leftLeg.rotation.x *= 0.85;
    u.rightLeg.rotation.x *= 0.85;
    u.leftArm.rotation.x *= 0.85;
    u.rightArm.rotation.x *= 0.85;
  }
}

/* 6. Build the Entire 3D World & Actors */
createGroundAndRiver();
createClouds();
createFountain(10, -7);
createFloristStall(-11, -6);
createGazebo(0, 32);

// Trees framing the park & meadow
[
  [-15, -12, "cherry"], [15, -13, "cherry"], [-16, 4, "pine"], [16, 3, "cherry"],
  [-9, -15, "pine"], [9, -16, "pine"], [-12, 20, "cherry"], [12, 21, "cherry"],
  [-9, 32, "pine"], [9, 32, "pine"], [-6, 37, "cherry"], [6, 37, "cherry"]
].forEach(([x, z, t]) => createTree(x, z, t));

// Decorative non-quest flowers
for (let i = 0; i < 45; i++) {
  const fx = (Math.random() - 0.5) * 44;
  const fz = (Math.random() - 0.5) * 44;
  if (Math.abs(fz - 13) < 4.5 || Math.hypot(fx, fz + 4) < 9 || Math.abs(fx) < 3.2) continue;
  const fl = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.25, 5),
    mat([0xf472b6, 0xfacc15, 0x38bdf8, 0xfb7185][i % 4])
  );
  fl.position.set(fx, 0.14, fz);
  fl.rotation.x = Math.PI;
  scene.add(fl);
}

// Actors
const player = createCharacter({ shirt: 0x3b82f6, pants: 0x1e293b, hair: 0x1e293b });
player.position.set(-1.3, 0, -4);
player.rotation.y = Math.PI / 2;

const maya = createCharacter({ shirt: 0xfb7185, pants: 0x000, hair: 0x451a03, isDress: true, scarf: 0xf43f5e });
maya.position.set(1.3, 0, -4);
maya.rotation.y = -Math.PI / 2;

const clara = createCharacter({ shirt: 0xfbbf24, pants: 0x000, hair: 0x78350f, isDress: true });
clara.position.set(-9.3, 0, -4.5);
clara.rotation.y = Math.PI / 4;

// Quest Items: Dropped Ribbon & 3 Memory Flowers
const ribbonMesh = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.28, 0.08, 36, 8),
  mat(0xf43f5e, 0.3, { emissive: 0xf43f5e, emissiveIntensity: 0.45 })
);
ribbonMesh.position.set(7.4, 0.55, -5.0);
ribbonMesh.visible = false;
scene.add(ribbonMesh);

const flowerLocations = [
  { x: -11, z: 4.5 },
  { x: 11.5, z: 5.5 },
  { x: -3.5, z: -13.5 }
];

flowerLocations.forEach((loc) => {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.65), mat(0x16a34a));
  stem.position.y = 0.32;
  const bloom = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35),
    mat(0xfbbf24, 0.3, { emissive: 0xf59e0b, emissiveIntensity: 0.5 })
  );
  bloom.position.y = 0.72;
  g.add(stem, bloom);
  g.position.set(loc.x, 0, loc.z);
  g.visible = false;
  scene.add(g);
  worldFlowers.push({ mesh: g, collected: false, x: loc.x, z: loc.z });
});

// Glowing Waypoint Beacon Pillar
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.55, 16, 16, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false
  })
);
beacon.position.y = 8;
beacon.visible = false;
scene.add(beacon);

/* 7. Color Filter & Petal Celebration */
function setWorldGrayscale(pct) {
  state.grayscale = pct;
  canvas.style.filter = `grayscale(${pct}%) contrast(${pct > 50 ? 1.08 : 1}) saturate(${pct === 0 ? 1.15 : 1})`;
  document.getElementById("colorMeter").textContent = `Color: ${Math.round(100 - pct)}%`;
}

function spawnColorPetals() {
  const count = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color(0xf43f5e),
    new THREE.Color(0xfbbf24),
    new THREE.Color(0x38bdf8),
    new THREE.Color(0xa78bfa)
  ];

  for (let i = 0; i < count; i++) {
    pos[i * 3] = player.position.x + (Math.random() - 0.5) * 14;
    pos[i * 3 + 1] = Math.random() * 7 + 0.5;
    pos[i * 3 + 2] = player.position.z + (Math.random() - 0.5) * 14;
    const c = palette[i % palette.length];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  petalSystem = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.26, vertexColors: true, transparent: true, opacity: 0.9 })
  );
  scene.add(petalSystem);
}

/* 8. Dialogue & Cutscene Engine */
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

  const choiceGroup = document.getElementById("choiceGroup");
  if (line.choices) {
    choiceGroup.innerHTML = "";
    choiceGroup.hidden = false;
    document.getElementById("dialogueHint").hidden = true;
    line.choices.forEach((ch) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = ch.label;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        AudioEngine.blip();
        choiceGroup.hidden = true;
        document.getElementById("dialogueHint").hidden = false;
        ch.onPick();
      });
      choiceGroup.appendChild(btn);
    });
  } else {
    choiceGroup.hidden = true;
    document.getElementById("dialogueHint").hidden = false;
  }
}

function advanceDialogue() {
  if (!state.dialogueActive) return;
  const current = state.dialogueQueue[state.dialogueIndex];
  if (current && current.choices) return; // Wait for choice click

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
  document.getElementById("compassLine").hidden = step === 0 || step === 5;
}

/* 9. Story Progression */
function beginOpeningQuarrel() {
  state.phase = "QUARREL";
  document.getElementById("hud").hidden = false;
  updateQuestUI(0);
  setWorldGrayscale(0);

  startDialogue(
    [
      { speaker: "Maya", role: "Your Partner", text: "You looked right through me again tonight. You didn't hear a single word I said." },
      { speaker: "You", role: "Leo", text: "I had a rough week, Maya. Why do you always turn everything into a huge fight?" },
      { speaker: "Maya", role: "Hurt", text: "I'm not fighting, Leo. I'm tired of feeling invisible when I'm standing right next to you." },
      { speaker: "Maya", role: "", text: "I need to walk for a while. Please... just leave me alone." }
    ],
    () => {
      state.phase = "LADY_LEAVING";
      document.getElementById("questDesc").textContent = "Maya is walking away...";
      AudioEngine.colorDrain();
      setWorldGrayscale(100); // Drain the entire world to Black & White!
    }
  );
}

function finishLadyLeaving() {
  maya.position.set(0, 0, 32);
  maya.rotation.y = 0; // Looking out from Gazebo
  state.phase = "EXPLORE";
  updateQuestUI(1);
  document.getElementById("controlsHint").hidden = false;
  if ("ontouchstart" in window || window.innerWidth <= 768) {
    document.getElementById("mobilePad").hidden = false;
  }

  startDialogue([
    { speaker: "Leo", role: "Inner Voice", text: "Wait... Maya! Everything around me feels completely drained of color." },
    { speaker: "Leo", role: "Inner Voice", text: "I was wrong to shut her out. I need to find her and tell her how sorry I am." }
  ]);
}

function interactWithTarget(target) {
  if (target.id === "clara" && state.questStep === 1) {
    startDialogue(
      [
        { speaker: "Clara", role: "Town Florist", text: "Oh, Leo... Maya hurried past my stall in tears a moment ago." },
        { speaker: "Clara", role: "Town Florist", text: "I think she dropped her red ribbon over by the Old Stone Fountain. Check there first!" },
        { speaker: "Clara", role: "Town Florist", text: "And if you want to apologize from the heart, gather some wildflowers for her before crossing the bridge." }
      ],
      () => {
        ribbonMesh.visible = true;
        updateQuestUI(2);
      }
    );
  } else if (target.id === "clara") {
    startDialogue([{ speaker: "Clara", role: "Town Florist", text: "Follow the glowing light, Leo. She walked north across the wooden bridge." }]);
  } else if (target.id === "ribbon" && state.questStep === 2) {
    ribbonMesh.visible = false;
    AudioEngine.sparkle();
    setWorldGrayscale(75); // First spark of color returns!
    worldFlowers.forEach((f) => (f.mesh.visible = true));
    updateQuestUI(3);
    startDialogue([
      { speaker: "Leo", role: "", text: "Found Maya's silk ribbon! Just holding it brings back a faint touch of warmth..." },
      { speaker: "Leo", role: "", text: "Now let me gather 3 wildflowers around the meadow so I don't show up empty-handed." }
    ]);
  } else if (target.id === "flower" && state.questStep === 3) {
    target.ref.collected = true;
    target.ref.mesh.visible = false;
    state.flowersCollected++;
    AudioEngine.sparkle();

    const remainingGray = 75 - state.flowersCollected * 15; // 60% -> 45% -> 30%
    setWorldGrayscale(remainingGray);
    document.getElementById("questDesc").textContent = `Gather 3 Memory Wildflowers (${state.flowersCollected}/3) around the south meadow.`;

    if (state.flowersCollected >= 3) {
      updateQuestUI(4);
      startDialogue([
        { speaker: "Leo", role: "", text: "That's all three wildflowers. The colors are slowly coming back." },
        { speaker: "Leo", role: "", text: "Maya must be up at the Hilltop Gazebo across the bridge. Time to say I'm sorry." }
      ]);
    }
  } else if (target.id === "maya" && state.questStep === 4) {
    // Turn Maya to face the player
    const dx = player.position.x - maya.position.x;
    const dz = player.position.z - maya.position.z;
    maya.rotation.y = Math.atan2(dx, dz);

    startDialogue([
      { speaker: "Maya", role: "", text: "Leo... you came all the way out here?" },
      {
        speaker: "Leo",
        role: "Choose your words",
        text: "Look at Maya and speak from the heart:",
        choices: [
          {
            label: "1. \"I'm truly sorry, Maya. I stopped listening when you needed me most.\"",
            onPick: () => deliverApologyFinale()
          },
          {
            label: "2. \"I brought your ribbon and wildflowers. My world turned gray without you.\"",
            onPick: () => deliverApologyFinale()
          }
        ]
      }
    ]);
  }
}

function deliverApologyFinale() {
  startDialogue(
    [
      { speaker: "Leo", role: "", text: "You weren't making a big deal out of nothing. You were asking me to care, and I let my pride get in the way. I'm so sorry." },
      { speaker: "Maya", role: "", text: "You found my ribbon... and picked these for me?" },
      { speaker: "Maya", role: "Smiling softly", text: "Thank you for actually coming to understand, Leo. I missed you too." }
    ],
    () => {
      AudioEngine.colorReturn();
      setWorldGrayscale(0); // Burst back to 100% vibrant color!
      spawnColorPetals();
      updateQuestUI(5);
      state.phase = "ENDING";
      document.getElementById("interactPrompt").hidden = true;
      setTimeout(() => {
        document.getElementById("endingOverlay").hidden = false;
      }, 1700);
    }
  );
}

/* 10. Waypoint & Interactable Finder */
function getCurrentObjectivePos() {
  if (state.questStep === 1) return { x: clara.position.x, z: clara.position.z };
  if (state.questStep === 2) return { x: ribbonMesh.position.x, z: ribbonMesh.position.z };
  if (state.questStep === 3) {
    const nextFlower = worldFlowers.find((f) => !f.collected);
    return nextFlower ? { x: nextFlower.x, z: nextFlower.z } : null;
  }
  if (state.questStep === 4) return { x: maya.position.x, z: maya.position.z };
  return null;
}

function findNearbyInteractable() {
  if (state.phase !== "EXPLORE" || state.dialogueActive) return null;
  const px = player.position.x;
  const pz = player.position.z;

  if (Math.hypot(px - clara.position.x, pz - clara.position.z) < 3.0) {
    return { id: "clara", label: "Talk to Clara" };
  }
  if (state.questStep === 2 && ribbonMesh.visible && Math.hypot(px - ribbonMesh.position.x, pz - ribbonMesh.position.z) < 2.6) {
    return { id: "ribbon", label: "Pick up Maya's Ribbon" };
  }
  if (state.questStep === 3) {
    for (const f of worldFlowers) {
      if (!f.collected && Math.hypot(px - f.x, pz - f.z) < 2.3) {
        return { id: "flower", label: "Pick Wildflower", ref: f };
      }
    }
  }
  if (state.questStep === 4 && Math.hypot(px - maya.position.x, pz - maya.position.z) < 3.2) {
    return { id: "maya", label: "Talk to Maya" };
  }
  return null;
}

/* 11. Collision & Player Movement */
function canWalkTo(nx, nz) {
  if (nx < -26 || nx > 26 || nz < -20 || nz > 39) return false;

  // River check (Z = 9.7 to 16.3), allow wooden bridge (X = -2.1 to 2.1)
  if (nz > 9.7 && nz < 16.3 && Math.abs(nx) > 1.95) {
    return false;
  }

  for (const c of colliders) {
    if (Math.hypot(nx - c.x, nz - c.z) < c.r) return false;
  }
  return true;
}

/* 12. Input Listeners */
window.addEventListener("keydown", (e) => {
  AudioEngine.unlock();
  const k = e.key.toLowerCase();
  state.keys[k] = true;

  if (e.key === " " || e.key === "Enter" || k === "e") {
    if (state.dialogueActive) {
      e.preventDefault();
      advanceDialogue();
    } else if (state.nearbyInteractable && (e.key === " " || k === "e")) {
      e.preventDefault();
      interactWithTarget(state.nearbyInteractable);
    }
  }
});

window.addEventListener("keyup", (e) => {
  state.keys[e.key.toLowerCase()] = false;
});

document.getElementById("dialogueBox").addEventListener("click", () => {
  AudioEngine.unlock();
  advanceDialogue();
});

document.getElementById("interactPrompt").addEventListener("click", () => {
  AudioEngine.unlock();
  if (state.nearbyInteractable) interactWithTarget(state.nearbyInteractable);
});

document.getElementById("mobileActionBtn").addEventListener("click", () => {
  AudioEngine.unlock();
  if (state.dialogueActive) advanceDialogue();
  else if (state.nearbyInteractable) interactWithTarget(state.nearbyInteractable);
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

// Mouse Drag Camera Orbit
canvas.addEventListener("mousedown", (e) => {
  AudioEngine.unlock();
  state.isDragging = true;
  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;
});

window.addEventListener("mousemove", (e) => {
  if (!state.isDragging) return;
  const dx = e.clientX - state.lastMouseX;
  const dy = e.clientY - state.lastMouseY;
  state.camYaw -= dx * 0.006;
  state.camPitch = Math.max(0.15, Math.min(0.85, state.camPitch + dy * 0.004));
  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;
});

window.addEventListener("mouseup", () => { state.isDragging = false; });

document.getElementById("muteBtn").addEventListener("click", (e) => {
  const muted = AudioEngine.toggleMute();
  e.target.textContent = muted ? "🔇 Muted" : "🔊 Sound On";
});

document.getElementById("restartBtn").addEventListener("click", () => location.reload());
document.getElementById("playAgainBtn").addEventListener("click", () => location.reload());
document.getElementById("exploreFreeBtn").addEventListener("click", () => {
  document.getElementById("endingOverlay").hidden = true;
  state.phase = "EXPLORE";
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* 13. Main Animation Loop */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  // Clouds drift
  animatedClouds.forEach((c) => {
    c.mesh.position.x += c.speed * dt;
    if (c.mesh.position.x > 52) c.mesh.position.x = -52;
  });

  // Floating quest items
  if (ribbonMesh.visible) {
    ribbonMesh.rotation.y += dt * 2.2;
    ribbonMesh.position.y = 0.55 + Math.sin(elapsed * 3) * 0.12;
  }
  worldFlowers.forEach((f, idx) => {
    if (f.mesh.visible && !f.collected) {
      f.mesh.rotation.y += dt * 1.4;
      f.mesh.position.y = Math.sin(elapsed * 2.5 + idx) * 0.08;
    }
  });

  // Celebratory color petals
  if (petalSystem) {
    const pos = petalSystem.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let py = pos.getY(i) - dt * 0.9;
      if (py < 0.2) py = 7.5;
      pos.setY(i, py);
      pos.setX(i, pos.getX(i) + Math.sin(elapsed + i) * dt * 0.4);
    }
    pos.needsUpdate = true;
  }

  // Cutscene: Maya walking away across the bridge
  if (state.phase === "LADY_LEAVING") {
    maya.position.x += (0 - maya.position.x) * dt * 1.5;
    maya.position.z += dt * 4.5;
    maya.rotation.y = 0;
    animateCharacterWalk(maya, true, dt);
    if (maya.position.z >= 19.5) {
      animateCharacterWalk(maya, false, dt);
      finishLadyLeaving();
    }
  }

  // Player Exploration Movement
  let playerMoving = false;
  if (state.phase === "EXPLORE" && !state.dialogueActive) {
    if (state.keys["q"]) state.camYaw += dt * 2.0;
    if (state.keys["e"] && !state.nearbyInteractable) state.camYaw -= dt * 2.0;

    let fwd = 0, side = 0;
    if (state.keys["w"] || state.keys["arrowup"]) fwd += 1;
    if (state.keys["s"] || state.keys["arrowdown"]) fwd -= 1;
    if (state.keys["a"] || state.keys["arrowleft"]) side -= 1;
    if (state.keys["d"] || state.keys["arrowright"]) side += 1;

    if (fwd !== 0 || side !== 0) {
      const len = Math.hypot(fwd, side);
      fwd /= len;
      side /= len;

      const sinY = Math.sin(state.camYaw);
      const cosY = Math.cos(state.camYaw);
      const moveX = (-sinY * fwd + cosY * side);
      const moveZ = (-cosY * fwd - sinY * side);

      const speed = state.keys["shift"] ? 8.8 : 5.6;
      const nx = player.position.x + moveX * speed * dt;
      const nz = player.position.z + moveZ * speed * dt;

      if (canWalkTo(nx, player.position.z)) player.position.x = nx;
      if (canWalkTo(player.position.x, nz)) player.position.z = nz;

      player.rotation.y = Math.atan2(moveX, moveZ);
      playerMoving = true;
    }

    // Check interactables & update waypoint compass
    state.nearbyInteractable = findNearbyInteractable();
    const promptBtn = document.getElementById("interactPrompt");
    if (state.nearbyInteractable) {
      promptBtn.hidden = false;
      promptBtn.innerHTML = `Press <kbd>Space</kbd> / Tap: <strong>${state.nearbyInteractable.label}</strong>`;
    } else {
      promptBtn.hidden = true;
    }

    const obj = getCurrentObjectivePos();
    if (obj) {
      beacon.visible = true;
      beacon.position.x = obj.x;
      beacon.position.z = obj.z;
      beacon.rotation.y += dt;

      const dist = Math.round(Math.hypot(obj.x - player.position.x, obj.z - player.position.z));
      document.getElementById("compassDist").textContent = `${dist}m to objective`;
      const targetAngle = Math.atan2(obj.x - player.position.x, obj.z - player.position.z);
      const relDeg = ((targetAngle - state.camYaw) * 180) / Math.PI;
      document.getElementById("compassArrow").style.transform = `rotate(${-relDeg - 90}deg)`;
    } else {
      beacon.visible = false;
    }
  } else {
    beacon.visible = false;
    document.getElementById("interactPrompt").hidden = true;
  }

  animateCharacterWalk(player, playerMoving, dt);

  // Smooth Third-Person Camera Tracking
  if (state.phase === "FLASH" || state.phase === "QUARREL" || state.phase === "LADY_LEAVING") {
    camera.position.lerp(new THREE.Vector3(0, 3.6, 2.8), 0.06);
    camera.lookAt(0, 1.3, -4);
  } else {
    const camDist = 8.5;
    const targetCamX = player.position.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * camDist;
    const targetCamY = player.position.y + 1.8 + Math.sin(state.camPitch) * camDist;
    const targetCamZ = player.position.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * camDist;

    camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.12);
    camera.lookAt(player.position.x, player.position.y + 1.35, player.position.z);
  }

  renderer.render(scene, camera);
}

/* 14. Start Title Flash -> Quarrel Intro */
window.addEventListener("DOMContentLoaded", () => {
  setWorldGrayscale(0);
  animate();

  // After the 3.7s Title Flash completes, start the opening quarrel cutscene
  setTimeout(() => {
    document.getElementById("titleFlash").hidden = true;
    beginOpeningQuarrel();
  }, 3700);
});
