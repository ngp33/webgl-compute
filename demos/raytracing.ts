import { init } from "../webgl_compute.js";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2");

if (gl === null) {
  alert(
    "Unable to initialize WebGL. Your browser or machine may not support it."
  );
  throw "";
}

const glComp = init(gl);

const VIEWPORT_PIXELS = 1000;
const VIEWPORT_WIDTH = 2;
const VIEWPORT_DIST = 1;

const floatStr = (v: number) =>
  Number.isInteger(v) ? v.toFixed(1) : v.toString();

const render = glComp.createComputation(
  {},
  /*GLSL*/ `
vec3 spherePos = vec3(0.0, 0.0, -2.0);
vec3 lightPos = vec3(0.0, 1.0, 0.0);
vec3 sphereColor = vec3(0.0, 1.0, 1.0);

vec3 rayOrigin = vec3(0.0, 0.0, 0.0);
vec3 rayTarget = rayOrigin + vec3(
  -${floatStr(VIEWPORT_WIDTH / 2)},
  -${floatStr(VIEWPORT_WIDTH / 2)},
  -${floatStr(VIEWPORT_DIST)}) + vec3(
  (gl_FragCoord.x / ${floatStr(VIEWPORT_PIXELS)}) * ${floatStr(VIEWPORT_WIDTH)},
  (gl_FragCoord.y / ${floatStr(VIEWPORT_PIXELS)}) * ${floatStr(VIEWPORT_WIDTH)},
  0.0);
vec3 rayDir = normalize(rayTarget - rayOrigin);

float dist = raySphereIntersect(rayOrigin, rayDir, spherePos, 1.0);
if (dist == -1.0) {
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  return;
}

vec3 hitPos = rayOrigin + rayDir * dist;
vec3 toLight = lightPos - hitPos;
float lightStrength = 1.0 / (toLight.x * toLight.x + toLight.y * toLight.y + toLight.z * toLight.z);
vec3 l = normalize(toLight);
vec3 n = normalize(hitPos - spherePos);
vec3 v = -rayDir;

fragColor = vec4(
  1.0 * sphereColor * lightStrength * dot(n, l) +
  1.0 * vec3(1.0) * lightStrength * pow(dot(n, normalize(l + v)), 16.0),
  1.0);
`,
  /*GLSL*/ `
// from https://gist.github.com/wwwtyro/beecc31d65d1004f5a9d
float raySphereIntersect(vec3 r0, vec3 rd, vec3 s0, float sr) {
  // - r0: ray origin
  // - rd: normalized ray direction
  // - s0: sphere center
  // - sr: sphere radius
  // - Returns distance from r0 to first intersecion with sphere,
  //   or -1.0 if no intersection.
  float a = dot(rd, rd);
  vec3 s0_r0 = r0 - s0;
  float b = 2.0 * dot(rd, s0_r0);
  float c = dot(s0_r0, s0_r0) - (sr * sr);
  if (b*b - 4.0*a*c < 0.0) {
      return -1.0;
  }
  return (-b - sqrt((b*b) - 4.0*a*c))/(2.0*a);
}
`
);

glComp.runComputation(render, "canvas", {});
