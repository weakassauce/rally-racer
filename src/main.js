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

buildWorld(scene);
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

const wheelTune = { lateral: 0.40, longitudinal: 0.30, diameter: 0.72, yLift: 0.02 };
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
