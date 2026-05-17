import * as THREE from 'three';
import { WORLD } from './config.js';

// Shared heightmap function — used by terrain mesh, track path, vegetation.
export function terrainHeight(x, z) {
  const a = Math.sin(x * 0.0042) * Math.cos(z * 0.0036) * WORLD.heightAmplitude;
  const b = Math.cos(x * 0.0011) * Math.sin(z * 0.0017) * (WORLD.heightAmplitude * 0.7);
  const c = Math.sin((x + z) * 0.0089) * WORLD.ridgeAmplitude;
  const d = Math.cos(x * 0.0025 + z * 0.0019) * (WORLD.ridgeAmplitude * 0.5);
  return a + b + c + d;
}

// Procedural grass canvas texture: green base with speckle noise. Tiles
// across the terrain so each chunk of ground gets visible variation.
function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  // Base green
  ctx.fillStyle = '#4d5d2c';
  ctx.fillRect(0, 0, 256, 256);
  // Speckle: ~6000 short strokes of darker / lighter green
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = (Math.random() - 0.5) * 32;
    const r = 51 + v, g = 76 + v, b = 28 + v;
    ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  // Occasional brighter blades
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = `rgba(160, 180, 90, ${0.3 + Math.random() * 0.35})`;
    ctx.fillRect(x, y, 1, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(WORLD.terrainSize / 18, WORLD.terrainSize / 18);
  tex.anisotropy = 4;
  return tex;
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

export function buildWorld(scene, { treeTemplate = null, rockTemplate = null } = {}) {
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
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // Vertex coloring: dirt/grass/rock/snow zones tint the texture
  const colors = new Float32Array(pos.count * 3);
  const cValley = new THREE.Color(0x7d8a52);
  const cGrass  = new THREE.Color(0xa3b075);
  const cRock   = new THREE.Color(0x9a9180);
  const cSnow   = new THREE.Color(0xeae9e3);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    let col;
    if (h < 8) {
      col = tmpA.copy(cValley).lerp(cGrass, THREE.MathUtils.clamp((h + 30) / 38, 0, 1));
    } else if (h < 40) {
      col = tmpA.copy(cGrass).lerp(cRock, THREE.MathUtils.clamp((h - 8) / 32, 0, 1));
    } else {
      col = tmpB.copy(cRock).lerp(cSnow, THREE.MathUtils.clamp((h - 40) / 30, 0, 1));
    }
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const grassTex = makeGrassTexture();
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    vertexColors: true,
    roughness: 0.95,
    flatShading: false,
  });
  const ground = new THREE.Mesh(geo, groundMat);
  scene.add(ground);

  const trees = scatterTrees(scene, treeTemplate);
  const rocks = scatterRocks(scene, rockTemplate);

  return { ground, trees, rocks };
}

// Returns { instances: InstancedMesh[], positions: [{x,z,y,radius}] }
function scatterTrees(scene, template) {
  const positions = [];
  const count = WORLD.treeCount;
  const half = WORLD.terrainSize * 0.48;
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 6) {
    tries++;
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    const y = terrainHeight(x, z);
    if (y < -10 || y > 45) continue;
    positions.push({ x, y, z, scale: 0.85 + Math.random() * 1.6, rot: Math.random() * Math.PI * 2, radius: 1.8 });
    placed++;
  }

  if (template) {
    const root = instanceTemplate(template, positions, 10);
    scene.add(root);
    return { positions, root };
  }

  // Procedural fallback (cone + cylinder), still instanced
  const trunkGeo  = new THREE.CylinderGeometry(0.32, 0.5, 5, 6);
  trunkGeo.translate(0, 2.5, 0);
  const leavesGeo = new THREE.ConeGeometry(2.4, 7, 7);
  leavesGeo.translate(0, 8.5, 0);
  const trunkMat  = new THREE.MeshStandardMaterial({ color: WORLD.trunkColor, roughness: 0.95, flatShading: true });
  const leavesMat = new THREE.MeshStandardMaterial({ color: WORLD.leafColor,  roughness: 0.85, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leavesGeo, leavesMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  positions.forEach((p, i) => {
    s.set(p.scale, p.scale, p.scale);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
    trunks.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
  });
  trunks.count = positions.length;
  leaves.count = positions.length;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(leaves);
  return { positions };
}

function scatterRocks(scene, template) {
  const positions = [];
  const half = WORLD.terrainSize * 0.46;
  for (let i = 0; i < WORLD.rockCount; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    const y = terrainHeight(x, z);
    const scale = 1 + Math.random() * 2.4;
    positions.push({ x, y, z, scale, rot: Math.random() * Math.PI * 2, radius: 1.0 + scale * 0.4 });
  }

  if (template) {
    const root = instanceTemplate(template, positions, 2.2);
    scene.add(root);
    return { positions, root };
  }

  const geo = new THREE.IcosahedronGeometry(1.2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: WORLD.rockColor, roughness: 0.95, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  positions.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(Math.random() * 0.6, p.rot, Math.random() * 0.6));
    m.compose(new THREE.Vector3(p.x, p.y + p.scale * 0.3, p.z), q, new THREE.Vector3(p.scale, p.scale * 0.7, p.scale));
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);
  return { positions };
}

// Walk a GLB template (which may contain multiple meshes/materials) and emit
// one InstancedMesh per source mesh. Each instance's matrix combines the
// per-position transform with the source mesh's local-to-template transform.
// This collapses N×K Object3D clones (≈ thousands of draw calls) into K
// InstancedMesh draw calls — the single biggest perf win for foliage.
function instanceTemplate(template, positions, targetSize) {
  template.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(template);
  const size = bbox.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const baseScale = targetSize / maxAxis;

  // Collect (geometry, material, localMatrix-in-template-frame) per source mesh.
  // Materials should NOT be cloned — Three.js can share them across instanced
  // meshes; we only need separate InstancedMesh objects per geometry+material.
  const sources = [];
  template.traverse((o) => {
    if (o.isMesh) {
      sources.push({ geometry: o.geometry, material: o.material, localMatrix: o.matrixWorld.clone() });
    }
  });

  const root = new THREE.Group();
  const m = new THREE.Matrix4();
  const tm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);

  for (const src of sources) {
    const im = new THREE.InstancedMesh(src.geometry, src.material, positions.length);
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = true;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      s.setScalar(baseScale * p.scale);
      q.setFromAxisAngle(upAxis, p.rot);
      tm.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
      m.multiplyMatrices(tm, src.localMatrix);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    root.add(im);
  }
  return root;
}
