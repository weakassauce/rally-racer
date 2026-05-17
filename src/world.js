import * as THREE from 'three';
import { WORLD } from './config.js';

// Shared heightmap function — used by terrain mesh, track path, vegetation.
// Multi-layer hills + sin ridges + low-frequency rolling for variety.
export function terrainHeight(x, z) {
  const a = Math.sin(x * 0.0042) * Math.cos(z * 0.0036) * WORLD.heightAmplitude;
  const b = Math.cos(x * 0.0011) * Math.sin(z * 0.0017) * (WORLD.heightAmplitude * 0.7);
  const c = Math.sin((x + z) * 0.0089) * WORLD.ridgeAmplitude;
  const d = Math.cos(x * 0.0025 + z * 0.0019) * (WORLD.ridgeAmplitude * 0.5);
  return a + b + c + d;
}

export function buildWorld(scene) {
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);

  // Sun + hemi
  const sun = new THREE.DirectionalLight(0xfff2c8, 1.05);
  sun.position.set(...WORLD.sunDir).normalize().multiplyScalar(500);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcbe2ff, 0x39301c, 0.55));

  // Terrain
  const segs = WORLD.terrainSegments;
  const geo = new THREE.PlaneGeometry(WORLD.terrainSize, WORLD.terrainSize, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // Vertex coloring: dirt brown below 0, grass green near 0, mossy brown on ridges, stone above
  const colors = new Float32Array(pos.count * 3);
  const cValley = new THREE.Color(0x46532a);
  const cGrass  = new THREE.Color(0x5a6b3a);
  const cRock   = new THREE.Color(0x6c6657);
  const cSnow   = new THREE.Color(0xd8dcd2);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    let col;
    if (h < 8) {
      const t = THREE.MathUtils.clamp((h + 30) / 38, 0, 1);
      col = tmpA.copy(cValley).lerp(cGrass, t);
    } else if (h < 40) {
      const t = THREE.MathUtils.clamp((h - 8) / 32, 0, 1);
      col = tmpA.copy(cGrass).lerp(cRock, t);
    } else {
      const t = THREE.MathUtils.clamp((h - 40) / 30, 0, 1);
      col = tmpB.copy(cRock).lerp(cSnow, t);
    }
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, flatShading: true,
  });
  const ground = new THREE.Mesh(geo, groundMat);
  scene.add(ground);

  // Trees — InstancedMesh of cone leaves + cylinder trunks. Place by sampling
  // terrain height; skip very-high (snow line) and very-low (mud puddles).
  scatterTrees(scene);
  scatterRocks(scene);

  return { ground };
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const ctx = c.getContext('2d');
  const top = new THREE.Color(WORLD.skyTop);
  const bot = new THREE.Color(WORLD.skyBottom);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, `rgb(${top.r*255|0},${top.g*255|0},${top.b*255|0})`);
  g.addColorStop(1, `rgb(${bot.r*255|0},${bot.g*255|0},${bot.b*255|0})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function scatterTrees(scene) {
  const trunkGeo  = new THREE.CylinderGeometry(0.32, 0.5, 5, 6);
  trunkGeo.translate(0, 2.5, 0);
  const leavesGeo = new THREE.ConeGeometry(2.4, 7, 7);
  leavesGeo.translate(0, 8.5, 0);
  const trunkMat  = new THREE.MeshStandardMaterial({ color: WORLD.trunkColor, roughness: 0.95, flatShading: true });
  const leavesMat = new THREE.MeshStandardMaterial({ color: WORLD.leafColor,  roughness: 0.85, flatShading: true });

  const count = WORLD.treeCount;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leavesGeo, leavesMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const half = WORLD.terrainSize * 0.48;
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 6) {
    tries++;
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    const y = (function () { return (typeof terrainHeight === 'function') ? terrainHeight(x, z) : 0; })();
    if (y < -10 || y > 45) continue;
    const scale = 0.85 + Math.random() * 1.6;
    s.set(scale, scale, scale);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, y, z), q, s);
    trunks.setMatrixAt(placed, m);
    leaves.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed;
  leaves.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(leaves);
}

function scatterRocks(scene) {
  const geo = new THREE.IcosahedronGeometry(1.2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: WORLD.rockColor, roughness: 0.95, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, mat, WORLD.rockCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const half = WORLD.terrainSize * 0.46;
  for (let i = 0; i < WORLD.rockCount; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    const y = terrainHeight(x, z);
    const scale = 1 + Math.random() * 2.4;
    q.setFromEuler(new THREE.Euler(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6));
    m.compose(new THREE.Vector3(x, y + scale * 0.3, z), q, new THREE.Vector3(scale, scale * 0.7, scale));
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);
}
