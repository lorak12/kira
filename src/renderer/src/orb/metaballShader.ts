export const vertexShaderSrc = /* glsl */ `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Signed-distance-field circle warped by layered simplex-ish noise. u_amplitude
// scales the warp magnitude so the orb "breathes" with TTS playback volume;
// u_time alone drives a gentle idle pulse when amplitude is ~0. u_pulseSpeed
// and u_glow are state-driven (idle/listening/thinking/speaking each map to
// a distinct pulse rate + brightness) so the state is readable at a glance,
// not just when audio happens to be playing.
export const fragmentShaderSrc = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amplitude;
uniform vec3 u_color;
uniform float u_pulseSpeed;
uniform float u_glow;

out vec4 fragColor;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
  return dot(n, vec3(70.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float dist = length(uv);

  float pulse = 0.03 * sin(u_time * u_pulseSpeed);
  float energy = clamp(u_amplitude, 0.0, 1.0);

  // Three noise octaves at different frequencies/speeds read as a genuinely
  // liquid, organic warp instead of a simple ripple -- large slow swells,
  // medium wobble, and fine fast jitter that kicks in with speech energy.
  float angle = atan(uv.y, uv.x);
  float warp = noise(vec2(cos(angle) * 2.0, sin(angle) * 2.0) + u_time * 0.25);
  warp += 0.55 * noise(vec2(cos(angle) * 4.5, sin(angle) * 4.5) - u_time * 0.5);
  warp += 0.3 * (0.3 + energy) * noise(vec2(cos(angle) * 9.0, sin(angle) * 9.0) + u_time * 1.4);

  float radius = 0.30 + pulse + warp * (0.03 + energy * 0.09);
  // Hard ceiling: the canvas edge sits at a UV distance of 0.5 from center
  // (regardless of the canvas's pixel size), so radius + the widest glow
  // falloff below MUST stay under that or the bloom hard-clips at the
  // canvas edge -- visible as both a faint "box" (nonzero alpha reaching
  // the literal edge) and an abrupt cutoff at high energy/glow states.
  // Capping radius here makes that impossible regardless of how warp/pulse
  // tuning changes later.
  radius = min(radius, 0.34);

  float edge = smoothstep(radius, radius - 0.018, dist);

  // Layered bloom: a tight inner glow plus a softer outer halo, so
  // brightness reads as depth rather than a flat colored disc. Both fully
  // resolve to 0 well inside the canvas edge (radius capped at 0.34 + 0.13
  // = 0.47 at most, vs. the 0.5 edge) so there's no visible clipping.
  float innerGlow = smoothstep(radius + 0.07, radius, dist) * 0.55;
  float outerGlow = smoothstep(radius + 0.13, radius, dist) * 0.22;
  float glow = (innerGlow + outerGlow) * u_glow;

  // Bright core highlight offset slightly off-center for a subtle sense of
  // volume/light source rather than a flat-shaded circle.
  float core = smoothstep(0.22, 0.0, length(uv - vec2(-0.05, 0.06)));
  vec3 coreColor = mix(u_color, vec3(1.0), 0.6) * core * (0.3 + 0.4 * u_glow);

  vec3 color = u_color * (0.85 + 0.3 * energy) * (0.7 + 0.3 * u_glow) + coreColor;
  float alpha = edge + glow * (0.5 + 0.5 * energy);

  fragColor = vec4(color, alpha);
}
`
