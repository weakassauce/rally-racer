// Rally-stage tunables. Units: meters, seconds, m/s, radians.

export const WORLD = {
  terrainSize: 2000,         // square stage extent
  terrainSegments: 192,      // heightmap resolution
  heightAmplitude: 36,       // base hill amplitude
  ridgeAmplitude: 18,        // secondary ridge layer
  treeCount: 1400,
  rockCount: 80,
  skyTop: 0x9fc6ec,
  skyBottom: 0xe2dfc8,
  fogColor: 0xcadbc0,
  fogNear: 80,
  fogFar: 700,
  sunDir: [0.55, 0.7, 0.4],
  groundColor: 0x4a5236,     // base grass
  rockColor: 0x6f6b5d,
  trunkColor: 0x4a2f1a,
  leafColor: 0x2f5a25,
};

export const TRACK = {
  width: 7,                  // gravel road width
  // Path waypoints (xz). The track winds through terrain; finish is the last
  // entry. World coords; the actual road altitudes follow the heightmap.
  waypoints: [
    [   0,    0],
    [  20,  -80],
    [  60, -160],
    [ 140, -220],
    [ 240, -260],
    [ 330, -300],
    [ 380, -380],
    [ 400, -470],
    [ 360, -550],
    [ 280, -610],
    [ 180, -660],
    [  60, -680],
    [ -60, -680],
    [-160, -650],
    [-240, -590],
    [-300, -510],
    [-340, -420],
    [-360, -320],
    [-340, -220],
    [-300, -130],
    [-220,  -60],
    [-120,  -20],
    [ -40,  -10],
    [  40,   30],
    [ 130,   60],
    [ 220,   80],
    [ 320,  120],
    [ 420,  180],
    [ 520,  260],
    [ 600,  360],
    [ 660,  470],
    [ 690,  590],
  ],
  finishRadius: 12,          // distance to last waypoint to trigger finish
  checkpointEvery: 4,        // every Nth waypoint is a checkpoint marker
  surfaceLift: 0.18,         // road sits this many meters above the terrain
  bankWidth: 1.4,            // gravel shoulder past asphalt edge
};

export const CAR = {
  mass: 1300,
  maxAccel: 14,
  brakeAccel: 26,
  reverseAccel: 7,
  dragCoef: 0.0008,
  rollingResist: 1.6,
  topSpeed: 65,              // m/s, ~230 km/h — rally-realistic
  // Steering
  maxSteer: 0.62,
  steerLerp: 8,
  yawAtRest: 58,
  yawHalfSpeed: 26,          // tighter low-speed steering for hairpins
  // Grip / drift — looser than tarmac so gravel slides
  lateralGrip: 4.0,
  handbrakeGripMul: 0.12,
  throttleResponse: 0.55,
  maxHull: 100,
  // Body
  length: 4.6,
  width: 1.9,
  height: 1.4,
};

export const CAMERA = {
  chaseBack: 8,
  chaseUp: 3.0,
  chaseLookAhead: 8,
  lerp: 9,
  fovBase: 70,
  fovBoost: 86,
};
