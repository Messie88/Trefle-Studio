// Kinetic Cluster — exported React component.
// Requires: react, three. Usage: <KineticCluster modelUrl="/your-model.glb" style={{ height: 480 }} />
// The pile is made of the objects of the model you uploaded (glTF/GLB). Place that
// file next to your code or in your public folder and pass its URL as modelUrl.
// Edits (shown parts, materials, effects) are matched to the model by node name.

import * as React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---- cluster-values ----
// Product domain for the Kinetic Cluster tool: targets, defaults, limits and
// value readers shared by the schema, the renderer, export and tests.

/** A curve point in 0..1 on both axes (same shape as Toolcraft's curves values). */
type ClusterCurvePoint = Readonly<{ x: number; y: number }>;

const clusterTargets = {
  asset: "objects.asset",
  assetView: "asset.parts",
  accent: "material.accent",
  background: "appearance.background",
  cohesion: "motion.cohesion",
  count: "objects.count",
  damping: "motion.damping",
  dark: "material.dark",
  driftAmount: "idle.amount",
  driftSpeed: "idle.speed",
  gloss: "material.gloss",
  includeBackground: "export.includeBackground",
  light: "material.light",
  pushFalloff: "motion.pushFalloff",
  pushRadius: "motion.pushRadius",
  pushStrength: "motion.pushStrength",
  shape: "objects.shape",
  size: "objects.size",
} as const;

/** Shapes a single piece can take. */
const clusterPieceShapes = [
  "six-way",
  "four-way",
  "corner",
  "tube",
  "ring",
  "box",
  "capsule",
  "cone",
  "cylinder",
  "sphere",
  "tetrahedron",
  "octahedron",
  "dodecahedron",
  "icosahedron",
  "polyhedron",
  "torus",
  "torus-knot",
  "curved-tube",
  "lathe",
  "extrude",
] as const;

type ClusterPieceShape = (typeof clusterPieceShapes)[number];

/**
 * Shape options: one piece shape for the whole pile, a random mix, or the
 * objects of the uploaded asset (built-in default pieces until one is ready).
 */
const clusterShapes = [...clusterPieceShapes, "random", "uploaded"] as const;

type ClusterShape = (typeof clusterShapes)[number];

/**
 * Piece shape of body `index`. "random" deals every shape evenly through a
 * low-discrepancy sequence keyed by index, so a body keeps its shape when the
 * count changes and takes replay with the same mix.
 */
function clusterPieceShape(shape: ClusterShape, index: number): ClusterPieceShape {
  if (shape === "uploaded") return CLUSTER_UPLOAD_FALLBACK_SHAPE;
  if (shape !== "random") return shape;
  return clusterPieceShapes[clusterDealIndex(index, clusterPieceShapes.length)]!;
}

/**
 * Which of `kinds` piece kinds body `index` gets: an even, stable deal through
 * a low-discrepancy sequence, shared by Random mix and uploaded assets.
 */
function clusterDealIndex(index: number, kinds: number): number {
  const ratio = (index * 0.7548776662 + 0.2) % 1;
  return Math.min(kinds - 1, Math.floor(ratio * kinds));
}

/** Every piece shape a pile with `shape` can contain. */
function clusterPileShapes(shape: ClusterShape): readonly ClusterPieceShape[] {
  if (shape === "uploaded") return [CLUSTER_UPLOAD_FALLBACK_SHAPE];
  return shape === "random" ? clusterPieceShapes : [shape];
}

/** Pieces an "uploaded" pile shows while no asset is attached or ready. */
const CLUSTER_UPLOAD_FALLBACK_SHAPE: ClusterPieceShape = "six-way";

const clusterShapeLabels: Readonly<Record<ClusterShape, string>> = {
  box: "Box",
  capsule: "Capsule",
  cone: "Cone",
  corner: "Corner",
  "curved-tube": "Curved tube",
  cylinder: "Cylinder",
  dodecahedron: "Dodecahedron",
  extrude: "Extruded star",
  "four-way": "4-way",
  icosahedron: "Icosahedron",
  lathe: "Lathe vase",
  octahedron: "Octahedron",
  polyhedron: "Bipyramid",
  random: "Random mix",
  ring: "Ring",
  "six-way": "6-way",
  sphere: "Sphere",
  tetrahedron: "Tetrahedron",
  torus: "Torus",
  uploaded: "Uploaded asset",
  "torus-knot": "Torus knot",
  tube: "Tube",
};

const clusterLimits = {
  cohesion: { defaultValue: 1, max: 3, min: 0.4, step: 0.05 },
  count: { defaultValue: 40, max: 72, min: 8, step: 1 },
  /** Linear damping per second (spin damping scales with it). */
  damping: { defaultValue: 3.6, max: 10, min: 0.5, step: 0.1 },
  /** Idle drift strength: 1 = about a tenth of a piece in travel and 9 degrees of turn. */
  driftAmount: { defaultValue: 0.5, max: 1, min: 0, step: 0.05 },
  /** Idle drift tempo in cycles per second (snapped to whole cycles per timeline loop). */
  driftSpeed: { defaultValue: 0.12, max: 0.5, min: 0.02, step: 0.01 },
  gloss: { defaultValue: 0.6, max: 1, min: 0, step: 0.05 },
  /** Reach of the cursor push at size 1, in world units. */
  pushRadius: { defaultValue: 2.6, max: 6, min: 1, step: 0.1 },
  pushStrength: { defaultValue: 1.2, max: 4, min: 0, step: 0.05 },
  size: { defaultValue: 1, max: 1.6, min: 0.6, step: 0.05 },
} as const;

/** Push strength by distance from the cursor (0 = at the cursor, 1 = at the radius). */
const clusterPushFalloffDefault: readonly ClusterCurvePoint[] = Object.freeze([
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 1, y: 0 }),
]);

// Reference palette: chalk white, soft black, electric blue on deep navy.
const clusterColorDefaults = {
  accent: "#1C2CF5",
  background: "#14141C",
  dark: "#111114",
  light: "#E4E4EA",
} as const;

const clusterShapeDefault: ClusterShape = "six-way";

function clampNumber(
  value: unknown,
  limits: Readonly<{ defaultValue: number; max: number; min: number }>,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return limits.defaultValue;
  return Math.min(limits.max, Math.max(limits.min, numeric));
}

function readClusterShape(value: unknown): ClusterShape {
  return clusterShapes.includes(value as ClusterShape)
    ? (value as ClusterShape)
    : clusterShapeDefault;
}

function readClusterCount(value: unknown): number {
  return Math.round(clampNumber(value, clusterLimits.count));
}

function readClusterSize(value: unknown): number {
  return clampNumber(value, clusterLimits.size);
}

function readClusterCohesion(value: unknown): number {
  return clampNumber(value, clusterLimits.cohesion);
}

function readClusterPushStrength(value: unknown): number {
  return clampNumber(value, clusterLimits.pushStrength);
}

function readClusterPushRadius(value: unknown): number {
  return clampNumber(value, clusterLimits.pushRadius);
}

function readClusterDamping(value: unknown): number {
  return clampNumber(value, clusterLimits.damping);
}

/**
 * Single-channel curves value (`points.RGB`) → points clamped to 0..1, sorted
 * by x, last point winning at a shared x (the runtime's own normalization).
 */
function readClusterPushFalloff(value: unknown): ClusterCurvePoint[] {
  const points = (value as { points?: { RGB?: unknown } } | null)?.points?.RGB;
  const byX = new Map<number, ClusterCurvePoint>();
  for (const point of Array.isArray(points) ? points : []) {
    const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const clampedX = Math.min(1, Math.max(0, x));
    byX.set(clampedX, { x: clampedX, y: Math.min(1, Math.max(0, y)) });
  }
  const normalized = [...byX.values()].sort((a, b) => a.x - b.x);
  return normalized.length >= 2 ? normalized : clusterPushFalloffDefault.map((p) => ({ ...p }));
}

function readClusterGloss(value: unknown): number {
  return clampNumber(value, clusterLimits.gloss);
}

function readClusterColor(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "hex" in value &&
    typeof value.hex === "string"
  ) {
    return readClusterColor(value.hex, fallback);
  }
  return fallback;
}

type ClusterAppearance = Readonly<{
  accent: string;
  dark: string;
  gloss: number;
  light: string;
  shape: ClusterShape;
}>;

type ClusterSettings = ClusterAppearance &
  Readonly<{
    cohesion: number;
    count: number;
    damping: number;
    driftAmount: number;
    driftSpeed: number;
    pushFalloff: readonly ClusterCurvePoint[];
    pushRadius: number;
    pushStrength: number;
    size: number;
  }>;

function readClusterSettings(
  values: Readonly<Record<string, unknown>>,
): ClusterSettings {
  return {
    accent: readClusterColor(values[clusterTargets.accent], clusterColorDefaults.accent),
    cohesion: readClusterCohesion(values[clusterTargets.cohesion]),
    count: readClusterCount(values[clusterTargets.count]),
    damping: readClusterDamping(values[clusterTargets.damping]),
    dark: readClusterColor(values[clusterTargets.dark], clusterColorDefaults.dark),
    driftAmount: clampNumber(values[clusterTargets.driftAmount], clusterLimits.driftAmount),
    driftSpeed: clampNumber(values[clusterTargets.driftSpeed], clusterLimits.driftSpeed),
    gloss: readClusterGloss(values[clusterTargets.gloss]),
    light: readClusterColor(values[clusterTargets.light], clusterColorDefaults.light),
    pushFalloff: readClusterPushFalloff(values[clusterTargets.pushFalloff]),
    pushRadius: readClusterPushRadius(values[clusterTargets.pushRadius]),
    pushStrength: readClusterPushStrength(values[clusterTargets.pushStrength]),
    shape: readClusterShape(values[clusterTargets.shape]),
    size: readClusterSize(values[clusterTargets.size]),
  };
}

type ClusterBackingSize = Readonly<{
  backingHeight: number;
  backingWidth: number;
  cssHeight: number;
  cssWidth: number;
}>;

/** Backing pixels = CSS size × device pixel ratio × selected resolution scale. */
/**
 * Fraction of the artboard size the live canvas occupies on screen, from the
 * view zoom in percent. Zoomed-out views render at their on-screen size (the
 * Resolution scale contract measures the visible canvas); above 100% the
 * backing stays at artboard resolution, since following zoom-in would grow it
 * past GPU limits (400% at 2x DPR and scale 2 is 16x the artboard).
 */
function clusterBackingZoom(zoomPercent: number): number {
  return Number.isFinite(zoomPercent) && zoomPercent > 0 ? Math.min(1, zoomPercent / 100) : 1;
}

function getClusterBacking(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  renderScale: number,
): ClusterBackingSize {
  const scale = Math.min(2, Math.max(1, Number.isFinite(renderScale) ? renderScale : 2));
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    backingHeight: Math.ceil(cssHeight * ratio * scale),
    backingWidth: Math.ceil(cssWidth * ratio * scale),
    cssHeight,
    cssWidth,
  };
}

// ---- cluster-collision ----
// Shape-aware collision volumes for the cluster. Each rendered shape is
// approximated by capsules (segment + radius) that follow its arms, hub, tube
// or ring, so pieces can interlock in each other's gaps without passing
// through each other. Pure math: shared by the simulation, tests and geometry.


type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** Rendered dimensions at size 1, shared with the geometry builder. */
const CLUSTER_ARM_LENGTH = 1.2;
const CLUSTER_ARM_RADIUS = 0.36;
const CLUSTER_HUB_RADIUS = CLUSTER_ARM_RADIUS * 1.08;
const CLUSTER_RING_RADIUS = 0.82;

const RING_SEGMENTS = 10;
/** Capsule end of an arm: its rounded cap covers the flat bevelled rim. */
const ARM_SEGMENT_END = CLUSTER_ARM_LENGTH - CLUSTER_ARM_RADIUS * 0.5;

type Capsule = Readonly<{ a: Vec3; b: Vec3; radius: number }>;

type ClusterCollisionShape = Readonly<{
  /** Radius of the sphere around the body centre that holds every capsule. */
  boundRadius: number;
  capsules: readonly Capsule[];
}>;

const ORIGIN: Vec3 = [0, 0, 0];

function arm(direction: Vec3): Capsule {
  return {
    a: ORIGIN,
    b: [
      direction[0] * ARM_SEGMENT_END,
      direction[1] * ARM_SEGMENT_END,
      direction[2] * ARM_SEGMENT_END,
    ],
    radius: CLUSTER_ARM_RADIUS,
  };
}

const HUB: Capsule = { a: ORIGIN, b: ORIGIN, radius: CLUSTER_HUB_RADIUS };

function ringCapsules(): Capsule[] {
  // Chords of the torus centre circle; radius grows slightly so the chord
  // midpoints still reach the tube surface.
  const sag = CLUSTER_RING_RADIUS * (1 - Math.cos(Math.PI / RING_SEGMENTS));
  return Array.from({ length: RING_SEGMENTS }, (_, index) => {
    const start = (index / RING_SEGMENTS) * Math.PI * 2;
    const end = ((index + 1) / RING_SEGMENTS) * Math.PI * 2;
    // Torus lies in the XY plane, matching THREE.TorusGeometry.
    return {
      a: [Math.cos(start) * CLUSTER_RING_RADIUS, Math.sin(start) * CLUSTER_RING_RADIUS, 0],
      b: [Math.cos(end) * CLUSTER_RING_RADIUS, Math.sin(end) * CLUSTER_RING_RADIUS, 0],
      radius: CLUSTER_ARM_RADIUS + sag,
    } satisfies Capsule;
  });
}

function sphere(center: Vec3, radius: number): Capsule {
  return { a: center, b: center, radius };
}

function scaled(direction: Vec3, length: number): Vec3 {
  const norm = Math.hypot(...direction);
  return [
    (direction[0] / norm) * length,
    (direction[1] / norm) * length,
    (direction[2] / norm) * length,
  ];
}

/** Capsules from the centre towards each vertex, ending one radius short of it. */
function spokes(vertices: readonly Vec3[], radius: number): Capsule[] {
  return vertices.map((vertex) => ({
    a: ORIGIN,
    b: scaled(vertex, Math.hypot(...vertex) - radius),
    radius,
  }));
}

function distanceToSegment(point: Vec3, a: Vec3, b: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const lengthSq = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1] + (point[2] - a[2]) * ab[2]) /
              lengthSq,
          ),
        );
  return Math.hypot(
    point[0] - (a[0] + ab[0] * t),
    point[1] - (a[1] + ab[1] * t),
    point[2] - (a[2] + ab[2] * t),
  );
}

/**
 * Chords along a curve (t in 0..1); each chord's radius grows by how far the
 * curve bows away from it, so the chords still reach the tube surface.
 */
function curveCapsules(curve: (t: number) => Vec3, segments: number, radius: number): Capsule[] {
  return Array.from({ length: segments }, (_, index) => {
    const a = curve(index / segments);
    const b = curve((index + 1) / segments);
    let sag = 0;
    for (let sample = 1; sample < 8; sample += 1) {
      const point = curve((index + sample / 8) / segments);
      sag = Math.max(sag, distanceToSegment(point, a, b));
    }
    return { a, b, radius: radius + sag };
  });
}

/** Plain torus (thinner than the ring fitting), shared with the geometry builder. */
const CLUSTER_TORUS = { radius: 0.85, tube: 0.24 } as const;

/** Torus knot parameters, shared with THREE.TorusKnotGeometry in the geometry builder. */
const CLUSTER_TORUS_KNOT = { p: 2, q: 3, radius: 0.62, tube: 0.2 } as const;

/** Centre line of THREE.TorusKnotGeometry for t in 0..1 (same formula as three.js). */
function clusterTorusKnotPoint(t: number): Vec3 {
  const { p, q, radius } = CLUSTER_TORUS_KNOT;
  const u = t * p * Math.PI * 2;
  const quOverP = (q / p) * u;
  const cs = Math.cos(quOverP);
  return [
    radius * (2 + cs) * 0.5 * Math.cos(u),
    radius * (2 + cs) * 0.5 * Math.sin(u),
    radius * Math.sin(quOverP) * 0.5,
  ];
}

const CLUSTER_CURVED_TUBE_RADIUS = 0.26;

/** Centre line of the curved tube (a gentle 3D S-bend) for t in 0..1. */
function clusterCurvedTubePoint(t: number): Vec3 {
  return [
    (t - 0.5) * 1.9,
    Math.sin(t * Math.PI * 2) * 0.5,
    Math.cos(t * Math.PI * 2) * 0.3,
  ];
}

/** Polyhedron vertices, shared with the geometry builder. */
const CLUSTER_TETRAHEDRON_RADIUS = 1.15;
const CLUSTER_OCTAHEDRON_RADIUS = 1.1;
/** Triangular bipyramid: two apexes over an equator triangle, all on one sphere. */
const CLUSTER_BIPYRAMID_RADIUS = 1.1;
const CLUSTER_BIPYRAMID_VERTICES: readonly Vec3[] = [
  [0, 1, 0],
  [0, -1, 0],
  ...[0, 1, 2].map((index): Vec3 => {
    const angle = Math.PI / 2 + (index * Math.PI * 2) / 3;
    return [Math.cos(angle), 0, Math.sin(angle)];
  }),
];

/** Five-point star outline (outer, inner radius) for the extruded shape. */
const CLUSTER_STAR = { depth: 0.4, inner: 0.45, outer: 1.1, points: 5 } as const;

function starArms(): Capsule[] {
  return Array.from({ length: CLUSTER_STAR.points }, (_, index) => {
    const angle = Math.PI / 2 + (index * Math.PI * 2) / CLUSTER_STAR.points;
    return {
      a: ORIGIN,
      b: [Math.cos(angle) * 0.82, Math.sin(angle) * 0.82, 0],
      radius: 0.28,
    } satisfies Capsule;
  });
}

function boxCapsules(): Capsule[] {
  // A core sphere touching the face centres plus one sphere per corner, all
  // inside the 1.5 cube, so neighbours touch where the faces are drawn.
  const corner = 0.45;
  return [
    sphere(ORIGIN, 0.75),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) =>
        [-1, 1].map((sz) => sphere([sx * corner, sy * corner, sz * corner], 0.3)),
      ),
    ),
  ];
}

const TETRAHEDRON_VERTICES: readonly Vec3[] = (
  [
    [1, 1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, -1, -1],
  ] as const
).map((vertex) => scaled([...vertex], CLUSTER_TETRAHEDRON_RADIUS));

const OCTAHEDRON_VERTICES: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
].map((vertex) => scaled(vertex as Vec3, CLUSTER_OCTAHEDRON_RADIUS));

function withBound(capsules: Capsule[]): ClusterCollisionShape {
  const boundRadius = Math.max(
    ...capsules.map(
      (capsule) => Math.max(Math.hypot(...capsule.a), Math.hypot(...capsule.b)) + capsule.radius,
    ),
  );
  return { boundRadius, capsules };
}

const SHAPES: Readonly<Record<ClusterPieceShape, ClusterCollisionShape>> = {
  corner: withBound([HUB, arm([1, 0, 0]), arm([0, 1, 0]), arm([0, 0, 1])]),
  "four-way": withBound([HUB, arm([1, 0, 0]), arm([-1, 0, 0]), arm([0, 1, 0]), arm([0, -1, 0])]),
  ring: withBound(ringCapsules()),
  "six-way": withBound([
    HUB,
    arm([1, 0, 0]),
    arm([-1, 0, 0]),
    arm([0, 1, 0]),
    arm([0, -1, 0]),
    arm([0, 0, 1]),
    arm([0, 0, -1]),
  ]),
  box: withBound(boxCapsules()),
  capsule: withBound([{ a: [0, -0.65, 0], b: [0, 0.65, 0], radius: 0.45 }]),
  cone: withBound([
    // Body, a ring of chords along the base rim, and the tip.
    sphere([0, -0.45, 0], 0.45),
    ...curveCapsules(
      (t) => [Math.cos(t * Math.PI * 2) * 0.5, -0.75, Math.sin(t * Math.PI * 2) * 0.5],
      6,
      0.15,
    ),
    { a: [0, -0.2, 0], b: [0, 0.55, 0], radius: 0.25 },
  ]),
  "curved-tube": withBound(curveCapsules(clusterCurvedTubePoint, 6, CLUSTER_CURVED_TUBE_RADIUS)),
  cylinder: withBound([{ a: [0, -0.3, 0], b: [0, 0.3, 0], radius: 0.62 }]),
  dodecahedron: withBound([sphere(ORIGIN, 0.9)]),
  extrude: withBound([sphere(ORIGIN, 0.3), ...starArms()]),
  icosahedron: withBound([sphere(ORIGIN, 0.9)]),
  lathe: withBound([
    sphere([0, -0.45, 0], 0.5),
    { a: [0, -0.1, 0], b: [0, 0.45, 0], radius: 0.35 },
    sphere([0, 0.55, 0], 0.4),
  ]),
  octahedron: withBound([
    sphere(ORIGIN, CLUSTER_OCTAHEDRON_RADIUS / Math.sqrt(3)),
    ...spokes(OCTAHEDRON_VERTICES, 0.3),
  ]),
  polyhedron: withBound([
    sphere(ORIGIN, 0.45),
    ...spokes(
      CLUSTER_BIPYRAMID_VERTICES.map((vertex) => scaled(vertex, CLUSTER_BIPYRAMID_RADIUS)),
      0.3,
    ),
  ]),
  sphere: withBound([sphere(ORIGIN, 0.95)]),
  tetrahedron: withBound([
    sphere(ORIGIN, CLUSTER_TETRAHEDRON_RADIUS / 3),
    ...spokes(TETRAHEDRON_VERTICES, 0.3),
  ]),
  torus: withBound(
    curveCapsules(
      (t) => [
        Math.cos(t * Math.PI * 2) * CLUSTER_TORUS.radius,
        Math.sin(t * Math.PI * 2) * CLUSTER_TORUS.radius,
        0,
      ],
      10,
      CLUSTER_TORUS.tube,
    ),
  ),
  "torus-knot": withBound(curveCapsules(clusterTorusKnotPoint, 12, CLUSTER_TORUS_KNOT.tube)),
  tube: withBound([
    {
      a: [0, -ARM_SEGMENT_END, 0],
      b: [0, ARM_SEGMENT_END, 0],
      radius: CLUSTER_ARM_RADIUS,
    },
  ]),
};

function getClusterCollisionShape(shape: ClusterPieceShape): ClusterCollisionShape {
  return SHAPES[shape];
}

/** Most collision spheres fitted to one uploaded asset object. */
const CLUSTER_ASSET_MAX_SPHERES = 8;

/** Most capsules any piece shape or fitted asset object uses (sizes per-body scratch buffers). */
const CLUSTER_MAX_CAPSULES = Math.max(
  CLUSTER_ASSET_MAX_SPHERES,
  ...clusterPieceShapes.map((shape) => SHAPES[shape].capsules.length),
);

/** Floats per world capsule: a(3), b(3), radius, centre(3), bounding extent. */
const CAPSULE_STRIDE = 11;

function rotate(q: Quat, v: Vec3, scale: number, out: Float64Array, offset: number): void {
  const [x, y, z, w] = q;
  // v' = v + 2w(q×v) + 2q×(q×v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  out[offset] = (v[0] + w * tx + (y * tz - z * ty)) * scale;
  out[offset + 1] = (v[1] + w * ty + (z * tx - x * tz)) * scale;
  out[offset + 2] = (v[2] + w * tz + (x * ty - y * tx)) * scale;
}

/** Writes the body's capsules in world space into `out` (CAPSULE_STRIDE each). */
function writeWorldCapsules(
  shape: ClusterCollisionShape,
  position: Vec3,
  orientation: Quat,
  size: number,
  out: Float64Array,
): void {
  shape.capsules.forEach((capsule, index) => {
    const offset = index * CAPSULE_STRIDE;
    rotate(orientation, capsule.a, size, out, offset);
    rotate(orientation, capsule.b, size, out, offset + 3);
    out[offset] += position[0];
    out[offset + 1] += position[1];
    out[offset + 2] += position[2];
    out[offset + 3] += position[0];
    out[offset + 4] += position[1];
    out[offset + 5] += position[2];
    out[offset + 6] = capsule.radius * size;
    out[offset + 7] = (out[offset]! + out[offset + 3]!) * 0.5;
    out[offset + 8] = (out[offset + 1]! + out[offset + 4]!) * 0.5;
    out[offset + 9] = (out[offset + 2]! + out[offset + 5]!) * 0.5;
    out[offset + 10] =
      (Math.hypot(capsule.b[0] - capsule.a[0], capsule.b[1] - capsule.a[1], capsule.b[2] - capsule.a[2]) * 0.5 +
        capsule.radius) *
      size;
  });
}

/** Moves every world capsule of one body by (dx, dy, dz). */
function translateWorldCapsules(
  out: Float64Array,
  count: number,
  dx: number,
  dy: number,
  dz: number,
): void {
  for (let index = 0; index < count; index += 1) {
    const offset = index * CAPSULE_STRIDE;
    out[offset] += dx;
    out[offset + 1] += dy;
    out[offset + 2] += dz;
    out[offset + 3] += dx;
    out[offset + 4] += dy;
    out[offset + 5] += dz;
    out[offset + 7] += dx;
    out[offset + 8] += dy;
    out[offset + 9] += dz;
  }
}

type ClusterContact = {
  /** Deepest penetration; positive when any capsules overlap. */
  depth: number;
  /** Unit normal of the deepest overlap, from the first body to the second. */
  normal: Vec3;
  /**
   * Mean of normal × depth over every overlapping capsule pair. Opposing
   * contacts (a ring hooked through another) cancel instead of alternating.
   */
  push: Vec3;
};

/**
 * Overlaps between two bodies' world capsules (Ericson's closest points
 * between segments). Depth ≤ 0 means they do not touch. `fallback` is the
 * centre-to-centre direction used when two segments intersect exactly.
 */
function deepestContact(
  first: Float64Array,
  firstCount: number,
  second: Float64Array,
  secondCount: number,
  fallback: Vec3,
  out: ClusterContact,
): ClusterContact {
  out.depth = -Infinity;
  out.push[0] = 0;
  out.push[1] = 0;
  out.push[2] = 0;
  let overlaps = 0;
  for (let i = 0; i < firstCount; i += 1) {
    const p = i * CAPSULE_STRIDE;
    const ax = first[p]!;
    const ay = first[p + 1]!;
    const az = first[p + 2]!;
    const d1x = first[p + 3]! - ax;
    const d1y = first[p + 4]! - ay;
    const d1z = first[p + 5]! - az;
    const ra = first[p + 6]!;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const cx = first[p + 7]!;
    const cy = first[p + 8]!;
    const cz = first[p + 9]!;
    const extent = first[p + 10]!;
    for (let j = 0; j < secondCount; j += 1) {
      const q = j * CAPSULE_STRIDE;
      // Bounding spheres around both capsules rule out most pairs cheaply.
      const ex = second[q + 7]! - cx;
      const ey = second[q + 8]! - cy;
      const ez = second[q + 9]! - cz;
      const bound = extent + second[q + 10]!;
      const boundDepth = bound - Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (boundDepth <= 0) continue;
      const bx = second[q]!;
      const by = second[q + 1]!;
      const bz = second[q + 2]!;
      const d2x = second[q + 3]! - bx;
      const d2y = second[q + 4]! - by;
      const d2z = second[q + 5]! - bz;
      const radii = ra + second[q + 6]!;
      const rx = ax - bx;
      const ry = ay - by;
      const rz = az - bz;
      const e = d2x * d2x + d2y * d2y + d2z * d2z;
      const f = d2x * rx + d2y * ry + d2z * rz;
      let s = 0;
      let t = 0;
      if (a <= 1e-12 && e <= 1e-12) {
        s = 0;
        t = 0;
      } else if (a <= 1e-12) {
        t = Math.min(1, Math.max(0, f / e));
      } else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e <= 1e-12) {
          s = Math.min(1, Math.max(0, -c / a));
        } else {
          const b = d1x * d2x + d1y * d2y + d1z * d2z;
          const denominator = a * e - b * b;
          s = denominator > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denominator)) : 0;
          t = (b * s + f) / e;
          if (t < 0) {
            t = 0;
            s = Math.min(1, Math.max(0, -c / a));
          } else if (t > 1) {
            t = 1;
            s = Math.min(1, Math.max(0, (b - c) / a));
          }
        }
      }
      const nx = bx + d2x * t - (ax + d1x * s);
      const ny = by + d2y * t - (ay + d1y * s);
      const nz = bz + d2z * t - (az + d1z * s);
      const distance = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const depth = radii - distance;
      const unitX = distance > 1e-6 ? nx / distance : fallback[0];
      const unitY = distance > 1e-6 ? ny / distance : fallback[1];
      const unitZ = distance > 1e-6 ? nz / distance : fallback[2];
      if (depth > 0) {
        overlaps += 1;
        out.push[0] += unitX * depth;
        out.push[1] += unitY * depth;
        out.push[2] += unitZ * depth;
      }
      if (depth <= out.depth) continue;
      out.depth = depth;
      out.normal[0] = unitX;
      out.normal[1] = unitY;
      out.normal[2] = unitZ;
    }
  }
  if (overlaps > 1) {
    out.push[0] /= overlaps;
    out.push[1] /= overlaps;
    out.push[2] /= overlaps;
  }
  return out;
}

// ---- cluster-asset ----
// Uploaded asset -> pile pieces. The Toolcraft model presentation lease hands
// over a Three root (node Groups tagged with their canonical node id, primitive
// Meshes with the authored materials). This module splits it into objects
// (top-level children after single-child wrappers), bakes each part into
// object space, normalizes scale and fits a collision shape per object. It
// never decodes files or rebuilds materials: parts reuse the lease's materials.



type ClusterAssetLimits = Readonly<{
  collisionSpheres: number;
  heavyTriangles: number;
  scaleFloor: number;
  shownObjects: number;
}>;

const CLUSTER_ASSET_LIMITS: ClusterAssetLimits = Object.freeze({
  /** At most this many collision spheres per object. */
  collisionSpheres: CLUSTER_ASSET_MAX_SPHERES,
  /**
   * Objects above this triangle count are flagged as heavy (no simplification).
   * Measured on an M2 Pro at a 7680x4320 backing: 72 copies of a 20k-triangle
   * object drop the live pile below 60 fps. Toolcraft's model import rejects
   * uploads above about 50k triangles in total, so the flag must sit below that.
   */
  heavyTriangles: 20_000,
  /** Smallest object radius relative to the largest (largest = 1). */
  scaleFloor: 0.35,
  /** Objects past this index start hidden from the deal. */
  shownObjects: 12,
});

type ClusterAssetPart = Readonly<{
  /** Object-space geometry owned by the asset (a transformed clone). */
  geometry: THREE.BufferGeometry;
  /** Authored material borrowed from the presentation lease; never disposed here. */
  material: THREE.Material | THREE.Material[];
  name: string;
}>;

type ClusterAssetObject = Readonly<{
  /** Collision of all parts: fitted on first read (hidden objects never pay for it). */
  readonly collision: ClusterCollisionShape;
  /** Collision of the given part indices (sorted), fitted once per subset. */
  collisionOf(partIndices: readonly number[]): ClusterCollisionShape;
  heavy: boolean;
  name: string;
  nodeId: string;
  parts: readonly ClusterAssetPart[];
  /** Radius after normalization (largest object = 1). */
  radius: number;
  /** The node's own name as in the file (may be empty; `name` has a fallback). */
  sourceName: string;
  shown: boolean;
  triangles: number;
}>;

type ClusterAsset = Readonly<{
  /** Releases the creator's hold; geometry is freed once every holder released. */
  dispose(): void;
  /** Unique per extraction: GPU caches key on it (a re-extraction has new geometry). */
  instance: string;
  /** Identity of the source document: physics and takes compare it across reloads. */
  key: string;
  objects: readonly ClusterAssetObject[];
  /** Most objects the pile may deal at once (soft limit; the first ones start shown). */
  shownLimit: number;
  /** Another holder (a pile built from the asset); call the result once to release. */
  retain(): () => void;
}>;

let extractions = 0;

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function nodeChildren(object: THREE.Object3D): THREE.Object3D[] {
  return object.children.filter((child) => !isMesh(child));
}

function meshChildren(object: THREE.Object3D): THREE.Mesh[] {
  return object.children.filter(isMesh);
}

function nodeIdOf(object: THREE.Object3D, fallback: string): string {
  const id = object.userData.toolcraftModelNodeId;
  return typeof id === "string" ? id : fallback;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3);
}

type ObjectSource = Readonly<{
  meshes: readonly THREE.Mesh[];
  name: string;
  nodeId: string;
  sourceName: string;
}>;

/** Meshes of a subtree in traversal order, named by their owning node. */
function subtreeMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (isMesh(object)) meshes.push(object);
  });
  return meshes;
}

/** Top-level objects after descending single-child wrappers without meshes. */
function objectSources(root: THREE.Object3D): { container: THREE.Object3D; sources: ObjectSource[] } {
  let container = root;
  while (meshChildren(container).length === 0 && nodeChildren(container).length === 1) {
    container = nodeChildren(container)[0]!;
  }
  const nodes = nodeChildren(container);
  const sources: ObjectSource[] =
    nodes.length === 0
      ? [{
          meshes: subtreeMeshes(container),
          name: container.name,
          nodeId: nodeIdOf(container, "root"),
          sourceName: container.name,
        }]
      : nodes.map((child, index) => ({
          meshes: subtreeMeshes(child),
          name: child.name,
          nodeId: nodeIdOf(child, `object-${index}`),
          sourceName: child.name,
        }));
  const ownMeshes = nodes.length > 0 ? meshChildren(container) : [];
  if (ownMeshes.length > 0) {
    sources.push({
      meshes: ownMeshes,
      name: container.name,
      nodeId: nodeIdOf(container, "base"),
      sourceName: container.name,
    });
  }
  return {
    container,
    sources: sources
      .filter((source) => source.meshes.length > 0)
      .map((source, index) => ({ ...source, name: source.name || `Object ${index + 1}` })),
  };
}

function partName(mesh: THREE.Mesh, index: number): string {
  // Primitive meshes are named by id; their owning node carries the authored name.
  const owner = mesh.parent && !isMesh(mesh.parent) ? mesh.parent.name : "";
  return owner || mesh.name || `Part ${index + 1}`;
}

/** Plain vertex positions and triangle corners of a geometry (no Three objects past this point). */
type MeshData = Readonly<{ indices: Uint32Array; positions: Float32Array }>;

/** Plain positions and triangle corners of a geometry. */
function meshData(geometry: THREE.BufferGeometry): MeshData {
  const attribute = geometry.getAttribute("position");
  const positions = new Float32Array(attribute.count * 3);
  for (let vertex = 0; vertex < attribute.count; vertex += 1) {
    positions[vertex * 3] = attribute.getX(vertex);
    positions[vertex * 3 + 1] = attribute.getY(vertex);
    positions[vertex * 3 + 2] = attribute.getZ(vertex);
  }
  const index = geometry.index;
  const corners = index ? index.count : attribute.count;
  const indices = new Uint32Array(corners - (corners % 3));
  for (let corner = 0; corner < indices.length; corner += 1) {
    indices[corner] = index ? index.getX(corner) : corner;
  }
  return { indices, positions };
}

function maxDistance(geometries: readonly THREE.BufferGeometry[]): number {
  let radius = 0;
  for (const geometry of geometries) {
    const attribute = geometry.getAttribute("position");
    for (let vertex = 0; vertex < attribute.count; vertex += 1) {
      radius = Math.max(radius, Math.hypot(attribute.getX(vertex), attribute.getY(vertex), attribute.getZ(vertex)));
    }
  }
  return radius;
}

/** A mirroring bake reverses triangle winding; swap two corners so faces point outward again. */
function restoreWinding(geometry: THREE.BufferGeometry): void {
  const index = geometry.index;
  if (index) {
    for (let corner = 0; corner + 2 < index.count; corner += 3) {
      const second = index.getX(corner + 1);
      index.setX(corner + 1, index.getX(corner + 2));
      index.setX(corner + 2, second);
    }
    index.needsUpdate = true;
    return;
  }
  for (const attribute of Object.values(geometry.attributes)) {
    for (let corner = 0; corner + 2 < attribute.count; corner += 3) {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        const second = attribute.getComponent(corner + 1, component);
        attribute.setComponent(corner + 1, component, attribute.getComponent(corner + 2, component));
        attribute.setComponent(corner + 2, component, second);
      }
    }
    attribute.needsUpdate = true;
  }
}

function extractClusterAsset(
  root: THREE.Object3D,
  key: string,
  limits: ClusterAssetLimits = CLUSTER_ASSET_LIMITS,
  onFree: () => void = () => undefined,
): ClusterAsset {
  root.updateMatrixWorld(true);
  const { container, sources } = objectSources(root);
  const toContainer = container.matrixWorld.clone().invert();
  const relative = new THREE.Matrix4();

  // Bake every part into container space, then centre each object on its box.
  const baked = sources.map((source) => {
    const parts = source.meshes.map((mesh, index) => {
      const geometry = mesh.geometry.clone();
      relative.multiplyMatrices(toContainer, mesh.matrixWorld);
      geometry.applyMatrix4(relative);
      if (relative.determinant() < 0) restoreWinding(geometry);
      return { geometry, material: mesh.material, name: partName(mesh, index) };
    });
    const box = new THREE.Box3();
    parts.forEach((part) => {
      part.geometry.computeBoundingBox();
      box.union(part.geometry.boundingBox!);
    });
    const center = box.getCenter(new THREE.Vector3());
    parts.forEach((part) => part.geometry.translate(-center.x, -center.y, -center.z));
    const radius = maxDistance(parts.map((part) => part.geometry));
    return { parts, radius, source };
  });

  const largest = Math.max(0, ...baked.map(({ radius }) => radius));
  const objects: ClusterAssetObject[] = [];
  for (const { parts, radius, source } of baked) {
    if (!(radius > 0) || !(largest > 0)) {
      parts.forEach((part) => part.geometry.dispose());
      continue;
    }
    const target = Math.max(radius / largest, limits.scaleFloor);
    const factor = target / radius;
    parts.forEach((part) => {
      part.geometry.scale(factor, factor, factor);
      part.geometry.computeBoundingSphere();
    });
    const triangles = parts.reduce((sum, part) => sum + triangleCount(part.geometry), 0);
    // Cache the full set plus the latest subset: toggling parts back and forth
    // reuses them without keeping every subset ever fitted.
    const allParts = parts.map((_, index) => index);
    const fullKey = allParts.join(",");
    let full: ClusterCollisionShape | null = null;
    let latest: { fit: ClusterCollisionShape; key: string } | null = null;
    const fit = (partIndices: readonly number[]) =>
      fitClusterCollision(
        partIndices.map((index) => parts[index]!.geometry),
        limits.collisionSpheres,
      );
    const collisionOf = (partIndices: readonly number[]): ClusterCollisionShape => {
      const key = partIndices.join(",");
      if (key === fullKey) return (full ??= fit(allParts));
      if (latest?.key !== key) latest = { fit: fit(partIndices), key };
      return latest.fit;
    };
    objects.push({
      get collision() {
        return collisionOf(allParts);
      },
      collisionOf,
      heavy: triangles > limits.heavyTriangles,
      name: source.name,
      nodeId: source.nodeId,
      parts,
      radius: target,
      shown: objects.length < limits.shownObjects,
      sourceName: source.sourceName,
      triangles,
    });
  }

  let holders = 1;
  const release = () => {
    holders -= 1;
    if (holders !== 0) return;
    objects.forEach((object) => object.parts.forEach((part) => part.geometry.dispose()));
    onFree();
  };
  extractions += 1;
  let creatorReleased = false;
  return {
    dispose: () => {
      if (creatorReleased) return;
      creatorReleased = true;
      release();
    },
    instance: `${key}#${extractions}`,
    key,
    objects,
    shownLimit: limits.shownObjects,
    retain: () => {
      holders += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
      };
    },
  };
}

/** Grid cells along the longest box side for the collision voxel solid. */
const COLLISION_GRID = 16;
/** Surface samples per cell area: dense enough to close the voxel shell. */
const SAMPLES_PER_CELL_AREA = 4;
const MAX_SURFACE_SAMPLES = 40_000;

/** Surface sample points (vertices plus area-weighted triangle interiors). */
function surfaceSamples(meshes: readonly MeshData[], cell: number): Float64Array {
  const samples: number[] = [];
  let budget = MAX_SURFACE_SAMPLES;
  for (const { indices, positions } of meshes) {
    for (let corner = 0; corner + 2 < indices.length; corner += 3) {
      const a = indices[corner]! * 3;
      const b = indices[corner + 1]! * 3;
      const c = indices[corner + 2]! * 3;
      const ax = positions[a]!;
      const ay = positions[a + 1]!;
      const az = positions[a + 2]!;
      const abx = positions[b]! - ax;
      const aby = positions[b + 1]! - ay;
      const abz = positions[b + 2]! - az;
      const acx = positions[c]! - ax;
      const acy = positions[c + 1]! - ay;
      const acz = positions[c + 2]! - az;
      const area =
        Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) / 2;
      const count = Math.min(
        Math.max(1, Math.ceil((area / (cell * cell)) * SAMPLES_PER_CELL_AREA)),
        Math.max(1, budget),
      );
      budget -= count;
      samples.push(ax, ay, az);
      for (let sample = 0; sample < count; sample += 1) {
        let s = (sample * 0.7548776662 + 0.31) % 1;
        let t = (sample * 0.5698402909 + 0.17) % 1;
        if (s + t > 1) [s, t] = [1 - s, 1 - t];
        samples.push(ax + abx * s + acx * t, ay + aby * s + acy * t, az + abz * s + acz * t);
      }
    }
  }
  return Float64Array.from(samples);
}

/**
 * Collision for an arbitrary mesh: a coarse voxel solid (surface cells plus
 * the inside, found by flood-filling the outside), clustered into at most
 * `maxSpheres` spheres that cover their cells. Centres sit inside the volume,
 * so convex pieces are not oversized the way surface clusters would be.
 */
function fitClusterCollision(
  geometries: readonly THREE.BufferGeometry[],
  maxSpheres: number = CLUSTER_ASSET_LIMITS.collisionSpheres,
): ClusterCollisionShape {
  const meshes = geometries.map(meshData);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of meshes) {
    for (let offset = 0; offset < positions.length; offset += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, positions[offset + axis]!);
        max[axis] = Math.max(max[axis]!, positions[offset + axis]!);
      }
    }
  }
  const extent = { x: max[0]! - min[0]!, y: max[1]! - min[1]!, z: max[2]! - min[2]! };
  const cell = Math.max(extent.x, extent.y, extent.z, 1e-6) / COLLISION_GRID;
  // One padding cell on every side keeps the outside connected for the flood fill.
  const dims = [extent.x, extent.y, extent.z].map((size) => Math.max(1, Math.ceil(size / cell)) + 2) as [
    number,
    number,
    number,
  ];
  const origin = { x: min[0]! - cell, y: min[1]! - cell, z: min[2]! - cell };
  const cellIndex = (x: number, y: number, z: number) => x + dims[0] * (y + dims[1] * z);
  const surface = new Uint8Array(dims[0] * dims[1] * dims[2]);
  const samples = surfaceSamples(meshes, cell);
  for (let offset = 0; offset < samples.length; offset += 3) {
    const x = Math.min(dims[0] - 2, Math.max(1, Math.floor((samples[offset]! - origin.x) / cell)));
    const y = Math.min(dims[1] - 2, Math.max(1, Math.floor((samples[offset + 1]! - origin.y) / cell)));
    const z = Math.min(dims[2] - 2, Math.max(1, Math.floor((samples[offset + 2]! - origin.z) / cell)));
    surface[cellIndex(x, y, z)] = 1;
  }

  // Flood the outside from a padding corner; everything else is solid.
  const outside = new Uint8Array(surface.length);
  const queue = [0];
  outside[0] = 1;
  while (queue.length > 0) {
    const current = queue.pop()!;
    const x = current % dims[0];
    const y = Math.floor(current / dims[0]) % dims[1];
    const z = Math.floor(current / (dims[0] * dims[1]));
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= dims[0] || ny >= dims[1] || nz >= dims[2]) continue;
      const next = cellIndex(nx, ny, nz);
      if (outside[next] || surface[next]) continue;
      outside[next] = 1;
      queue.push(next);
    }
  }
  const centerOf = (index: number): Vec3 => {
    const x = index % dims[0];
    const y = Math.floor(index / dims[0]) % dims[1];
    const z = Math.floor(index / (dims[0] * dims[1]));
    return [origin.x + (x + 0.5) * cell, origin.y + (y + 0.5) * cell, origin.z + (z + 0.5) * cell];
  };

  // Depth of each solid cell: distance to the nearest outside cell, found by
  // propagating each cell's nearest outside seed through its 26 neighbours
  // (near-Euclidean, linear in cells), minus the half cell the surface sits inside.
  const nearestSeed = new Int32Array(surface.length).fill(-1);
  const seedDistance = new Float64Array(surface.length).fill(Infinity);
  const frontier: number[] = [];
  for (let index = 0; index < surface.length; index += 1) {
    if (!outside[index]) continue;
    nearestSeed[index] = index;
    seedDistance[index] = 0;
    frontier.push(index);
  }
  for (let head = 0; head < frontier.length; head += 1) {
    const current = frontier[head]!;
    const seed = centerOf(nearestSeed[current]!);
    const x = current % dims[0];
    const y = Math.floor(current / dims[0]) % dims[1];
    const z = Math.floor(current / (dims[0] * dims[1]));
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= dims[0] || ny >= dims[1] || nz >= dims[2]) continue;
          const next = cellIndex(nx, ny, nz);
          if (outside[next]) continue;
          const candidate = distance(centerOf(next), seed);
          if (candidate >= seedDistance[next]! - 1e-12) continue;
          seedDistance[next] = candidate;
          nearestSeed[next] = nearestSeed[current]!;
          frontier.push(next);
        }
      }
    }
  }
  const cells: Vec3[] = [];
  const depth: number[] = [];
  for (let index = 0; index < surface.length; index += 1) {
    if (outside[index]) continue;
    cells.push(centerOf(index));
    depth.push(Math.max(cell * 0.5, seedDistance[index]! - cell * 0.5));
  }
  const spheres =
    inscribedSpheres(cells, depth, cell, maxSpheres) ?? coveringSpheres(cells, cell, maxSpheres);
  // Surface samples sit up to half a cell beyond the cell centres.
  const margin = cell * 0.35;
  const capsules = spheres.map(({ center, radius }) => ({ a: center, b: center, radius: radius + margin }));
  const boundRadius = Math.max(...capsules.map(({ a, radius }) => Math.hypot(...a) + radius));
  return { boundRadius, capsules };
}

type Sphere = { center: Vec3; radius: number };

const MAX_SPHERE_CANDIDATES = 600;

/** Inscribed spheres must cover this share of the solid cells to be used. */
const INSCRIBED_COVERAGE = 0.985;

/**
 * Greedy medial spheres: each step adds the inscribed sphere (centre on a
 * solid cell, radius its depth) that covers the most uncovered cells. Chunky
 * shapes need few; null when the budget cannot cover a thin shape.
 */
function inscribedSpheres(
  cells: readonly Vec3[],
  depth: readonly number[],
  cell: number,
  maxSpheres: number,
): Sphere[] | null {
  const count = cells.length;
  const flat = new Float64Array(count * 3);
  cells.forEach((point, index) => flat.set(point, index * 3));
  // Candidate centres: the deepest cells plus an even spread, so import stays
  // fast on large solids without losing the best medial centres.
  const byDepth = cells.map((_, index) => index).sort((a, b) => depth[b]! - depth[a]! || a - b);
  const stride = Math.max(1, Math.ceil(count / (MAX_SPHERE_CANDIDATES / 2)));
  const candidates = [
    ...new Set([
      ...byDepth.slice(0, MAX_SPHERE_CANDIDATES / 2),
      ...cells.map((_, index) => index).filter((index) => index % stride === 0),
    ]),
  ];
  const covered = new Uint8Array(count);
  let coveredCount = 0;
  const spheres: Sphere[] = [];
  const coversOf = (candidate: number, mark: boolean): number => {
    // Outer solid cells straddle the surface: a cell counts as covered within one cell of the sphere.
    const reach = depth[candidate]! + cell;
    const limit = reach * reach;
    const cx = flat[candidate * 3]!;
    const cy = flat[candidate * 3 + 1]!;
    const cz = flat[candidate * 3 + 2]!;
    let gain = 0;
    for (let index = 0; index < count; index += 1) {
      if (covered[index]) continue;
      const dx = flat[index * 3]! - cx;
      const dy = flat[index * 3 + 1]! - cy;
      const dz = flat[index * 3 + 2]! - cz;
      if (dx * dx + dy * dy + dz * dz > limit) continue;
      gain += 1;
      if (mark) covered[index] = 1;
    }
    return gain;
  };
  while (spheres.length < maxSpheres && coveredCount < count) {
    let best = -1;
    let bestGain = 0;
    for (const candidate of candidates) {
      const gain = coversOf(candidate, false);
      if (gain > bestGain) {
        bestGain = gain;
        best = candidate;
      }
    }
    if (best < 0) break;
    coveredCount += coversOf(best, true);
    // Depth runs to about half a cell inside the surface.
    spheres.push({ center: cells[best]!, radius: depth[best]! + cell * 0.5 });
  }
  if (coveredCount < count * INSCRIBED_COVERAGE) return null;
  // Close the last sliver by growing the nearest sphere just enough.
  const grown = spheres.map(({ center, radius }) => ({ center, radius }));
  cells.forEach((point, index) => {
    if (covered[index]) return;
    let best = 0;
    spheres.forEach((sphere, candidate) => {
      const gap = distance(point, sphere.center) - sphere.radius;
      if (gap < distance(point, spheres[best]!.center) - spheres[best]!.radius) best = candidate;
    });
    grown[best]!.radius = Math.max(grown[best]!.radius, distance(point, spheres[best]!.center) - cell * 0.5);
  });
  return grown;
}

/** Thin shapes: deterministic k-means over the cells, each sphere covering its cluster. */
function coveringSpheres(cells: readonly Vec3[], cell: number, maxSpheres: number): Sphere[] {
  const centers = clusterCells(cells, Math.min(maxSpheres, cells.length));
  const assignment = cells.map((point) => nearest(centers, point));
  return centers
    .map((center, cluster) => {
      let radius = 0;
      cells.forEach((point, index) => {
        if (assignment[index] === cluster) radius = Math.max(radius, distance(point, center));
      });
      return { center, radius: Math.max(radius, cell * 0.5) };
    })
    .filter((_, cluster) => assignment.includes(cluster));
}

function nearest(centers: readonly Vec3[], point: Vec3): number {
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const d = distance(center, point);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}

/** Deterministic k-means: farthest-point seeds, then a few Lloyd iterations. */
function clusterCells(cells: readonly Vec3[], count: number): Vec3[] {
  if (count <= 0) return [];
  const centers: Vec3[] = [cells[0]!];
  const gap = cells.map((point) => distance(point, cells[0]!));
  while (centers.length < count) {
    let far = 0;
    gap.forEach((value, index) => {
      if (value > gap[far]!) far = index;
    });
    centers.push(cells[far]!);
    cells.forEach((point, index) => {
      gap[index] = Math.min(gap[index]!, distance(point, cells[far]!));
    });
  }
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    cells.forEach((point) => {
      const sum = sums[nearest(centers, point)]!;
      sum[0]! += point[0];
      sum[1]! += point[1];
      sum[2]! += point[2];
      sum[3]! += 1;
    });
    sums.forEach((sum, index) => {
      if (sum[3]! > 0) centers[index] = [sum[0]! / sum[3]!, sum[1]! / sum[3]!, sum[2]! / sum[3]!];
    });
  }
  return centers;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---- cluster-physics ----
// Physics: the values that change how the pile moves (see CONTEXT.md).
// Built only by `physicsOf` and compared only with `samePhysics`, so the
// simulation, sequences, takes and the engine share one definition.


/**
 * The uploaded asset's collision, one shape per dealt object. Compared by key:
 * the same source document always fits the same shapes.
 */
type ClusterAssetPhysics = Readonly<{
  collisions: readonly ClusterCollisionShape[];
  key: string;
}>;

type ClusterPhysics = Readonly<{
  /** Frame width / height, rounded to 0.001; the pull weakens along the long axis. */
  aspect: number;
  /** Set only while Shape is "uploaded" and the asset is ready; null uses built-in pieces. */
  asset: ClusterAssetPhysics | null;
  cohesion: number;
  count: number;
  /** Linear damping per second; spin damping scales with it. */
  damping: number;
  /** Push strength by normalized distance from the cursor (monotone curve). */
  pushFalloff: readonly ClusterCurvePoint[];
  /** Push reach at size 1, in world units. */
  pushRadius: number;
  pushStrength: number;
  shape: ClusterShape;
  size: number;
}>;

/** Every Physics field; `samePhysics` compares exactly these. */
const PHYSICS_FIELDS = [
  "aspect",
  "asset",
  "cohesion",
  "count",
  "damping",
  "pushFalloff",
  "pushRadius",
  "pushStrength",
  "shape",
  "size",
] as const;

// Adding a field to ClusterPhysics without listing it (or the reverse) fails typecheck.
type ListedFields = (typeof PHYSICS_FIELDS)[number];
const fieldsMatchType: [Exclude<keyof ClusterPhysics, ListedFields>, Exclude<ListedFields, keyof ClusterPhysics>] extends [never, never]
  ? true
  : never = true;
void fieldsMatchType;

/**
 * Preview CSS and export frame sizes differ by float noise; rounding once here
 * keeps live play, takes, preview and export on bit-identical physics.
 */
function roundClusterAspect(aspect: number): number {
  return Math.round(aspect * 1000) / 1000;
}

/** The settings Physics is built from. */
type ClusterPhysicsSettings = Pick<
  ClusterSettings,
  "cohesion" | "count" | "damping" | "pushFalloff" | "pushRadius" | "pushStrength" | "shape" | "size"
>;

function physicsOf(
  settings: ClusterPhysicsSettings,
  aspect: number,
  asset: ClusterAssetPhysics | null = null,
): ClusterPhysics {
  return {
    aspect: roundClusterAspect(aspect),
    asset: settings.shape === "uploaded" && asset && asset.collisions.length > 0 ? asset : null,
    cohesion: settings.cohesion,
    count: settings.count,
    damping: settings.damping,
    pushFalloff: settings.pushFalloff.map(({ x, y }) => ({ x, y })),
    pushRadius: settings.pushRadius,
    pushStrength: settings.pushStrength,
    shape: settings.shape,
    size: settings.size,
  };
}

function samePoints(a: readonly ClusterCurvePoint[], b: readonly ClusterCurvePoint[]): boolean {
  return a.length === b.length && a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y);
}

function samePhysics(a: ClusterPhysics, b: ClusterPhysics): boolean {
  return PHYSICS_FIELDS.every((field) =>
    field === "pushFalloff"
      ? samePoints(a.pushFalloff, b.pushFalloff)
      : field === "asset"
        ? (a.asset?.key ?? null) === (b.asset?.key ?? null)
        : a[field] === b[field],
  );
}

// ---- cluster-part-material ----
// Materials of uploaded asset parts. The "Part material" panel fields always
// edit one material: the selected part's, or the whole asset's when no part
// is selected. Every other part keeps its own record in the Asset objects
// value, or follows the whole-asset one. Selecting another part swaps the
// fields in and out in one change (`swapClusterPartSelection`), so there is no
// second copy to keep in sync.

const clusterPartMaterialTargets = {
  clearcoat: "part.clearcoat",
  color: "part.color",
  colorSource: "part.colorSource",
  detail: "part.detail",
  effect: "part.effect",
  effectCode: "part.effectCode",
  effectColor: "part.effectColor",
  effectIntensity: "part.effectIntensity",
  effectScale: "part.effectScale",
  emissive: "part.emissive",
  metalness: "part.metalness",
  mode: "part.mode",
  opacity: "part.opacity",
  roughness: "part.roughness",
  shading: "part.shading",
  transmission: "part.transmission",
} as const;

/** Shader effects layered on a part's material (after lighting). */
const clusterPartEffects = [
  "none",
  "fresnel",
  "gradient",
  "noise",
  "holographic",
  "outline",
  "custom",
] as const;
type ClusterPartEffect = (typeof clusterPartEffects)[number];

const clusterPartEffectLabels: Readonly<Record<ClusterPartEffect, string>> = {
  custom: "Custom GLSL",
  fresnel: "Fresnel glow",
  gradient: "Gradient",
  holographic: "Holographic",
  noise: "Noise",
  none: "None",
  outline: "Toon outline",
};

/** Effects that move over time (whole cycles per timeline loop). */
function isClusterPartEffectAnimated(effect: ClusterPartEffect, code = ""): boolean {
  // A custom snippet moves only when it reads loopPhase or loopTime.
  if (effect === "custom") return /\bloop(Phase|Time)\b/.test(code);
  return effect === "noise" || effect === "holographic";
}

type ClusterPartMaterial = Readonly<{
  clearcoat: number;
  /** Uppercase #RRGGBB (Toolcraft colour value). */
  color: string;
  /** Fixed colour, or cycle the Light/Dark/Accent palette across copies. */
  colorSource: "fixed" | "palette";
  /** Panel detail level only; it does not change the look. */
  detail: "advanced" | "simple";
  /** Shader effect on top of the lit material (Original or Custom). */
  effect: ClusterPartEffect;
  /** Custom GLSL: the body of clusterCustomEffect(...), returning the colour. */
  effectCode: string;
  /** Uppercase #RRGGBB. */
  effectColor: string;
  effectIntensity: number;
  /** 0 to 1: effect detail (pattern frequency, rim width). */
  effectScale: number;
  /** Glow strength in the part's own colour. */
  emissive: number;
  metalness: number;
  /** Original keeps the authored material; Custom uses these fields. */
  mode: "custom" | "original";
  opacity: number;
  roughness: number;
  shading: "standard" | "toon";
  transmission: number;
}>;

/** Longest Custom GLSL snippet accepted (characters). */
const CLUSTER_CUSTOM_EFFECT_MAX_LENGTH = 8_000;

/** Starter snippet: moving bands on loopPhase, so a video loops seamlessly. */
const CLUSTER_CUSTOM_EFFECT_STARTER = `// Inputs: baseColor, localPosition, normal, viewDir,
// loopPhase (0 to 1 per timeline loop), loopTime (seconds),
// effectColor, intensity, scale. Return the final colour.
// Animate with loopPhase (whole cycles) so the video loops seamlessly.
float bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));
return mix(baseColor, effectColor, bands * intensity);`;

const CLUSTER_PART_MATERIAL_DEFAULT: ClusterPartMaterial = Object.freeze({
  clearcoat: 0,
  color: "#E4E4EA",
  colorSource: "fixed",
  detail: "simple",
  effect: "none",
  effectCode: CLUSTER_CUSTOM_EFFECT_STARTER,
  effectColor: "#7FE8FF",
  effectIntensity: 0.7,
  effectScale: 0.5,
  emissive: 0,
  metalness: 0,
  mode: "original",
  opacity: 1,
  roughness: 0.5,
  shading: "standard",
  transmission: 0,
});

/** Key of the whole-asset material record. */
const CLUSTER_WHOLE_ASSET_MATERIAL = "*";

function unit(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function hexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

/** Validates one stored material record. */
function readClusterPartMaterialRecord(value: unknown): ClusterPartMaterial {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const fallback = CLUSTER_PART_MATERIAL_DEFAULT;
  return {
    clearcoat: unit(record.clearcoat, fallback.clearcoat),
    color: hexColor(record.color, fallback.color),
    colorSource: oneOf(record.colorSource, ["fixed", "palette"], fallback.colorSource),
    detail: oneOf(record.detail, ["advanced", "simple"], fallback.detail),
    effect: oneOf(record.effect, clusterPartEffects, fallback.effect),
    effectCode:
      typeof record.effectCode === "string"
        ? record.effectCode.slice(0, CLUSTER_CUSTOM_EFFECT_MAX_LENGTH)
        : fallback.effectCode,
    effectColor: hexColor(record.effectColor, fallback.effectColor),
    effectIntensity: unit(record.effectIntensity, fallback.effectIntensity),
    effectScale: unit(record.effectScale, fallback.effectScale),
    emissive: unit(record.emissive, fallback.emissive),
    metalness: unit(record.metalness, fallback.metalness),
    mode: oneOf(record.mode, ["custom", "original"], fallback.mode),
    opacity: unit(record.opacity, fallback.opacity),
    roughness: unit(record.roughness, fallback.roughness),
    shading: oneOf(record.shading, ["standard", "toon"], fallback.shading),
    transmission: unit(record.transmission, fallback.transmission),
  };
}

/** The material the panel fields currently hold. */
function readClusterPartMaterial(values: Readonly<Record<string, unknown>>): ClusterPartMaterial {
  return readClusterPartMaterialRecord(
    Object.fromEntries(
      Object.entries(clusterPartMaterialTargets).map(([field, target]) => [field, values[target]]),
    ),
  );
}

/** Panel values for a material (for `controls.apply`). */
function clusterPartMaterialValues(material: ClusterPartMaterial): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(clusterPartMaterialTargets).map(([field, target]) => [
      target,
      material[field as keyof ClusterPartMaterial],
    ]),
  );
}

const clusterPartMaterialPresets = ["matte", "plastic", "metal", "glass", "toon", "emissive"] as const;
type ClusterPartMaterialPreset = (typeof clusterPartMaterialPresets)[number];

const clusterPartMaterialPresetLabels: Readonly<Record<ClusterPartMaterialPreset, string>> = {
  emissive: "Emissive",
  glass: "Glass",
  matte: "Matte",
  metal: "Metal",
  plastic: "Plastic",
  toon: "Toon",
};

type PresetFields = Omit<
  ClusterPartMaterial,
  | "color"
  | "colorSource"
  | "detail"
  | "effect"
  | "effectCode"
  | "effectColor"
  | "effectIntensity"
  | "effectScale"
  | "mode"
>;

const PRESET_FIELDS: Readonly<Record<ClusterPartMaterialPreset, PresetFields>> = {
  emissive: { clearcoat: 0, emissive: 1, metalness: 0, opacity: 1, roughness: 0.5, shading: "standard", transmission: 0 },
  glass: { clearcoat: 0.4, emissive: 0, metalness: 0, opacity: 1, roughness: 0.05, shading: "standard", transmission: 1 },
  matte: { clearcoat: 0, emissive: 0, metalness: 0, opacity: 1, roughness: 0.9, shading: "standard", transmission: 0 },
  metal: { clearcoat: 0, emissive: 0, metalness: 1, opacity: 1, roughness: 0.25, shading: "standard", transmission: 0 },
  plastic: { clearcoat: 0.6, emissive: 0, metalness: 0, opacity: 1, roughness: 0.35, shading: "standard", transmission: 0 },
  toon: { clearcoat: 0, emissive: 0, metalness: 0, opacity: 1, roughness: 0.5, shading: "toon", transmission: 0 },
};

/** A preset as a starting point: its fields, keeping the colour, colour source, effect and detail level. */
function clusterPartMaterialPreset(
  preset: ClusterPartMaterialPreset,
  current: ClusterPartMaterial,
): ClusterPartMaterial {
  return {
    ...PRESET_FIELDS[preset],
    color: current.color,
    colorSource: current.colorSource,
    detail: current.detail,
    effect: current.effect,
    effectCode: current.effectCode,
    effectColor: current.effectColor,
    effectIntensity: current.effectIntensity,
    effectScale: current.effectScale,
    mode: "custom",
  };
}

/** The part fields of the Asset objects value this module reads and writes. */
type ClusterPartMaterialView = Readonly<{
  materials: Readonly<Record<string, ClusterPartMaterial>>;
  /** Selected part id, or null when the fields edit the whole asset. */
  selectedPart: string | null;
}>;

function editedKey(view: ClusterPartMaterialView): string {
  return view.selectedPart ?? CLUSTER_WHOLE_ASSET_MATERIAL;
}

/** Whole-asset material: the fields while no part is selected, else its stored record. */
function wholeAssetMaterial(view: ClusterPartMaterialView, fields: ClusterPartMaterial): ClusterPartMaterial {
  return view.selectedPart === null
    ? fields
    : (view.materials[CLUSTER_WHOLE_ASSET_MATERIAL] ?? CLUSTER_PART_MATERIAL_DEFAULT);
}

/** Material of part `partId`: the fields when edited, its own record, or the whole-asset one. */
function clusterPartMaterialOf(
  view: ClusterPartMaterialView,
  fields: ClusterPartMaterial,
  partId: string,
): ClusterPartMaterial {
  if (view.selectedPart === partId) return fields;
  return view.materials[partId] ?? wholeAssetMaterial(view, fields);
}

function sameMaterial(a: ClusterPartMaterial, b: ClusterPartMaterial): boolean {
  return (Object.keys(a) as (keyof ClusterPartMaterial)[]).every(
    (field) => field === "detail" || a[field] === b[field],
  );
}

/**
 * Moves the panel fields to another part (or to the whole asset with null):
 * the edited material is stored under its key (a part equal to the whole
 * asset stores nothing and keeps following it), and the next one is loaded.
 */
function swapClusterPartSelection<View extends ClusterPartMaterialView>(
  view: View,
  fields: ClusterPartMaterial,
  nextPart: string | null,
): Readonly<{ fields: ClusterPartMaterial; view: View }> {
  const materials: Record<string, ClusterPartMaterial> = { ...view.materials };
  const key = editedKey(view);
  if (key === CLUSTER_WHOLE_ASSET_MATERIAL) {
    materials[key] = fields;
  } else if (sameMaterial(fields, materials[CLUSTER_WHOLE_ASSET_MATERIAL] ?? CLUSTER_PART_MATERIAL_DEFAULT)) {
    delete materials[key];
  } else {
    materials[key] = fields;
  }
  const next = { ...view, materials, selectedPart: nextPart };
  const loaded =
    nextPart === null
      ? (materials[CLUSTER_WHOLE_ASSET_MATERIAL] ?? CLUSTER_PART_MATERIAL_DEFAULT)
      : (materials[nextPart] ?? materials[CLUSTER_WHOLE_ASSET_MATERIAL] ?? CLUSTER_PART_MATERIAL_DEFAULT);
  // The panel's detail level is a view preference: keep it across parts.
  return { fields: { ...loaded, detail: fields.detail }, view: next };
}

// ---- cluster-asset-view ----
// Which objects and parts of the uploaded asset the pile deals. The view is
// one runtime value: overrides on top of the defaults (the first objects shown,
// every part shown), so hiding is non-destructive and Reset clears it, plus the
// object selected in the Asset list.


type ClusterAssetView = Readonly<{
  /** Document the overrides were made for; another asset ignores them. */
  assetKey: string | null;
  /** Material records keyed by part id, or "*" for the whole asset. */
  materials: Readonly<Record<string, ClusterPartMaterial>>;
  /** Object id (its node id) selected in the Asset list, or null. */
  selected: string | null;
  /** Part whose material the Part material fields edit, or null for the whole asset. */
  selectedPart: string | null;
  /** Show overrides keyed by object id or part id; absent ids use the defaults. */
  visibility: Readonly<Record<string, boolean>>;
}>;

const CLUSTER_ASSET_VIEW_DEFAULT: ClusterAssetView = Object.freeze({
  assetKey: null,
  materials: Object.freeze({}),
  selected: null,
  selectedPart: null,
  visibility: Object.freeze({}),
});

function clusterAssetPartId(objectId: string, partIndex: number): string {
  return `${objectId}/${partIndex}`;
}

/** Validates a stored value; anything malformed falls back to the defaults. */
function readClusterAssetView(value: unknown): ClusterAssetView {
  if (!value || typeof value !== "object") return CLUSTER_ASSET_VIEW_DEFAULT;
  const { assetKey, materials, selected, selectedPart, visibility } = value as {
    assetKey?: unknown;
    materials?: unknown;
    selected?: unknown;
    selectedPart?: unknown;
    visibility?: unknown;
  };
  const records: Record<string, ClusterPartMaterial> = {};
  if (materials && typeof materials === "object") {
    for (const [id, record] of Object.entries(materials)) {
      if (record && typeof record === "object") records[id] = readClusterPartMaterialRecord(record);
    }
  }
  const overrides: Record<string, boolean> = {};
  if (visibility && typeof visibility === "object") {
    for (const [id, shown] of Object.entries(visibility)) {
      if (typeof shown === "boolean") overrides[id] = shown;
    }
  }
  return {
    assetKey: typeof assetKey === "string" ? assetKey : null,
    materials: records,
    selected: typeof selected === "string" ? selected : null,
    selectedPart: typeof selectedPart === "string" ? selectedPart : null,
    visibility: overrides,
  };
}

/** The view as it applies to `asset`: overrides made for another document are dropped. */
function clusterScopedAssetView(asset: ClusterAsset, view: ClusterAssetView): ClusterAssetView {
  return viewFor(asset, view);
}

function viewFor(asset: ClusterAsset, view: ClusterAssetView): ClusterAssetView {
  // Overrides and selections made for another document do not apply.
  return view.assetKey === asset.key ? view : CLUSTER_ASSET_VIEW_DEFAULT;
}

function isClusterAssetObjectShown(object: ClusterAssetObject, view: ClusterAssetView): boolean {
  return view.visibility[object.nodeId] ?? object.shown;
}

function isClusterAssetPartShown(
  object: ClusterAssetObject,
  partIndex: number,
  view: ClusterAssetView,
): boolean {
  return view.visibility[clusterAssetPartId(object.nodeId, partIndex)] ?? true;
}

type ClusterDealtObject = Readonly<{
  object: ClusterAssetObject;
  /** Indices of the object's shown parts, ascending. */
  partIndices: readonly number[];
}>;

function dealtWith(asset: ClusterAsset, view: ClusterAssetView): ClusterDealtObject[] {
  return asset.objects
    .flatMap((object) => {
      if (!isClusterAssetObjectShown(object, view)) return [];
      const partIndices = object.parts.flatMap((_, index) =>
        isClusterAssetPartShown(object, index, view) ? [index] : [],
      );
      return partIndices.length > 0 ? [{ object, partIndices }] : [];
    })
    .slice(0, asset.shownLimit);
}

/**
 * Objects the pile deals: shown, with at least one shown part, in asset order,
 * at most `asset.shownLimit`. Overrides that would deal nothing (for example
 * stored for another file version) fall back to the defaults.
 */
function clusterDealtObjects(asset: ClusterAsset, view: ClusterAssetView): ClusterDealtObject[] {
  const dealt = dealtWith(asset, viewFor(asset, view));
  return dealt.length > 0 ? dealt : dealtWith(asset, CLUSTER_ASSET_VIEW_DEFAULT);
}

/** Stable text of the dealt set: piles, physics and caches change only with it. */
function clusterAssetViewSignature(asset: ClusterAsset, view: ClusterAssetView): string {
  return clusterDealtObjects(asset, view)
    .map(({ object, partIndices }) => `${object.nodeId}:${partIndices.join(",")}`)
    .join(";");
}

function selectClusterAssetObject(view: ClusterAssetView, objectId: string | null): ClusterAssetView {
  return { ...view, selected: objectId };
}

type ClusterAssetToggle = Readonly<{ refusal: string | null; view: ClusterAssetView }>;

/**
 * Shows or hides one object or part. Refuses (keeping the view) when nothing
 * would be left to deal, so the pile never empties.
 */
function toggleClusterAssetItem(
  asset: ClusterAsset,
  view: ClusterAssetView,
  id: string,
  shown: boolean,
): ClusterAssetToggle {
  const scoped = viewFor(asset, view);
  const next = { ...scoped, assetKey: asset.key, visibility: { ...scoped.visibility, [id]: shown } };
  if (!shown && dealtWith(asset, next).length === 0) {
    return { refusal: "Keep at least one visible part: the pile needs something to deal.", view };
  }
  const shownObjects = asset.objects.filter((object) => isClusterAssetObjectShown(object, next)).length;
  if (shown && shownObjects > asset.shownLimit) {
    return {
      refusal: `Show at most ${asset.shownLimit} objects at once: hide another object first.`,
      view,
    };
  }
  return { refusal: null, view: next };
}

/** Collision the simulation uses for an asset: one shape per dealt object (its shown parts), in deal order. */
function clusterAssetPhysics(
  asset: ClusterAsset | null,
  view: ClusterAssetView = CLUSTER_ASSET_VIEW_DEFAULT,
): ClusterAssetPhysics | null {
  if (!asset) return null;
  const dealt = clusterDealtObjects(asset, view);
  if (dealt.length === 0) return null;
  return {
    collisions: dealt.map(({ object, partIndices }) => object.collisionOf(partIndices)),
    key: assetPhysicsKey(asset, view),
  };
}

/**
 * Physics key: the document key while the defaults are dealt (takes recorded
 * before the object list existed still match), plus the dealt set otherwise.
 */
function assetPhysicsKey(asset: ClusterAsset, view: ClusterAssetView): string {
  const signature = clusterAssetViewSignature(asset, view);
  return signature === clusterAssetViewSignature(asset, CLUSTER_ASSET_VIEW_DEFAULT)
    ? asset.key
    : `${asset.key}|${signature}`;
}

type ClusterPartMaterials = Readonly<{
  /** Changes only when a dealt part's resolved material changes. */
  key: string;
  /** Changes only when a part's mode, shading, colour source, effect kind or GLSL changes (scene rebuild). */
  structureKey: string;
  materialOf: (partId: string) => ClusterPartMaterial;
}>;

/** Resolved materials of the dealt parts: Part material fields plus stored records. */
function clusterPartMaterials(
  asset: ClusterAsset,
  view: ClusterAssetView,
  fields: ClusterPartMaterial,
  /** Compile check of Custom GLSL; a failing snippet keys as one "invalid" state. */
  checkCustom: (code: string) => string | null | undefined = () => null,
): ClusterPartMaterials {
  const scoped = viewFor(asset, view);
  const materialOf = (partId: string) => clusterPartMaterialOf(scoped, fields, partId);
  const custom = clusterDealtObjects(asset, view).flatMap(({ object, partIndices }) =>
    partIndices.flatMap((index) => {
      const id = clusterAssetPartId(object.nodeId, index);
      const { detail: _detail, ...material } = materialOf(id);
      return material.mode === "custom" || material.effect !== "none" ? [[id, material] as const] : [];
    }),
  );
  // No Custom part: empty keys, equal to having no part materials at all.
  return {
    key: custom.length > 0 ? JSON.stringify(custom) : "",
    materialOf,
    structureKey:
      custom.length > 0
        ? JSON.stringify(
            custom.map(([id, material]) => [
              id,
              material.mode,
              material.shading,
              material.colorSource,
              material.effect,
              // A new compiling snippet needs a new program; failing ones all draw
              // the plain material, so typing through errors rebuilds only once.
              material.effect !== "custom"
                ? ""
                : checkCustom(material.effectCode) === null
                  ? material.effectCode
                  : "invalid",
            ]),
          )
        : "",
  };
}

/** The object owning part `partId`, resolved from the asset (ids may contain "/"). */
function clusterPartObjectId(asset: ClusterAsset, partId: string): string | null {
  for (const object of asset.objects) {
    if (object.parts.some((_, index) => clusterAssetPartId(object.nodeId, index) === partId)) {
      return object.nodeId;
    }
  }
  return null;
}

// ---- cluster-part-effect ----
// Shader effects layered on uploaded part materials. The effect runs after
// three's lighting (`opaque_fragment`), so the part stays lit and shadowed.
// The effect kind is a compile-time define (one program per kind); colour,
// intensity, scale and the loop phase are uniforms, so field edits update in
// place. Animated effects move by whole cycles of the loop phase (0 to 1 per
// timeline loop), so exported video loops seamlessly.



const EFFECT_IDS: Readonly<Record<ClusterPartEffect, number>> = {
  custom: 6,
  fresnel: 1,
  gradient: 2,
  holographic: 4,
  noise: 3,
  none: 0,
  outline: 5,
};

/** The loop phase uniform every effect material of a scene shares. */
type ClusterLoopPhase = { value: number };

function createClusterLoopPhase(): ClusterLoopPhase {
  return { value: 0 };
}

type EffectUniforms = Readonly<{
  uClusterEffectColor: { value: THREE.Color };
  uClusterEffectIntensity: { value: number };
  uClusterEffectScale: { value: number };
  uClusterLoopPhase: ClusterLoopPhase;
  uClusterLoopSeconds: ClusterLoopPhase;
}>;

/** The fixed signature a Custom GLSL snippet is the body of. */
const CUSTOM_SIGNATURE =
  "vec3 clusterCustomEffect(vec3 baseColor, vec3 localPosition, vec3 normal, vec3 viewDir, " +
  "float loopPhase, float loopTime, vec3 effectColor, float intensity, float scale)";

function customFunction(code: string): string {
  return `${CUSTOM_SIGNATURE} {\n${code}\n}\n`;
}

/** Result when no WebGL context could check a snippet (never cached). */
const CLUSTER_SHADER_UNCHECKED = "The shader could not be checked (no WebGL).";

/** Minimal WebGL surface the snippet check needs (the live renderer's context). */
type ClusterShaderCompiler = Readonly<{
  COMPILE_STATUS: number;
  FRAGMENT_SHADER: number;
  compileShader(shader: never): void;
  createShader(type: number): unknown;
  deleteShader(shader: never): void;
  getShaderInfoLog(shader: never): string | null;
  getShaderParameter(shader: never, name: number): unknown;
  shaderSource(shader: never, source: string): void;
}>;

/**
 * Compiles a Custom GLSL snippet alone (its function plus a tiny main) and
 * returns the compiler log, or null when it compiles. A failing snippet never
 * reaches a part material, so the part keeps its own look.
 */
function checkClusterCustomEffect(gl: ClusterShaderCompiler, code: string): string | null {
  // The snippet is a function body: it must not close the function early.
  let depth = 0;
  for (const character of code) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) return "Unbalanced braces: the snippet closes the function early.";
  }
  if (depth !== 0) return "Unbalanced braces: a { is never closed.";
  const shader = gl.createShader(gl.FRAGMENT_SHADER) as never;
  if (!shader) return CLUSTER_SHADER_UNCHECKED;
  const prefix = "#version 300 es\nprecision highp float;\nout vec4 clusterOut;\n" + HELPERS + CUSTOM_SIGNATURE + " {\n";
  try {
    gl.shaderSource(
      shader,
      prefix +
        code +
        "\n}\n" +
        "void main() { clusterOut = vec4(clusterCustomEffect(vec3(0.5), vec3(0.0), vec3(0.0, 0.0, 1.0), " +
        "vec3(0.0, 0.0, 1.0), 0.0, 0.0, vec3(1.0), 1.0, 0.5), 1.0); }\n",
    );
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    const log = (gl.getShaderInfoLog(shader) ?? "").trim() || "The shader did not compile.";
    // Report lines of the user's snippet, not of the wrapped source.
    const offset = prefix.split("\n").length - 1;
    return log.replace(/\b0:(\d+):/g, (_match, line: string) => `line ${Math.max(1, Number(line) - offset)}:`);
  } finally {
    gl.deleteShader(shader);
  }
}

const VERTEX_HEAD = "varying vec3 vClusterLocal;\n";

/** Noise helpers shared by the built-in effects and Custom GLSL snippets. */
const HELPERS = /* glsl */ `
const float CLUSTER_TAU = 6.28318530718;

float clusterHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float clusterNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(clusterHash(i), clusterHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(clusterHash(i + vec3(0.0, 1.0, 0.0)), clusterHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(clusterHash(i + vec3(0.0, 0.0, 1.0)), clusterHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(clusterHash(i + vec3(0.0, 1.0, 1.0)), clusterHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uClusterEffectColor;
uniform float uClusterEffectIntensity;
uniform float uClusterEffectScale;
uniform float uClusterLoopPhase;
uniform float uClusterLoopSeconds;
varying vec3 vClusterLocal;
${HELPERS}
vec3 clusterEffect(vec3 color, vec3 surfaceNormal, vec3 toCamera, vec3 shade) {
  // The per-copy shade (depth cue, highlight dimming) also dims the effect colour.
  vec3 tint = uClusterEffectColor * shade;
  float facing = clamp(dot(normalize(surfaceNormal), normalize(toCamera)), 0.0, 1.0);
  float rim = 1.0 - facing;
#if CLUSTER_EFFECT == 1
  float glow = pow(rim, mix(5.0, 1.5, uClusterEffectScale));
  return color + tint * glow * uClusterEffectIntensity * 2.0;
#elif CLUSTER_EFFECT == 2
  float t = clamp(vClusterLocal.y * mix(0.5, 2.5, uClusterEffectScale) * 0.5 + 0.5, 0.0, 1.0);
  return mix(color, tint * (0.35 + 0.65 * facing), t * uClusterEffectIntensity);
#elif CLUSTER_EFFECT == 3
  float angle = CLUSTER_TAU * uClusterLoopPhase;
  vec3 p = vClusterLocal * mix(2.0, 12.0, uClusterEffectScale) + vec3(cos(angle), sin(angle), 0.0) * 1.5;
  float speckle = smoothstep(0.45, 0.75, clusterNoise(p));
  return mix(color, tint, speckle * uClusterEffectIntensity);
#elif CLUSTER_EFFECT == 4
  float band = 0.5 + 0.5 * sin(CLUSTER_TAU * (vClusterLocal.y * mix(2.0, 14.0, uClusterEffectScale) - uClusterLoopPhase));
  vec3 iridescence = 0.5 + 0.5 * cos(CLUSTER_TAU * (vec3(0.0, 0.33, 0.67) + rim * 0.8 + band * 0.25 + uClusterLoopPhase));
  vec3 holo = mix(iridescence, tint, 0.35) * (0.4 + 0.6 * band) + rim * tint;
  return mix(color, holo, uClusterEffectIntensity * (0.35 + 0.65 * rim));
#elif CLUSTER_EFFECT == 6
  vec3 custom = clusterCustomEffect(color, vClusterLocal, normalize(surfaceNormal), normalize(toCamera),
    uClusterLoopPhase, uClusterLoopPhase * uClusterLoopSeconds, tint, uClusterEffectIntensity, uClusterEffectScale);
  return custom;
#elif CLUSTER_EFFECT == 5
  float width = mix(0.15, 0.5, uClusterEffectScale);
  float edge = 1.0 - smoothstep(width - 0.08, width, facing);
  return mix(color, tint, edge * uClusterEffectIntensity);
#else
  return color;
#endif
}
`;

function uniformsOf(material: THREE.Material): EffectUniforms | undefined {
  return material.userData.clusterEffect as EffectUniforms | undefined;
}

/**
 * Adds `record.effect` to `material` (no-op for "none"). Call once on a fresh
 * or cloned material; later field edits go through `updateClusterPartEffect`.
 */
function applyClusterPartEffect(
  material: THREE.Material,
  record: ClusterPartMaterial,
  phase: ClusterLoopPhase,
  /** Compiler log of a Custom GLSL snippet, or null when it compiles. */
  checkCustom: (code: string) => string | null = () => "No shader check available.",
  loopSeconds: ClusterLoopPhase = { value: 8 },
): void {
  const id = EFFECT_IDS[record.effect];
  // A snippet that does not compile leaves the part's material as it is.
  if (record.effect === "custom" && checkCustom(record.effectCode) !== null) return;
  // Effects need a lit material (surface normal and view direction).
  const lit =
    material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshToonMaterial;
  if (id === 0 || !lit) return;
  const uniforms: EffectUniforms = {
    uClusterEffectColor: { value: new THREE.Color(record.effectColor) },
    uClusterEffectIntensity: { value: record.effectIntensity },
    uClusterEffectScale: { value: record.effectScale },
    uClusterLoopPhase: phase,
    uClusterLoopSeconds: loopSeconds,
  };
  const custom = record.effect === "custom" ? customFunction(record.effectCode) : "";
  // The whole snippet keys the program: two snippets never share one.
  const cacheKey = record.effect === "custom" ? `${id}-${record.effectCode}` : `${id}`;
  material.userData.clusterEffect = uniforms;
  material.defines = { ...material.defines, CLUSTER_EFFECT: id };
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|cluster-effect-${cacheKey}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      VERTEX_HEAD +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvClusterLocal = transformed;",
      );
    shader.fragmentShader =
      FRAGMENT_HEAD.replace("vec3 clusterEffect(", `${custom}vec3 clusterEffect(`) +
      shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        "#include <opaque_fragment>\n" +
          "#ifdef USE_INSTANCING_COLOR\n" +
          "gl_FragColor.rgb = clusterEffect(gl_FragColor.rgb, normal, vViewPosition, vColor);\n" +
          "#else\n" +
          "gl_FragColor.rgb = clusterEffect(gl_FragColor.rgb, normal, vViewPosition, vec3(1.0));\n" +
          "#endif",
      );
  };
}

/** Writes the effect fields to an effect material's uniforms (same effect kind). */
function updateClusterPartEffect(material: THREE.Material, record: ClusterPartMaterial): void {
  const uniforms = uniformsOf(material);
  if (!uniforms) return;
  uniforms.uClusterEffectColor.value.set(record.effectColor);
  uniforms.uClusterEffectIntensity.value = record.effectIntensity;
  uniforms.uClusterEffectScale.value = record.effectScale;
}

// ---- cluster-geometry ----
// Dimensions are shared with cluster-collision so the capsules that collide
// follow exactly what is drawn.
const INNER_RADIUS = 0.13;
const BEVEL = 0.035;
const SOCKET_DEPTH = 0.5;
const RADIAL_SEGMENTS = 40;

/**
 * One hollow arm along +Y: a tube with a bevelled rim and a bored socket,
 * like the pipe connectors in the reference.
 */
function createArm(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.0001, CLUSTER_ARM_LENGTH - SOCKET_DEPTH),
    new THREE.Vector2(INNER_RADIUS, CLUSTER_ARM_LENGTH - SOCKET_DEPTH),
    new THREE.Vector2(INNER_RADIUS, CLUSTER_ARM_LENGTH - BEVEL * 0.4),
    new THREE.Vector2(INNER_RADIUS + BEVEL * 0.6, CLUSTER_ARM_LENGTH),
    new THREE.Vector2(CLUSTER_ARM_RADIUS - BEVEL, CLUSTER_ARM_LENGTH),
    new THREE.Vector2(CLUSTER_ARM_RADIUS - BEVEL * 0.3, CLUSTER_ARM_LENGTH - BEVEL * 0.3),
    new THREE.Vector2(CLUSTER_ARM_RADIUS, CLUSTER_ARM_LENGTH - BEVEL),
    new THREE.Vector2(CLUSTER_ARM_RADIUS, 0),
  ];
  // Reverse so faces point outward (lathe winds by point order).
  const geometry = new THREE.LatheGeometry(profile.reverse(), RADIAL_SEGMENTS);
  return geometry;
}

function armAlong(direction: THREE.Vector3): THREE.BufferGeometry {
  const arm = createArm();
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  arm.applyQuaternion(rotation);
  return arm;
}

function hub(radius: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(radius, RADIAL_SEGMENTS, 24);
}

function connector(directions: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const parts = [hub(CLUSTER_HUB_RADIUS), ...directions.map(armAlong)];
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("Connector geometry could not be merged.");
  return merged;
}

function tube(): THREE.BufferGeometry {
  const up = armAlong(new THREE.Vector3(0, 1, 0));
  const down = armAlong(new THREE.Vector3(0, -1, 0));
  const merged = mergeGeometries([up, down], false);
  up.dispose();
  down.dispose();
  if (!merged) throw new Error("Tube geometry could not be merged.");
  return merged;
}

function ring(): THREE.BufferGeometry {
  return new THREE.TorusGeometry(CLUSTER_RING_RADIUS, CLUSTER_ARM_RADIUS, 32, 72);
}

/** Closed vase profile (axis to axis), so the lathe is a solid piece. */
const LATHE_PROFILE: readonly [number, number][] = [
  [0, -0.95],
  [0.55, -0.95],
  [0.7, -0.6],
  [0.45, -0.1],
  [0.3, 0.35],
  [0.45, 0.8],
  [0.3, 0.85],
  [0, 0.85],
];

function lathe(): THREE.BufferGeometry {
  // Points run bottom to top so the lathe winds its faces outward.
  const points = LATHE_PROFILE.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(points, RADIAL_SEGMENTS);
}

function star(): THREE.BufferGeometry {
  const { depth, inner, outer, points } = CLUSTER_STAR;
  const outline = new THREE.Shape();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = Math.PI / 2 + (index * Math.PI) / points;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) outline.moveTo(x, y);
    else outline.lineTo(x, y);
  }
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, {
    bevelSegments: 2,
    bevelSize: 0.06,
    bevelThickness: 0.08,
    depth,
  });
  // Extrusion runs from z = 0 to depth; centre it on the body.
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** Tube along the shared curved centre line, closed with round end caps. */
function curvedTube(): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3(
    Array.from({ length: 33 }, (_, index) =>
      new THREE.Vector3(...clusterCurvedTubePoint(index / 32)),
    ),
  );
  const parts = [
    new THREE.TubeGeometry(path, 64, CLUSTER_CURVED_TUBE_RADIUS, 20, false),
    ...[0, 1].map((end) =>
      new THREE.SphereGeometry(CLUSTER_CURVED_TUBE_RADIUS, 20, 12).translate(
        ...clusterCurvedTubePoint(end),
      ),
    ),
  ];
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("Curved tube geometry could not be merged.");
  return merged;
}

function bipyramid(): THREE.BufferGeometry {
  // Apexes 0 (top) and 1 (bottom) joined to the equator triangle 2-3-4.
  const indices = [0, 3, 2, 0, 4, 3, 0, 2, 4, 1, 2, 3, 1, 3, 4, 1, 4, 2];
  return new THREE.PolyhedronGeometry(
    CLUSTER_BIPYRAMID_VERTICES.flat(),
    indices,
    CLUSTER_BIPYRAMID_RADIUS,
    0,
  );
}

const axis = {
  nx: new THREE.Vector3(-1, 0, 0),
  ny: new THREE.Vector3(0, -1, 0),
  nz: new THREE.Vector3(0, 0, -1),
  px: new THREE.Vector3(1, 0, 0),
  py: new THREE.Vector3(0, 1, 0),
  pz: new THREE.Vector3(0, 0, 1),
};

function createClusterGeometry(shape: ClusterPieceShape): THREE.BufferGeometry {
  switch (shape) {
    case "six-way":
      return connector([axis.px, axis.nx, axis.py, axis.ny, axis.pz, axis.nz]);
    case "four-way":
      return connector([axis.px, axis.nx, axis.py, axis.ny]);
    case "corner":
      return connector([axis.px, axis.py, axis.pz]);
    case "tube":
      return tube();
    case "ring":
      return ring();
    case "box":
      return new THREE.BoxGeometry(1.5, 1.5, 1.5);
    case "capsule":
      return new THREE.CapsuleGeometry(0.45, 1.3, 8, 24);
    case "cone":
      return new THREE.ConeGeometry(0.7, 1.8, RADIAL_SEGMENTS);
    case "cylinder":
      return new THREE.CylinderGeometry(0.62, 0.62, 1.7, RADIAL_SEGMENTS);
    case "sphere":
      return new THREE.SphereGeometry(0.95, RADIAL_SEGMENTS, 24);
    case "tetrahedron":
      return new THREE.TetrahedronGeometry(CLUSTER_TETRAHEDRON_RADIUS);
    case "octahedron":
      return new THREE.OctahedronGeometry(CLUSTER_OCTAHEDRON_RADIUS);
    case "dodecahedron":
      return new THREE.DodecahedronGeometry(1);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(1);
    case "polyhedron":
      return bipyramid();
    case "torus":
      return new THREE.TorusGeometry(CLUSTER_TORUS.radius, CLUSTER_TORUS.tube, 24, 72);
    case "torus-knot":
      return new THREE.TorusKnotGeometry(
        CLUSTER_TORUS_KNOT.radius,
        CLUSTER_TORUS_KNOT.tube,
        160,
        16,
        CLUSTER_TORUS_KNOT.p,
        CLUSTER_TORUS_KNOT.q,
      );
    case "curved-tube":
      return curvedTube();
    case "lathe":
      return lathe();
    case "extrude":
      return star();
  }
}

/** Geometry for every piece shape a pile uses, keyed by piece shape. */
/** One drawn part: geometry plus its authored material, or null for the palette slots. */
type ClusterPilePart = Readonly<{
  geometry: THREE.BufferGeometry;
  /** Uploaded part id (object node id / part index); built-in pieces have none. */
  id?: string;
  material: THREE.Material | THREE.Material[] | null;
}>;

/** One piece kind of a pile: a built-in shape or an uploaded object. */
type ClusterPileKind = Readonly<{ parts: readonly ClusterPilePart[] }>;

type ClusterPileGeometry = Readonly<{
  /** Releases the geometry this pile owns (uploaded parts belong to their asset). */
  dispose(): void;
  /** Identity for caches: the shape option, plus the asset instance when uploaded. */
  key: string;
  kinds: readonly ClusterPileKind[];
  /** Kind of body `index` (the same deal the simulation collides with). */
  kindOf(index: number): number;
}>;

/**
 * Pile geometry for a Shape option. "uploaded" deals the asset's shown objects
 * when a ready asset is given, else draws nothing (a model still loading shows
 * no stand-in pieces; the bodies keep simulating with a placeholder collision).
 */
function createClusterPileGeometry(
  shape: ClusterShape,
  asset: ClusterAsset | null = null,
  view: ClusterAssetView = CLUSTER_ASSET_VIEW_DEFAULT,
): ClusterPileGeometry {
  const dealt = shape === "uploaded" && asset ? clusterDealtObjects(asset, view) : [];
  if (asset && dealt.length > 0) {
    // The pile holds the asset (geometry and lease) until the pile is disposed,
    // so a renderer still drawing it never sees freed resources.
    const release = asset.retain();
    return {
      dispose: release,
      key: `uploaded:${asset.instance}|${clusterAssetViewSignature(asset, view)}`,
      kindOf: (index) => clusterDealIndex(index, dealt.length),
      kinds: dealt.map(({ object, partIndices }) => ({
        parts: partIndices.map((index) => ({
          ...object.parts[index]!,
          id: clusterAssetPartId(object.nodeId, index),
        })),
      })),
    };
  }
  if (shape === "uploaded") {
    return { dispose: () => undefined, key: shape, kindOf: () => -1, kinds: [] };
  }
  const pieces = clusterPileShapes(shape);
  const geometries = pieces.map((piece) => createClusterGeometry(piece));
  return {
    dispose: () => geometries.forEach((geometry) => geometry.dispose()),
    key: shape,
    kindOf: (index) => pieces.indexOf(clusterPieceShape(shape, index)),
    kinds: geometries.map((geometry) => ({ parts: [{ geometry, material: null }] })),
  };
}

// ---- cluster-drift ----
// Idle drift: a slow, subtle per-piece offset (travel + turn) added on top of
// the physics pose when drawing. Purely visual: the simulation, takes and
// collisions never see it. A pure function of piece index and time, with
// every frequency snapped to whole cycles per timeline loop, so a video of
// the loop stitches seamlessly.


type ClusterDrift = Readonly<{
  /** 0 = off, 1 = full strength. */
  amount: number;
  /** Timeline duration; drift repeats exactly after it. */
  loopSeconds: number;
  /** Tempo in cycles per second before snapping to the loop. */
  speed: number;
}>;

type ClusterDriftOffset = Readonly<{
  /** Small rotation angles around x, y, z (radians). */
  rotation: readonly [number, number, number];
  /** World-space translation. */
  translation: readonly [number, number, number];
}>;

/** Travel at amount 1, in world units per unit of piece size. */
const CLUSTER_DRIFT_MAX_TRAVEL = 0.1;
/** Turn at amount 1, in radians (about 9 degrees). */
const CLUSTER_DRIFT_MAX_TURN = 0.16;

/** Deterministic 0..1 value per piece and channel (integer hash). */
function seeded(index: number, channel: number): number {
  let hash = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** One channel: a sine with a seeded phase and a seeded rate, whole cycles per loop. */
function wave(index: number, channel: number, timeSeconds: number, drift: ClusterDrift): number {
  const loop = Math.max(1e-3, drift.loopSeconds);
  const rate = 0.7 + 0.6 * seeded(index, channel * 2);
  const cycles = Math.max(1, Math.round(drift.speed * rate * loop));
  const phase = 2 * Math.PI * seeded(index, channel * 2 + 1);
  return Math.sin((2 * Math.PI * cycles * timeSeconds) / loop + phase);
}

function clusterDriftOffset(
  index: number,
  timeSeconds: number,
  drift: ClusterDrift,
  size: number,
): ClusterDriftOffset {
  const travel = drift.amount * CLUSTER_DRIFT_MAX_TRAVEL * size;
  const turn = drift.amount * CLUSTER_DRIFT_MAX_TURN;
  if (travel === 0 && turn === 0) return { rotation: [0, 0, 0], translation: [0, 0, 0] };
  return {
    rotation: [
      turn * wave(index, 3, timeSeconds, drift),
      turn * wave(index, 4, timeSeconds, drift),
      turn * wave(index, 5, timeSeconds, drift),
    ],
    translation: [
      travel * wave(index, 0, timeSeconds, drift),
      travel * wave(index, 1, timeSeconds, drift),
      travel * wave(index, 2, timeSeconds, drift),
    ],
  };
}

function clusterDriftOf(
  settings: Pick<ClusterSettings, "driftAmount" | "driftSpeed">,
  loopSeconds: number,
): ClusterDrift {
  return { amount: settings.driftAmount, loopSeconds, speed: settings.driftSpeed };
}

// ---- cluster-falloff ----
const BAKED_PUSH_FALLOFF = [0,0.0026359,0.0052665,0.0078919,0.0105122,0.0131272,0.015737,0.0183416,0.020941,0.0235352,0.0261242,0.0287079,0.0312865,0.0338599,0.036428,0.038991,0.0415487,0.0441013,0.0466486,0.0491908,0.0517277,0.0542594,0.056786,0.0593073,0.0618234,0.0643344,0.0668401,0.0693406,0.0718359,0.0743261,0.076811,0.0792907,0.0817652,0.0842346,0.0866987,0.0891576,0.0916113,0.0940599,0.0965032,0.0989414,0.1013743,0.103802,0.1062246,0.108642,0.1110541,0.1134611,0.1158628,0.1182594,0.1206508,0.123037,0.125418,0.1277938,0.1301644,0.1325298,0.13489,0.1372451,0.1395949,0.1419396,0.144279,0.1466133,0.1489424,0.1512663,0.153585,0.1558985,0.1582068,0.1605099,0.1628079,0.1651006,0.1673882,0.1696706,0.1719478,0.1742198,0.1764866,0.1787483,0.1810047,0.183256,0.1855021,0.187743,0.1899787,0.1922092,0.1944346,0.1966547,0.1988697,0.2010795,0.2032841,0.2054836,0.2076778,0.2098669,0.2120508,0.2142295,0.216403,0.2185714,0.2207345,0.2228925,0.2250453,0.227193,0.2293354,0.2314727,0.2336048,0.2357317,0.2378535,0.23997,0.2420814,0.2441877,0.2462887,0.2483846,0.2504753,0.2525608,0.2546411,0.2567163,0.2587863,0.2608511,0.2629107,0.2649652,0.2670145,0.2690586,0.2710976,0.2731314,0.27516,0.2771835,0.2792017,0.2812148,0.2832228,0.2852255,0.2872231,0.2892156,0.2912028,0.2931849,0.2951618,0.2971336,0.2991002,0.3010616,0.3030178,0.3049689,0.3069149,0.3088556,0.3107912,0.3127216,0.3146469,0.316567,0.3184819,0.3203917,0.3222963,0.3241958,0.32609,0.3279792,0.3298631,0.3317419,0.3336155,0.335484,0.3373473,0.3392055,0.3410585,0.3429063,0.344749,0.3465865,0.3484189,0.3502461,0.3520681,0.353885,0.3556967,0.3575033,0.3593047,0.3611009,0.362892,0.364678,0.3664588,0.3682344,0.3700049,0.3717702,0.3735304,0.3752854,0.3770353,0.37878,0.3805195,0.3822539,0.3839832,0.3857073,0.3874262,0.38914,0.3908487,0.3925522,0.3942505,0.3959437,0.3976318,0.3993147,0.4009924,0.402665,0.4043325,0.4059948,0.4076519,0.4093039,0.4109508,0.4125925,0.4142291,0.4158605,0.4174868,0.4191079,0.4207239,0.4223347,0.4239404,0.425541,0.4271364,0.4287267,0.4303118,0.4318918,0.4334666,0.4350363,0.4366009,0.4381603,0.4397146,0.4412637,0.4428077,0.4443465,0.4458803,0.4474088,0.4489323,0.4504506,0.4519637,0.4534717,0.4549746,0.4564724,0.457965,0.4594525,0.4609348,0.462412,0.463884,0.465351,0.4668128,0.4682694,0.4697209,0.4711673,0.4726086,0.4740447,0.4754757,0.4769016,0.4783223,0.4797379,0.4811483,0.4825537,0.4839539,0.4853489,0.4867389,0.4881237,0.4895033,0.4908779,0.4922473,0.4936116,0.4949707,0.4963248,0.4976737,0.4990174,0.5003561,0.5016896,0.503018,0.5043413,0.5056594,0.5069724,0.5082803,0.5095831,0.5108807,0.5121732,0.5134606,0.5147429,0.5160201,0.5172921,0.518559,0.5198208,0.5210774,0.5223289,0.5235754,0.5248166,0.5260528,0.5272839,0.5285098,0.5297306,0.5309463,0.5321569,0.5333623,0.5345627,0.5357579,0.536948,0.538133,0.5393128,0.5404876,0.5416572,0.5428217,0.5439811,0.5451354,0.5462846,0.5474286,0.5485676,0.5497014,0.5508301,0.5519537,0.5530722,0.5541855,0.5552938,0.5563969,0.557495,0.5585879,0.5596757,0.5607584,0.561836,0.5629085,0.5639759,0.5650381,0.5660953,0.5671473,0.5681942,0.5692361,0.5702728,0.5713044,0.5723309,0.5733523,0.5743686,0.5753798,0.5763858,0.5773868,0.5783827,0.5793734,0.5803591,0.5813396,0.5823151,0.5832854,0.5842507,0.5852108,0.5861658,0.5871158,0.5880606,0.5890003,0.589935,0.5908645,0.5917889,0.5927082,0.5936224,0.5945316,0.5954356,0.5963345,0.5972283,0.5981171,0.5990007,0.5998792,0.6007527,0.601621,0.6024843,0.6033424,0.6041954,0.6050434,0.6058862,0.606724,0.6075567,0.6083842,0.6092067,0.6100241,0.6108364,0.6116436,0.6124457,0.6132427,0.6140346,0.6148215,0.6156032,0.6163798,0.6171514,0.6179178,0.6186792,0.6194355,0.6201867,0.6209328,0.6216738,0.6224097,0.6231406,0.6238663,0.624587,0.6253026,0.626013,0.6267184,0.6274188,0.628114,0.6288041,0.6294892,0.6301692,0.630844,0.6315138,0.6321786,0.6328382,0.6334927,0.6341422,0.6347866,0.6354259,0.6360601,0.6366893,0.6373133,0.6379323,0.6385462,0.639155,0.6397587,0.6403574,0.640951,0.6415395,0.6421229,0.6427012,0.6432745,0.6438427,0.6444058,0.6449638,0.6455167,0.6460646,0.6466074,0.6471451,0.6476778,0.6482053,0.6487278,0.6492453,0.6497576,0.6502649,0.6507671,0.6512642,0.6517563,0.6522432,0.6527251,0.653202,0.6536737,0.6541404,0.6546021,0.6550586,0.6555101,0.6559565,0.6563978,0.6568341,0.6572653,0.6576914,0.6581125,0.6585285,0.6589394,0.6593453,0.6597461,0.6601418,0.6605325,0.6609181,0.6612986,0.6616741,0.6620445,0.6624098,0.6627701,0.6631253,0.6634754,0.6638205,0.6641605,0.6644955,0.6648254,0.6651502,0.66547,0.6657847,0.6660943,0.6663989,0.6666984,0.6669929,0.6672823,0.6675666,0.6678459,0.6681201,0.6683893,0.6686534,0.6689124,0.6691664,0.6694154,0.6696592,0.6698981,0.6701318,0.6703605,0.6705842,0.6708028,0.6710163,0.6712248,0.6714282,0.6716266,0.6718199,0.6720082,0.6721914,0.6723696,0.6725427,0.6727108,0.6728738,0.6730317,0.6731847,0.6733325,0.6734753,0.6736131,0.6737458,0.6738734,0.673996,0.6741136,0.6742261,0.6743336,0.674436,0.6745334,0.6746257,0.6747129,0.6747952,0.6748724,0.6749445,0.6750116,0.6750736,0.6751306,0.6751826,0.6752295,0.6752714,0.6753082,0.67534,0.6753667,0.6753884,0.675405,0.6754166,0.6754232,0.6754247,0.6754211,0.6754121,0.6753979,0.6753785,0.6753537,0.6753237,0.6752885,0.6752479,0.6752021,0.6751511,0.6750948,0.6750332,0.6749663,0.6748942,0.6748169,0.6747342,0.6746463,0.6745532,0.6744548,0.6743511,0.6742422,0.674128,0.6740085,0.6738838,0.6737538,0.6736186,0.6734781,0.6733324,0.6731814,0.6730251,0.6728636,0.6726968,0.6725248,0.6723475,0.672165,0.6719772,0.6717841,0.6715858,0.6713823,0.6711735,0.6709594,0.6707401,0.6705155,0.6702857,0.6700506,0.6698103,0.6695647,0.6693139,0.6690578,0.6687965,0.6685299,0.6682581,0.667981,0.6676987,0.6674111,0.6671183,0.6668202,0.6665169,0.6662084,0.6658945,0.6655755,0.6652512,0.6649216,0.6645868,0.6642468,0.6639015,0.663551,0.6631952,0.6628342,0.6624679,0.6620964,0.6617197,0.6613377,0.6609505,0.660558,0.6601603,0.6597573,0.6593491,0.6589357,0.658517,0.6580931,0.6576639,0.6572295,0.6567899,0.656345,0.6558949,0.6554395,0.6549789,0.6545131,0.6540421,0.6535658,0.6530842,0.6525974,0.6521054,0.6516082,0.6511057,0.650598,0.6500851,0.6495669,0.6490435,0.6485148,0.6479809,0.6474418,0.6468975,0.6463479,0.6457931,0.6452331,0.6446678,0.6440973,0.6435216,0.6429406,0.6423544,0.641763,0.6411663,0.6405645,0.6399574,0.639345,0.6387275,0.6381047,0.6374767,0.6368434,0.636205,0.6355613,0.6349123,0.6342582,0.6335988,0.6329342,0.6322644,0.6315894,0.6309091,0.6302236,0.6295329,0.628837,0.6281358,0.6274294,0.6267178,0.626001,0.625279,0.6245517,0.6238192,0.6230815,0.6223386,0.6215905,0.6208371,0.6200785,0.6193148,0.6185457,0.6177715,0.6169921,0.6162074,0.6154175,0.6146224,0.6138221,0.6130166,0.6122058,0.6113899,0.6105687,0.6097423,0.6089107,0.6080739,0.6072319,0.6063846,0.6055322,0.6046745,0.6038116,0.6029435,0.6020702,0.6011917,0.600308,0.5994191,0.5985249,0.5976256,0.596721,0.5958113,0.5948963,0.5939761,0.5930507,0.5921201,0.5911843,0.5902433,0.5892971,0.5883456,0.587389,0.5864272,0.5854601,0.5844879,0.5835104,0.5825278,0.5815399,0.5805468,0.5795486,0.5785451,0.5775364,0.5765225,0.5755035,0.5744792,0.5734497,0.572415,0.5713752,0.5703301,0.5692798,0.5682243,0.5671636,0.5660978,0.5650267,0.5639504,0.5628689,0.5617823,0.5606904,0.5595933,0.5584911,0.5573836,0.556271,0.5551531,0.5540301,0.5529018,0.5517684,0.5506298,0.549486,0.548337,0.5471827,0.5460234,0.5448588,0.543689,0.542514,0.5413338,0.5401485,0.5389579,0.5377622,0.5365613,0.5353551,0.5341438,0.5329273,0.5317057,0.5304788,0.5292467,0.5280095,0.526767,0.5255194,0.5242666,0.5230086,0.5217454,0.520477,0.5192035,0.5179247,0.5166408,0.5153517,0.5140574,0.5127579,0.5114533,0.5101434,0.5088284,0.5075082,0.5061828,0.5048522,0.5035165,0.5021756,0.5008294,0.4994781,0.4981217,0.49676,0.4953932,0.4940212,0.492644,0.4912616,0.489874,0.4884813,0.4870834,0.4856803,0.4842721,0.4828586,0.48144,0.4800162,0.4785873,0.4771531,0.4757138,0.4742693,0.4728197,0.4713649,0.4699048,0.4684397,0.4669693,0.4654938,0.4640131,0.4625272,0.4610362,0.45954,0.4580386,0.456532,0.4550203,0.4535034,0.4519814,0.4504541,0.4489217,0.4473842,0.4458414,0.4442935,0.4427405,0.4411822,0.4396188,0.4380502,0.4364765,0.4348976,0.4333135,0.4317243,0.4301299,0.4285303,0.4269256,0.4253157,0.4237007,0.4220805,0.4204551,0.4188245,0.4171888,0.415548,0.4139019,0.4122508,0.4105944,0.4089329,0.4072662,0.4055944,0.4039174,0.4022353,0.400548,0.3988555,0.3971579,0.3954551,0.3937472,0.3920341,0.3903158,0.3885924,0.3868638,0.3851301,0.3833913,0.3816472,0.379898,0.3781437,0.3763842,0.3746196,0.3728498,0.3710748,0.3692947,0.3675095,0.3657191,0.3639235,0.3621228,0.3603169,0.3585059,0.3566897,0.3548684,0.353042,0.3512104,0.3493736,0.3475317,0.3456846,0.3438324,0.3419751,0.3401126,0.3382449,0.3363721,0.3344942,0.3326111,0.3307229,0.3288295,0.326931,0.3250273,0.3231185,0.3212045,0.3192854,0.3173612,0.3154318,0.3134973,0.3115576,0.3096128,0.3076628,0.3057077,0.3037475,0.3017821,0.2998116,0.2978359,0.2958552,0.2938692,0.2918781,0.2898819,0.2878806,0.2858741,0.2838625,0.2818457,0.2798238,0.2777968,0.2757646,0.2737273,0.2716848,0.2696372,0.2675845,0.2655267,0.2634637,0.2613956,0.2593223,0.2572439,0.2551604,0.2530718,0.250978,0.2488791,0.246775,0.2446658,0.2425515,0.2404321,0.2383075,0.2361778,0.234043,0.231903,0.2297579,0.2276077,0.2254524,0.2232919,0.2211263,0.2189556,0.2167797,0.2145987,0.2124126,0.2102214,0.208025,0.2058235,0.2036169,0.2014052,0.1991883,0.1969664,0.1947393,0.192507,0.1902697,0.1880272,0.1857796,0.1835269,0.181269,0.1790061,0.176738,0.1744648,0.1721865,0.169903,0.1676145,0.1653208,0.163022,0.1607181,0.158409,0.1560949,0.1537756,0.1514512,0.1491217,0.1467871,0.1444473,0.1421025,0.1397525,0.1373974,0.1350372,0.1326719,0.1303015,0.1279259,0.1255453,0.1231595,0.1207686,0.1183726,0.1159715,0.1135653,0.111154,0.1087375,0.106316,0.1038893,0.1014575,0.0990206,0.0965786,0.0941315,0.0916793,0.089222,0.0867596,0.084292,0.0818194,0.0793416,0.0768588,0.0743708,0.0718778,0.0693796,0.0668763,0.0643679,0.0618544,0.0593358,0.0568121,0.0542833,0.0517494,0.0492104,0.0466663,0.0441171,0.0415627,0.0390033,0.0364388,0.0338692,0.0312944,0.0287146,0.0261297,0.0235397,0.0209445,0.0183443,0.015739,0.0131286,0.0105131,0.0078924,0.0052667,0.0026359,0];

type ClusterFalloff = (distance: number) => number;

/** Push falloff baked from the editor's curve; `points` is ignored here. */
function compileClusterFalloff(_points: readonly ClusterCurvePoint[]): ClusterFalloff {
  const last = BAKED_PUSH_FALLOFF.length - 1;
  return (distance) => {
    const t = Math.min(1, Math.max(0, distance)) * last;
    const index = Math.min(last - 1, Math.floor(t));
    const from = BAKED_PUSH_FALLOFF[index]!;
    return from + (BAKED_PUSH_FALLOFF[index + 1]! - from) * (t - index);
  };
}

// ---- cluster-simulation ----
// Deterministic rigid-body cluster used by both the live preview and export.
// Bodies collide through capsules that follow their rendered shape (see
// cluster-collision), so pieces interlock without passing through each other.
// The simulation settles (sleeps) once every body is at rest so a still frame
// is pixel-stable until the next input.


/**
 * Collision of body `index`: its dealt object of the uploaded asset, else its
 * built-in piece shape. One definition for the simulation and tests.
 */
function clusterBodyCollision(physics: ClusterPhysics, index: number): ClusterCollisionShape {
  const { asset } = physics;
  if (asset && asset.collisions.length > 0) {
    return asset.collisions[clusterDealIndex(index, asset.collisions.length)]!;
  }
  return getClusterCollisionShape(clusterPieceShape(physics.shape, index));
}


type ClusterBody = {
  angularVelocity: Vec3;
  colorIndex: 0 | 1 | 2;
  orientation: Quat;
  position: Vec3;
  velocity: Vec3;
};

/** A world-space ray from the camera through the cursor. */
type ClusterPointer = Readonly<{ direction: Vec3; origin: Vec3 }>;

const CLUSTER_FIXED_STEP_SECONDS = 1 / 60;
const CLUSTER_SEED = 0x2f6b9e1d;
/** Nominal radius of one object at size 1 (spawn packing, spin); collision uses cluster-collision. */
const CLUSTER_BODY_RADIUS = 1;

/** Spin damping relative to linear damping (1.6 against the original 3.6). */
const ANGULAR_DAMPING_RATIO = 1.6 / 3.6;
const SLEEP_LINEAR = 0.05;
const SLEEP_ANGULAR = 0.03;
const SLEEP_FRAMES = 20;
const MAX_SUBSTEPS = 60;
const REST_SPEED = 0.6;
/** Contact passes per step; enough for a dense 72-piece pile under full pull. */
const CONTACT_ITERATIONS = 10;
/** Under-relaxed contact pushes stop pieces flip-flopping between contacts. */
const CONTACT_RELAXATION = 0.8;
/** Speed cap at size 1, well above the cursor push. */
const MAX_SPEED = 12;
/** Spin kept per contact per step; touching pieces stop tumbling quickly. */
const CONTACT_SPIN_KEEP = 0.9;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeQuat(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= length;
  q[1] /= length;
  q[2] /= length;
  q[3] /= length;
  return q;
}

/** Palette share mirrors the reference: mostly light, then dark, then accent. */
function pickColor(index: number): 0 | 1 | 2 {
  const ratio = (index * 0.6180339887) % 1;
  if (ratio < 0.42) return 0;
  if (ratio < 0.72) return 1;
  return 2;
}

function getClusterRadius(count: number, size: number): number {
  // Loose sphere packing of `count` bodies of radius `size`.
  return Math.cbrt(count / 0.55) * CLUSTER_BODY_RADIUS * size;
}

/** Deterministic spawn for body `index`; independent of the total count. */
function createClusterBody(index: number, spawnRadius: number): ClusterBody {
  const random = mulberry32(CLUSTER_SEED ^ Math.imul(index + 1, 0x9e3779b1));
  const polar = Math.acos(1 - 2 * random());
  const azimuth = index * Math.PI * (3 - Math.sqrt(5));
  const radius = spawnRadius * (0.75 + 0.25 * random());
  return {
    angularVelocity: [
      (random() - 0.5) * 2,
      (random() - 0.5) * 2,
      (random() - 0.5) * 2,
    ],
    colorIndex: pickColor(index),
    orientation: normalizeQuat([
      random() - 0.5,
      random() - 0.5,
      random() - 0.5,
      random() - 0.5,
    ]),
    position: [
      radius * Math.sin(polar) * Math.cos(azimuth),
      radius * Math.sin(polar) * Math.sin(azimuth),
      radius * Math.cos(polar) * 0.6,
    ],
    velocity: [0, 0, 0],
  };
}

function createClusterBodies(count: number, size: number): ClusterBody[] {
  const spawnRadius = getClusterRadius(count, size) * 1.6;
  return Array.from({ length: count }, (_, index) =>
    createClusterBody(index, spawnRadius),
  );
}

function cloneClusterBody(body: ClusterBody): ClusterBody {
  return {
    angularVelocity: [...body.angularVelocity],
    colorIndex: body.colorIndex,
    orientation: [...body.orientation],
    position: [...body.position],
    velocity: [...body.velocity],
  };
}

function integrateOrientation(q: Quat, w: Vec3, dt: number): void {
  const [x, y, z, s] = q;
  const half = dt * 0.5;
  q[0] = x + half * (w[0] * s + w[1] * z - w[2] * y);
  q[1] = y + half * (w[1] * s + w[2] * x - w[0] * z);
  q[2] = z + half * (w[2] * s + w[0] * y - w[1] * x);
  q[3] = s - half * (w[0] * x + w[1] * y + w[2] * z);
  normalizeQuat(q);
}

class ClusterSimulation {
  bodies: ClusterBody[] = [];
  private accumulator = 0;
  private quietFrames = 0;
  private currentPhysics: ClusterPhysics;
  /** Compiled once per physics change (Toolcraft's monotone curve evaluator). */
  private pushFalloff: ClusterFalloff;
  private pointer: ClusterPointer | null = null;
  private settled = false;
  private paused = false;
  /** Increments whenever body poses change; the renderer redraws on change. */
  version = 0;

  constructor(physics: ClusterPhysics) {
    this.currentPhysics = physics;
    this.pushFalloff = compileClusterFalloff(physics.pushFalloff);
    this.reset(physics);
  }

  get physics(): ClusterPhysics {
    return this.currentPhysics;
  }

  get isSettled(): boolean {
    return this.settled;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Viewport pan/zoom suspends stepping. Time spent paused is discarded so the
   * pile resumes exactly where it stopped instead of jumping ahead.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.accumulator = 0;
  }

  /** Rebuilds the bodies from the fixed seed (count or size changed). */
  reset(physics: ClusterPhysics): void {
    this.currentPhysics = physics;
    this.pushFalloff = compileClusterFalloff(physics.pushFalloff);
    this.bodies = createClusterBodies(physics.count, physics.size);
    this.accumulator = 0;
    this.quietFrames = 0;
    this.settled = false;
    this.version += 1;
  }

  get currentPointer(): ClusterPointer | null {
    return this.pointer;
  }

  /**
   * Replaces every body with a copy of `bodies` (sequence playback origin) and
   * sets the cursor without waking, exactly as it was when the pose was taken.
   */
  restore(
    bodies: readonly ClusterBody[],
    settled: boolean,
    pointer: ClusterPointer | null = null,
  ): void {
    this.bodies = bodies.map(cloneClusterBody);
    this.pointer = pointer;
    this.accumulator = 0;
    this.quietFrames = 0;
    this.settled = settled;
    this.version += 1;
  }

  /**
   * Physics edits keep current poses: count adds/removes bodies at the rim,
   * other changes wake the cluster so contacts re-resolve live.
   */
  setPhysics(physics: ClusterPhysics): void {
    const previous = this.currentPhysics;
    this.currentPhysics = physics;
    this.pushFalloff = compileClusterFalloff(physics.pushFalloff);
    if (physics.count > this.bodies.length) {
      const spawnRadius = getClusterRadius(physics.count, physics.size) * 1.35;
      for (let index = this.bodies.length; index < physics.count; index += 1) {
        this.bodies.push(createClusterBody(index, spawnRadius));
      }
    } else if (physics.count < this.bodies.length) {
      this.bodies.length = physics.count;
    }
    if (!samePhysics(physics, previous)) {
      this.version += 1;
      this.wake();
    }
  }

  /** Moving, adding or removing the cursor changes forces, so it wakes the pile. */
  setPointer(pointer: ClusterPointer | null): void {
    const changed = (pointer === null) !== (this.pointer === null) || pointer !== null;
    this.pointer = pointer;
    if (changed) this.wake();
  }

  wake(): void {
    this.settled = false;
    this.quietFrames = 0;
  }

  /** Advances by wall-clock delta using fixed steps; returns true if poses moved. */
  advance(deltaSeconds: number): boolean {
    if (this.settled || this.paused) return false;
    this.accumulator += Math.min(deltaSeconds, CLUSTER_FIXED_STEP_SECONDS * MAX_SUBSTEPS);
    let stepped = false;
    while (this.accumulator >= CLUSTER_FIXED_STEP_SECONDS && !this.settled) {
      this.step(CLUSTER_FIXED_STEP_SECONDS);
      this.accumulator -= CLUSTER_FIXED_STEP_SECONDS;
      stepped = true;
    }
    if (stepped) this.version += 1;
    return stepped;
  }

  /** Runs fixed steps until settled (or the cap), for deterministic tests. */
  runUntilSettled(maxSteps = 6000): number {
    let steps = 0;
    while (!this.settled && steps < maxSteps) {
      this.step(CLUSTER_FIXED_STEP_SECONDS);
      steps += 1;
    }
    this.version += 1;
    return steps;
  }

  step(dt: number): void {
    const { aspect, cohesion, damping, pushRadius, pushStrength, size } = this.currentPhysics;
    const pointerForce = pushStrength;
    const bodies = this.bodies;
    const radius = CLUSTER_BODY_RADIUS * size;
    const linearDecay = Math.exp(-damping * dt);
    const angularDecay = Math.exp(-damping * ANGULAR_DAMPING_RATIO * dt);
    const pointer = this.pointer;
    // Aspect arrives rounded (physicsOf), so every caller runs identical physics.
    const stretch = Math.min(3, Math.max(1 / 3, aspect));
    const pullX = (cohesion * 6) / Math.max(1, stretch) ** 1.4;
    const pullY = cohesion * 6 * Math.min(1, stretch) ** 1.4;
    const pullZ = cohesion * 6;
    const previous = this.previousPositions(bodies.length);

    // 1. Forces: central pull and cursor push, then predict positions.
    for (let index = 0; index < bodies.length; index += 1) {
      const body = bodies[index]!;
      const [x, y, z] = body.position;
      body.velocity[0] -= x * pullX * dt;
      body.velocity[1] -= y * pullY * dt;
      body.velocity[2] -= z * pullZ * dt;

      if (pointer && pointerForce > 0) {
        const ox = x - pointer.origin[0];
        const oy = y - pointer.origin[1];
        const oz = z - pointer.origin[2];
        const along =
          ox * pointer.direction[0] + oy * pointer.direction[1] + oz * pointer.direction[2];
        const px = ox - along * pointer.direction[0];
        const py = oy - along * pointer.direction[1];
        const pz = oz - along * pointer.direction[2];
        const distance = Math.hypot(px, py, pz);
        const reach = pushRadius * size;
        if (distance < reach && distance > 1e-5) {
          const strength = this.pushFalloff(distance / reach) * pointerForce * 60 * dt;
          body.velocity[0] += (px / distance) * strength;
          body.velocity[1] += (py / distance) * strength;
          body.velocity[2] += (pz / distance) * strength * 0.5;
          body.angularVelocity[0] += (py / distance) * strength * 0.6;
          body.angularVelocity[1] -= (px / distance) * strength * 0.6;
        }
      }

      body.velocity[0] *= linearDecay;
      body.velocity[1] *= linearDecay;
      body.velocity[2] *= linearDecay;
      const prior = previous[index]!;
      prior[0] = x;
      prior[1] = y;
      prior[2] = z;
      body.position[0] += body.velocity[0] * dt;
      body.position[1] += body.velocity[1] * dt;
      body.position[2] += body.velocity[2] * dt;
    }

    // 2. Positional contact resolution between shape capsules; the first
    //    pass also converts slip to spin.
    //    Each body collides as its own piece shape (a random mix varies).
    const collisions = this.bodyCollisions(bodies.length, this.currentPhysics);
    const world = this.worldCapsules(bodies.length);
    for (let index = 0; index < bodies.length; index += 1) {
      const body = bodies[index]!;
      writeWorldCapsules(collisions[index]!, body.position, body.orientation, size, world[index]!);
    }
    const contact = this.contact;
    const fallback = this.fallback;
    for (let iteration = 0; iteration < CONTACT_ITERATIONS; iteration += 1) {
      let resolved = false;
      for (let i = 0; i < bodies.length; i += 1) {
        const a = bodies[i]!;
        const shapeA = collisions[i]!;
        for (let j = i + 1; j < bodies.length; j += 1) {
          const b = bodies[j]!;
          const shapeB = collisions[j]!;
          const reach = (shapeA.boundRadius + shapeB.boundRadius) * size;
          const dx = b.position[0] - a.position[0];
          const dy = b.position[1] - a.position[1];
          const dz = b.position[2] - a.position[2];
          const distanceSquared = dx * dx + dy * dy + dz * dz;
          if (distanceSquared >= reach * reach) continue;
          const distance = Math.sqrt(distanceSquared);
          if (distance > 1e-6) {
            fallback[0] = dx / distance;
            fallback[1] = dy / distance;
            fallback[2] = dz / distance;
          } else {
            fallback[0] = 1;
            fallback[1] = 0;
            fallback[2] = 0;
          }
          const countA = shapeA.capsules.length;
          const countB = shapeB.capsules.length;
          deepestContact(world[i]!, countA, world[j]!, countB, fallback, contact);
          if (contact.depth <= 0) continue;
          resolved = true;
          const [nx, ny, nz] = contact.normal;
          const half = 0.5 * CONTACT_RELAXATION;
          let px = contact.push[0] * half;
          let py = contact.push[1] * half;
          let pz = contact.push[2] * half;
          // Opposing contacts cancel when one piece is hooked through another
          // (a rod through a ring that is too tight). Pull them apart along
          // their centre line so they unhook instead of staying embedded.
          if (Math.hypot(contact.push[0], contact.push[1], contact.push[2]) < contact.depth * 0.5) {
            px = fallback[0] * contact.depth * half;
            py = fallback[1] * contact.depth * half;
            pz = fallback[2] * contact.depth * half;
          }
          a.position[0] -= px;
          a.position[1] -= py;
          a.position[2] -= pz;
          b.position[0] += px;
          b.position[1] += py;
          b.position[2] += pz;
          translateWorldCapsules(world[i]!, countA, -px, -py, -pz);
          translateWorldCapsules(world[j]!, countB, px, py, pz);
          if (iteration === 0) {
            // Rolling contact: slip turns into a little spin, while touching
            // pieces lose spin so swinging arms cannot keep the pile agitated.
            const rvx = b.velocity[0] - a.velocity[0];
            const rvy = b.velocity[1] - a.velocity[1];
            const rvz = b.velocity[2] - a.velocity[2];
            const spin = 0.12 / Math.max(radius, 0.1);
            const tx = (rvy * nz - rvz * ny) * spin;
            const ty = (rvz * nx - rvx * nz) * spin;
            const tz = (rvx * ny - rvy * nx) * spin;
            for (let axis = 0; axis < 3; axis += 1) {
              a.angularVelocity[axis]! *= CONTACT_SPIN_KEEP;
              b.angularVelocity[axis]! *= CONTACT_SPIN_KEEP;
            }
            a.angularVelocity[0] -= tx;
            a.angularVelocity[1] -= ty;
            a.angularVelocity[2] -= tz;
            b.angularVelocity[0] += tx;
            b.angularVelocity[1] += ty;
            b.angularVelocity[2] += tz;
          }
        }
      }
      if (!resolved) break;
    }

    // 3. Velocities follow the resolved positions, so resting contacts stop.
    let maxLinear = 0;
    let maxAngular = 0;
    for (let index = 0; index < bodies.length; index += 1) {
      const body = bodies[index]!;
      const prior = previous[index]!;
      body.velocity[0] = (body.position[0] - prior[0]) / dt;
      body.velocity[1] = (body.position[1] - prior[1]) / dt;
      body.velocity[2] = (body.position[2] - prior[2]) / dt;
      // A deep overlap resolved in one step must not launch the piece.
      const launch = Math.hypot(...body.velocity) / (MAX_SPEED * size);
      if (launch > 1) {
        body.velocity[0] /= launch;
        body.velocity[1] /= launch;
        body.velocity[2] /= launch;
      }
      // Near rest, extra friction stops contact creep so the pile can sleep.
      const speed = Math.hypot(...body.velocity);
      if (speed < REST_SPEED * size) {
        const friction = 1 - speed / (REST_SPEED * size);
        const keep = 1 - 0.9 * friction;
        body.velocity[0] *= keep;
        body.velocity[1] *= keep;
        body.velocity[2] *= keep;
        body.angularVelocity[0] *= keep;
        body.angularVelocity[1] *= keep;
        body.angularVelocity[2] *= keep;
      }
      body.angularVelocity[0] *= angularDecay;
      body.angularVelocity[1] *= angularDecay;
      body.angularVelocity[2] *= angularDecay;
      integrateOrientation(body.orientation, body.angularVelocity, dt);
      maxLinear = Math.max(maxLinear, Math.hypot(...body.velocity));
      maxAngular = Math.max(maxAngular, Math.hypot(...body.angularVelocity));
    }

    // A resting cursor may hold a gap open; once nothing moves the pile sleeps
    // until the cursor moves again.
    if (
      maxLinear < SLEEP_LINEAR * size &&
      maxAngular < SLEEP_ANGULAR
    ) {
      this.quietFrames += 1;
      if (this.quietFrames >= SLEEP_FRAMES) {
        for (const body of bodies) {
          body.velocity = [0, 0, 0];
          body.angularVelocity = [0, 0, 0];
        }
        this.settled = true;
      }
    } else {
      this.quietFrames = 0;
    }
  }

  private scratch: Vec3[] = [];
  private worldScratch: Float64Array[] = [];
  private readonly contact: ClusterContact = { depth: 0, normal: [0, 0, 0], push: [0, 0, 0] };
  private readonly fallback: Vec3 = [1, 0, 0];

  private collisionScratch: ClusterCollisionShape[] = [];
  private collisionKey: string | null = null;

  /** Collision shape per body, rebuilt only when the shape option, asset or count changes. */
  private bodyCollisions(count: number, physics: ClusterPhysics): readonly ClusterCollisionShape[] {
    const key = `${physics.shape}:${physics.asset?.key ?? ""}`;
    if (this.collisionKey !== key) {
      this.collisionScratch = [];
      this.collisionKey = key;
    }
    for (let index = this.collisionScratch.length; index < count; index += 1) {
      this.collisionScratch.push(clusterBodyCollision(physics, index));
    }
    return this.collisionScratch;
  }

  /** World capsule buffers sized for the largest piece shape, reused every step. */
  private worldCapsules(count: number): Float64Array[] {
    const length = CLUSTER_MAX_CAPSULES * CAPSULE_STRIDE;
    while (this.worldScratch.length < count) this.worldScratch.push(new Float64Array(length));
    return this.worldScratch;
  }

  private previousPositions(count: number): Vec3[] {
    while (this.scratch.length < count) this.scratch.push([0, 0, 0]);
    return this.scratch;
  }
}

// ---- cluster-scene ----
/** Visible half-extent (world units) of the shorter frame side at z = 0. */
const CLUSTER_VIEW_HALF_EXTENT = 3.3;
const CAMERA_DISTANCE = 22;
const CAMERA_NEAR = 4;
const CAMERA_FAR = 60;

function configureClusterRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
}

/** Pixel budget of the live Glass (transmission) target: about one 1080p frame. */
const LIVE_TRANSMISSION_PIXELS = 1920 * 1080;

/**
 * Resolution scale of three's transmission target for the live canvas. Glass
 * re-renders the scene into a 4x MSAA half-float target and mipmaps it every
 * frame; at full backing (7680x4320 on a 2x display at scale 2) that costs
 * more than the whole rest of the frame. Capping it near 1080p keeps the
 * refraction close to what the screen shows; exports render at full scale.
 */
function clusterLiveTransmissionScale(backingWidth: number, backingHeight: number): number {
  const pixels = backingWidth * backingHeight;
  return pixels > LIVE_TRANSMISSION_PIXELS ? Math.sqrt(LIVE_TRANSMISSION_PIXELS / pixels) : 1;
}

/** Camera whose shorter side always shows the same world extent. */
function createClusterCamera(width: number, height: number): THREE.PerspectiveCamera {
  const aspect = Math.max(1e-3, width / Math.max(1, height));
  const halfHeight =
    aspect >= 1 ? CLUSTER_VIEW_HALF_EXTENT : CLUSTER_VIEW_HALF_EXTENT / aspect;
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight / CAMERA_DISTANCE));
  const camera = new THREE.PerspectiveCamera(fov, aspect, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function createClusterEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = generator.fromScene(room, 0.04, 0.1, 100, { size: 128 });
  room.dispose();
  generator.dispose();
  return target.texture;
}

function createMaterials(appearance: ClusterAppearance): THREE.MeshStandardMaterial[] {
  const gloss = appearance.gloss;
  // Satin light/dark pieces use the cheaper standard BRDF; only the accent
  // pays for a physical clear coat, as in the reference.
  const light = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.light),
    envMapIntensity: 0.32,
    metalness: 0,
    roughness: 0.62 - 0.27 * gloss,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.dark),
    envMapIntensity: 0.45,
    metalness: 0,
    roughness: 0.7 - 0.3 * gloss,
  });
  const accent = new THREE.MeshPhysicalMaterial({
    clearcoat: gloss,
    clearcoatRoughness: 0.04 + 0.3 * (1 - gloss),
    color: new THREE.Color(appearance.accent),
    envMapIntensity: 0.55,
    metalness: 0,
    roughness: 0.42 - 0.3 * gloss,
  });
  return [light, dark, accent];
}

/** A piece kind to emphasise and how strongly (0 to 1). */
type ClusterHighlight = Readonly<{ kind: number; strength: number }>;

/** Shade multiplier for pieces outside the highlighted kind at full strength. */
const HIGHLIGHT_DIM = 0.75;

/** Authored textures a custom material keeps (the part's own detail). */
function authoredTextures(material: THREE.Material) {
  const source = material as THREE.MeshStandardMaterial;
  return { map: source.map ?? null, normalMap: source.normalMap ?? null };
}

/**
 * Writes a Custom record's fields onto an existing material of the same
 * shading. Only a change of transparency or of transmission on/off needs a
 * new shader program; everything else is a uniform update.
 */
function applyClusterPartMaterial(
  material: THREE.MeshPhysicalMaterial | THREE.MeshToonMaterial,
  record: ClusterPartMaterial,
  color: string,
): void {
  const transparent = record.opacity < 1;
  const programChanges =
    material.transparent !== transparent ||
    (material instanceof THREE.MeshPhysicalMaterial &&
      material.transmission > 0 !== record.transmission > 0);
  material.color.set(color);
  material.emissive.set(color);
  material.emissiveIntensity = record.emissive;
  material.opacity = record.opacity;
  material.transparent = transparent;
  // See-through copies must not hide the copies behind them.
  material.depthWrite = !transparent;
  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.clearcoat = record.clearcoat;
    material.metalness = record.metalness;
    material.roughness = record.roughness;
    material.thickness = record.transmission > 0 ? 0.6 : 0;
    material.transmission = record.transmission;
  }
  if (programChanges) material.needsUpdate = true;
}

/** A Custom part material in one colour; toon or physical shading. */
function createClusterPartMaterial(
  record: ClusterPartMaterial,
  color: string,
  authored: THREE.Material,
): THREE.MeshPhysicalMaterial | THREE.MeshToonMaterial {
  const textures = authoredTextures(authored);
  const material =
    record.shading === "toon"
      ? new THREE.MeshToonMaterial(textures)
      : new THREE.MeshPhysicalMaterial({ ...textures, envMapIntensity: 0.6 });
  applyClusterPartMaterial(material, record, color);
  return material;
}

type ClusterSceneHandle = Readonly<{
  dispose(): void;
  scene: THREE.Scene;
  /**
   * Re-applies Custom part fields to the existing materials. Valid only while
   * each part keeps its mode, shading and colour source (see
   * `ClusterPartMaterials.structureKey`); otherwise rebuild the scene.
   */
  updatePartMaterials(partMaterial: (partId: string) => ClusterPartMaterial): void;
  /** True while a part effect moves with the loop phase (keep drawing). */
  readonly animated: boolean;
  /** Timeline loop phase (0 to 1) and loop length for animated part effects. */
  setLoopPhase(phase: number, loopSeconds?: number): void;
  /**
   * Writes body poses, plus the idle drift at `timeSeconds` when given, into
   * the instance matrices. `highlight` (live preview only) dims every other
   * piece kind by `strength` so the copies of one kind stand out.
   */
  updatePoses(
    bodies: readonly ClusterBody[],
    size: number,
    drift?: ClusterDrift,
    timeSeconds?: number,
    highlight?: ClusterHighlight,
  ): void;
}>;

/**
 * Builds lights plus one InstancedMesh per palette slot. The geometry is
 * borrowed (owned by the retained geometry pass) and is not disposed here.
 */
function createClusterScene({
  appearance,
  environment,
  geometry,
  maxInstances,
  partMaterial,
  checkCustomEffect,
}: Readonly<{
  appearance: ClusterAppearance;
  environment: THREE.Texture;
  geometry: ClusterPileGeometry;
  maxInstances: number;
  /** Material of an uploaded part by id; Custom parts get their own materials. */
  partMaterial?: (partId: string) => ClusterPartMaterial;
  /** Compiler log of a Custom GLSL snippet (null when it compiles), from this renderer. */
  checkCustomEffect?: (code: string) => string | null;
}>): ClusterSceneHandle {
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1;

  // Soft studio key from the upper left, a cool rim from the right and a dim
  // sky fill: shaded sides stay grey on light pieces, as in the reference.
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(-7, 10, 9);
  const rim = new THREE.DirectionalLight(0xd8deff, 0.55);
  rim.position.set(10, -2, 4);
  const fill = new THREE.HemisphereLight(0xffffff, 0x14151d, 0.18);
  scene.add(key, rim, fill);

  const materials = createMaterials(appearance);
  // Instanced meshes per piece kind and part: palette parts get one mesh per
  // palette slot (a body picks by its colour index), authored parts one mesh.
  // Each kind's meshes hold only as many instances as the deal can give it.
  const capacity = new Array<number>(geometry.kinds.length).fill(0);
  for (let index = 0; index < maxInstances; index += 1) {
    const kind = geometry.kindOf(index);
    if (kind >= 0 && kind < capacity.length) capacity[kind]! += 1;
  }
  // Materials created for Custom parts or effect clones of authored ones; the
  // scene owns, updates and disposes them. `custom` marks the ones the
  // material fields apply to (an Original clone keeps its authored look).
  const ownMaterials: {
    custom: boolean;
    id: string;
    material: THREE.Material;
    slot: number;
  }[] = [];
  const loopPhase = createClusterLoopPhase();
  const loopSeconds = createClusterLoopPhase();
  loopSeconds.value = 8;
  let animated = false;
  const paletteColors = [appearance.light, appearance.dark, appearance.accent];
  const meshesByKind = geometry.kinds.map((kind, kindIndex) =>
    kind.parts.map((part) => {
      const instances = capacity[kindIndex]!;
      const record = part.id && part.material && partMaterial ? partMaterial(part.id) : null;
      if (part.material && record && (record.mode === "custom" || record.effect !== "none")) {
        const authored = part.material;
        const id = part.id!;
        if (isClusterPartEffectAnimated(record.effect, record.effectCode)) animated = true;
        // One material per authored group, so each keeps its own textures.
        const groups = Array.isArray(authored) ? authored : [authored];
        const custom = record.mode === "custom";
        const colors = custom && record.colorSource === "palette" ? paletteColors : [record.color];
        return colors.map((color, slot) => {
          const materials = groups.map((group) => {
            const material = custom ? createClusterPartMaterial(record, color, group) : group.clone();
            applyClusterPartEffect(material, record, loopPhase, checkCustomEffect, loopSeconds);
            ownMaterials.push({ custom, id, material, slot });
            return material;
          });
          return createInstancedMesh(part.geometry, Array.isArray(authored) ? materials : materials[0]!, instances);
        });
      }
      return part.material
        ? [createInstancedMesh(part.geometry, part.material, instances)]
        : materials.map((material) => createInstancedMesh(part.geometry, material, instances));
    }),
  );
  const meshes = meshesByKind.flat(2);
  meshes.forEach((mesh) => scene.add(mesh));

  function createInstancedMesh(
    pieceGeometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    instances: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(pieceGeometry, material, instances);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(instances * 3).fill(1),
      3,
    );
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const turnAngles = new THREE.Euler();
  const scale = new THREE.Vector3();
  const order: number[] = [];
  const shade = new THREE.Color();

  return {
    dispose() {
      meshes.forEach((mesh) => mesh.dispose());
      materials.forEach((material) => material.dispose());
      ownMaterials.forEach(({ material }) => material.dispose());
    },
    scene,
    get animated() {
      return animated;
    },
    setLoopPhase(phase, seconds) {
      loopPhase.value = phase - Math.floor(phase);
      if (seconds !== undefined && seconds > 0) loopSeconds.value = seconds;
    },
    updatePartMaterials(resolve) {
      for (const { custom, id, material, slot } of ownMaterials) {
        const record = resolve(id);
        if (custom) {
          const color = record.colorSource === "palette" ? paletteColors[slot]! : record.color;
          applyClusterPartMaterial(material as THREE.MeshPhysicalMaterial | THREE.MeshToonMaterial, record, color);
        }
        updateClusterPartEffect(material, record);
      }
    },
    updatePoses(bodies, size, drift, timeSeconds = 0, highlight) {
      meshes.forEach((mesh) => {
        mesh.count = 0;
      });
      scale.setScalar(size);
      // Nearest first (camera looks down -z) so depth testing rejects overdraw.
      order.length = 0;
      for (let index = 0; index < bodies.length; index += 1) order.push(index);
      order.sort((a, b) => bodies[b]!.position[2] - bodies[a]!.position[2]);
      for (const bodyIndex of order) {
        const body = bodies[bodyIndex]!;
        const kind = geometry.kindOf(bodyIndex);
        const parts = meshesByKind[kind];
        if (!parts) continue;
        position.set(body.position[0], body.position[1], body.position[2]);
        rotation.set(
          body.orientation[0],
          body.orientation[1],
          body.orientation[2],
          body.orientation[3],
        );
        if (drift && drift.amount > 0) {
          const offset = clusterDriftOffset(bodyIndex, timeSeconds, drift, size);
          position.x += offset.translation[0];
          position.y += offset.translation[1];
          position.z += offset.translation[2];
          turnAngles.set(offset.rotation[0], offset.rotation[1], offset.rotation[2]);
          rotation.premultiply(turn.setFromEuler(turnAngles));
        }
        matrix.compose(position, rotation, scale);
        // Pieces deeper in the pile fall into shadow (cheap occlusion cue).
        const depth = THREE.MathUtils.clamp((body.position[2] + 3.2 * size) / (5 * size), 0, 1);
        shade.setScalar(0.32 + 0.68 * depth * depth * (3 - 2 * depth));
        if (highlight && kind !== highlight.kind) {
          shade.multiplyScalar(1 - HIGHLIGHT_DIM * highlight.strength);
        }
        for (const slots of parts) {
          const mesh = slots.length === 1 ? slots[0]! : slots[body.colorIndex];
          if (!mesh || mesh.count >= mesh.instanceMatrix.count) continue;
          mesh.setMatrixAt(mesh.count, matrix);
          mesh.setColorAt(mesh.count, shade);
          mesh.count += 1;
        }
      }
      meshes.forEach((mesh) => {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    },
  };
}

// ---- cluster-recording ----
// Takes: the user's own cursor over the live pile, captured at every fixed
// physics step together with the start pile. Recording and replay advance the
// pile through the same private step rule (`applyTakeStep`), so a replayed take
// reproduces the live motion exactly and the exported video shows what the
// user saw.


/** Runtime value target that stores the recording (persisted, undoable). */
const CLUSTER_RECORDING_TARGET = "motion.recording";

/**
 * Per physics step: `0` = no cursor event since the previous step, `null` =
 * cursor released, otherwise the cursor ray `[ox, oy, oz, dx, dy, dz]`.
 */
type ClusterRecordedPointer = 0 | null | readonly [number, number, number, number, number, number];

type ClusterRecording = Readonly<{
  /** The physics the take was recorded with; replay needs exactly these. */
  physics: ClusterPhysics;
  pointers: readonly ClusterRecordedPointer[];
  start: readonly ClusterBody[];
  /** Cursor already active when recording began (no wake at step 0). */
  startPointer: Exclude<ClusterRecordedPointer, 0>;
  startSettled: boolean;
  version: 1;
}>;

/**
 * A take replays only with the physics it was recorded with, judged at the
 * take's own aspect: a resized canvas keeps the take, a cohesion change doesn't.
 */
function takeFitsPhysics(take: ClusterRecording, physics: ClusterPhysics): boolean {
  return samePhysics(take.physics, { ...physics, aspect: take.physics.aspect });
}

function encodeClusterPointer(pointer: ClusterPointer | null): Exclude<ClusterRecordedPointer, 0> {
  return pointer ? [...pointer.origin, ...pointer.direction] : null;
}

function decodeClusterPointer(entry: Exclude<ClusterRecordedPointer, 0>): ClusterPointer | null {
  return entry ? { direction: [entry[3], entry[4], entry[5]], origin: [entry[0], entry[1], entry[2]] } : null;
}

/**
 * The single step rule for takes: apply the step's cursor entry (if any), then
 * advance physics unless the pile rests. Recording and replay both use only
 * this, which is what makes replay exact.
 */
function applyTakeStep(simulation: ClusterSimulation, entry: ClusterRecordedPointer): void {
  if (entry !== 0) simulation.setPointer(decodeClusterPointer(entry));
  if (!simulation.isSettled) simulation.step(CLUSTER_FIXED_STEP_SECONDS);
}

/**
 * Records one take from the live simulation. While recording, the recorder
 * owns the cursor: events are held until the next step and applied there, so
 * the live pile moves exactly as the replay will (at most one step, 1/60 s,
 * of hover latency).
 */
class ClusterMotionRecorder {
  private readonly pointers: ClusterRecordedPointer[] = [];
  private readonly start: ClusterBody[];
  private readonly startPointer: Exclude<ClusterRecordedPointer, 0>;
  private readonly startSettled: boolean;
  private readonly physics: ClusterPhysics;
  private pending: ClusterRecordedPointer = 0;

  constructor(
    private readonly simulation: ClusterSimulation,
    private readonly steps: number,
  ) {
    this.start = simulation.bodies.map(cloneClusterBody);
    this.startSettled = simulation.isSettled;
    this.startPointer = encodeClusterPointer(simulation.currentPointer);
    this.physics = simulation.physics;
  }

  get progress(): number {
    return this.steps > 0 ? this.pointers.length / this.steps : 1;
  }

  get done(): boolean {
    return this.pointers.length >= this.steps;
  }

  /** Cursor event during the take; the latest one before a step wins. */
  setPointer(pointer: ClusterPointer | null): void {
    this.pending = encodeClusterPointer(pointer);
  }

  /** Records the step's cursor entry and advances the live pile one step. */
  step(): boolean {
    if (this.done) return true;
    const entry = this.pending;
    this.pending = 0;
    this.pointers.push(entry);
    applyTakeStep(this.simulation, entry);
    return this.done;
  }

  result(): ClusterRecording {
    return {
      physics: this.physics,
      pointers: [...this.pointers],
      start: this.start.map(cloneClusterBody),
      startPointer: this.startPointer,
      startSettled: this.startSettled,
      version: 1,
    };
  }
}

/** Replays a take step by step; stepping back restarts from the start pile. */
class ClusterTakePlayer {
  private readonly simulation: ClusterSimulation;
  private stepIndex = 0;

  constructor(private readonly take: ClusterRecording) {
    this.simulation = new ClusterSimulation(take.physics);
    this.restart();
  }

  private restart(): void {
    this.simulation.restore(
      this.take.start,
      this.take.startSettled,
      decodeClusterPointer(this.take.startPointer),
    );
    this.stepIndex = 0;
  }

  /** The entry for a step; one step past the take releases the cursor. */
  private entryAt(step: number): ClusterRecordedPointer {
    if (step < this.take.pointers.length) return this.take.pointers[step]!;
    return step === this.take.pointers.length ? null : 0;
  }

  /** A copy of the pile after `steps` physics steps from the start pile. */
  posesAfter(steps: number): ClusterBody[] {
    if (steps < this.stepIndex) this.restart();
    while (this.stepIndex < steps) {
      applyTakeStep(this.simulation, this.entryAt(this.stepIndex));
      this.stepIndex += 1;
    }
    return this.simulation.bodies.map(cloneClusterBody);
  }

  /** The cursor acting during step `step` (null when released or past the take). */
  pointerAt(step: number): ClusterPointer | null {
    if (step >= this.take.pointers.length) return null;
    for (let index = step; index >= 0; index -= 1) {
      const entry = this.take.pointers[index]!;
      if (entry !== 0) return decodeClusterPointer(entry);
    }
    return decodeClusterPointer(this.take.startPointer);
  }
}

function isFiniteTuple(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isBody(value: unknown): value is ClusterBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    isFiniteTuple(body.position, 3) &&
    isFiniteTuple(body.velocity, 3) &&
    isFiniteTuple(body.angularVelocity, 3) &&
    isFiniteTuple(body.orientation, 4) &&
    (body.colorIndex === 0 || body.colorIndex === 1 || body.colorIndex === 2)
  );
}

function isFalloff(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((point) => {
      const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown };
      return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y);
    })
  );
}

function isVec3(value: unknown): boolean {
  return isFiniteTuple(value, 3);
}

/** A stored asset collision: null, or a key plus capsule shapes. */
function isAssetPhysics(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const { collisions, key } = value as { collisions?: unknown; key?: unknown };
  return (
    typeof key === "string" &&
    Array.isArray(collisions) &&
    collisions.length > 0 &&
    collisions.every((shape) => {
      const { boundRadius, capsules } = (shape ?? {}) as { boundRadius?: unknown; capsules?: unknown };
      return (
        typeof boundRadius === "number" &&
        Number.isFinite(boundRadius) &&
        Array.isArray(capsules) &&
        // Per-body world capsule buffers hold at most CLUSTER_MAX_CAPSULES.
        capsules.length > 0 &&
        capsules.length <= CLUSTER_MAX_CAPSULES &&
        capsules.every((capsule) => {
          const { a, b, radius } = (capsule ?? {}) as { a?: unknown; b?: unknown; radius?: unknown };
          return isVec3(a) && isVec3(b) && typeof radius === "number" && Number.isFinite(radius);
        })
      );
    })
  );
}

/** Validates a stored value; anything malformed counts as no recording. */
function decodeClusterRecording(value: unknown): ClusterRecording | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const physics = candidate.physics as Record<string, unknown> | undefined;
  if (
    candidate.version !== 1 ||
    typeof candidate.startSettled !== "boolean" ||
    !(candidate.startPointer === null || isFiniteTuple(candidate.startPointer, 6)) ||
    !physics ||
    typeof physics !== "object" ||
    !["aspect", "cohesion", "count", "size"].every(
      (key) => typeof physics[key] === "number" && Number.isFinite(physics[key]),
    ) ||
    !clusterShapes.includes(physics.shape as ClusterShape) ||
    !["damping", "pushRadius", "pushStrength"].every(
      (key) =>
        physics[key] === undefined ||
        (typeof physics[key] === "number" && Number.isFinite(physics[key])),
    ) ||
    !(physics.pushFalloff === undefined || isFalloff(physics.pushFalloff)) ||
    !isAssetPhysics(physics.asset) ||
    !Array.isArray(candidate.start) ||
    !candidate.start.every(isBody) ||
    !Array.isArray(candidate.pointers) ||
    !candidate.pointers.every(
      (entry) => entry === 0 || entry === null || isFiniteTuple(entry, 6),
    )
  ) {
    return null;
  }
  // Takes saved before physics was normalized stored the raw frame aspect, and
  // takes saved before the feel controls were recorded with their defaults.
  const recording = candidate as unknown as ClusterRecording;
  const defaults = readClusterSettings({});
  return {
    ...recording,
    physics: {
      ...recording.physics,
      aspect: roundClusterAspect(recording.physics.aspect),
      asset: recording.physics.asset ?? null,
      damping: recording.physics.damping ?? defaults.damping,
      pushFalloff: recording.physics.pushFalloff ?? defaults.pushFalloff,
      pushRadius: recording.physics.pushRadius ?? defaults.pushRadius,
      pushStrength: recording.physics.pushStrength ?? defaults.pushStrength,
    },
  };
}

const keys = new WeakMap<object, string>();

/** Content key (FNV-1a over the JSON), cached per recording object. */
function clusterRecordingKey(recording: ClusterRecording): string {
  const cached = keys.get(recording);
  if (cached) return cached;
  const text = JSON.stringify(recording);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const key = `${text.length}:${(hash >>> 0).toString(36)}`;
  keys.set(recording, key);
  return key;
}

// ---- cluster-engine ----
/** `sequence` = showing timeline-driven poses instead of the live simulation. */
type ClusterEngineStatus = "moving" | "sequence" | "settled";

type ClusterBacking = Readonly<{
  backingHeight: number;
  backingWidth: number;
  cssHeight: number;
  cssWidth: number;
}>;

type ClusterFrameHooks = Readonly<{
  /** Wraps one simulation advance; returns whether poses moved. */
  simulate: (advance: () => boolean) => Promise<boolean>;
  /** Wraps one GPU draw. */
  render: (draw: () => void) => Promise<void>;
}>;

/** Length of the selection highlight pulse. */
const CLUSTER_HIGHLIGHT_SECONDS = 1.2;

const directHooks: ClusterFrameHooks = {
  render: async (draw) => draw(),
  simulate: async (advance) => advance(),
};

function appearanceOf(settings: ClusterSettings): ClusterAppearance {
  return {
    accent: settings.accent,
    dark: settings.dark,
    gloss: settings.gloss,
    light: settings.light,
    shape: settings.shape,
  };
}

function sameAppearance(a: ClusterAppearance, b: ClusterAppearance): boolean {
  return (
    a.accent === b.accent &&
    a.dark === b.dark &&
    a.gloss === b.gloss &&
    a.light === b.light &&
    a.shape === b.shape
  );
}

/**
 * Owns the live WebGL renderer, the simulation and the animation loop for one
 * mounted canvas. The loop only steps while the cluster moves and only draws
 * when something visible changed; with idle drift off a settled cluster is
 * pixel-stable, with drift on it keeps drawing (physics stays at rest).
 */
class ClusterEngine {
  readonly simulation: ClusterSimulation;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly environment: THREE.Texture;
  private camera: THREE.PerspectiveCamera;
  private sceneHandle: ClusterSceneHandle | null = null;
  private geometry: ClusterPileGeometry | null = null;
  private appearance: ClusterAppearance;
  private settings: ClusterSettings;
  private backing: ClusterBacking | null = null;
  private aspect = 16 / 9;
  private frameRequest = 0;
  private lastTime = 0;
  private drawnVersion = -1;
  private dirty = true;
  private paused = false;
  private running = false;
  private busy = false;
  private disposed = false;
  private hooks: ClusterFrameHooks = directHooks;
  private sequencePose: readonly ClusterBody[] | null = null;
  private sequenceTime = 0;
  /** Idle drift time on the live pile; frozen while paused. */
  private driftClock = 0;
  private driftLoopSeconds = 8;
  private reducedMotion = false;
  private recording: {
    accumulator: number;
    onProgress: (progress: number) => void;
    recorder: ClusterMotionRecorder;
    reject: (error: Error) => void;
    resolve: (recording: ClusterRecording) => void;
  } | null = null;
  private status: ClusterEngineStatus = "moving";
  private frameCount = 0;
  private readonly listeners = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement, settings: ClusterSettings) {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      // Resolution scale (default 2×) already supersamples; MSAA would only add cost.
      antialias: false,
      canvas,
      powerPreference: "high-performance",
      // Keeps the last frame readable for pixel proofs and screenshots.
      preserveDrawingBuffer: true,
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(1);
    configureClusterRenderer(this.renderer);
    this.environment = createClusterEnvironment(this.renderer);
    this.camera = createClusterCamera(16, 9);
    this.settings = settings;
    this.appearance = appearanceOf(settings);
    this.simulation = new ClusterSimulation(physicsOf(settings, 16 / 9));
  }

  get currentStatus(): ClusterEngineStatus {
    return this.status;
  }

  get renderedFrames(): number {
    return this.frameCount;
  }

  get currentGeometry(): ClusterPileGeometry | null {
    return this.geometry;
  }

  get currentSettings(): ClusterSettings {
    return this.settings;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setHooks(hooks: ClusterFrameHooks | null): void {
    this.hooks = hooks ?? directHooks;
  }

  /**
   * The pile to draw: geometry, the uploaded asset's collision and part
   * materials together, so a change of all three rebuilds the scene once.
   */
  setPile(
    geometry: ClusterPileGeometry | null,
    asset: ClusterAssetPhysics | null,
    materials: ClusterPartMaterials | null,
  ): void {
    if (geometry !== this.geometry) {
      this.partMaterials = materials;
      this.setGeometry(geometry);
    } else {
      this.setPartMaterials(materials);
    }
    this.setAssetPhysics(asset);
  }

  setGeometry(geometry: ClusterPileGeometry | null): void {
    if (geometry === this.geometry) return;
    this.geometry = geometry;
    this.rebuildScene();
  }

  private assetPhysics: ClusterAssetPhysics | null = null;
  private partMaterials: ClusterPartMaterials | null = null;

  /**
   * Uploaded part materials. Field edits update the scene's materials in
   * place; only a change of which parts are Custom, their shading or colour
   * source rebuilds the scene.
   */
  setPartMaterials(materials: ClusterPartMaterials | null): void {
    const previous = this.partMaterials;
    this.partMaterials = materials;
    if ((materials?.key ?? "") === (previous?.key ?? "")) return;
    if (materials && previous && materials.structureKey === previous.structureKey && this.sceneHandle) {
      this.sceneHandle.updatePartMaterials(materials.materialOf);
      this.dirty = true;
      this.kick();
      return;
    }
    this.rebuildScene();
  }
  private highlightKind: number | null = null;
  private highlightStart = 0;

  /**
   * Briefly dims every other piece kind so the copies of `kind` stand out
   * (selecting an object in the Asset list). Live preview only: export and
   * the timeline sequence frames never carry it.
   */
  pulseHighlight(kind: number | null): void {
    this.highlightKind = kind;
    this.highlightStart = performance.now();
    this.dirty = true;
    this.kick();
  }

  /** The highlight at `now`: fades in, holds, fades out over CLUSTER_HIGHLIGHT_SECONDS. */
  private highlightAt(now: number): ClusterHighlight | undefined {
    if (this.highlightKind === null) return undefined;
    // rAF timestamps can trail the performance.now() the pulse started at.
    const t = Math.max(0, (now - this.highlightStart) / 1000 / CLUSTER_HIGHLIGHT_SECONDS);
    if (t >= 1) {
      this.highlightKind = null;
      this.dirty = true;
      return undefined;
    }
    const strength = t < 0.15 ? t / 0.15 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    return { kind: this.highlightKind, strength };
  }

  /** The uploaded asset's collision; physics uses it while Shape is "uploaded". */
  setAssetPhysics(asset: ClusterAssetPhysics | null): void {
    if (asset === this.assetPhysics) return;
    this.assetPhysics = asset;
    this.setSettings(this.settings);
  }

  /** Also called by `setBacking`, so a resize mid-take is a physics change too. */
  setSettings(settings: ClusterSettings): void {
    const physics = physicsOf(settings, this.aspect, this.assetPhysics);
    if (this.recording && !samePhysics(physics, this.simulation.physics)) {
      // Physics changed mid-take; the take could not be replayed faithfully.
      this.cancelRecording("Recording stopped because the physics settings changed.");
    }
    const nextAppearance = appearanceOf(settings);
    const appearanceChanged = !sameAppearance(nextAppearance, this.appearance);
    this.settings = settings;
    this.appearance = nextAppearance;
    this.simulation.setPhysics(physics);
    if (appearanceChanged) this.rebuildScene();
    this.dirty = true;
    this.kick();
  }

  setBacking(backing: ClusterBacking | null): void {
    this.backing = backing;
    if (backing) {
      this.renderer.setSize(backing.backingWidth, backing.backingHeight, false);
      this.renderer.transmissionResolutionScale = clusterLiveTransmissionScale(
        backing.backingWidth,
        backing.backingHeight,
      );
      this.camera = createClusterCamera(backing.cssWidth, backing.cssHeight);
      this.aspect = backing.cssWidth / Math.max(1, backing.cssHeight);
      this.setSettings(this.settings);
    }
    this.dirty = true;
    this.kick();
  }

  /** Drift frequencies snap to whole cycles per timeline loop. */
  setDriftLoopSeconds(seconds: number): void {
    if (!(seconds > 0) || seconds === this.driftLoopSeconds) return;
    this.driftLoopSeconds = seconds;
    this.dirty = true;
    this.kick();
  }

  /**
   * Honors prefers-reduced-motion: the live pile holds its drift still.
   * Timeline preview and export stay a pure function of time.
   */
  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    this.dirty = true;
    this.kick();
  }

  private effectClock = 0;
  private readonly customEffectChecks = new Map<string, string | null>();

  /**
   * Compiler log of a Custom GLSL snippet on this renderer's WebGL context, or
   * null when it compiles. Cached per snippet, least recently used out after
   * 32; a "could not check" result (no context) is never cached.
   */
  checkCustomEffect(code: string): string | null {
    const cached = this.customEffectChecks.get(code);
    if (cached !== undefined) {
      this.customEffectChecks.delete(code);
      this.customEffectChecks.set(code, cached);
      return cached;
    }
    const result = checkClusterCustomEffect(this.renderer.getContext(), code);
    if (result === CLUSTER_SHADER_UNCHECKED) return result;
    if (this.customEffectChecks.size >= 32) {
      this.customEffectChecks.delete(this.customEffectChecks.keys().next().value!);
    }
    this.customEffectChecks.set(code, result);
    return result;
  }

  /** Animated part effects keep the live pile drawing (unless reduced motion). */
  private get effectsAnimate(): boolean {
    return this.sceneHandle?.animated === true && !this.reducedMotion;
  }

  /** The live pile keeps animating for drift alone. */
  private get drifting(): boolean {
    return this.settings.driftAmount > 0 && !this.reducedMotion;
  }

  /** Viewport pan/zoom suspends stepping; the cluster resumes where it was. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.simulation.setPaused(paused);
    this.lastTime = 0;
    // A pulse requested during a pan or zoom plays in full once the view settles.
    if (!paused && this.highlightKind !== null) this.highlightStart = performance.now();
    if (!paused) this.kick();
  }

  /**
   * Shows timeline-driven poses (playback, scrubbing) instead of the live pile.
   * The live simulation freezes meanwhile and resumes untouched on `null`.
   */
  setSequencePose(bodies: readonly ClusterBody[] | null, timeSeconds = 0): void {
    if (bodies === null && this.sequencePose === null) return;
    this.sequencePose = bodies;
    if (bodies === null) {
      this.lastTime = 0;
      // The live drift and effects pick up where the timeline frame left them: no jump.
      this.driftClock = this.sequenceTime;
      this.effectClock = this.sequenceTime;
    } else {
      this.sequenceTime = timeSeconds;
    }
    this.dirty = true;
    this.kick();
  }

  get showingSequence(): boolean {
    return this.sequencePose !== null;
  }

  /**
   * Hands the pose on screen to the live simulation so cursor hover can push
   * it immediately, without a visual jump from the timeline frame.
   */
  takeOverSequence(): void {
    const pose = this.sequencePose;
    if (!pose) return;
    this.simulation.restore(pose, false);
    this.setSequencePose(null);
  }

  /**
   * Records the user's cursor over the live pile for `steps` fixed physics
   * steps, starting from the pile on screen. Physics runs exactly as it will
   * be replayed for export.
   */
  record(steps: number, onProgress: (progress: number) => void): Promise<ClusterRecording> {
    if (this.recording) return Promise.reject(new Error("A recording is already running."));
    this.takeOverSequence();
    return new Promise((resolve, reject) => {
      this.recording = {
        accumulator: 0,
        onProgress,
        recorder: new ClusterMotionRecorder(this.simulation, steps),
        reject,
        resolve,
      };
      this.lastTime = 0;
      this.kick();
    });
  }

  private cancelRecording(reason: string): void {
    const recording = this.recording;
    if (!recording) return;
    this.recording = null;
    recording.reject(new Error(reason));
  }

  /** Cursor position in canvas-local normalized device coordinates. */
  setPointer(ndc: Readonly<{ x: number; y: number }> | null): void {
    // Hover belongs to the live pile; the timeline owns motion in sequence mode.
    if (this.sequencePose) return;
    if (!ndc) {
      this.applyPointer(null);
      return;
    }
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    const pointer: ClusterPointer = {
      direction: [
        raycaster.ray.direction.x,
        raycaster.ray.direction.y,
        raycaster.ray.direction.z,
      ],
      origin: [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
    };
    this.applyPointer(pointer);
    this.kick();
  }

  /** During a take the recorder owns the cursor (applied at its next step). */
  private applyPointer(pointer: ClusterPointer | null): void {
    if (this.recording) this.recording.recorder.setPointer(pointer);
    else this.simulation.setPointer(pointer);
  }

  start(): void {
    this.running = true;
    this.kick();
  }

  dispose(): void {
    this.cancelRecording("Recording stopped because the canvas closed.");
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.frameRequest);
    this.sceneHandle?.dispose();
    this.sceneHandle = null;
    this.environment.dispose();
    this.renderer.dispose();
    this.listeners.clear();
  }

  private rebuildScene(): void {
    this.sceneHandle?.dispose();
    this.sceneHandle = this.geometry
      ? createClusterScene({
          appearance: this.appearance,
          environment: this.environment,
          geometry: this.geometry,
          maxInstances: clusterLimits.count.max,
          ...(this.partMaterials ? { partMaterial: this.partMaterials.materialOf } : {}),
          checkCustomEffect: (code) => this.checkCustomEffect(code),
        })
      : null;
    this.dirty = true;
    this.kick();
  }

  private kick(): void {
    if (!this.running || this.disposed || this.frameRequest !== 0) return;
    this.frameRequest = requestAnimationFrame((time) => {
      this.frameRequest = 0;
      void this.tick(time);
    });
  }

  private settledOnce = false;

  /** False until the freshly spawned pile has come to rest once. */
  get hasSettledOnce(): boolean {
    return this.settledOnce;
  }

  private setStatus(status: ClusterEngineStatus): void {
    if (status === "settled") this.settledOnce = true;
    if (status === this.status) return;
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }

  private async tick(time: number): Promise<void> {
    if (this.disposed || this.busy) return;
    this.busy = true;
    try {
      const delta = this.lastTime === 0 ? 1 / 60 : (time - this.lastTime) / 1000;
      this.lastTime = time;
      const sequence = this.sequencePose;
      const recording = this.recording;
      if (recording) {
        // Fixed steps against wall time, settled or not, exactly like replay.
        recording.accumulator += Math.min(delta, CLUSTER_FIXED_STEP_SECONDS * 8);
        await this.hooks.simulate(() => {
          let stepped = false;
          while (recording.accumulator >= CLUSTER_FIXED_STEP_SECONDS && !recording.recorder.done) {
            recording.recorder.step();
            recording.accumulator -= CLUSTER_FIXED_STEP_SECONDS;
            stepped = true;
          }
          if (stepped) this.simulation.version += 1;
          return stepped;
        });
        recording.onProgress(recording.recorder.progress);
        if (recording.recorder.done && this.recording === recording) {
          this.recording = null;
          recording.resolve(recording.recorder.result());
        }
      } else if (!sequence && !this.paused && !this.simulation.isSettled) {
        await this.hooks.simulate(() => this.simulation.advance(delta));
      }
      const driftMoves = !sequence && !this.paused && this.drifting;
      if (driftMoves) this.driftClock += Math.min(delta, 0.1);
      // Animated part effects run on their own clock, frozen under reduced motion.
      const effectsMove = !sequence && !this.paused && this.effectsAnimate;
      if (effectsMove) this.effectClock += Math.min(delta, 0.1);
      // The live pile only: timeline sequence frames match export exactly.
      if (sequence) this.highlightKind = null;
      const highlight = this.highlightAt(time);
      const needsDraw =
        this.dirty ||
        driftMoves ||
        effectsMove ||
        highlight !== undefined ||
        (!sequence && this.drawnVersion !== this.simulation.version);
      if (needsDraw && this.backing && this.sceneHandle) {
        const handle = this.sceneHandle;
        await this.hooks.render(() => {
          // Whole loops per timeline duration: sequence frames match export.
          handle.setLoopPhase(
            (sequence ? this.sequenceTime : this.effectClock) / this.driftLoopSeconds,
            this.driftLoopSeconds,
          );
          handle.updatePoses(
            sequence ?? this.simulation.bodies,
            this.settings.size,
            sequence || !this.reducedMotion
              ? clusterDriftOf(this.settings, this.driftLoopSeconds)
              : clusterDriftOf({ ...this.settings, driftAmount: 0 }, this.driftLoopSeconds),
            sequence ? this.sequenceTime : this.driftClock,
            highlight,
          );
          this.renderer.render(handle.scene, this.camera);
        });
        this.drawnVersion = this.simulation.version;
        this.dirty = false;
        this.frameCount += 1;
      }
      this.setStatus(
        sequence
          ? "sequence"
          : this.simulation.isSettled && !this.dirty
            ? "settled"
            : "moving",
      );
    } finally {
      this.busy = false;
    }
    if (this.recording) {
      this.kick();
      return;
    }
    if (this.paused) return;
    const live = this.sequencePose === null;
    if (
      this.dirty ||
      this.highlightKind !== null ||
      (live && (!this.simulation.isSettled || this.drifting || this.effectsAnimate))
    ) {
      this.kick();
    } else {
      this.lastTime = 0;
    }
  }
}

// ---- cluster-asset-gltf ----
// Copied React component: turns a GLTFLoader scene into the node tree the
// editor's model presentation builds (one Group per glTF node, its primitive
// Meshes inside), so `extractClusterAsset` finds the same objects and parts.
// Nodes are tagged with name keys (name, then name#2 ... among same-named
// siblings): the editor bakes edits under the same keys, so they survive a
// re-export of the model.



/** Asset key the copied component extracts its model under. */
const CLUSTER_COPIED_ASSET_KEY = "copied-asset";

/** Name key of a node among its siblings: "Chair", then "Chair#2", ... */
function clusterNodeKey(name: string, occurrence: number): string {
  return occurrence <= 1 ? name : `${name}#${occurrence}`;
}

/** Attribute layout of a geometry: primitives merge only with the same layout. */
function layoutOf(geometry: THREE.BufferGeometry): string {
  return [
    geometry.index ? "indexed" : "flat",
    ...Object.entries(geometry.attributes)
      .map(([name, attribute]) => `${name}:${attribute.itemSize}`)
      .sort(),
  ].join("|");
}

/**
 * A node's primitives as the editor draws them: merged per material and
 * attribute layout, in order of first appearance.
 */
function nodeParts(primitives: readonly Readonly<{ matrix: THREE.Matrix4; mesh: THREE.Mesh }>[]): THREE.Mesh[] {
  const batches = new Map<string, { geometries: THREE.BufferGeometry[]; material: THREE.Mesh["material"] }>();
  for (const { matrix, mesh } of primitives) {
    const geometry = mesh.geometry.clone().applyMatrix4(matrix);
    const materialKey = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.uuid).join(",")
      : mesh.material.uuid;
    const key = `${materialKey}#${layoutOf(geometry)}`;
    const batch = batches.get(key);
    if (batch) batch.geometries.push(geometry);
    else batches.set(key, { geometries: [geometry], material: mesh.material });
  }
  return [...batches.values()].map(({ geometries, material }) => {
    const geometry = geometries.length === 1 ? geometries[0]! : (mergeGeometries(geometries) ?? geometries[0]!);
    return new THREE.Mesh(geometry, material);
  });
}

/**
 * Builds the editor's node tree from a GLTFLoader scene: one Group per glTF
 * node that has meshes below it (cameras, lights and empty nodes are left out,
 * like the editor), with the node's primitives merged into its parts.
 * `nodeName` returns a glTF node's original name from the file's JSON
 * (GLTFLoader sanitizes and renames objects), or null for a primitive Mesh that
 * is not a node: a single-primitive node is a Mesh itself, a multi-primitive
 * node a Group of primitive Meshes (GLTFLoader keeps the link in
 * `parser.associations`).
 */
function normalizeClusterGltfScene(
  scene: THREE.Object3D,
  nodeName: (object: THREE.Object3D) => string | null,
): THREE.Group {
  scene.updateMatrixWorld(true);
  const root = new THREE.Group();
  const isPrimitive = (object: THREE.Object3D) => (object as THREE.Mesh).isMesh && nodeName(object) === null;

  /** The node as a Group, or null when nothing below it is drawn. */
  const convert = (object: THREE.Object3D): THREE.Group | null => {
    const group = new THREE.Group();
    group.name = nodeName(object) ?? object.name;
    group.matrixAutoUpdate = false;
    group.matrix.copy(object.matrix);
    const primitives: { matrix: THREE.Matrix4; mesh: THREE.Mesh }[] = [];
    if ((object as THREE.Mesh).isMesh) primitives.push({ matrix: new THREE.Matrix4(), mesh: object as THREE.Mesh });
    for (const child of object.children) {
      if (isPrimitive(child)) primitives.push({ matrix: child.matrix, mesh: child as THREE.Mesh });
    }
    nodeParts(primitives).forEach((part) => group.add(part));
    for (const child of object.children) {
      if (isPrimitive(child)) continue;
      const converted = convert(child);
      if (converted) group.add(converted);
    }
    return group.children.length > 0 ? group : null;
  };

  for (const child of scene.children) {
    const converted = convert(child);
    if (converted) root.add(converted);
  }
  return root;
}

/**
 * Name keys of an asset's objects: the node's own name, then name#2 ... for
 * repeats, in object order. The editor bakes edits under these keys and the
 * copied component computes the same keys for its own extraction.
 */
function clusterObjectNameKeys(asset: ClusterAsset): string[] {
  const seen = new Map<string, number>();
  return asset.objects.map((object) => {
    const occurrence = (seen.get(object.sourceName) ?? 0) + 1;
    seen.set(object.sourceName, occurrence);
    return clusterNodeKey(object.sourceName, occurrence);
  });
}

/** A baked view (name keys) translated to this asset's object ids. */
function rekeyClusterAssetView(asset: ClusterAsset, view: ClusterAssetView): ClusterAssetView {
  const idByKey = new Map(clusterObjectNameKeys(asset).map((key, index) => [key, asset.objects[index]!.nodeId]));
  const rekey = (key: string): string => {
    if (idByKey.has(key)) return idByKey.get(key)!;
    const slash = key.lastIndexOf("/");
    const object = slash < 0 ? undefined : idByKey.get(key.slice(0, slash));
    return object === undefined ? key : `${object}${key.slice(slash)}`;
  };
  const remap = <T,>(record: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [rekey(key), value]));
  return { ...view, assetKey: asset.key, materials: remap(view.materials), visibility: remap(view.visibility) };
}

/** Frees what GLTFLoader created: geometries, materials and their textures. */
function disposeClusterGltf(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).dispose();
      }
      material.dispose();
    }
  });
}

// ---- cluster-asset-proxy ----
// Copy React code: the low-poly copy of the uploaded asset that the copied
// component draws while GLTFLoader fetches the real file. The editor bakes it
// (cluster-asset-proxy-bake); this module, which travels with the component,
// rebuilds it as a ClusterAsset so the same deal, physics and part materials
// apply until the loaded model replaces it.



/** Positions are stored as integers of this fraction (objects are normalized to radius <= 1). */
const CLUSTER_PROXY_POSITION_SCALE = 1000;

type ClusterProxyMaterial = Readonly<{
  color: number;
  emissive: number;
  metalness: number;
  opacity: number;
  roughness: number;
}>;

type ClusterProxyPart = Readonly<{
  indices: readonly number[];
  material: ClusterProxyMaterial;
  name: string;
  /** Object-space positions times CLUSTER_PROXY_POSITION_SCALE, rounded. */
  positions: readonly number[];
}>;

type ClusterProxyObject = Readonly<{
  /** Collision of the dealt parts, exactly as the editor simulates them; null when not dealt. */
  collision: ClusterCollisionShape | null;
  name: string;
  /** Parts in asset order; null for a part that is not dealt. */
  parts: readonly (ClusterProxyPart | null)[];
  radius: number;
  shown: boolean;
  sourceName: string;
}>;

/** Every object in asset order (name keys depend on it), geometry for dealt parts only. */
type ClusterAssetProxy = Readonly<{
  objects: readonly ClusterProxyObject[];
  /** The editor asset's deal limit. */
  shownLimit: number;
}>;

function proxyPartOf(proxy: ClusterProxyPart | null, name: string): ClusterAssetPart {
  const geometry = new THREE.BufferGeometry();
  const positions = Float32Array.from(proxy?.positions ?? [], (value) => value / CLUSTER_PROXY_POSITION_SCALE);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(Array.from(proxy?.indices ?? []));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const numbers = proxy?.material;
  const material = new THREE.MeshStandardMaterial({
    color: numbers?.color ?? 0xcccccc,
    emissive: numbers?.emissive ?? 0,
    flatShading: true,
    metalness: numbers?.metalness ?? 0,
    opacity: numbers?.opacity ?? 1,
    roughness: numbers?.roughness ?? 0.5,
    transparent: (numbers?.opacity ?? 1) < 1,
  });
  return { geometry, material, name: proxy?.name ?? name };
}

let proxies = 0;

/** The baked proxy as a ClusterAsset under `key`; it owns (and frees) its geometry and materials. */
function createClusterProxyAsset(proxy: ClusterAssetProxy, key: string): ClusterAsset {
  const objects: ClusterAssetObject[] = proxy.objects.map((source, objectIndex) => {
    const parts = source.parts.map((part, index) => proxyPartOf(part, `Part ${index + 1}`));
    const bakedKey = source.parts.flatMap((part, index) => (part ? [index] : [])).join(",");
    // Another part set than the baked one (not expected: the copied view deals
    // the same parts) is fitted from the low-poly geometry, once per set.
    const fitted = new Map<string, ClusterCollisionShape>();
    const collisionOf = (partIndices: readonly number[]): ClusterCollisionShape => {
      const setKey = partIndices.join(",");
      if (source.collision && setKey === bakedKey) return source.collision;
      let shape = fitted.get(setKey);
      if (!shape) {
        const geometries = partIndices
          .map((index) => parts[index]!.geometry)
          .filter((geometry) => triangleCount(geometry) > 0);
        shape =
          geometries.length > 0
            ? fitClusterCollision(geometries)
            : (source.collision ?? getClusterCollisionShape(CLUSTER_UPLOAD_FALLBACK_SHAPE));
        fitted.set(setKey, shape);
      }
      return shape;
    };
    const allParts = parts.map((_, index) => index);
    return {
      get collision() {
        return collisionOf(allParts);
      },
      collisionOf,
      heavy: false,
      name: source.name,
      nodeId: `proxy-${objectIndex}`,
      parts,
      radius: source.radius,
      shown: source.shown,
      sourceName: source.sourceName,
      triangles: parts.reduce((sum, part) => sum + triangleCount(part.geometry), 0),
    };
  });

  let holders = 1;
  const release = () => {
    holders -= 1;
    if (holders !== 0) return;
    for (const object of objects) {
      for (const part of object.parts) {
        part.geometry.dispose();
        (part.material as THREE.Material).dispose();
      }
    }
  };
  proxies += 1;
  let creatorReleased = false;
  return {
    dispose: () => {
      if (creatorReleased) return;
      creatorReleased = true;
      release();
    },
    instance: `${key}#proxy${proxies}`,
    key,
    objects,
    shownLimit: proxy.shownLimit,
    retain: () => {
      holders += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
      };
    },
  };
}

// ---- Settings baked from the editor ----
const KINETIC_CLUSTER_SETTINGS: ClusterSettings = {
  "accent": "#49A603",
  "cohesion": 1.85,
  "count": 72,
  "damping": 3,
  "dark": "#C59E02",
  "driftAmount": 0.8,
  "driftSpeed": 0.22,
  "gloss": 1,
  "light": "#C80404",
  "pushFalloff": [
    {
      "x": 0,
      "y": 0
    },
    {
      "x": 0.5027372262773724,
      "y": 0.6754248403284672
    },
    {
      "x": 1,
      "y": 0
    }
  ],
  "pushRadius": 3.3,
  "pushStrength": 3,
  "shape": "uploaded",
  "size": 0.75
};
const KINETIC_CLUSTER_BACKGROUND: string | null = null;
const KINETIC_CLUSTER_LOOP_SECONDS = 30;
/** Object and part edits from the editor, keyed by node name. */
const KINETIC_CLUSTER_ASSET: { view: ClusterAssetView; wholeAsset: ClusterPartMaterial } | null = {
  "view": {
    "assetKey": "copied-asset",
    "materials": {
      "*": {
        "clearcoat": 0.6,
        "color": "#999999",
        "colorSource": "fixed",
        "detail": "advanced",
        "effect": "none",
        "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
        "effectColor": "#7FE8FF",
        "effectIntensity": 0.78,
        "effectScale": 0.75,
        "emissive": 0,
        "metalness": 0,
        "mode": "original",
        "opacity": 1,
        "roughness": 0.35,
        "shading": "standard",
        "transmission": 0
      },
      "Orange/0": {
        "clearcoat": 0.6,
        "color": "#999999",
        "colorSource": "fixed",
        "detail": "advanced",
        "effect": "none",
        "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
        "effectColor": "#7FE8FF",
        "effectIntensity": 0.78,
        "effectScale": 0.75,
        "emissive": 0,
        "metalness": 0,
        "mode": "original",
        "opacity": 1,
        "roughness": 0.35,
        "shading": "standard",
        "transmission": 0
      },
      "Red/0": {
        "clearcoat": 0.6,
        "color": "#999999",
        "colorSource": "fixed",
        "detail": "advanced",
        "effect": "none",
        "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
        "effectColor": "#7FE8FF",
        "effectIntensity": 0.78,
        "effectScale": 0.75,
        "emissive": 0,
        "metalness": 0,
        "mode": "original",
        "opacity": 1,
        "roughness": 0.35,
        "shading": "standard",
        "transmission": 0
      },
      "Brown/0": {
        "clearcoat": 0.6,
        "color": "#999999",
        "colorSource": "fixed",
        "detail": "advanced",
        "effect": "none",
        "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
        "effectColor": "#7FE8FF",
        "effectIntensity": 0.78,
        "effectScale": 0.75,
        "emissive": 0,
        "metalness": 0,
        "mode": "original",
        "opacity": 1,
        "roughness": 0.35,
        "shading": "standard",
        "transmission": 0
      },
      "Green/0": {
        "clearcoat": 0.6,
        "color": "#999999",
        "colorSource": "fixed",
        "detail": "advanced",
        "effect": "none",
        "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
        "effectColor": "#7FE8FF",
        "effectIntensity": 0.78,
        "effectScale": 0.75,
        "emissive": 0,
        "metalness": 0,
        "mode": "original",
        "opacity": 1,
        "roughness": 0.35,
        "shading": "standard",
        "transmission": 0
      },
      "Blue/0": {
        "clearcoat": 0.6,
        "color": "#999999",
        "colorSource": "fixed",
        "detail": "advanced",
        "effect": "none",
        "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
        "effectColor": "#7FE8FF",
        "effectIntensity": 0.78,
        "effectScale": 0.75,
        "emissive": 0,
        "metalness": 0,
        "mode": "original",
        "opacity": 1,
        "roughness": 0.35,
        "shading": "standard",
        "transmission": 0
      },
      "Yellow/0": {
        "clearcoat": 0.6,
        "color": "#999999",
        "colorSource": "fixed",
        "detail": "advanced",
        "effect": "none",
        "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
        "effectColor": "#7FE8FF",
        "effectIntensity": 0.78,
        "effectScale": 0.75,
        "emissive": 0,
        "metalness": 0,
        "mode": "original",
        "opacity": 1,
        "roughness": 0.35,
        "shading": "standard",
        "transmission": 0
      }
    },
    "selected": null,
    "selectedPart": null,
    "visibility": {
      "Orange": true,
      "Orange/0": true,
      "Red": true,
      "Red/0": true,
      "Brown": true,
      "Brown/0": true,
      "Green": true,
      "Green/0": true,
      "Blue": true,
      "Blue/0": true,
      "Yellow": true,
      "Yellow/0": true
    }
  },
  "wholeAsset": {
    "clearcoat": 0.6,
    "color": "#999999",
    "colorSource": "fixed",
    "detail": "advanced",
    "effect": "none",
    "effectCode": "// Inputs: baseColor, localPosition, normal, viewDir,\n// loopPhase (0 to 1 per timeline loop), loopTime (seconds),\n// effectColor, intensity, scale. Return the final colour.\n// Animate with loopPhase (whole cycles) so the video loops seamlessly.\nfloat bands = 0.5 + 0.5 * sin(6.2831853 * (localPosition.y * (2.0 + 10.0 * scale) - loopPhase));\nreturn mix(baseColor, effectColor, bands * intensity);",
    "effectColor": "#7FE8FF",
    "effectIntensity": 0.78,
    "effectScale": 0.75,
    "emissive": 0,
    "metalness": 0,
    "mode": "original",
    "opacity": 1,
    "roughness": 0.35,
    "shading": "standard",
    "transmission": 0
  }
};
/** Low-poly copy of the model, drawn until modelUrl has loaded. */
const KINETIC_CLUSTER_PROXY: ClusterAssetProxy | null = {"objects":[{"collision":{"boundRadius":1.3306405285509637,"capsules":[{"a":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"b":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"radius":0.5890018578396757},{"a":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"b":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"radius":0.6122787342797343},{"a":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"b":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"radius":0.6396381347819958},{"a":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"b":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"radius":0.6012087534729326},{"a":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"b":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"radius":0.5522395237329509},{"a":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"b":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"radius":0.5905036125390997},{"a":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"b":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"radius":0.5893168238079317},{"a":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"b":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"radius":0.5953333003328203}]},"name":"Orange","parts":[{"indices":[0,1,2,0,2,3,0,3,4,0,5,6,0,6,7,0,7,1,8,9,10,8,11,9,8,12,11,8,13,14,8,15,13,8,10,15,1,16,17,1,17,18,1,18,2,2,18,19,2,19,20,2,20,3,3,20,21,3,21,22,3,22,4,4,22,23,4,23,24,0,4,24,0,24,25,0,25,26,0,26,5,5,26,27,5,27,28,5,28,29,5,29,6,6,29,30,6,30,31,6,31,7,7,31,32,7,32,16,1,7,16,16,33,34,16,34,35,16,35,17,17,35,18,18,35,36,18,36,19,19,36,37,19,37,38,19,38,20,20,38,39,20,39,21,21,39,40,21,40,22,22,40,41,22,41,23,23,41,42,23,42,43,23,43,24,24,43,44,24,44,25,25,44,26,26,44,45,26,45,27,27,45,46,27,46,28,28,46,47,28,47,29,29,47,48,29,48,30,30,48,49,30,49,31,31,49,50,31,50,32,32,50,33,16,32,33,33,51,52,33,52,34,34,52,53,34,53,35,35,53,54,35,54,55,35,55,36,36,55,56,36,56,37,37,56,57,37,57,38,38,57,58,38,58,39,39,58,59,39,59,60,39,60,40,40,60,61,40,61,41,41,61,62,41,62,42,42,62,63,42,63,43,43,63,64,43,64,44,44,64,65,44,65,66,44,66,45,45,66,67,45,67,46,46,67,68,46,68,47,47,68,69,47,69,48,48,69,70,48,70,71,48,71,49,49,71,72,49,72,50,50,72,51,33,50,51,51,73,74,51,74,52,52,74,75,52,75,53,53,75,76,53,76,54,54,76,77,54,77,55,55,77,78,55,78,56,56,78,79,56,79,57,57,79,80,57,80,58,58,80,81,58,81,59,59,81,82,59,82,60,60,82,83,60,83,61,61,83,84,61,84,62,62,84,85,62,85,63,63,85,86,63,86,64,64,86,87,64,87,65,65,87,88,65,88,66,66,88,89,66,89,67,67,89,90,67,90,68,68,90,91,68,91,69,69,91,92,69,92,70,70,92,93,70,93,71,71,93,94,71,94,72,72,94,73,51,72,73,73,95,96,73,96,74,74,96,97,74,97,75,75,97,98,75,98,76,76,98,99,76,99,77,77,99,100,77,100,78,78,100,101,78,101,79,79,101,102,79,102,80,80,102,103,80,103,81,81,103,104,81,104,82,82,104,105,82,105,83,83,105,106,83,106,84,84,106,107,84,107,85,85,107,108,85,108,86,86,108,109,86,109,87,87,109,110,87,110,88,88,110,111,88,111,89,89,111,112,89,112,90,90,112,113,90,113,91,91,113,114,91,114,92,92,114,115,92,115,93,93,115,116,93,116,94,94,116,95,73,94,95,95,117,118,95,118,96,96,118,119,96,119,97,97,119,120,97,120,98,98,120,121,98,121,99,99,121,122,99,122,100,100,122,123,100,123,101,101,123,124,101,124,102,102,124,125,102,125,103,103,125,126,103,126,104,104,126,127,104,127,105,105,127,128,105,128,106,106,128,129,106,129,107,107,129,130,107,130,108,108,130,131,108,131,109,109,131,132,109,132,110,110,132,133,110,133,111,111,133,134,111,134,112,112,134,135,112,135,113,113,135,136,113,136,114,114,136,137,114,137,115,115,137,138,115,138,116,116,138,117,95,116,117,117,139,140,117,140,118,118,140,141,118,141,119,119,141,142,119,142,120,120,142,143,120,143,121,121,143,144,121,144,122,122,144,145,122,145,123,123,145,146,123,146,124,124,146,147,124,147,125,125,147,148,125,148,126,126,148,149,126,149,127,127,149,150,127,150,128,128,150,151,128,151,129,129,151,152,129,152,130,130,152,153,130,153,131,131,153,154,131,154,132,132,154,155,132,155,133,133,155,156,133,156,134,134,156,157,134,157,135,135,157,158,135,158,136,136,158,159,136,159,137,137,159,160,137,160,138,138,160,139,117,138,139,139,161,162,139,162,140,140,162,163,140,163,141,141,163,164,141,164,142,142,164,143,143,164,165,143,165,144,144,165,166,144,166,145,145,166,167,145,167,146,146,167,147,147,167,168,147,168,148,148,168,169,148,169,149,149,169,170,149,170,150,150,170,171,150,171,151,151,171,172,151,172,152,152,172,153,153,172,173,153,173,154,154,173,174,154,174,155,155,174,175,155,175,156,156,175,176,156,176,157,157,176,158,158,176,177,158,177,159,159,177,178,159,178,160,160,178,161,139,160,161,161,179,162,162,179,180,162,180,163,163,180,181,163,181,164,164,181,182,164,182,165,165,182,183,165,183,166,166,183,184,166,184,167,167,184,185,167,185,186,167,186,168,168,186,187,168,187,169,169,187,170,170,187,188,170,188,171,171,188,189,171,189,172,172,189,190,172,190,191,172,191,173,173,191,174,174,191,192,174,192,193,174,193,175,175,193,176,176,193,194,176,194,195,176,195,177,177,195,196,177,196,178,178,196,179,161,178,179,10,180,179,10,9,180,9,181,180,9,182,181,9,11,182,11,183,182,11,184,183,11,185,184,11,12,185,12,186,185,12,187,186,8,187,12,8,188,187,8,189,188,8,14,189,14,190,189,14,191,190,14,192,191,14,13,192,13,193,192,13,194,193,13,15,194,15,195,194,15,196,195,10,196,15,10,179,196],"material":{"color":16746512,"emissive":0,"metalness":1,"opacity":1,"roughness":0.6},"name":"Orange_03 - Default_0","positions":[8,997,9,-49,966,-125,-219,966,-64,-229,966,48,-65,966,123,229,966,48,219,966,-64,98,966,-120,8,-997,9,-219,-966,-64,-49,-966,-125,-229,-966,48,-65,-966,123,219,-966,-64,229,-966,48,98,-966,-120,-43,866,-249,-250,866,-218,-354,866,-178,-458,866,-96,-472,866,64,-354,866,178,-250,866,218,-65,866,248,129,866,243,250,866,218,354,866,178,458,866,96,500,866,0,458,866,-96,354,866,-178,250,866,-218,129,866,-243,0,707,-356,-183,707,-344,-427,707,-280,-612,707,-178,-683,707,-92,-695,707,46,-556,707,215,-354,707,309,-183,707,344,0,707,356,183,707,344,427,707,280,612,707,178,695,707,46,683,707,-92,556,707,-215,354,707,-309,183,707,-344,0,500,-437,-224,500,-422,-433,500,-378,-612,500,-309,-750,500,-218,-837,500,-113,-851,500,57,-750,500,218,-612,500,309,-433,500,378,-224,500,422,0,500,437,224,500,422,433,500,378,612,500,309,750,500,218,851,500,57,837,500,-113,750,500,-218,612,500,-309,433,500,-378,224,500,-422,0,259,-487,-250,259,-470,-483,259,-422,-683,259,-344,-837,259,-243,-933,259,-126,-949,259,63,-837,259,243,-683,259,344,-483,259,422,-250,259,470,0,259,487,250,259,470,483,259,422,683,259,344,837,259,243,949,259,63,933,259,-126,837,259,-243,683,259,-344,483,259,-422,250,259,-470,0,0,-504,-259,0,-487,-500,0,-437,-707,0,-356,-866,0,-252,-966,0,-130,-983,0,65,-866,0,252,-707,0,356,-500,0,437,-259,0,487,0,0,504,259,0,487,500,0,437,707,0,356,866,0,252,983,0,65,966,0,-130,866,0,-252,707,0,-356,500,0,-437,259,0,-487,0,-259,-487,-250,-259,-470,-483,-259,-422,-683,-259,-344,-837,-259,-243,-933,-259,-126,-949,-259,63,-837,-259,243,-683,-259,344,-483,-259,422,-250,-259,470,0,-259,487,250,-259,470,483,-259,422,683,-259,344,837,-259,243,949,-259,63,933,-259,-126,837,-259,-243,683,-259,-344,483,-259,-422,250,-259,-470,0,-500,-437,-224,-500,-422,-433,-500,-378,-612,-500,-309,-750,-500,-218,-837,-500,-113,-851,-500,57,-750,-500,218,-612,-500,309,-433,-500,378,-224,-500,422,0,-500,437,224,-500,422,433,-500,378,612,-500,309,750,-500,218,851,-500,57,837,-500,-113,750,-500,-218,612,-500,-309,433,-500,-378,224,-500,-422,0,-707,-356,-183,-707,-344,-354,-707,-309,-556,-707,-215,-683,-707,-92,-695,-707,46,-556,-707,215,-354,-707,309,-183,-707,344,0,-707,356,183,-707,344,427,-707,280,612,-707,178,695,-707,46,683,-707,-92,556,-707,-215,354,-707,-309,183,-707,-344,-43,-866,-249,-250,-866,-218,-354,-866,-178,-458,-866,-96,-500,-866,0,-458,-866,96,-354,-866,178,-250,-866,218,-65,-866,248,129,-866,243,250,-866,218,354,-866,178,458,-866,96,500,-866,0,458,-866,-96,354,-866,-178,250,-866,-218,129,-866,-243]}],"radius":1,"shown":true,"sourceName":"Orange"},{"collision":{"boundRadius":1.3306405203921843,"capsules":[{"a":[-0.3207830751696265,-0.5700299589479544,-0.0771853638790458],"b":[-0.3207830751696265,-0.5700299589479544,-0.0771853638790458],"radius":0.5890018578396757},{"a":[0.33167983487090735,0.6246692600743796,0.047113396325912424],"b":[0.33167983487090735,0.6246692600743796,0.047113396325912424],"radius":0.6122787342797343},{"a":[0.6841576316737555,-0.09458548497946505,0.0215920812505133],"b":[0.6841576316737555,-0.09458548497946505,0.0215920812505133],"radius":0.6396381347819958},{"a":[-0.4387562029512983,0.5254396641411674,-0.02204521511442697],"b":[-0.4387562029512983,0.5254396641411674,-0.02204521511442697],"radius":0.6012087534729326},{"a":[-0.002185314294549969,0.01092663107739462,0.28125883860292133],"b":[-0.002185314294549969,0.01092663107739462,0.28125883860292133],"radius":0.5522395237329509},{"a":[0.1351950112862367,0.12101067626412879,-0.30157223309502534],"b":[0.1351950112862367,0.12101067626412879,-0.30157223309502534],"radius":0.5905036125390997},{"a":[0.2669117169783396,-0.6389704143738045,0.022327375236679527],"b":[0.2669117169783396,-0.6389704143738045,0.022327375236679527],"radius":0.5893168238079317},{"a":[-0.6684940325107143,-0.11805547484093243,0.024000061556086902],"b":[-0.6684940325107143,-0.11805547484093243,0.024000061556086902],"radius":0.5953333003328203}]},"name":"Red","parts":[{"indices":[0,1,2,0,2,3,0,3,4,0,5,6,0,6,7,0,7,1,8,9,10,8,11,9,8,12,11,8,13,14,8,15,13,8,10,15,1,16,17,1,17,18,1,18,2,2,18,19,2,19,20,2,20,3,3,20,21,3,21,22,3,22,4,4,22,23,4,23,24,0,4,24,0,24,25,0,25,26,0,26,5,5,26,27,5,27,28,5,28,29,5,29,6,6,29,30,6,30,31,6,31,7,7,31,32,7,32,16,1,7,16,16,33,34,16,34,35,16,35,17,17,35,18,18,35,36,18,36,19,19,36,37,19,37,38,19,38,20,20,38,39,20,39,21,21,39,40,21,40,22,22,40,41,22,41,23,23,41,42,23,42,43,23,43,24,24,43,44,24,44,25,25,44,26,26,44,45,26,45,27,27,45,46,27,46,28,28,46,47,28,47,29,29,47,48,29,48,30,30,48,49,30,49,31,31,49,50,31,50,32,32,50,33,16,32,33,33,51,52,33,52,34,34,52,53,34,53,35,35,53,54,35,54,55,35,55,36,36,55,56,36,56,37,37,56,57,37,57,38,38,57,58,38,58,39,39,58,59,39,59,60,39,60,40,40,60,61,40,61,41,41,61,62,41,62,42,42,62,63,42,63,43,43,63,64,43,64,44,44,64,65,44,65,66,44,66,45,45,66,67,45,67,46,46,67,68,46,68,47,47,68,69,47,69,48,48,69,70,48,70,71,48,71,49,49,71,72,49,72,50,50,72,51,33,50,51,51,73,74,51,74,52,52,74,75,52,75,53,53,75,76,53,76,54,54,76,77,54,77,55,55,77,78,55,78,56,56,78,79,56,79,57,57,79,80,57,80,58,58,80,81,58,81,59,59,81,82,59,82,60,60,82,83,60,83,61,61,83,84,61,84,62,62,84,85,62,85,63,63,85,86,63,86,64,64,86,87,64,87,65,65,87,88,65,88,66,66,88,89,66,89,67,67,89,90,67,90,68,68,90,91,68,91,69,69,91,92,69,92,70,70,92,93,70,93,71,71,93,94,71,94,72,72,94,73,51,72,73,73,95,96,73,96,74,74,96,97,74,97,75,75,97,98,75,98,76,76,98,99,76,99,77,77,99,100,77,100,78,78,100,101,78,101,79,79,101,102,79,102,80,80,102,103,80,103,81,81,103,104,81,104,82,82,104,105,82,105,83,83,105,106,83,106,84,84,106,107,84,107,85,85,107,108,85,108,86,86,108,109,86,109,87,87,109,110,87,110,88,88,110,111,88,111,89,89,111,112,89,112,90,90,112,113,90,113,91,91,113,114,91,114,92,92,114,115,92,115,93,93,115,116,93,116,94,94,116,95,73,94,95,95,117,118,95,118,96,96,118,119,96,119,97,97,119,120,97,120,98,98,120,121,98,121,99,99,121,122,99,122,100,100,122,123,100,123,101,101,123,124,101,124,102,102,124,125,102,125,103,103,125,126,103,126,104,104,126,127,104,127,105,105,127,128,105,128,106,106,128,129,106,129,107,107,129,130,107,130,108,108,130,131,108,131,109,109,131,132,109,132,110,110,132,133,110,133,111,111,133,134,111,134,112,112,134,135,112,135,113,113,135,136,113,136,114,114,136,137,114,137,115,115,137,138,115,138,116,116,138,117,95,116,117,117,139,140,117,140,118,118,140,141,118,141,119,119,141,142,119,142,120,120,142,143,120,143,121,121,143,144,121,144,122,122,144,145,122,145,123,123,145,146,123,146,124,124,146,147,124,147,125,125,147,148,125,148,126,126,148,149,126,149,127,127,149,150,127,150,128,128,150,151,128,151,129,129,151,152,129,152,130,130,152,153,130,153,131,131,153,154,131,154,132,132,154,155,132,155,133,133,155,156,133,156,134,134,156,157,134,157,135,135,157,158,135,158,136,136,158,159,136,159,137,137,159,160,137,160,138,138,160,139,117,138,139,139,161,162,139,162,140,140,162,163,140,163,141,141,163,164,141,164,142,142,164,143,143,164,165,143,165,144,144,165,166,144,166,145,145,166,167,145,167,146,146,167,147,147,167,168,147,168,148,148,168,169,148,169,149,149,169,170,149,170,150,150,170,171,150,171,151,151,171,172,151,172,152,152,172,153,153,172,173,153,173,154,154,173,174,154,174,155,155,174,175,155,175,156,156,175,176,156,176,157,157,176,158,158,176,177,158,177,159,159,177,178,159,178,160,160,178,161,139,160,161,161,179,162,162,179,180,162,180,163,163,180,181,163,181,164,164,181,182,164,182,165,165,182,183,165,183,166,166,183,184,166,184,167,167,184,185,167,185,186,167,186,168,168,186,187,168,187,169,169,187,170,170,187,188,170,188,171,171,188,189,171,189,172,172,189,190,172,190,191,172,191,173,173,191,174,174,191,192,174,192,193,174,193,175,175,193,176,176,193,194,176,194,195,176,195,177,177,195,196,177,196,178,178,196,179,161,178,179,10,180,179,10,9,180,9,181,180,9,182,181,9,11,182,11,183,182,11,184,183,11,185,184,11,12,185,12,186,185,12,187,186,8,187,12,8,188,187,8,189,188,8,14,189,14,190,189,14,191,190,14,192,191,14,13,192,13,193,192,13,194,193,13,15,194,15,195,194,15,196,195,10,196,15,10,179,196],"material":{"color":14356496,"emissive":0,"metalness":1,"opacity":1,"roughness":0.6},"name":"Red_07 - Default_0","positions":[8,997,9,-49,966,-125,-219,966,-64,-229,966,48,-65,966,123,229,966,48,219,966,-64,98,966,-120,8,-997,9,-219,-966,-64,-49,-966,-125,-229,-966,48,-65,-966,123,219,-966,-64,229,-966,48,98,-966,-120,-43,866,-249,-250,866,-218,-354,866,-178,-458,866,-96,-472,866,64,-354,866,178,-250,866,218,-65,866,248,129,866,243,250,866,218,354,866,178,458,866,96,500,866,0,458,866,-96,354,866,-178,250,866,-218,129,866,-243,0,707,-356,-183,707,-344,-427,707,-280,-612,707,-178,-683,707,-92,-695,707,46,-556,707,215,-354,707,309,-183,707,344,0,707,356,183,707,344,427,707,280,612,707,178,695,707,46,683,707,-92,556,707,-215,354,707,-309,183,707,-344,0,500,-437,-224,500,-422,-433,500,-378,-612,500,-309,-750,500,-218,-837,500,-113,-851,500,57,-750,500,218,-612,500,309,-433,500,378,-224,500,422,0,500,437,224,500,422,433,500,378,612,500,309,750,500,218,851,500,57,837,500,-113,750,500,-218,612,500,-309,433,500,-378,224,500,-422,0,259,-487,-250,259,-470,-483,259,-422,-683,259,-344,-837,259,-243,-933,259,-126,-949,259,63,-837,259,243,-683,259,344,-483,259,422,-250,259,470,0,259,487,250,259,470,483,259,422,683,259,344,837,259,243,949,259,63,933,259,-126,837,259,-243,683,259,-344,483,259,-422,250,259,-470,0,0,-504,-259,0,-487,-500,0,-437,-707,0,-356,-866,0,-252,-966,0,-130,-983,0,65,-866,0,252,-707,0,356,-500,0,437,-259,0,487,0,0,504,259,0,487,500,0,437,707,0,356,866,0,252,983,0,65,966,0,-130,866,0,-252,707,0,-356,500,0,-437,259,0,-487,0,-259,-487,-250,-259,-470,-483,-259,-422,-683,-259,-344,-837,-259,-243,-933,-259,-126,-949,-259,63,-837,-259,243,-683,-259,344,-483,-259,422,-250,-259,470,0,-259,487,250,-259,470,483,-259,422,683,-259,344,837,-259,243,949,-259,63,933,-259,-126,837,-259,-243,683,-259,-344,483,-259,-422,250,-259,-470,0,-500,-437,-224,-500,-422,-433,-500,-378,-612,-500,-309,-750,-500,-218,-837,-500,-113,-851,-500,57,-750,-500,218,-612,-500,309,-433,-500,378,-224,-500,422,0,-500,437,224,-500,422,433,-500,378,612,-500,309,750,-500,218,851,-500,57,837,-500,-113,750,-500,-218,612,-500,-309,433,-500,-378,224,-500,-422,0,-707,-356,-183,-707,-344,-354,-707,-309,-556,-707,-215,-683,-707,-92,-695,-707,46,-556,-707,215,-354,-707,309,-183,-707,344,0,-707,356,183,-707,344,427,-707,280,612,-707,178,695,-707,46,683,-707,-92,556,-707,-215,354,-707,-309,183,-707,-344,-43,-866,-249,-250,-866,-218,-354,-866,-178,-458,-866,-96,-500,-866,0,-458,-866,96,-354,-866,178,-250,-866,218,-65,-866,248,129,-866,243,250,-866,218,354,-866,178,458,-866,96,500,-866,0,458,-866,-96,354,-866,-178,250,-866,-218,129,-866,-243]}],"radius":0.9999998951265318,"shown":true,"sourceName":"Red"},{"collision":{"boundRadius":1.3306405285509637,"capsules":[{"a":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"b":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"radius":0.5890018578396757},{"a":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"b":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"radius":0.6122787342797343},{"a":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"b":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"radius":0.6396381347819958},{"a":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"b":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"radius":0.6012087534729326},{"a":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"b":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"radius":0.5522395237329509},{"a":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"b":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"radius":0.5905036125390997},{"a":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"b":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"radius":0.5893168238079317},{"a":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"b":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"radius":0.5953333003328203}]},"name":"Brown","parts":[{"indices":[0,1,2,0,2,3,0,3,4,0,4,5,0,6,7,0,7,1,8,9,10,8,11,9,8,12,11,8,13,12,8,14,15,8,10,14,1,16,17,1,17,2,2,17,18,2,18,19,2,19,3,3,19,20,3,20,21,3,21,4,4,21,22,4,22,23,4,23,5,5,23,24,5,24,25,0,5,25,0,25,26,0,26,27,0,27,6,6,27,28,6,28,29,6,29,30,6,30,7,7,30,31,7,31,32,1,7,32,1,32,16,16,33,34,16,34,17,17,34,35,17,35,18,18,35,19,19,35,36,19,36,20,20,36,37,20,37,38,20,38,21,21,38,39,21,39,40,21,40,22,22,40,23,23,40,41,23,41,24,24,41,42,24,42,43,24,43,25,25,43,44,25,44,26,26,44,27,27,44,45,27,45,28,28,45,46,28,46,29,29,46,47,29,47,30,30,47,48,30,48,31,31,48,49,31,49,32,32,49,50,16,32,50,16,50,33,33,51,52,33,52,34,34,52,53,34,53,35,35,53,54,35,54,55,35,55,36,36,55,56,36,56,37,37,56,57,37,57,38,38,57,58,38,58,39,39,58,59,39,59,40,40,59,60,40,60,61,40,61,41,41,61,62,41,62,42,42,62,63,42,63,43,43,63,64,43,64,44,44,64,65,44,65,66,44,66,45,45,66,67,45,67,46,46,67,68,46,68,47,47,68,69,47,69,48,48,69,70,48,70,71,48,71,49,49,71,72,49,72,50,50,72,51,33,50,51,51,73,74,51,74,52,52,74,75,52,75,53,53,75,76,53,76,54,54,76,77,54,77,55,55,77,78,55,78,56,56,78,79,56,79,57,57,79,80,57,80,58,58,80,81,58,81,59,59,81,82,59,82,60,60,82,83,60,83,61,61,83,84,61,84,62,62,84,85,62,85,63,63,85,86,63,86,64,64,86,87,64,87,65,65,87,88,65,88,66,66,88,89,66,89,67,67,89,90,67,90,68,68,90,91,68,91,69,69,91,92,69,92,70,70,92,93,70,93,71,71,93,94,71,94,72,72,94,73,51,72,73,73,95,96,73,96,74,74,96,97,74,97,75,75,97,98,75,98,76,76,98,99,76,99,77,77,99,100,77,100,78,78,100,101,78,101,79,79,101,102,79,102,80,80,102,103,80,103,81,81,103,104,81,104,82,82,104,105,82,105,83,83,105,106,83,106,84,84,106,107,84,107,85,85,107,108,85,108,86,86,108,109,86,109,87,87,109,110,87,110,88,88,110,111,88,111,89,89,111,112,89,112,90,90,112,113,90,113,91,91,113,114,91,114,92,92,114,115,92,115,93,93,115,116,93,116,94,94,116,95,73,94,95,95,117,118,95,118,96,96,118,119,96,119,97,97,119,120,97,120,98,98,120,121,98,121,99,99,121,122,99,122,100,100,122,123,100,123,101,101,123,124,101,124,102,102,124,125,102,125,103,103,125,126,103,126,104,104,126,127,104,127,105,105,127,128,105,128,106,106,128,129,106,129,107,107,129,130,107,130,108,108,130,131,108,131,109,109,131,132,109,132,110,110,132,133,110,133,111,111,133,134,111,134,112,112,134,135,112,135,113,113,135,136,113,136,114,114,136,137,114,137,115,115,137,138,115,138,116,116,138,117,95,116,117,117,139,140,117,140,118,118,140,141,118,141,119,119,141,142,119,142,120,120,142,143,120,143,121,121,143,144,121,144,122,122,144,145,122,145,123,123,145,146,123,146,124,124,146,147,124,147,125,125,147,148,125,148,126,126,148,149,126,149,127,127,149,150,127,150,128,128,150,151,128,151,129,129,151,152,129,152,130,130,152,153,130,153,131,131,153,154,131,154,132,132,154,155,132,155,133,133,155,156,133,156,134,134,156,157,134,157,135,135,157,158,135,158,136,136,158,159,136,159,137,137,159,160,137,160,138,138,160,139,117,138,139,139,161,162,139,162,140,140,162,163,140,163,141,141,163,142,142,163,164,142,164,143,143,164,165,143,165,144,144,165,166,144,166,145,145,166,167,145,167,146,146,167,147,147,167,168,147,168,148,148,168,169,148,169,149,149,169,170,149,170,150,150,170,171,150,171,151,151,171,172,151,172,152,152,172,153,153,172,173,153,173,154,154,173,174,154,174,155,155,174,175,155,175,156,156,175,176,156,176,157,157,176,158,158,176,177,158,177,159,159,177,178,159,178,160,160,178,161,139,160,161,161,179,180,161,180,162,162,180,181,162,181,163,163,181,182,163,182,183,163,183,164,164,183,165,165,183,184,165,184,166,166,184,185,166,185,167,167,185,186,167,186,187,167,187,168,168,187,188,168,188,169,169,188,170,170,188,189,170,189,171,171,189,190,171,190,172,172,190,191,172,191,192,172,192,173,173,192,174,174,192,193,174,193,194,174,194,175,175,194,176,176,194,195,176,195,196,176,196,177,177,196,179,177,179,178,161,178,179,9,179,10,9,180,179,9,181,180,9,11,181,11,182,181,11,183,182,11,12,183,12,184,183,12,185,184,12,186,185,12,13,186,13,187,186,13,188,187,8,188,13,8,189,188,8,190,189,8,15,190,15,191,190,15,192,191,15,193,192,15,14,193,14,194,193,14,195,194,10,195,14,10,196,195,10,179,196],"material":{"color":8268816,"emissive":0,"metalness":1,"opacity":1,"roughness":0.6},"name":"Brown_02 - Default_0","positions":[8,997,9,49,966,-125,-98,966,-120,-219,966,-64,-229,966,48,-65,966,123,229,966,48,219,966,-64,8,-997,9,-98,-966,-120,49,-966,-125,-219,-966,-64,-229,-966,48,-65,-966,123,219,-966,-64,229,-966,48,43,866,-249,-129,866,-243,-250,866,-218,-354,866,-178,-458,866,-96,-472,866,64,-354,866,178,-250,866,218,-65,866,248,129,866,243,250,866,218,354,866,178,458,866,96,500,866,0,458,866,-96,354,866,-178,250,866,-218,0,707,-356,-183,707,-344,-427,707,-280,-612,707,-178,-683,707,-92,-695,707,46,-612,707,178,-427,707,280,-183,707,344,0,707,356,183,707,344,427,707,280,612,707,178,695,707,46,683,707,-92,556,707,-215,354,707,-309,183,707,-344,0,500,-437,-224,500,-422,-433,500,-378,-612,500,-309,-750,500,-218,-837,500,-113,-851,500,57,-750,500,218,-612,500,309,-433,500,378,-224,500,422,0,500,437,224,500,422,433,500,378,612,500,309,750,500,218,851,500,57,837,500,-113,750,500,-218,612,500,-309,433,500,-378,224,500,-422,0,259,-487,-250,259,-470,-483,259,-422,-683,259,-344,-837,259,-243,-933,259,-126,-949,259,63,-837,259,243,-683,259,344,-483,259,422,-250,259,470,0,259,487,250,259,470,483,259,422,683,259,344,837,259,243,949,259,63,933,259,-126,837,259,-243,683,259,-344,483,259,-422,250,259,-470,0,0,-504,-259,0,-487,-500,0,-437,-707,0,-356,-866,0,-252,-966,0,-130,-983,0,65,-866,0,252,-707,0,356,-500,0,437,-259,0,487,0,0,504,259,0,487,500,0,437,707,0,356,866,0,252,983,0,65,966,0,-130,866,0,-252,707,0,-356,500,0,-437,259,0,-487,0,-259,-487,-250,-259,-470,-483,-259,-422,-683,-259,-344,-837,-259,-243,-933,-259,-126,-949,-259,63,-837,-259,243,-683,-259,344,-483,-259,422,-250,-259,470,0,-259,487,250,-259,470,483,-259,422,683,-259,344,837,-259,243,949,-259,63,933,-259,-126,837,-259,-243,683,-259,-344,483,-259,-422,250,-259,-470,0,-500,-437,-224,-500,-422,-433,-500,-378,-612,-500,-309,-750,-500,-218,-837,-500,-113,-851,-500,57,-750,-500,218,-612,-500,309,-433,-500,378,-224,-500,422,0,-500,437,224,-500,422,433,-500,378,612,-500,309,750,-500,218,851,-500,57,837,-500,-113,750,-500,-218,612,-500,-309,433,-500,-378,224,-500,-422,0,-707,-356,-183,-707,-344,-427,-707,-280,-612,-707,-178,-683,-707,-92,-695,-707,46,-556,-707,215,-354,-707,309,-183,-707,344,0,-707,356,183,-707,344,427,-707,280,612,-707,178,695,-707,46,683,-707,-92,556,-707,-215,354,-707,-309,183,-707,-344,43,-866,-249,-129,-866,-243,-250,-866,-218,-354,-866,-178,-458,-866,-96,-500,-866,0,-458,-866,96,-354,-866,178,-250,-866,218,-65,-866,248,129,-866,243,250,-866,218,354,-866,178,458,-866,96,500,-866,0,458,-866,-96,354,-866,-178,250,-866,-218]}],"radius":0.9999999358244095,"shown":true,"sourceName":"Brown"},{"collision":{"boundRadius":1.3306405285509637,"capsules":[{"a":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"b":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"radius":0.5890018578396757},{"a":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"b":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"radius":0.6122787342797343},{"a":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"b":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"radius":0.6396381347819958},{"a":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"b":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"radius":0.6012087534729326},{"a":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"b":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"radius":0.5522395237329509},{"a":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"b":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"radius":0.5905036125390997},{"a":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"b":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"radius":0.5893168238079317},{"a":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"b":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"radius":0.5953333003328203}]},"name":"Green","parts":[{"indices":[0,1,2,0,2,3,0,3,4,0,4,5,0,6,7,0,7,1,8,9,10,8,11,9,8,12,11,8,13,12,8,14,15,8,10,14,1,16,17,1,17,2,2,17,18,2,18,19,2,19,3,3,19,20,3,20,21,3,21,4,4,21,22,4,22,23,4,23,5,5,23,24,5,24,25,0,5,25,0,25,26,0,26,27,0,27,6,6,27,28,6,28,29,6,29,30,6,30,7,7,30,31,7,31,32,1,7,32,1,32,16,16,33,34,16,34,17,17,34,35,17,35,18,18,35,19,19,35,36,19,36,20,20,36,37,20,37,38,20,38,21,21,38,39,21,39,40,21,40,22,22,40,23,23,40,41,23,41,24,24,41,42,24,42,43,24,43,25,25,43,44,25,44,26,26,44,27,27,44,45,27,45,28,28,45,46,28,46,29,29,46,47,29,47,30,30,47,48,30,48,31,31,48,49,31,49,32,32,49,50,16,32,50,16,50,33,33,51,52,33,52,34,34,52,53,34,53,35,35,53,54,35,54,55,35,55,36,36,55,56,36,56,37,37,56,57,37,57,38,38,57,58,38,58,59,38,59,39,39,59,60,39,60,40,40,60,61,40,61,62,40,62,41,41,62,63,41,63,42,42,63,64,42,64,43,43,64,65,43,65,44,44,65,66,44,66,67,44,67,45,45,67,68,45,68,46,46,68,69,46,69,47,47,69,70,47,70,48,48,70,71,48,71,72,48,72,49,49,72,73,49,73,50,50,73,51,33,50,51,51,74,75,51,75,52,52,75,76,52,76,53,53,76,77,53,77,54,54,77,78,54,78,55,55,78,79,55,79,56,56,79,80,56,80,57,57,80,58,58,80,81,58,81,59,59,81,82,59,82,60,60,82,83,60,83,61,61,83,84,61,84,62,62,84,85,62,85,63,63,85,86,63,86,64,64,86,87,64,87,65,65,87,88,65,88,66,66,88,89,66,89,67,67,89,90,67,90,68,68,90,91,68,91,69,69,91,92,69,92,70,70,92,93,70,93,71,71,93,94,71,94,72,72,94,95,72,95,73,73,95,74,51,73,74,74,96,97,74,97,75,75,97,98,75,98,76,76,98,99,76,99,77,77,99,100,77,100,78,78,100,101,78,101,79,79,101,102,79,102,80,80,102,103,80,103,81,81,103,104,81,104,82,82,104,105,82,105,83,83,105,106,83,106,84,84,106,107,84,107,85,85,107,108,85,108,86,86,108,109,86,109,87,87,109,110,87,110,88,88,110,111,88,111,89,89,111,112,89,112,90,90,112,113,90,113,91,91,113,114,91,114,92,92,114,115,92,115,93,93,115,116,93,116,94,94,116,117,94,117,95,95,117,96,74,95,96,96,118,119,96,119,97,97,119,120,97,120,98,98,120,121,98,121,99,99,121,122,99,122,100,100,122,123,100,123,101,101,123,124,101,124,102,102,124,125,102,125,103,103,125,126,103,126,104,104,126,127,104,127,105,105,127,128,105,128,106,106,128,129,106,129,107,107,129,130,107,130,108,108,130,131,108,131,109,109,131,132,109,132,110,110,132,133,110,133,111,111,133,134,111,134,112,112,134,135,112,135,113,113,135,136,113,136,114,114,136,137,114,137,115,115,137,138,115,138,116,116,138,139,116,139,117,117,139,118,96,117,118,118,140,141,118,141,119,119,141,142,119,142,120,120,142,143,120,143,121,121,143,144,121,144,122,122,144,145,122,145,123,123,145,146,123,146,124,124,146,147,124,147,125,125,147,148,125,148,126,126,148,149,126,149,127,127,149,150,127,150,128,128,150,151,128,151,129,129,151,152,129,152,130,130,152,153,130,153,131,131,153,154,131,154,132,132,154,155,132,155,133,133,155,156,133,156,134,134,156,157,134,157,135,135,157,158,135,158,136,136,158,159,136,159,137,137,159,160,137,160,138,138,160,161,138,161,139,139,161,140,118,139,140,140,162,163,140,163,141,141,163,164,141,164,142,142,164,143,143,164,165,143,165,144,144,165,166,144,166,145,145,166,167,145,167,146,146,167,168,146,168,147,147,168,148,148,168,169,148,169,149,149,169,170,149,170,150,150,170,171,150,171,151,151,171,172,151,172,152,152,172,173,152,173,153,153,173,154,154,173,174,154,174,155,155,174,175,155,175,156,156,175,176,156,176,157,157,176,177,157,177,158,158,177,159,159,177,178,159,178,160,160,178,179,160,179,161,161,179,162,140,161,162,162,180,181,162,181,163,163,181,182,163,182,164,164,182,183,164,183,184,164,184,165,165,184,166,166,184,185,166,185,167,167,185,186,167,186,168,168,186,187,168,187,188,168,188,169,169,188,189,169,189,170,170,189,171,171,189,190,171,190,172,172,190,191,172,191,173,173,191,192,173,192,193,173,193,174,174,193,175,175,193,194,175,194,195,175,195,176,176,195,177,177,195,196,177,196,197,177,197,178,178,197,180,178,180,179,162,179,180,9,180,10,9,181,180,9,182,181,9,11,182,11,183,182,11,184,183,11,12,184,12,185,184,12,186,185,12,187,186,12,13,187,13,188,187,13,189,188,8,189,13,8,190,189,8,191,190,8,15,191,15,192,191,15,193,192,15,194,193,15,14,194,14,195,194,14,196,195,10,196,14,10,197,196,10,180,197],"material":{"color":3847952,"emissive":0,"metalness":1,"opacity":1,"roughness":0.6},"name":"Green_01 - Default_0","positions":[8,997,9,49,966,-125,-98,966,-120,-219,966,-64,-229,966,48,-65,966,123,229,966,48,219,966,-64,8,-997,9,-98,-966,-120,49,-966,-125,-219,-966,-64,-229,-966,48,-65,-966,123,219,-966,-64,229,-966,48,43,866,-249,-129,866,-243,-250,866,-218,-354,866,-178,-458,866,-96,-472,866,64,-354,866,178,-250,866,218,-65,866,248,129,866,243,250,866,218,354,866,178,458,866,96,500,866,0,458,866,-96,354,866,-178,250,866,-218,0,707,-356,-183,707,-344,-427,707,-280,-612,707,-178,-683,707,-92,-695,707,46,-612,707,178,-427,707,280,-183,707,344,0,707,356,183,707,344,427,707,280,612,707,178,695,707,46,683,707,-92,556,707,-215,354,707,-309,183,707,-344,0,500,-437,-224,500,-422,-433,500,-378,-612,500,-309,-750,500,-218,-837,500,-113,-866,500,0,-837,500,113,-750,500,218,-612,500,309,-433,500,378,-224,500,422,0,500,437,224,500,422,433,500,378,612,500,309,750,500,218,851,500,57,837,500,-113,750,500,-218,612,500,-309,433,500,-378,224,500,-422,0,259,-487,-250,259,-470,-483,259,-422,-683,259,-344,-837,259,-243,-933,259,-126,-949,259,63,-837,259,243,-683,259,344,-483,259,422,-250,259,470,0,259,487,250,259,470,483,259,422,683,259,344,837,259,243,949,259,63,933,259,-126,837,259,-243,683,259,-344,483,259,-422,250,259,-470,0,0,-504,-259,0,-487,-500,0,-437,-707,0,-356,-866,0,-252,-966,0,-130,-983,0,65,-866,0,252,-707,0,356,-500,0,437,-259,0,487,0,0,504,259,0,487,500,0,437,707,0,356,866,0,252,983,0,65,966,0,-130,866,0,-252,707,0,-356,500,0,-437,259,0,-487,0,-259,-487,-250,-259,-470,-483,-259,-422,-683,-259,-344,-837,-259,-243,-933,-259,-126,-949,-259,63,-837,-259,243,-683,-259,344,-483,-259,422,-250,-259,470,0,-259,487,250,-259,470,483,-259,422,683,-259,344,837,-259,243,949,-259,63,933,-259,-126,837,-259,-243,683,-259,-344,483,-259,-422,250,-259,-470,0,-500,-437,-224,-500,-422,-433,-500,-378,-612,-500,-309,-750,-500,-218,-837,-500,-113,-851,-500,57,-750,-500,218,-612,-500,309,-433,-500,378,-224,-500,422,0,-500,437,224,-500,422,433,-500,378,612,-500,309,750,-500,218,851,-500,57,837,-500,-113,750,-500,-218,612,-500,-309,433,-500,-378,224,-500,-422,0,-707,-356,-183,-707,-344,-427,-707,-280,-612,-707,-178,-683,-707,-92,-695,-707,46,-556,-707,215,-354,-707,309,-183,-707,344,0,-707,356,183,-707,344,427,-707,280,612,-707,178,695,-707,46,683,-707,-92,556,-707,-215,354,-707,-309,183,-707,-344,43,-866,-249,-129,-866,-243,-250,-866,-218,-354,-866,-178,-458,-866,-96,-500,-866,0,-458,-866,96,-354,-866,178,-250,-866,218,-65,-866,248,129,-866,243,250,-866,218,354,-866,178,458,-866,96,500,-866,0,458,-866,-96,354,-866,-178,250,-866,-218]}],"radius":0.999999916078085,"shown":true,"sourceName":"Green"},{"collision":{"boundRadius":1.3306405285509637,"capsules":[{"a":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"b":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"radius":0.5890018578396757},{"a":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"b":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"radius":0.6122787342797343},{"a":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"b":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"radius":0.6396381347819958},{"a":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"b":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"radius":0.6012087534729326},{"a":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"b":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"radius":0.5522395237329509},{"a":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"b":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"radius":0.5905036125390997},{"a":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"b":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"radius":0.5893168238079317},{"a":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"b":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"radius":0.5953333003328203}]},"name":"Blue","parts":[{"indices":[0,1,2,0,2,3,0,3,4,0,4,5,0,6,7,0,7,1,8,9,10,8,11,9,8,12,11,8,13,12,8,14,15,8,10,14,1,16,17,1,17,2,2,17,18,2,18,19,2,19,3,3,19,20,3,20,21,3,21,4,4,21,22,4,22,23,4,23,5,5,23,24,5,24,25,0,5,25,0,25,26,0,26,27,0,27,6,6,27,28,6,28,29,6,29,30,6,30,7,7,30,31,7,31,32,1,7,32,1,32,16,16,33,34,16,34,17,17,34,35,17,35,18,18,35,19,19,35,36,19,36,20,20,36,37,20,37,38,20,38,21,21,38,39,21,39,22,22,39,40,22,40,23,23,40,41,23,41,24,24,41,42,24,42,43,24,43,25,25,43,44,25,44,26,26,44,27,27,44,45,27,45,28,28,45,46,28,46,29,29,46,47,29,47,30,30,47,48,30,48,31,31,48,49,31,49,32,32,49,50,16,32,50,16,50,33,33,51,52,33,52,34,34,52,53,34,53,35,35,53,54,35,54,55,35,55,36,36,55,56,36,56,37,37,56,57,37,57,38,38,57,58,38,58,59,38,59,39,39,59,60,39,60,61,39,61,40,40,61,62,40,62,41,41,62,63,41,63,42,42,63,64,42,64,43,43,64,65,43,65,44,44,65,66,44,66,67,44,67,45,45,67,68,45,68,46,46,68,69,46,69,47,47,69,70,47,70,48,48,70,71,48,71,72,48,72,49,49,72,73,49,73,50,50,73,51,33,50,51,51,74,75,51,75,52,52,75,76,52,76,53,53,76,77,53,77,54,54,77,78,54,78,55,55,78,79,55,79,56,56,79,80,56,80,57,57,80,58,58,80,81,58,81,59,59,81,82,59,82,60,60,82,83,60,83,61,61,83,84,61,84,62,62,84,85,62,85,63,63,85,86,63,86,64,64,86,87,64,87,65,65,87,88,65,88,66,66,88,89,66,89,67,67,89,90,67,90,68,68,90,91,68,91,69,69,91,92,69,92,70,70,92,93,70,93,71,71,93,94,71,94,72,72,94,95,72,95,73,73,95,74,51,73,74,74,96,97,74,97,75,75,97,98,75,98,76,76,98,99,76,99,77,77,99,100,77,100,78,78,100,101,78,101,79,79,101,102,79,102,80,80,102,103,80,103,81,81,103,104,81,104,82,82,104,105,82,105,83,83,105,106,83,106,84,84,106,107,84,107,85,85,107,108,85,108,86,86,108,109,86,109,87,87,109,110,87,110,88,88,110,111,88,111,89,89,111,112,89,112,90,90,112,113,90,113,91,91,113,114,91,114,92,92,114,115,92,115,93,93,115,116,93,116,94,94,116,117,94,117,95,95,117,96,74,95,96,96,118,119,96,119,97,97,119,120,97,120,98,98,120,121,98,121,99,99,121,122,99,122,100,100,122,123,100,123,101,101,123,124,101,124,102,102,124,125,102,125,103,103,125,126,103,126,104,104,126,127,104,127,105,105,127,128,105,128,106,106,128,129,106,129,107,107,129,130,107,130,108,108,130,131,108,131,109,109,131,132,109,132,110,110,132,133,110,133,111,111,133,134,111,134,112,112,134,135,112,135,113,113,135,136,113,136,114,114,136,137,114,137,115,115,137,138,115,138,116,116,138,139,116,139,117,117,139,118,96,117,118,118,140,141,118,141,119,119,141,142,119,142,120,120,142,143,120,143,121,121,143,144,121,144,122,122,144,145,122,145,123,123,145,146,123,146,124,124,146,147,124,147,125,125,147,148,125,148,126,126,148,149,126,149,127,127,149,150,127,150,128,128,150,151,128,151,129,129,151,152,129,152,130,130,152,153,130,153,131,131,153,154,131,154,132,132,154,155,132,155,133,133,155,156,133,156,134,134,156,157,134,157,135,135,157,158,135,158,136,136,158,159,136,159,137,137,159,160,137,160,138,138,160,161,138,161,139,139,161,140,118,139,140,140,162,163,140,163,141,141,163,164,141,164,142,142,164,165,142,165,143,143,165,144,144,165,166,144,166,145,145,166,167,145,167,146,146,167,168,146,168,147,147,168,148,148,168,169,148,169,149,149,169,170,149,170,150,150,170,171,150,171,151,151,171,172,151,172,152,152,172,173,152,173,153,153,173,154,154,173,174,154,174,155,155,174,175,155,175,156,156,175,176,156,176,157,157,176,177,157,177,158,158,177,159,159,177,178,159,178,160,160,178,179,160,179,161,161,179,162,140,161,162,162,180,181,162,181,163,163,181,182,163,182,164,164,182,183,164,183,165,165,183,184,165,184,166,166,184,185,166,185,167,167,185,186,167,186,168,168,186,187,168,187,188,168,188,169,169,188,189,169,189,170,170,189,171,171,189,190,171,190,172,172,190,191,172,191,173,173,191,192,173,192,193,173,193,174,174,193,175,175,193,194,175,194,195,175,195,176,176,195,177,177,195,196,177,196,197,177,197,178,178,197,180,178,180,179,162,179,180,9,180,10,9,181,180,9,182,181,9,11,182,11,183,182,11,184,183,11,12,184,12,185,184,12,186,185,12,187,186,12,13,187,13,188,187,13,189,188,8,189,13,8,190,189,8,191,190,8,15,191,15,192,191,15,193,192,15,194,193,15,14,194,14,195,194,14,196,195,10,196,14,10,197,196,10,180,197],"material":{"color":1065947,"emissive":0,"metalness":1,"opacity":1,"roughness":0.6},"name":"Blue_13 - Default_0","positions":[8,997,9,49,966,-125,-98,966,-120,-219,966,-64,-229,966,48,-65,966,123,229,966,48,219,966,-64,8,-997,9,-98,-966,-120,49,-966,-125,-219,-966,-64,-229,-966,48,-65,-966,123,219,-966,-64,229,-966,48,43,866,-249,-129,866,-243,-250,866,-218,-354,866,-178,-458,866,-96,-472,866,64,-354,866,178,-250,866,218,-65,866,248,129,866,243,250,866,218,354,866,178,458,866,96,500,866,0,458,866,-96,354,866,-178,250,866,-218,0,707,-356,-183,707,-344,-427,707,-280,-612,707,-178,-683,707,-92,-695,707,46,-556,707,215,-354,707,309,-183,707,344,0,707,356,183,707,344,427,707,280,612,707,178,695,707,46,683,707,-92,556,707,-215,354,707,-309,183,707,-344,0,500,-437,-224,500,-422,-433,500,-378,-612,500,-309,-750,500,-218,-837,500,-113,-866,500,0,-837,500,113,-750,500,218,-612,500,309,-433,500,378,-224,500,422,0,500,437,224,500,422,433,500,378,612,500,309,750,500,218,851,500,57,837,500,-113,750,500,-218,612,500,-309,433,500,-378,224,500,-422,0,259,-487,-250,259,-470,-483,259,-422,-683,259,-344,-837,259,-243,-933,259,-126,-949,259,63,-837,259,243,-683,259,344,-483,259,422,-250,259,470,0,259,487,250,259,470,483,259,422,683,259,344,837,259,243,949,259,63,933,259,-126,837,259,-243,683,259,-344,483,259,-422,250,259,-470,0,0,-504,-259,0,-487,-500,0,-437,-707,0,-356,-866,0,-252,-966,0,-130,-983,0,65,-866,0,252,-707,0,356,-500,0,437,-259,0,487,0,0,504,259,0,487,500,0,437,707,0,356,866,0,252,983,0,65,966,0,-130,866,0,-252,707,0,-356,500,0,-437,259,0,-487,0,-259,-487,-250,-259,-470,-483,-259,-422,-683,-259,-344,-837,-259,-243,-933,-259,-126,-949,-259,63,-837,-259,243,-683,-259,344,-483,-259,422,-250,-259,470,0,-259,487,250,-259,470,483,-259,422,683,-259,344,837,-259,243,949,-259,63,933,-259,-126,837,-259,-243,683,-259,-344,483,-259,-422,250,-259,-470,0,-500,-437,-224,-500,-422,-433,-500,-378,-612,-500,-309,-750,-500,-218,-837,-500,-113,-851,-500,57,-750,-500,218,-612,-500,309,-433,-500,378,-224,-500,422,0,-500,437,224,-500,422,433,-500,378,612,-500,309,750,-500,218,851,-500,57,837,-500,-113,750,-500,-218,612,-500,-309,433,-500,-378,224,-500,-422,0,-707,-356,-183,-707,-344,-354,-707,-309,-556,-707,-215,-683,-707,-92,-695,-707,46,-556,-707,215,-354,-707,309,-183,-707,344,0,-707,356,183,-707,344,427,-707,280,612,-707,178,695,-707,46,683,-707,-92,556,-707,-215,354,-707,-309,183,-707,-344,43,-866,-249,-129,-866,-243,-250,-866,-218,-354,-866,-178,-458,-866,-96,-500,-866,0,-458,-866,96,-354,-866,178,-250,-866,218,-65,-866,248,129,-866,243,250,-866,218,354,-866,178,458,-866,96,500,-866,0,458,-866,-96,354,-866,-178,250,-866,-218]}],"radius":0.9999999160781667,"shown":true,"sourceName":"Blue"},{"collision":{"boundRadius":1.3306405285509637,"capsules":[{"a":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"b":[-0.3207830751696265,-0.5700300185525992,-0.0771853638790458],"radius":0.5890018578396757},{"a":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"b":[0.33167983487090735,0.6246692004697348,0.047113396325912424],"radius":0.6122787342797343},{"a":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"b":[0.6841576316737555,-0.09458554458410982,0.0215920812505133],"radius":0.6396381347819958},{"a":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"b":[-0.4387562029512983,0.5254396045365226,-0.02204521511442697],"radius":0.6012087534729326},{"a":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"b":[-0.002185314294549969,0.010926571472749844,0.28125883860292133],"radius":0.5522395237329509},{"a":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"b":[0.1351950112862367,0.12101061665948401,-0.30157223309502534],"radius":0.5905036125390997},{"a":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"b":[0.2669117169783396,-0.6389704739784493,0.022327375236679527],"radius":0.5893168238079317},{"a":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"b":[-0.6684940325107143,-0.1180555344455772,0.024000061556086902],"radius":0.5953333003328203}]},"name":"Yellow","parts":[{"indices":[0,1,2,0,2,3,0,3,4,0,4,5,0,6,7,0,7,1,8,9,10,8,11,9,8,12,11,8,13,12,8,14,15,8,10,14,1,16,17,1,17,2,2,17,18,2,18,19,2,19,3,3,19,20,3,20,21,3,21,4,4,21,22,4,22,23,4,23,5,5,23,24,5,24,25,0,5,25,0,25,26,0,26,27,0,27,6,6,27,28,6,28,29,6,29,30,6,30,7,7,30,31,7,31,32,1,7,32,1,32,16,16,33,34,16,34,17,17,34,35,17,35,18,18,35,19,19,35,36,19,36,20,20,36,37,20,37,38,20,38,21,21,38,39,21,39,22,22,39,40,22,40,23,23,40,41,23,41,24,24,41,42,24,42,43,24,43,25,25,43,44,25,44,26,26,44,27,27,44,45,27,45,28,28,45,46,28,46,29,29,46,47,29,47,30,30,47,48,30,48,31,31,48,49,31,49,32,32,49,50,16,32,50,16,50,33,33,51,52,33,52,34,34,52,53,34,53,35,35,53,54,35,54,55,35,55,36,36,55,56,36,56,37,37,56,57,37,57,38,38,57,58,38,58,39,39,58,59,39,59,60,39,60,40,40,60,61,40,61,41,41,61,62,41,62,42,42,62,63,42,63,43,43,63,64,43,64,44,44,64,65,44,65,66,44,66,45,45,66,67,45,67,46,46,67,68,46,68,47,47,68,69,47,69,48,48,69,70,48,70,71,48,71,49,49,71,72,49,72,50,50,72,51,33,50,51,51,73,74,51,74,52,52,74,75,52,75,53,53,75,76,53,76,54,54,76,77,54,77,55,55,77,78,55,78,56,56,78,79,56,79,57,57,79,80,57,80,58,58,80,81,58,81,59,59,81,82,59,82,60,60,82,83,60,83,61,61,83,84,61,84,62,62,84,85,62,85,63,63,85,86,63,86,64,64,86,87,64,87,65,65,87,88,65,88,66,66,88,89,66,89,67,67,89,90,67,90,68,68,90,91,68,91,69,69,91,92,69,92,70,70,92,93,70,93,71,71,93,94,71,94,72,72,94,73,51,72,73,73,95,96,73,96,74,74,96,97,74,97,75,75,97,98,75,98,76,76,98,99,76,99,77,77,99,100,77,100,78,78,100,101,78,101,79,79,101,102,79,102,80,80,102,103,80,103,81,81,103,104,81,104,82,82,104,105,82,105,83,83,105,106,83,106,84,84,106,107,84,107,85,85,107,108,85,108,86,86,108,109,86,109,87,87,109,110,87,110,88,88,110,111,88,111,89,89,111,112,89,112,90,90,112,113,90,113,91,91,113,114,91,114,92,92,114,115,92,115,93,93,115,116,93,116,94,94,116,95,73,94,95,95,117,118,95,118,96,96,118,119,96,119,97,97,119,120,97,120,98,98,120,121,98,121,99,99,121,122,99,122,100,100,122,123,100,123,101,101,123,124,101,124,102,102,124,125,102,125,103,103,125,126,103,126,104,104,126,127,104,127,105,105,127,128,105,128,106,106,128,129,106,129,107,107,129,130,107,130,108,108,130,131,108,131,109,109,131,132,109,132,110,110,132,133,110,133,111,111,133,134,111,134,112,112,134,135,112,135,113,113,135,136,113,136,114,114,136,137,114,137,115,115,137,138,115,138,116,116,138,117,95,116,117,117,139,140,117,140,118,118,140,141,118,141,119,119,141,142,119,142,120,120,142,143,120,143,121,121,143,144,121,144,122,122,144,145,122,145,123,123,145,146,123,146,124,124,146,147,124,147,125,125,147,148,125,148,126,126,148,149,126,149,127,127,149,150,127,150,128,128,150,151,128,151,129,129,151,152,129,152,130,130,152,153,130,153,131,131,153,154,131,154,132,132,154,155,132,155,133,133,155,156,133,156,134,134,156,157,134,157,135,135,157,158,135,158,136,136,158,159,136,159,137,137,159,160,137,160,138,138,160,139,117,138,139,139,161,162,139,162,140,140,162,163,140,163,141,141,163,164,141,164,142,142,164,143,143,164,165,143,165,144,144,165,166,144,166,145,145,166,167,145,167,146,146,167,147,147,167,168,147,168,148,148,168,169,148,169,149,149,169,170,149,170,150,150,170,171,150,171,151,151,171,172,151,172,152,152,172,153,153,172,173,153,173,154,154,173,174,154,174,155,155,174,175,155,175,156,156,175,176,156,176,157,157,176,158,158,176,177,158,177,159,159,177,178,159,178,160,160,178,161,139,160,161,161,179,180,161,180,162,162,180,181,162,181,163,163,181,182,163,182,164,164,182,183,164,183,165,165,183,184,165,184,166,166,184,185,166,185,167,167,185,186,167,186,187,167,187,168,168,187,188,168,188,169,169,188,170,170,188,189,170,189,171,171,189,190,171,190,172,172,190,191,172,191,192,172,192,173,173,192,174,174,192,193,174,193,194,174,194,175,175,194,176,176,194,195,176,195,196,176,196,177,177,196,179,177,179,178,161,178,179,9,179,10,9,180,179,9,181,180,9,11,181,11,182,181,11,183,182,11,12,183,12,184,183,12,185,184,12,186,185,12,13,186,13,187,186,13,188,187,8,188,13,8,189,188,8,190,189,8,15,190,15,191,190,15,192,191,15,193,192,15,14,193,14,194,193,14,195,194,10,195,14,10,196,195,10,179,196],"material":{"color":16776976,"emissive":0,"metalness":1,"opacity":1,"roughness":0.6},"name":"Yellow_08 - Default_0","positions":[8,997,9,49,966,-125,-98,966,-120,-219,966,-64,-229,966,48,-65,966,123,229,966,48,219,966,-64,8,-997,9,-98,-966,-120,49,-966,-125,-219,-966,-64,-229,-966,48,-65,-966,123,219,-966,-64,229,-966,48,43,866,-249,-129,866,-243,-250,866,-218,-354,866,-178,-458,866,-96,-472,866,64,-354,866,178,-250,866,218,-65,866,248,129,866,243,250,866,218,354,866,178,458,866,96,500,866,0,458,866,-96,354,866,-178,250,866,-218,0,707,-356,-183,707,-344,-427,707,-280,-612,707,-178,-683,707,-92,-695,707,46,-556,707,215,-354,707,309,-183,707,344,0,707,356,183,707,344,427,707,280,612,707,178,695,707,46,683,707,-92,556,707,-215,354,707,-309,183,707,-344,0,500,-437,-224,500,-422,-433,500,-378,-612,500,-309,-750,500,-218,-837,500,-113,-851,500,57,-750,500,218,-612,500,309,-433,500,378,-224,500,422,0,500,437,224,500,422,433,500,378,612,500,309,750,500,218,851,500,57,837,500,-113,750,500,-218,612,500,-309,433,500,-378,224,500,-422,0,259,-487,-250,259,-470,-483,259,-422,-683,259,-344,-837,259,-243,-933,259,-126,-949,259,63,-837,259,243,-683,259,344,-483,259,422,-250,259,470,0,259,487,250,259,470,483,259,422,683,259,344,837,259,243,949,259,63,933,259,-126,837,259,-243,683,259,-344,483,259,-422,250,259,-470,0,0,-504,-259,0,-487,-500,0,-437,-707,0,-356,-866,0,-252,-966,0,-130,-983,0,65,-866,0,252,-707,0,356,-500,0,437,-259,0,487,0,0,504,259,0,487,500,0,437,707,0,356,866,0,252,983,0,65,966,0,-130,866,0,-252,707,0,-356,500,0,-437,259,0,-487,0,-259,-487,-250,-259,-470,-483,-259,-422,-683,-259,-344,-837,-259,-243,-933,-259,-126,-949,-259,63,-837,-259,243,-683,-259,344,-483,-259,422,-250,-259,470,0,-259,487,250,-259,470,483,-259,422,683,-259,344,837,-259,243,949,-259,63,933,-259,-126,837,-259,-243,683,-259,-344,483,-259,-422,250,-259,-470,0,-500,-437,-224,-500,-422,-433,-500,-378,-612,-500,-309,-750,-500,-218,-837,-500,-113,-851,-500,57,-750,-500,218,-612,-500,309,-433,-500,378,-224,-500,422,0,-500,437,224,-500,422,433,-500,378,612,-500,309,750,-500,218,851,-500,57,837,-500,-113,750,-500,-218,612,-500,-309,433,-500,-378,224,-500,-422,0,-707,-356,-183,-707,-344,-354,-707,-309,-556,-707,-215,-683,-707,-92,-695,-707,46,-556,-707,215,-354,-707,309,-183,-707,344,0,-707,356,183,-707,344,427,-707,280,612,-707,178,695,-707,46,683,-707,-92,556,-707,-215,354,-707,-309,183,-707,-344,43,-866,-249,-129,-866,-243,-250,-866,-218,-354,-866,-178,-458,-866,-96,-500,-866,0,-458,-866,96,-354,-866,178,-250,-866,218,-65,-866,248,129,-866,243,250,-866,218,354,-866,178,458,-866,96,500,-866,0,458,-866,-96,354,-866,-178,250,-866,-218]}],"radius":0.9999999358244896,"shown":true,"sourceName":"Yellow"}],"shownLimit":12};

// ---- React component ----
export type KineticClusterProps = Readonly<{
  className?: string;
  /**
   * URL of the model this pile was made from (the file you uploaded). Put the
   * file next to your code or in your public folder, e.g. modelUrl="/model.glb".
   */
  modelUrl: string;
  /** Overrides for the baked-in settings. */
  settings?: Partial<ClusterSettings>;
  style?: React.CSSProperties;
}>;

/** Live 3D pile: hover pushes the pieces, which settle back. */
export function KineticCluster({ className, modelUrl, settings, style }: KineticClusterProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Keyed on the settings' content: a parent re-render with an equal inline
  // object keeps the running pile (and the loaded model).
  const settingsKey = JSON.stringify(settings ?? {});
  const resolved = React.useMemo<ClusterSettings>(
    () => ({ ...KINETIC_CLUSTER_SETTINGS, ...(JSON.parse(settingsKey) as Partial<ClusterSettings>) }),
    [settingsKey],
  );

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = new ClusterEngine(canvas, resolved);
    engine.setDriftLoopSeconds(KINETIC_CLUSTER_LOOP_SECONDS);
    const geometry = createClusterPileGeometry(resolved.shape);
    engine.setGeometry(geometry);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      engine.setBacking({
        backingHeight: Math.round(bounds.height * ratio),
        backingWidth: Math.round(bounds.width * ratio),
        cssHeight: bounds.height,
        cssWidth: bounds.width,
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const setPointerFrom = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      engine.setPointer({
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      });
    };
    const handleMove = (event: PointerEvent) => {
      // A touch is always "pressed", so a finger drag acts as hover.
      if (event.buttons !== 0 && event.pointerType !== "touch") return engine.setPointer(null);
      setPointerFrom(event);
    };
    const handleDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return setPointerFrom(event);
      engine.setPointer(null);
    };
    const handleLeave = () => engine.setPointer(null);
    canvas.addEventListener("pointermove", handleMove);
    canvas.addEventListener("pointerleave", handleLeave);
    canvas.addEventListener("pointerdown", handleDown);
    canvas.addEventListener("pointerup", handleLeave);
    canvas.addEventListener("pointercancel", handleLeave);
    engine.start();

    let disposed = false;
    let asset: ClusterAsset | null = null;
    let assetPile: ClusterPileGeometry | null = null;
    let loaded: THREE.Object3D | null = null;
    // Degraded version of the model while the file loads (same deal, collision and edits).
    let proxyAsset: ClusterAsset | null = null;
    let proxyPile: ClusterPileGeometry | null = null;
    const dropProxy = () => {
      proxyPile?.dispose();
      proxyAsset?.dispose();
      proxyPile = null;
      proxyAsset = null;
    };
    if (KINETIC_CLUSTER_ASSET) {
      const baked = KINETIC_CLUSTER_ASSET;
      if (KINETIC_CLUSTER_PROXY) {
        proxyAsset = createClusterProxyAsset(KINETIC_CLUSTER_PROXY, CLUSTER_COPIED_ASSET_KEY);
        const proxyView = rekeyClusterAssetView(proxyAsset, baked.view);
        proxyPile = createClusterPileGeometry("uploaded", proxyAsset, proxyView);
        engine.setPile(
          proxyPile,
          clusterAssetPhysics(proxyAsset, proxyView),
          clusterPartMaterials(proxyAsset, proxyView, baked.wholeAsset, (code) => engine.checkCustomEffect(code)),
        );
      }
      new GLTFLoader()
        .loadAsync(modelUrl)
        .then((gltf) => {
          if (disposed) {
            disposeClusterGltf(gltf.scene);
            return;
          }
          const associations = gltf.parser.associations;
          const fileNodes = gltf.parser.json.nodes ?? [];
          // Original node names from the file (GLTFLoader renames objects).
          const root = normalizeClusterGltfScene(gltf.scene, (object) => {
            const index = associations.get(object)?.nodes;
            return index === undefined ? null : (fileNodes[index]?.name ?? "");
          });
          asset = extractClusterAsset(root, CLUSTER_COPIED_ASSET_KEY);
          // Baked edits are keyed by node name: translate them to this extraction.
          const view = rekeyClusterAssetView(asset, baked.view);
          assetPile = createClusterPileGeometry("uploaded", asset, view);
          engine.setPile(
            assetPile,
            clusterAssetPhysics(asset, view),
            clusterPartMaterials(asset, view, baked.wholeAsset, (code) => engine.checkCustomEffect(code)),
          );
          loaded = gltf.scene;
          dropProxy();
        })
        .catch((error: unknown) => console.error("KineticCluster: the model could not be loaded.", error));
    }

    return () => {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointerleave", handleLeave);
      canvas.removeEventListener("pointerdown", handleDown);
      canvas.removeEventListener("pointerup", handleLeave);
      canvas.removeEventListener("pointercancel", handleLeave);
      engine.dispose();
      geometry.dispose();
      dropProxy();
      assetPile?.dispose();
      asset?.dispose();
      if (loaded) disposeClusterGltf(loaded);
    };
  }, [modelUrl, resolved]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        background: KINETIC_CLUSTER_BACKGROUND ?? "transparent",
        display: "block",
        height: "100%",
        // Keep finger drags on the canvas instead of scrolling/zooming the page.
        touchAction: "none",
        width: "100%",
        ...style,
      }}
    />
  );
}

export default KineticCluster;
