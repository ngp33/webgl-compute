import { init } from "../webgl_compute.js";

console.log("343434");

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

const NUM_LIGHTS = 8;

const floatStr = (v: number) =>
  Number.isInteger(v) ? v.toFixed(1) : v.toString();

const intersectsFBO = glComp.createFBO(
  VIEWPORT_PIXELS,
  VIEWPORT_PIXELS,
  4,
  "f32"
);

const allLightsFBO = glComp.createIndexedFBO(
  [NUM_LIGHTS, VIEWPORT_PIXELS, VIEWPORT_PIXELS],
  4,
  "f32"
);

const numSummationSteps = Math.log2(NUM_LIGHTS);
const summationFBOs = new Array(numSummationSteps)
  .fill(0)
  .map((_, i) =>
    glComp.createIndexedFBO(
      [2 ** (numSummationSteps - i - 1), VIEWPORT_PIXELS, VIEWPORT_PIXELS],
      4,
      "f32"
    )
  );

const intersectRays = glComp.createComputation(
  {},
  /*GLSL*/ `
vec3 spherePos = vec3(0.0, 0.0, -2.0);

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
  fragColor = vec4(0.0, 0.0, 0.0, -1.0);
  return;
}

fragColor = vec4(rayOrigin + rayDir * dist, 0.0);
`,
  /*GLSL*/ `
// from https://gist.github.com/wwwtyro/beecc31d65d1004f5a9d
float raySphereIntersect(vec3 r0, vec3 rd, vec3 s0, float sr) {
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

const shadeAllLights = glComp.createComputation(
  { intersects: "fbo", t: "float", outputWidth: "int" },
  /*GLSL*/ `
${glComp.MACROS.idx_from_2d_dynamic(
  "my_idx",
  [String(NUM_LIGHTS), String(VIEWPORT_PIXELS), String(VIEWPORT_PIXELS)],
  ["outputWidth", ""],
  ["int(gl_FragCoord.x)", "int(gl_FragCoord.y)"]
)}
vec3 spherePos = vec3(0.0, 0.0, -2.0);
vec3 sphereColor = vec3(0.0, 1.0, 1.0);
mat3 rotation = mat3(
  1.0, 0.0, 0.0,
  0.0, cos(t/1000.0), -sin(t/1000.0),
  0.0, sin(t/1000.0), cos(t/1000.0)
);
vec3 lightPos = spherePos + rotation * vec3(2.0 * sin(float(my_idx_0) * 3.14*2.0/${floatStr(
    NUM_LIGHTS
  )}), 1.0, 2.0 * cos(float(my_idx_0) * 3.14*2.0/${floatStr(NUM_LIGHTS)}));

vec4 intersect = texelFetch(intersects, ivec2(my_idx_1, my_idx_2), 0);
if (intersect.w < -0.5) {
  fragColor = vec4(0.0);
  return;
}

vec3 hitPos = intersect.xyz;
vec3 toLight = lightPos - hitPos;
float lightStrength = 0.5 / (toLight.x * toLight.x + toLight.y * toLight.y + toLight.z * toLight.z);
vec3 l = normalize(toLight);
vec3 n = normalize(hitPos - spherePos);
vec3 v = normalize(vec3(0.0, 0.0, 0.0) - hitPos);

fragColor = vec4(
  1.0 * sphereColor * lightStrength * max(0.0, dot(n, l)) +
  1.0 * vec3(1.0) * lightStrength * pow(max(0.0, dot(n, normalize(l + v))), 32.0),
  0.0);
`
);

const sumStep = glComp.createComputation(
  { inputFbo: "fbo", inputNumLights: "int", outputWidth: "int" },
  /*GLSL*/ `
${glComp.MACROS.idx_from_2d_dynamic(
  "my_idx",
  ["(inputNumLights/2)", String(VIEWPORT_PIXELS), String(VIEWPORT_PIXELS)],
  ["outputWidth", ""],
  ["int(gl_FragCoord.x)", "int(gl_FragCoord.y)"]
)}

${glComp.MACROS.idx_to_2d_dynamic(
  "idx_a",
  ["textureSize(inputFbo, 0).x", ""],
  ["(inputNumLights/2)", String(VIEWPORT_PIXELS), String(VIEWPORT_PIXELS)],
  ["(my_idx_0*2)", "my_idx_1", "my_idx_2"]
)}

${glComp.MACROS.idx_to_2d_dynamic(
  "idx_b",
  ["textureSize(inputFbo, 0).x", ""],
  ["(inputNumLights/2)", String(VIEWPORT_PIXELS), String(VIEWPORT_PIXELS)],
  ["(my_idx_0*2 + 1)", "my_idx_1", "my_idx_2"]
)}

fragColor = texelFetch(inputFbo, idx_a, 0) + texelFetch(inputFbo, idx_b, 0);
  `
);

const renderToCanvas = glComp.createComputation(
  { fbo: "fbo" },
  /*GLSL*/ `fragColor = vec4(texelFetch(fbo, ivec2(gl_FragCoord.y, gl_FragCoord.x), 0).xyz, 1.0);`
);

let startT = 0;
let lastT = 0;
const mainLoop = (t: number) => {
  if (startT === 0) {
    startT = t;
    lastT = t;
  }

  const dt = t - lastT;
  lastT = t;
  document.getElementById("fps")!.innerHTML = `FPS: ${1000 / dt}`;

  glComp.runComputation(intersectRays, intersectsFBO, {});
  glComp.runComputation(shadeAllLights, allLightsFBO, {
    intersects: intersectsFBO,
    t: t - startT,
    outputWidth: allLightsFBO.width,
  });

  let inputFBO = allLightsFBO;
  let outputFBO = summationFBOs[0];
  for (let i = 0; i < numSummationSteps; i++) {
    outputFBO = summationFBOs[i];
    glComp.runComputation(sumStep, outputFBO, {
      inputFbo: inputFBO,
      inputNumLights: inputFBO.indexDims[0],
      outputWidth: outputFBO.width,
    });
    inputFBO = outputFBO;
  }

  glComp.runComputation(renderToCanvas, "canvas", { fbo: outputFBO });

  requestAnimationFrame(mainLoop);
};

mainLoop(0);
