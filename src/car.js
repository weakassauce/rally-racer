import * as THREE from 'three';
import { CAR } from './config.js';
import { terrainHeight } from './world.js';

const WHEEL_RADIUS = 0.36;

// Low-poly placeholder rally car (boxy WRX-ish silhouette). Replaced by a
// generated GLB when /assets/player_car.glb loads.
export function buildPlaceholderCar({ bodyColor = 0xf3f3f9, accent = 0x2b3a8a } = {}) {
  const g = new THREE.Group();
  const matBody  = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.5, roughness: 0.4 });
  const matAcc   = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.55 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.7, roughness: 0.15 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.85, CAR.length * 0.82), matBody);
  body.position.set(0, 0.6, 0); g.add(body);
  const greenhouse = new THREE.Mesh(new THREE.BoxGeometry(CAR.width * 0.86, 0.6, CAR.length * 0.42), matGlass);
  greenhouse.position.set(0, 1.10, 0.05); g.add(greenhouse);
  const hoodScoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.6), matAcc);
  hoodScoop.position.set(0, 0.95, -CAR.length * 0.25); g.add(hoodScoop);
  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(CAR.width * 1.0, 0.08, 0.5), matAcc);
  rearWing.position.set(0, 1.45, CAR.length * 0.45); g.add(rearWing);
  for (const x of [-CAR.width * 0.45, CAR.width * 0.45]) {
    const sup = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.08), matAcc);
    sup.position.set(x, 1.18, CAR.length * 0.45); g.add(sup);
  }
  // Stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(CAR.width * 1.001, 0.12, CAR.length * 0.82), matAcc);
  stripe.position.set(0, 0.78, 0); g.add(stripe);
  return g;
}

// Rally car physics. Loose lateral grip, big steer angle, follows terrain.
export class Car {
  constructor(mesh) {
    this.mesh = mesh;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.steer = 0;
    this.handbraking = false;
    this.boostActive = false;
    this.distanceTravelled = 0;
    this.crashed = 0;
    this.wheels = [];
    this.wheelAngle = 0;
  }

  reset(at = new THREE.Vector3(), heading = 0) {
    this.position.copy(at);
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.steer = 0;
    this.distanceTravelled = 0;
    this.crashed = 0;
    this.wheelAngle = 0;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }
  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }
  speed() { return this.velocity.length(); }

  // Build wheel rigs. Mirrors highway-racer's nested steer/spin pivots.
  attachWheels(arg = null) {
    for (const w of this.wheels) this.mesh.remove(w.steer);
    this.wheels = [];

    let meshes = null, hubs = null;
    if (arg && arg.wheels && arg.wheelHubs) {
      meshes = arg.wheels; hubs = arg.wheelHubs;
    } else if (Array.isArray(arg)) {
      meshes = arg;
    }
    const defaults = [
      { x: -CAR.width * 0.40, y: WHEEL_RADIUS, z: -CAR.length * 0.30, isFront: true  },
      { x:  CAR.width * 0.40, y: WHEEL_RADIUS, z: -CAR.length * 0.30, isFront: true  },
      { x: -CAR.width * 0.40, y: WHEEL_RADIUS, z:  CAR.length * 0.30, isFront: false },
      { x:  CAR.width * 0.40, y: WHEEL_RADIUS, z:  CAR.length * 0.30, isFront: false },
    ];
    const useHubs = hubs || defaults;

    for (let i = 0; i < 4; i++) {
      const h = useHubs[i];
      const steer = new THREE.Group();
      steer.position.set(h.x, h.y, h.z);
      const spin = new THREE.Group();
      steer.add(spin);
      let mesh;
      if (meshes && meshes[i]) {
        mesh = meshes[i];
      } else {
        mesh = this._buildAlloyWheel();
        if (h.x < 0) mesh.rotation.y += Math.PI;
      }
      spin.add(mesh);
      this.mesh.add(steer);
      this.wheels.push({ steer, spin, isFront: h.isFront });
    }
  }

  _buildAlloyWheel() {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(WHEEL_RADIUS * 0.92, WHEEL_RADIUS * 0.24, 10, 24),
      new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.95, flatShading: true }),
    );
    tire.rotation.y = Math.PI / 2;
    g.add(tire);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_RADIUS * 0.75, WHEEL_RADIUS * 0.75, WHEEL_RADIUS * 0.45, 22),
      new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.7, flatShading: true }),
    );
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    return g;
  }

  takeImpact(strength = 6) {
    this.velocity.multiplyScalar(0.7);
    this.crashed = 0.3;
  }

  update(dt, controls) {
    // Steer smoothing
    const target = controls.steer * CAR.maxSteer;
    this.steer += (target - this.steer) * Math.min(1, dt * CAR.steerLerp);
    this.handbraking = !!controls.handbrake;

    const fwd = this.forward();
    const right = this.right();
    let vLong = this.velocity.dot(fwd);
    let vLat  = this.velocity.dot(right);

    // Throttle
    if (controls.accel > 0) {
      const speedRatio = Math.max(0, vLong) / CAR.topSpeed;
      const power = CAR.maxAccel * (1 - speedRatio) * controls.accel;
      vLong += Math.max(0, power) * dt;
    }
    // Brake / reverse
    if (controls.brake > 0) {
      if (vLong > 0.3) vLong -= CAR.brakeAccel * controls.brake * dt;
      else             vLong -= CAR.reverseAccel * controls.brake * dt;
    }
    // Drag + rolling resist
    const sp = Math.max(1e-3, this.speed());
    const drag = (CAR.rollingResist + CAR.dragCoef * sp * sp);
    const dragOn = Math.sign(vLong) * drag * dt;
    if (Math.abs(dragOn) > Math.abs(vLong)) vLong = 0; else vLong -= dragOn;

    // Lateral grip
    const grip = this.handbraking ? CAR.handbrakeGripMul : 1;
    vLat *= Math.exp(-CAR.lateralGrip * grip * dt);

    // Yaw curve (speed-attenuated)
    const v = Math.abs(vLong);
    const yawAuthority = CAR.yawAtRest / (CAR.yawHalfSpeed + v);
    this.heading += this.steer * yawAuthority * Math.sign(vLong) * dt;

    // Recompose velocity in new heading frame
    const newFwd = this.forward();
    const newRight = this.right();
    this.velocity.copy(newFwd).multiplyScalar(vLong)
      .add(newRight.multiplyScalar(vLat));

    // Integrate position in horizontal plane
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.distanceTravelled += vLong * dt;

    // Follow terrain
    const groundY = terrainHeight(this.position.x, this.position.z);
    this.position.y = groundY + 0.05;

    // Pitch/roll the body slightly with terrain slope (sample 4 points)
    const dxA = terrainHeight(this.position.x + 1, this.position.z) - groundY;
    const dxB = terrainHeight(this.position.x - 1, this.position.z) - groundY;
    const dzA = terrainHeight(this.position.x, this.position.z + 1) - groundY;
    const dzB = terrainHeight(this.position.x, this.position.z - 1) - groundY;
    const tiltX = Math.atan2(dzA - dzB, 2); // pitch
    const tiltZ = -Math.atan2(dxA - dxB, 2); // roll (right wheel low → +roll right)

    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(tiltX, this.heading, tiltZ);

    // Wheels
    if (this.wheels.length > 0) {
      this.wheelAngle -= (vLong / WHEEL_RADIUS) * dt;
      for (const w of this.wheels) {
        w.spin.rotation.x = this.wheelAngle;
        w.steer.rotation.y = w.isFront ? this.steer : 0;
      }
    }

    if (this.crashed > 0) this.crashed -= dt;
  }
}
