import * as THREE from 'three';
import { TRACK } from './config.js';
import { terrainHeight } from './world.js';

function makeDirtTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  // Sandy-brown base
  ctx.fillStyle = '#9a8460';
  ctx.fillRect(0, 0, 256, 256);
  // Pebble speckle
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const v = (Math.random() - 0.5) * 40;
    const r = 154 + v, g = 132 + v, b = 96 + v;
    ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // Tire grooves: two slightly darker bands running U direction (drift hint)
  ctx.fillStyle = 'rgba(60, 50, 36, 0.18)';
  ctx.fillRect(82, 0, 12, 256);
  ctx.fillRect(162, 0, 12, 256);
  // Occasional pebbles
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const r = 1 + Math.random() * 2.6;
    ctx.fillStyle = `rgba(50, 38, 22, ${0.35 + Math.random() * 0.4})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1, 1); // road UVs already tile along length
  tex.anisotropy = 4;
  return tex;
}

// Build a winding gravel road from the waypoint list. Returns a CatmullRom
// curve so the player car spawn + camera can sample it.
export function buildTrack(scene) {
  // Convert waypoints to Vector3 sitting on the terrain
  const points = TRACK.waypoints.map(([x, z]) => {
    const y = terrainHeight(x, z) + TRACK.surfaceLift;
    return new THREE.Vector3(x, y, z);
  });
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');

  // Sample many points along the curve for smooth road geometry
  const samples = Math.max(160, points.length * 12);
  const ribbonVerts = [];
  const ribbonNormals = [];
  const ribbonUVs = [];
  const ribbonIndices = [];
  const halfW = TRACK.width / 2;

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    curve.getPointAt(t, pos);
    // Glue the centerline to terrain (so road dips/climbs with hills)
    pos.y = terrainHeight(pos.x, pos.z) + TRACK.surfaceLift;
    curve.getTangentAt(t, tangent).normalize();
    lateral.crossVectors(tangent, up).normalize();

    // Left edge, right edge
    const lx = pos.x - lateral.x * halfW;
    const lz = pos.z - lateral.z * halfW;
    const rx = pos.x + lateral.x * halfW;
    const rz = pos.z + lateral.z * halfW;
    const ly = terrainHeight(lx, lz) + TRACK.surfaceLift;
    const ry = terrainHeight(rx, rz) + TRACK.surfaceLift;
    ribbonVerts.push(lx, ly, lz, rx, ry, rz);
    ribbonNormals.push(0, 1, 0, 0, 1, 0);
    ribbonUVs.push(0, t * samples * 0.4, 1, t * samples * 0.4);
  }
  // Indices: two triangles per segment between rib i and rib i+1
  for (let i = 0; i < samples; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    ribbonIndices.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonVerts, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(ribbonNormals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(ribbonUVs, 2));
  geo.setIndex(ribbonIndices);

  const mat = new THREE.MeshStandardMaterial({
    map: makeDirtTexture(),
    color: 0xb19878, roughness: 0.97, metalness: 0,
  });
  const road = new THREE.Mesh(geo, mat);
  scene.add(road);

  // Gravel shoulder: a slightly wider, slightly darker mesh underneath
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x6c5e44, roughness: 0.98 });
  const shoulderGeo = geo.clone();
  // Expand each vertex outward along its lateral by TRACK.bankWidth
  const positions = shoulderGeo.attributes.position.array;
  for (let i = 0; i <= samples; i++) {
    const idx = i * 2 * 3;
    // L: -lateral; widen further out (away from center)
    // We don't have lateral stored per-vertex here, so approximate: use the
    // perpendicular from the centerline of each pair.
    const lx = positions[idx + 0], lz = positions[idx + 2];
    const rx = positions[idx + 3], rz = positions[idx + 5];
    const cx = (lx + rx) / 2, cz = (lz + rz) / 2;
    const tlx = lx - cx, tlz = lz - cz;
    const len = Math.hypot(tlx, tlz) || 1;
    const out = TRACK.bankWidth;
    positions[idx + 0] = lx + (tlx / len) * out;
    positions[idx + 2] = lz + (tlz / len) * out;
    positions[idx + 3] = rx - (tlx / len) * out;
    positions[idx + 5] = rz - (tlz / len) * out;
    positions[idx + 1] -= 0.04; // tiny dip below the road surface
    positions[idx + 4] -= 0.04;
  }
  shoulderGeo.attributes.position.needsUpdate = true;
  shoulderGeo.computeVertexNormals();
  const shoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
  scene.add(shoulder);

  // Start / finish poles
  const finishPos = points[points.length - 1].clone();
  scene.add(buildGate(points[0].clone(), 0x90ffa0, 'START'));
  scene.add(buildGate(finishPos, 0xff7060, 'FINISH'));

  // Checkpoint flags every N waypoints
  for (let i = TRACK.checkpointEvery; i < points.length - 1; i += TRACK.checkpointEvery) {
    scene.add(buildFlag(points[i].clone()));
  }

  return { curve, points, finishPos, startPos: points[0].clone() };
}

function buildGate(pos, color, label) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.6 });
  const bannerMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.15 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 5, 8);
  for (const x of [-4, 4]) {
    const p = new THREE.Mesh(poleGeo, poleMat);
    p.position.set(x, 2.5, 0);
    g.add(p);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 0.25), bannerMat);
  banner.position.set(0, 5.0, 0);
  g.add(banner);
  // Label (just a strip; no canvas text for simplicity)
  g.position.copy(pos);
  g.position.y += 0.0;
  return g;
}

function buildFlag(pos) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.8 }),
  );
  pole.position.y = 1.2;
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffcc28, roughness: 0.7, side: THREE.DoubleSide }),
  );
  flag.position.set(0.4, 1.9, 0);
  g.add(flag);
  g.position.copy(pos);
  g.position.y += 0.0;
  return g;
}
