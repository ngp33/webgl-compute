import { init } from "../webgl_compute.js";
const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");
if (gl === null) {
    alert("Unable to initialize WebGL. Your browser or machine may not support it.");
    throw "";
}
const glComp = init(gl);
const displayCtx = document.getElementById("display").getContext("2d");
displayCtx.scale(10, 10);
const PARTICLES_W = 10 * 2;
const PARTICLES_H = 10 * 2;
const NUM_PARTICLES = PARTICLES_W * PARTICLES_H;
const SPRING_LENGTH = 5.5 / 2;
const START_GAP = 5.0 / 2;
// Ordered as a list of columns
const getParticleIndex = (x, y) => {
    return x < 0 || x >= PARTICLES_W || y < 0 || y >= PARTICLES_H
        ? -1
        : x * PARTICLES_H + y;
};
let edgesFBO = glComp.createFBO(8, NUM_PARTICLES, "f32", 1, new Float32Array(new Array(PARTICLES_W)
    .fill(0)
    .map((v, x) => new Array(PARTICLES_H).fill(0).map((v, y) => {
    return [
        // Rest length = l
        getParticleIndex(x - 1, y),
        getParticleIndex(x + 1, y),
        getParticleIndex(x, y - 1),
        getParticleIndex(x, y + 1),
        // Rest length = l * sqrt(2)
        getParticleIndex(x - 1, y - 1),
        getParticleIndex(x - 1, y + 1),
        getParticleIndex(x + 1, y - 1),
        getParticleIndex(x + 1, y + 1),
    ];
}))
    .flat(2)));
let posFBO = glComp.createFBO(PARTICLES_W, PARTICLES_H, "f32", 4, new Float32Array(new Array(PARTICLES_W)
    .fill(0)
    .map((v, x) => new Array(PARTICLES_H)
    .fill(0)
    .map((v, y) => [
    50.0 + (-PARTICLES_W / 2 + x) * START_GAP,
    50.0 + (-PARTICLES_H / 2 + y) * START_GAP,
    0.0,
    0.0,
]))
    .flat(2)));
let newPosFBO = glComp.createFBO(PARTICLES_W, PARTICLES_H, "f32", 4);
let velFBO = glComp.createFBO(PARTICLES_W, PARTICLES_H, "f32", 4, new Float32Array(new Array(NUM_PARTICLES)
    .fill(0)
    .map((v, i) => [
    (-1.0 + Math.random() * 2.0) / 10,
    (-1.0 + Math.random() * 2.0) / 10,
    0.0,
    0.0,
])
    .flat()));
let newVelFBO = glComp.createFBO(PARTICLES_W, PARTICLES_H, "f32", 4);
const updateVel = glComp.createComputation({ pos: "fbo", vel: "fbo", edges: "fbo", dt: "float" }, 
/*GLSL*/ `
vec4 myPos = ${glComp.MACROS.fbo_idx_myxy("pos")};
vec4 myVel = ${glComp.MACROS.fbo_idx_myxy("vel")};

vec4 acc = vec4(0.0);
for (int i = 0; i < 8; i++) {
  int otherIdx = int(${glComp.MACROS.fbo_idx("edges", "i", `int(${glComp.MACROS.my_x()}) * ${PARTICLES_H} + int(${glComp.MACROS.my_y()})`)}.x);
  vec4 toOther = otherIdx == -1 ? vec4(0.0) : (${glComp.MACROS.fbo_idx("pos", `otherIdx / ${PARTICLES_H}`, `otherIdx % ${PARTICLES_H}`)} - myPos);
  acc += otherIdx == -1 ? vec4(0.0) : (0.5 * ((length(toOther) - (i >= 4 ? sqrt(2.0) : 1.0) * ${SPRING_LENGTH.toFixed(1)}) * normalize(toOther)) - 
  vec4(0.0)
  // (length(myVel) < 1.0 ? vec4(0.0) : 0.25 * (dot(-normalize(toOther), normalize(myVel))) * myVel)
);
}

fragColor = myVel;
fragColor += acc;
// fragColor = acc;
  `);
// fragColor = ${glComp.MACROS.fbo_idx(
//   "edges",
//   `int(${glComp.MACROS.my_x()}) * ${PARTICLES_H} + int(${glComp.MACROS.my_y()})`,
//   "i"
// )};
const updatePos = glComp.createComputation({ pos: "fbo", vel: "fbo", dt: "float" }, `
fragColor = clamp(${glComp.MACROS.fbo_idx_myxy("pos")} + ${glComp.MACROS.fbo_idx_myxy("vel")} * dt, 0.0, 100.0);
  `);
const edgesOut = glComp.readFBORaw(edgesFBO);
const drawOutput = () => {
    const posOut = glComp.readFBORaw(posFBO);
    const velOut = glComp.readFBORaw(velFBO);
    displayCtx.clearRect(0, 0, 1000, 1000);
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const [x, y] = [posOut[i * 4], posOut[i * 4 + 1]];
        for (const j of edgesOut.slice(i * 8, (i + 1) * 8)) {
            if (j === -1) {
                continue;
            }
            const [x2, y2] = [posOut[j * 4], posOut[j * 4 + 1]];
            displayCtx.beginPath();
            displayCtx.moveTo(x, y);
            displayCtx.lineTo(x2, y2);
            displayCtx.strokeStyle = "silver";
            displayCtx.lineWidth = 0.2;
            displayCtx.stroke();
            displayCtx.closePath();
        }
    }
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const [x, y] = [posOut[i * 4], posOut[i * 4 + 1]];
        const [vx, vy] = [velOut[i * 4], velOut[i * 4 + 1]];
        displayCtx.beginPath();
        displayCtx.arc(x, y, 0.5, 0, Math.PI * 2);
        displayCtx.fillStyle = "green";
        displayCtx.fill();
        displayCtx.closePath();
        // displayCtx.beginPath();
        // displayCtx.moveTo(x, y);
        // displayCtx.lineTo(x + vx, y + vy);
        // displayCtx.strokeStyle = "black";
        // displayCtx.lineWidth = 0.2;
        // displayCtx.stroke();
        // displayCtx.closePath();
    }
};
let lastT = 0;
const mainLoop = (t) => {
    if (lastT === 0) {
        lastT = t;
    }
    const dt = (t - lastT) * 0.01;
    lastT = t;
    drawOutput();
    glComp.runComputation(updateVel, newVelFBO, {
        pos: posFBO,
        vel: velFBO,
        edges: edgesFBO,
        dt,
    });
    let temp = velFBO;
    velFBO = newVelFBO;
    newVelFBO = temp;
    glComp.runComputation(updatePos, newPosFBO, { pos: posFBO, vel: velFBO, dt });
    temp = posFBO;
    posFBO = newPosFBO;
    newPosFBO = temp;
    requestAnimationFrame(mainLoop);
    drawOutput();
};
// console.log(edgesOut);
mainLoop(0);