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
const NUM_PARTICLES = 2000;
let posFBO = glComp.createFBO(NUM_PARTICLES, 1, "f32", 4, new Float32Array(new Array(NUM_PARTICLES)
    .fill(0)
    .map((v, i) => [
    45.0 + Math.random() * 10.0,
    45.0 + Math.random() * 10.0,
    0.0,
    0.0,
])
    .flat()));
let newPosFBO = glComp.createFBO(NUM_PARTICLES, 1, "f32", 4);
let velFBO = glComp.createFBO(NUM_PARTICLES, 1, "f32", 4, new Float32Array(new Array(NUM_PARTICLES)
    .fill(0)
    .map((v, i) => [
    (-1.0 + Math.random() * 2.0) / 10,
    (-1.0 + Math.random() * 2.0) / 10,
    0.0,
    0.0,
])
    .flat()));
let newVelFBO = glComp.createFBO(NUM_PARTICLES, 1, "f32", 4);
const updateVel = glComp.createComputation({ pos: "fbo", vel: "fbo", dt: "float" }, `
vec4 pos = ${glComp.MACROS.fbo_idx_myxy("pos")};
fragColor = ${glComp.MACROS.fbo_idx_myxy("vel")};
fragColor.x *= float(pos.x > 0.0 && pos.x < 100.0) * 2.0 - 1.0;
fragColor.y *= float(pos.y > 0.0 && pos.y < 100.0) * 2.0 - 1.0;
  `);
const updatePos = glComp.createComputation({ pos: "fbo", vel: "fbo", dt: "float" }, `
fragColor = clamp(${glComp.MACROS.fbo_idx_myxy("pos")} + ${glComp.MACROS.fbo_idx_myxy("vel")} * dt, 0.0, 100.0);
  `);
const drawOutput = () => {
    const posOut = glComp.readFBORaw(posFBO);
    const velOut = glComp.readFBORaw(velFBO);
    displayCtx.clearRect(0, 0, 1000, 1000);
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const [x, y] = [posOut[i * 4], posOut[i * 4 + 1]];
        const [vx, vy] = [velOut[i * 4], velOut[i * 4 + 1]];
        displayCtx.beginPath();
        displayCtx.arc(x, y, 0.5, 0, Math.PI * 2);
        displayCtx.fillStyle = "green";
        displayCtx.fill();
        displayCtx.closePath();
        displayCtx.beginPath();
        displayCtx.moveTo(x, y);
        displayCtx.lineTo(x + vx * 20, y + vy * 20);
        displayCtx.strokeStyle = "black";
        displayCtx.lineWidth = 0.2;
        displayCtx.stroke();
        displayCtx.closePath();
    }
};
let lastT = 0;
const mainLoop = (t) => {
    if (lastT === 0) {
        lastT = t;
    }
    const dt = t - lastT;
    lastT = t;
    drawOutput();
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
