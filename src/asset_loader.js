import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function tryLoadGLB(url) {
  return new Promise((resolve) => {
    new GLTFLoader().load(url, (g) => resolve(g.scene), undefined, () => resolve(null));
  });
}

export function normalizeCarModel(root, targetLength = 4.6) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest > 0) root.scale.setScalar(targetLength / longest);
  // TRELLIS faces +Z; flip 180° around Y so nose points -Z
  root.rotation.y = Math.PI;
  // Lift so wheels touch road
  const b2 = new THREE.Box3().setFromObject(root);
  root.position.y -= b2.min.y;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if ('roughness' in m) m.roughness = Math.min(0.32, m.roughness ?? 0.4);
      if ('metalness' in m) m.metalness = Math.max(0.5, m.metalness ?? 0);
      if ('envMapIntensity' in m) m.envMapIntensity = 1.3;
      m.needsUpdate = true;
    }
  });
  return root;
}

export function normalizeWheelModel(root, targetDiameter = 0.72) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest > 0) root.scale.setScalar(targetDiameter / longest);
  root.rotation.y = Math.PI / 2;
  return root;
}
