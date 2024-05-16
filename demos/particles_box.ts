import { init } from "../webgl_compute.js";


const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2");

if (gl === null) {
  alert(
    "Unable to initialize WebGL. Your browser or machine may not support it."
  );
  throw "";
}
const WIDTH = window.innerWidth
const HEIGHT = window.innerHeight
const HALF_WIDTH = WIDTH * 0.5
const HALF_HEIGHT = HEIGHT * 0.5
const PARTICLE_RADIUS = 1
const glComp = init(gl);
const displayCanvas = document.getElementById("display") as HTMLCanvasElement
const displayCtx = displayCanvas.getContext("2d")!;
displayCanvas.width = WIDTH;
displayCanvas.height = HEIGHT;

displayCtx.scale(1, 1);  // We can comine this with pixelDensity if we like to get retina resolution

const NUM_PARTICLES = 2000;

let posFBO = glComp.createFBO(
  NUM_PARTICLES,
  1,
  4,
  "f32",
  new Float32Array(
    new Array(NUM_PARTICLES)
      .fill(0)
      .map((v, i) => [
        Math.random() * (WIDTH * 0.1) + HALF_WIDTH,
        Math.random() * (HEIGHT* 0.1) + HALF_HEIGHT,
        0.0,
        0.0,
      ])
      .flat()
  )
);

let newPosFBO = glComp.createFBO(NUM_PARTICLES, 1, 4, "f32");
let velFBO = glComp.createFBO(
  NUM_PARTICLES,
  1,
  4,
  "f32",
  new Float32Array(
    new Array(NUM_PARTICLES)
      .fill(0)
      .map((v, i) => [
        (-1.0 + Math.random() * 2.0) / 10,
        (-1.0 + Math.random() * 2.0) / 10,
        0.0,
        0.0,
      ])
      .flat()
  )
);
let newVelFBO = glComp.createFBO(NUM_PARTICLES, 1, 4, "f32");

const updateVel = glComp.createComputation(
  { pos: "fbo", vel: "fbo", dt: "float" },
  `
vec4 pos = ${glComp.MACROS.fbo_idx_myxy("pos")};
fragColor = ${glComp.MACROS.fbo_idx_myxy("vel")};
// Commenting out this, Lets wrap instead
// fragColor.x *= float(pos.x > 0.0 && pos.x < ${WIDTH}.0) * 2.0 - 1.0;
// fragColor.y *= float(pos.y > 0.0 && pos.y < ${500}.0) * 2.0 - 1.0;

  `
);
const updatePos = glComp.createComputation(
  { pos: "fbo", vel: "fbo", dt: "float" },
  `
  vec4 pos = ${glComp.MACROS.fbo_idx_myxy("pos")};
  vec4 vel = ${glComp.MACROS.fbo_idx_myxy("vel")};
  
  fragColor.x = clamp(pos.x + vel.x * dt, 0.0, ${WIDTH}.0);
  fragColor.y = clamp(pos.y + vel.y * dt, 0.0, ${HEIGHT}.0);
  
  // Wrapping
  // Check if particle is out of screen. 
  if(fragColor.y >= ${HEIGHT}.0) {
    fragColor.y = 1.0;
  }
  if(fragColor.y <= 0.0) {
    fragColor.y = ${HEIGHT-1}.0;
  }
  if(fragColor.x >= ${WIDTH}.0) {
    fragColor.x = 1.0;
  }
  if(fragColor.x <= 0.0) {
    fragColor.x = ${WIDTH-1}.0;
  }

  `
);

const drawOutput = () => {
  const posOut = glComp.readFBORaw(posFBO);
  const velOut = glComp.readFBORaw(velFBO);
  const particleSize = PARTICLE_RADIUS * 2
  displayCtx.clearRect(0, 0, WIDTH, HEIGHT);
  displayCtx.fillStyle = "black";
  for (let i = 0; i < NUM_PARTICLES; i++) {
    const [x, y] = [posOut[i * 4], posOut[i * 4 + 1]];
    const [vx, vy] = [velOut[i * 4], velOut[i * 4 + 1]];
    displayCtx.fillRect(x, y, particleSize, particleSize)
    // displayCtx.beginPath();
    // displayCtx.arc(x, y, 0.5, 0, Math.PI * 2);
    // displayCtx.fillStyle = "green";
    // displayCtx.fill();
    // displayCtx.closePath();
    displayCtx.beginPath();
    const cx = x +PARTICLE_RADIUS
    const cy = y +PARTICLE_RADIUS
    displayCtx.moveTo(cx, cy);
    displayCtx.lineTo(x + vx * 100, y + vy * 100);
    displayCtx.strokeStyle = "red";
    displayCtx.lineWidth = 0.5;
    displayCtx.stroke();
    displayCtx.closePath();
  }
};

let lastT = 0;
const mainLoop = (t: number) => {
  if (lastT === 0) {
    lastT = t;
  }
  const dt = t - lastT;
  lastT = t;

  drawOutput();
  document.getElementById("fps")!.innerHTML = `FPS: ${1000 / dt}`;

  glComp.runComputation(updateVel, newVelFBO, { pos: posFBO, vel: velFBO, dt });

  let temp = velFBO;
  velFBO = newVelFBO;
  newVelFBO = temp;

  glComp.runComputation(updatePos, newPosFBO, { pos: posFBO, vel: velFBO, dt });

  temp = posFBO;
  posFBO = newPosFBO;
  newPosFBO = temp;

  requestAnimationFrame(mainLoop);
};

mainLoop(0);


