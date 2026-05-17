import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAR, CAMERA, TRACK } from './config.js';
import { buildPlaceholderCar, Car } from './car.js';
import { buildWorld, terrainHeight } from './world.js';
import { buildTrack } from './track.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { tryLoadGLB, normalizeCarModel, normalizeWheelModel } from './asset_loader.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;

const camera = new THREE.PerspectiveCamera(CAMERA.fovBase, window.innerWidth / window.innerHeight, 0.4, 4000);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// World is built up-front; tree / rock GLBs are swapped in later by loading
// the file and rebuilding the scene (cheap since terrain mesh dominates).
let world = buildWorld(scene);
const track = buildTrack(scene);

// Car at start, heading along the track's initial tangent
const carMesh = buildPlaceholderCar();
scene.add(carMesh);
const car = new Car(carMesh);
function spawnAtStart() {
  const p = track.startPos.clone();
  const t1 = track.points[1].clone().sub(p);
  const heading = Math.atan2(-t1.x, -t1.z); // forward = -Z when heading = 0
  car.reset(p, heading);
}
spawnAtStart();

// WRX-ish proportions: track ~1.46/1.78 ≈ 0.41, wheelbase ~2.62/4.6 ≈ 0.285
const wheelTune = { lateral: 0.41, longitudinal: 0.285, diameter: 0.66, yLift: -0.02 };
window.wheelTune = wheelTune;
window.applyWheels = () => reAttachWheels();
let wheelTemplateGLB = null;
let wheelTemplate = null;
let carBBox = null;

function reAttachWheels() {
  if (wheelTemplateGLB) {
    wheelTemplate = normalizeWheelModel(wheelTemplateGLB.clone(true), wheelTune.diameter);
  }
  if (!carBBox) {
    // Use placeholder dims
    const dx = CAR.width * wheelTune.lateral;
    const dz = CAR.length * wheelTune.longitudinal;
    const r = wheelTune.diameter / 2;
    const hubs = [
      { x: -dx, y: r + wheelTune.yLift, z: -dz, isFront: true  },
      { x:  dx, y: r + wheelTune.yLift, z: -dz, isFront: true  },
      { x: -dx, y: r + wheelTune.yLift, z:  dz, isFront: false },
      { x:  dx, y: r + wheelTune.yLift, z:  dz, isFront: false },
    ];
    car.attachWheels(buildHubMeshes(hubs));
    return;
  }
  const fullX = carBBox.max.x - carBBox.min.x;
  const fullZ = carBBox.max.z - carBBox.min.z;
  const r = wheelTune.diameter / 2;
  const dx = fullX * wheelTune.lateral;
  const dz = fullZ * wheelTune.longitudinal;
  const hubs = [
    { x: -dx, y: r + wheelTune.yLift, z: -dz, isFront: true  },
    { x:  dx, y: r + wheelTune.yLift, z: -dz, isFront: true  },
    { x: -dx, y: r + wheelTune.yLift, z:  dz, isFront: false },
    { x:  dx, y: r + wheelTune.yLift, z:  dz, isFront: false },
  ];
  car.attachWheels(buildHubMeshes(hubs));
}

function buildHubMeshes(hubs) {
  const meshes = hubs.map((hub) => {
    if (!wheelTemplate) return null;
    const clone = wheelTemplate.clone(true);
    if (hub.x < 0) clone.rotation.y += Math.PI;
    return clone;
  });
  return { wheels: meshes, wheelHubs: hubs };
}

reAttachWheels();
tryLoadGLB('/assets/wheel.glb').then((g) => {
  if (!g) return;
  wheelTemplateGLB = g;
  reAttachWheels();
});

// Async foliage / rock GLB swaps. When either lands we discard the current
// scatter group and rebuild with the template. (Tree+rock counts are small
// enough that this rebuild is fine.)
let treeTemplate = null;
let rockTemplate = null;
function rebuildScatter() {
  if (world.trees && world.trees.root) scene.remove(world.trees.root);
  if (world.rocks && world.rocks.root) scene.remove(world.rocks.root);
  // For procedural fallback the trees/rocks aren't in a tagged root, but we
  // also already scattered them once; rebuilding always for simplicity.
  // (The terrain mesh and lights stay.)
  // Re-run scatter only — terrain etc. already in scene from initial buildWorld.
  // Easiest: leave initial procedural scatter alone if template is null;
  // otherwise we add the GLB scatter on top and leave the procedural as a
  // fallback layer (they're cheap relative to the GLBs).
  world = buildWorld(scene, { treeTemplate, rockTemplate });
}
tryLoadGLB('/assets/tree.glb').then((g) => { if (g) { treeTemplate = normalizeFoliage(g, 'tree'); rebuildScatter(); } });
tryLoadGLB('/assets/rock.glb').then((g) => { if (g) { rockTemplate = normalizeFoliage(g, 'rock'); rebuildScatter(); } });

function normalizeFoliage(root, kind) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  // Re-center on origin (XZ), lift so bottom touches y=0
  root.position.sub(center);
  root.position.y += (box.max.y - box.min.y) / 2;
  // Light material tweaks so foliage doesn't look plasticky
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (kind === 'tree') {
        if ('roughness' in m) m.roughness = 0.9;
        if ('metalness' in m) m.metalness = 0;
      } else if (kind === 'rock') {
        if ('roughness' in m) m.roughness = 0.95;
        if ('metalness' in m) m.metalness = 0.05;
      }
      m.needsUpdate = true;
    }
  });
  return root;
}
tryLoadGLB('/assets/player_car.glb').then((g) => {
  if (!g) return;
  car.mesh.clear();
  const root = normalizeCarModel(g, CAR.length);
  car.mesh.add(root);
  carBBox = new THREE.Box3().setFromObject(root);
  reAttachWheels();
});

const input = new Input();
const chase = new ChaseCamera(camera);
const hud = new HUD();

let elapsed = 0;
let finished = false;
let startedRun = false;

function distanceToFinish() {
  const dx = car.position.x - track.finishPos.x;
  const dz = car.position.z - track.finishPos.z;
  return Math.hypot(dx, dz);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  input.decayLook(dt);
  const controls = input.axes();
  for (const a of input.drainActions()) {
    if (a === 'reset') { spawnAtStart(); elapsed = 0; finished = false; startedRun = false; }
    else if (a === 'toggleView') chase.toggleView();
  }
  if (!finished) {
    car.update(dt, controls);

    // Collision against scattered trees + rocks (nearest neighbours only)
    const carR = 1.4;
    const checkR2 = 50 * 50; // narrow phase radius squared
    const checkColliders = (list) => {
      for (const o of list) {
        const dx = car.position.x - o.x;
        const dz = car.position.z - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > checkR2) continue;
        const minD = carR + o.radius;
        if (d2 < minD * minD) {
          const d = Math.sqrt(d2) || 1;
          // Push car out to just outside collider
          const push = (minD - d) / d;
          car.position.x += dx * push;
          car.position.z += dz * push;
          // Bounce + speed loss
          car.velocity.multiplyScalar(0.35);
          car.takeImpact();
        }
      }
    };
    if (world.trees) checkColliders(world.trees.positions);
    if (world.rocks) checkColliders(world.rocks.positions);

    if (!startedRun && car.speed() > 1) startedRun = true;
    if (startedRun) elapsed += dt;
    if (distanceToFinish() < TRACK.finishRadius) finished = true;
  }
  chase.update(dt, car, controls);
  hud.draw({
    car,
    distanceToFinish: distanceToFinish(),
    finished,
    elapsed,
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
