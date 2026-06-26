uniform vec2 u_res;
uniform float u_time;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Sparse specks — only a fraction of pixels carry grain.
float speckField(vec2 px, vec2 seed, float t) {
  const float DENSITY = 1.5;
  const float STRENGTH = .5;

  // Continuous seed motion — smooth sin/cos, no stepped ticks.
  vec2 animSeed = seed
    + vec2(sin(t * 0.7) * 60.0, cos(t * 0.55) * 60.0)
    + vec2(sin(t * 0.19) * 12.0, cos(t * 0.23) * 12.0);

  float roll = hash21(px + animSeed);
  float presence = step(roll, DENSITY);
  float speck = hash21(px + animSeed + vec2(41.7, 89.3));
  float centered = (speck - 0.5) * presence;

  return 0.5 + centered * STRENGTH;
}

float filmGrain(vec2 fragCoord, float t) {
  // Smooth spatial drift — two layered frequencies for organic movement.
  vec2 drift = vec2(
    sin(t * 0.45) * 7.0 + sin(t * 0.11) * 2.5,
    cos(t * 0.38) * 7.0 + cos(t * 0.09) * 2.5
  );
  vec2 px = floor(fragCoord + drift);

  return speckField(px, vec2(0.0, 0.0), t);
}

void main() {
  float v = filmGrain(gl_FragCoord.xy, u_time);
  v = clamp(v, 0.2, 0.8);

  gl_FragColor = vec4(v, v, v, 1.0);
}
