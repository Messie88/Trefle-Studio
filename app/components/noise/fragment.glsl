// Simplex Noise Waves — fragment shader port of Reinder Nijhoff's turtle sketch
//   https://turtletoy.net/turtle/a4242cdb2b
// Forked from "Simplex Noise Mountains" by markknol.
//
// Per-pixel: loop top -> down through gridY rows, accumulate running min
// of (y_row + waveSize * 0.2 * wrinkleNoise(...)). At each row, the visible
// height for this column is the running min — the hidden-line stack used by
// the turtle drawing. Pixel is lit if it sits on/near the visible curve.

uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_intensity;
uniform vec3 u_ink;

// --- Tunables (mirror the turtletoy sliders) ----------------------------
const float WRINKLES   = 10.0;
const float FREQUENCY  = 0.6;
const float WAVE_SIZE  = 60.0;
const float FIELD_SIZE = 300.0;
const int   GRID_Y     = 120;

// --- 2D simplex noise (Ashima / Stefan Gustavson, MIT) ------------------
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0),
                          dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.1;
  vec3 ox = floor(x + 0.1);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x   + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// wrinkleNoise(x, y) = sin(n * 3 * wrinkles) * (0.5 + 0.5 * n)^2
float wrinkleNoise(vec2 p) {
  float n = snoise(p + .5);
  float base = 0.5 + 0.5 * n;
  return sin(n * 3.0 * WRINKLES) * base * base;
}

void main() {
  // Map fragment to the turtletoy [-fieldSize/2, fieldSize/2] world space.
  // Fit FIELD_SIZE into the shorter screen dimension; keep aspect.
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.x, u_res.y);
  vec2 world = uv * FIELD_SIZE;

  // Localized animation: only pixels near the cursor warp / advance in time.
  // Falloff from full influence at cursor to 0 outside MOUSE_RADIUS (viewport-uv).
  const float MOUSE_RADIUS_IN  = 0.05;
  const float MOUSE_RADIUS_OUT = 0.5;
  vec2 scr = gl_FragCoord.xy / u_res.xy;
  float dist = distance(scr, u_mouse);
  float influence = 1.0 - smoothstep(MOUSE_RADIUS_IN, MOUSE_RADIUS_OUT, dist);

  vec2 drift = ((u_mouse - 0.5) * FIELD_SIZE * 0.6
             + vec2(u_time * 1.2, u_time * -0.3)) * influence;

  // Per-pixel running min over rows (top -> down).
  float currentMin = 1e6;
  float lineMask = 0.0;
  float halfThick = max(0.45, FIELD_SIZE / min(u_res.x, u_res.y) * 0.6);

  for (int gy = 0; gy < GRID_Y; gy++) {
    float yRow = (float(GRID_Y - gy) / float(GRID_Y)) * FIELD_SIZE - FIELD_SIZE * 0.5;

    vec2 noisePos = vec2(world.x, yRow) * FREQUENCY / FIELD_SIZE
                  + drift / FIELD_SIZE;

    float r = WAVE_SIZE * 0.25 * wrinkleNoise(noisePos);
    float rawH = yRow + r;
    float h = min(rawH, currentMin);

    // Turtle always plots at h — overlapping strokes saturate the silhouette.
    // Lerp lineMask toward 1 by per-row contribution for smooth accumulation
    // rather than hard `max` clamping.
    float d = abs(world.y - h);
    float contribution = smoothstep(halfThick, 0.0, d);
    lineMask = mix(lineMask, .5, contribution);
    currentMin = h;
  }

  float a = lineMask * u_intensity;
  gl_FragColor = vec4(u_ink, a);
}
