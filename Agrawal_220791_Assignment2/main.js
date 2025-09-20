// ==============================
// Globals & Configuration
// ==============================
var gl;
var canvas;

// Matrix stack for hierarchical modeling
var modelStack = [];

// Cube buffers
var cubeVbo; // positions
var cubeIbo; // indices
var cubeNbo; // normals

// Sphere buffers
var sphereVbo;
var sphereIbo;
var sphereNbo;

// Sphere data arrays
var spherePositions = [];
var sphereIndices = [];
var sphereNormals = [];

// Shader programs and cached location objects
var programFlat, programGouraud, programPhong;
var locFlat, locGouraud, locPhong;

// Viewport rotations (yaw/pitch) per column
var pitchA = 0.0,
  yawA = 0.0; // left (flat)
var pitchB = 0.0,
  yawB = 0.0; // middle (gouraud)
var pitchC = 0.0,
  yawC = 0.0; // right (phong)

// Mouse interaction
var prevMouseX = 0.0;
var prevMouseY = 0.0;
var activeViewport = 0; // 1=left, 2=middle, 3=right

// Matrices
var viewMatrix = mat4.create();
var modelMatrix = mat4.create();
var projMatrix = mat4.create();
var normalMatrix = mat3.create();

// Lighting/material parameters
var lightPos = [5, 4, 4];
var kAmbient = [1, 1, 1];
var kDiffuse = [1.0, 1.0, 1.0];
var kSpecular = [1.0, 1.0, 1.0];

// Camera
var eyePos = [0.0, 0.0, 2.0];
var target = [0.0, 0.0, 0.0];
var viewUp = [0.0, 1.0, 0.0];

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

// ==============================
// Utilities
// ==============================
function pushMatrix(stack, m) {
  //necessary because javascript only does shallow push
  var copy = mat4.create(m);
  stack.push(copy);
}

function popMatrix(stack) {
  if (stack.length > 0) return stack.pop();
  else console.log("stack has no matrix to pop!");
}

// ==============================
// Shader program locations helper
// ==============================
function getLocations(shaderProgram) {
  return {
    aPosition: gl.getAttribLocation(shaderProgram, "aPosition"),
    aNormal: gl.getAttribLocation(shaderProgram, "aNormal"),
    uModel: gl.getUniformLocation(shaderProgram, "uModel"),
    uView: gl.getUniformLocation(shaderProgram, "uView"),
    uProj: gl.getUniformLocation(shaderProgram, "uProj"),
    uLightPos: gl.getUniformLocation(shaderProgram, "uLightPos"),
    uKAmbient: gl.getUniformLocation(shaderProgram, "uKAmbient"),
    uKDiffuse: gl.getUniformLocation(shaderProgram, "uKDiffuse"),
    uKSpecular: gl.getUniformLocation(shaderProgram, "uKSpecular"),
  };
}

// (mouse event handlers moved near UI setup below)

// ==============================
// Shader Sources
// ==============================
// Flat Shading (Per-Face)
const flatVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uProj;
uniform mat4 uView;

out vec3 vPosEye;

void main() {
  mat4 MVP = uProj * uView * uModel;
  gl_Position = MVP * vec4(aPosition, 1.0);
  vPosEye = (uView * uModel * vec4(aPosition, 1.0)).xyz;
}`;

const flatFragShaderCode = `#version 300 es
precision mediump float;

in vec3 vPosEye;

uniform vec3 uLightPos;
uniform vec3 uKAmbient;
uniform vec3 uKDiffuse;
uniform vec3 uKSpecular;

out vec4 fragColor;

void main() {
  vec3 N = normalize(cross(dFdx(vPosEye), dFdy(vPosEye)));
  vec3 L = normalize(uLightPos - vPosEye);
  vec3 R = normalize(-reflect(L, N));
  vec3 V = normalize(-vPosEye);

  float ambient = 0.15;
  float diffuse = max(dot(L, N), 0.0);
  float specular = pow(max(dot(R, V), 0.0), 32.0);

  vec3 color = uKAmbient * ambient + uKDiffuse * diffuse + uKSpecular * specular;
  fragColor = vec4(color, 1.0);
}`;

// Gouraud Shading (Per-Vertex)
const perVertVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uProj;
uniform mat4 uView;

out vec3 vColor;

uniform vec3 uLightPos;
uniform vec3 uKAmbient;
uniform vec3 uKDiffuse;
uniform vec3 uKSpecular;

void main() {
  vec3 posEye = (uView * uModel * vec4(aPosition, 1.0)).xyz;
  vec3 nEye = normalize((transpose(inverse(mat3(uView * uModel)))) * aNormal);

  vec3 L = normalize(uLightPos - posEye);
  vec3 V = normalize(-posEye);

  float diffuse = max(dot(nEye, L), 0.0);
  float specular = pow(max(dot(-reflect(L, nEye), V), 0.0), 32.0);
  float ambient = 0.15;
  vColor = uKAmbient * ambient + uKDiffuse * diffuse + uKSpecular * specular;

  gl_Position = uProj * uView * uModel * vec4(aPosition, 1.0);
}`;

const perVertFragShaderCode = `#version 300 es
precision mediump float;

in vec3 vColor;

out vec4 fragColor;

void main() {
  fragColor = vec4(vColor, 1.0);
}`;

// Phong Shading (Per-Fragment)
const perFragVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uProj;
uniform mat4 uView;

out vec3 vPosEye;
out vec3 vNEye;
out vec3 vL;
out vec3 vV;

uniform vec3 uLightPos;

void main() {
  vPosEye = (uView * uModel * vec4(aPosition, 1.0)).xyz;
  vNEye = normalize(mat3(uView * uModel) * aNormal);
  vL = normalize(uLightPos - vPosEye);
  vV = normalize(-vPosEye);
  gl_Position = uProj * uView * uModel * vec4(aPosition, 1.0);
}`;

const perFragFragShaderCode = `#version 300 es
precision mediump float;
out vec4 fragColor;

in vec3 vNEye;
in vec3 vL;
in vec3 vV;
in vec3 vPosEye;

uniform vec3 uKAmbient;
uniform vec3 uKDiffuse;
uniform vec3 uKSpecular;

void main() {
  vec3 N = normalize(vNEye);
  vec3 L = normalize(vL);
  vec3 V = normalize(vV);
  vec3 R = normalize(-reflect(L, N));

  float diffuse = max(dot(N, L), 0.0);
  float specular = pow(max(dot(R, V), 0.0), 32.0);
  float ambient = 0.15;

  vec3 color = uKAmbient * ambient + uKDiffuse * diffuse + uKSpecular * specular;
  fragColor = vec4(color, 1.0);
}`;

function vertexShaderSetup(vertexShaderCode) {
  shader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(shader, vertexShaderCode);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function fragmentShaderSetup(fragShaderCode) {
  shader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(shader, fragShaderCode);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

// ==============================
// WebGL helpers: shader compile/link, context init
// ==============================
function initShaders(vertexShaderCode, fragShaderCode) {
  shaderProgram = gl.createProgram();

  var vertexShader = vertexShaderSetup(vertexShaderCode);
  var fragmentShader = fragmentShaderSetup(fragShaderCode);

  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vertexShader));
    console.log(gl.getShaderInfoLog(fragmentShader));
  }

  gl.useProgram(shaderProgram);
  return shaderProgram;
}

function initGL(canvas) {
  try {
    gl = canvas.getContext("webgl2");
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
  } catch (e) {}
  if (!gl) {
    alert("WebGL initialization failed");
  }
}

// ==============================
// Geometry generation
// ==============================
function initSphere(nslices, nstacks, radius) {
  var theta1, theta2;

  for (i = 0; i < nslices; i++) {
    spherePositions.push(0);
    spherePositions.push(-radius);
    spherePositions.push(0);

    sphereNormals.push(0);
    sphereNormals.push(-1.0);
    sphereNormals.push(0);
  }

  for (j = 1; j < nstacks - 1; j++) {
    theta1 = (j * 2 * Math.PI) / nslices - Math.PI / 2;
    for (i = 0; i < nslices; i++) {
      theta2 = (i * 2 * Math.PI) / nslices;
      spherePositions.push(radius * Math.cos(theta1) * Math.cos(theta2));
      spherePositions.push(radius * Math.sin(theta1));
      spherePositions.push(radius * Math.cos(theta1) * Math.sin(theta2));

      sphereNormals.push(Math.cos(theta1) * Math.cos(theta2));
      sphereNormals.push(Math.sin(theta1));
      sphereNormals.push(Math.cos(theta1) * Math.sin(theta2));
    }
  }

  for (i = 0; i < nslices; i++) {
    spherePositions.push(0);
    spherePositions.push(radius);
    spherePositions.push(0);

    sphereNormals.push(0);
    sphereNormals.push(1.0);
    sphereNormals.push(0);
  }

  for (j = 0; j < nstacks - 1; j++) {
    for (i = 0; i <= nslices; i++) {
      var mi = i % nslices;
      var mi2 = (i + 1) % nslices;
      var idx = (j + 1) * nslices + mi;
      var idx2 = j * nslices + mi;
      var idx3 = j * nslices + mi2;
      var idx4 = (j + 1) * nslices + mi;
      var idx5 = j * nslices + mi2;
      var idx6 = (j + 1) * nslices + mi2;

      sphereIndices.push(idx);
      sphereIndices.push(idx2);
      sphereIndices.push(idx3);
      sphereIndices.push(idx4);
      sphereIndices.push(idx5);
      sphereIndices.push(idx6);
    }
  }
}

// Cube generation function with normals
// ==============================
// GPU Buffer initialization (cube)
// ==============================
function initCubeBuffer() {
  var vertices = [
    // Front face
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Back face
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    // Top face
    -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Bottom face
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // Right face
    0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
    // Left face
    -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5,
  ];
  cubeVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  cubeVbo.itemSize = 3;
  cubeVbo.numItems = vertices.length / 3;

  var normals = [
    // Front face
    0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
    // Back face
    0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0,
    // Top face
    0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0,
    // Bottom face
    0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0,
    // Right face
    1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,
    // Left face
    -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0,
  ];
  cubeNbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeNbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  cubeNbo.itemSize = 3;
  cubeNbo.numItems = normals.length / 3;

  var indices = [
    0,
    1,
    2,
    0,
    2,
    3, // Front face
    4,
    5,
    6,
    4,
    6,
    7, // Back face
    8,
    9,
    10,
    8,
    10,
    11, // Top face
    12,
    13,
    14,
    12,
    14,
    15, // Bottom face
    16,
    17,
    18,
    16,
    18,
    19, // Right face
    20,
    21,
    22,
    20,
    22,
    23, // Left face
  ];
  cubeIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIbo);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW,
  );
  cubeIbo.itemSize = 1;
  cubeIbo.numItems = indices.length;
}

// ==============================
// Draw helpers (cube)
// ==============================
function drawCube(locations) {
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVbo);
  gl.enableVertexAttribArray(locations.aPosition);
  gl.vertexAttribPointer(
    locations.aPosition,
    cubeVbo.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeNbo);
  if (locations.aNormal >= 0) {
    gl.enableVertexAttribArray(locations.aNormal);
    gl.vertexAttribPointer(
      locations.aNormal,
      cubeNbo.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIbo);
  gl.drawElements(gl.TRIANGLES, cubeIbo.numItems, gl.UNSIGNED_SHORT, 0);
}

// ==============================
// GPU Buffer initialization (sphere)
// ==============================
function initSphereBuffer() {
  var nslices = 30; // use even number
  var nstacks = nslices / 2 + 1;
  var radius = 0.5;
  initSphere(nslices, nstacks, radius);

  sphereVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereVbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(spherePositions),
    gl.STATIC_DRAW,
  );
  sphereVbo.itemSize = 3;
  sphereVbo.numItems = nslices * nstacks;

  sphereNbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereNbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(sphereNormals),
    gl.STATIC_DRAW,
  );
  sphereNbo.itemSize = 3;
  sphereNbo.numItems = nslices * nstacks;

  sphereIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIbo);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint32Array(sphereIndices),
    gl.STATIC_DRAW,
  );
  sphereIbo.itemsize = 1;
  sphereIbo.numItems = (nstacks - 1) * 6 * (nslices + 1);
}

// ==============================
// Draw helpers (sphere)
// ==============================
function drawSphere(locations) {
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereVbo);
  gl.enableVertexAttribArray(locations.aPosition);
  gl.vertexAttribPointer(
    locations.aPosition,
    sphereVbo.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereNbo);
  if (locations.aNormal >= 0) {
    gl.enableVertexAttribArray(locations.aNormal);
    gl.vertexAttribPointer(
      locations.aNormal,
      sphereNbo.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIbo);
  gl.drawElements(gl.TRIANGLES, sphereIbo.numItems, gl.UNSIGNED_INT, 0);
}

// ==============================
// Scene setup helpers
// ==============================
function sceneHelper() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  mat4.identity(viewMatrix);
  viewMatrix = mat4.lookAt(eyePos, target, viewUp, viewMatrix);
  mat4.identity(projMatrix);
  mat4.perspective(50, 1.0, 0.1, 1000, projMatrix);
  mat4.identity(modelMatrix);

  gl.enable(gl.DEPTH_TEST);
}

// Bind common uniforms for current program locations
function bindSceneUniforms(locations) {
  gl.uniformMatrix4fv(locations.uModel, false, modelMatrix);
  gl.uniformMatrix4fv(locations.uView, false, viewMatrix);
  gl.uniformMatrix4fv(locations.uProj, false, projMatrix);
  gl.uniform3fv(locations.uLightPos, lightPos);
  gl.uniform3fv(locations.uKAmbient, kAmbient);
  gl.uniform3fv(locations.uKDiffuse, kDiffuse);
  gl.uniform3fv(locations.uKSpecular, kSpecular);
}

// ==============================
// Viewport renderers
// ==============================
function drawFlatViewport(locations) {
  gl.viewport(0, 0, 400, 400);
  gl.scissor(0, 0, 400, 400);

  gl.clearColor(0.86, 0.86, 0.96, 1.0);
  sceneHelper();

  modelMatrix = mat4.rotate(modelMatrix, degToRad(yawA), [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, degToRad(pitchA), [1, 0, 0]);
  modelMatrix = mat4.rotate(modelMatrix, 0.5, [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, 0.2, [1, 0, 0]);
  modelMatrix = mat4.rotate(modelMatrix, 0.1, [0, 0, 1]);

  modelMatrix = mat4.scale(modelMatrix, [1.1, 1.1, 1.1]);
  modelMatrix = mat4.translate(modelMatrix, [0, -0.1, 0]);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0, 0.5, 0]);
  modelMatrix = mat4.scale(modelMatrix, [0.5, 0.5, 0.5]);

  kDiffuse = [0.02, 0.37, 0.62];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0.0, -0.125, 0]);
  modelMatrix = mat4.scale(modelMatrix, [0.45, 0.76, 0.5]);

  kDiffuse = [0.7, 0.7, 0.5];
  bindSceneUniforms(locations);
  drawCube(locations);
  modelMatrix = popMatrix(modelStack);
}

function drawGouraudViewport(locations) {
  gl.viewport(400, 0, 400, 400);
  gl.scissor(400, 0, 400, 400);

  gl.clearColor(0.96, 0.86, 0.86, 1.0);
  sceneHelper();

  modelMatrix = mat4.rotate(modelMatrix, degToRad(yawB), [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, degToRad(pitchB), [1, 0, 0]);
  modelMatrix = mat4.rotate(modelMatrix, 0.05, [0, 1, 0]);

  modelMatrix = mat4.scale(modelMatrix, [0.95, 0.95, 0.95]);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0, -0.45, 0.1]);
  modelMatrix = mat4.scale(modelMatrix, [0.7, 0.7, 0.7]);

  kDiffuse = [0.75, 0.75, 0.75];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [-0.36, -0.05, 0.1]);
  modelMatrix = mat4.scale(modelMatrix, [0.4, 0.4, 0.4]);
  modelMatrix = mat4.rotate(modelMatrix, 0.5, [1, 0, 0]);
  modelMatrix = mat4.rotate(modelMatrix, -0.45, [0, 0, 1]);
  modelMatrix = mat4.rotate(modelMatrix, -0.5, [0, 1, 0]);

  kDiffuse = [0.02, 0.54, 0.02];
  bindSceneUniforms(locations);
  drawCube(locations);

  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [-0.18, 0.24, 0.25]);
  modelMatrix = mat4.scale(modelMatrix, [0.4, 0.4, 0.4]);

  kDiffuse = [0.74, 0.74, 0.74];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0.095, 0.41, 0.3]);
  modelMatrix = mat4.scale(modelMatrix, [0.25, 0.25, 0.25]);
  modelMatrix = mat4.rotate(modelMatrix, 0.5, [1, 0, 0]);
  modelMatrix = mat4.rotate(modelMatrix, 0.5, [0, 0, 1]);
  modelMatrix = mat4.rotate(modelMatrix, 0.2, [0, 1, 0]);

  kDiffuse = [0.01, 0.53, 0.01];
  bindSceneUniforms(locations);
  drawCube(locations);

  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [-0.02, 0.6, 0.4]);
  modelMatrix = mat4.scale(modelMatrix, [0.25, 0.25, 0.25]);

  kDiffuse = [0.74, 0.74, 0.74];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);
}

function drawPhongViewport(locations) {
  gl.viewport(800, 0, 400, 400);
  gl.scissor(800, 0, 400, 400);

  gl.clearColor(0.86, 0.96, 0.86, 1.0);
  sceneHelper();

  modelMatrix = mat4.rotate(modelMatrix, degToRad(yawC), [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, degToRad(pitchC), [1, 0, 0]);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0, -0.6, 0.1]);
  modelMatrix = mat4.scale(modelMatrix, [0.4, 0.4, 0.4]);

  kDiffuse = [0.01, 0.7, 0.15];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0.01, -0.38, 0.1]);
  modelMatrix = mat4.rotate(modelMatrix, Math.PI / 4, [1, 1, 1]);
  modelMatrix = mat4.rotate(modelMatrix, -0.6, [0, 0, 1]);
  modelMatrix = mat4.rotate(modelMatrix, 0.1, [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, -0.1, [1, 0, 0]);
  modelMatrix = mat4.scale(modelMatrix, [1.35, 0.03, 0.25]);

  kDiffuse = [0.94, 0.05, 0.08];
  bindSceneUniforms(locations);
  drawCube(locations);

  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [-0.35, -0.21, 0.4]);
  modelMatrix = mat4.scale(modelMatrix, [0.3, 0.3, 0.3]);

  kDiffuse = [0.27, 0.28, 0.54];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0.35, -0.21, -0.2]);
  modelMatrix = mat4.scale(modelMatrix, [0.3, 0.3, 0.3]);

  kDiffuse = [0.11, 0.33, 0.31];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [-0.35, -0.04, 0.4]);
  modelMatrix = mat4.rotate(modelMatrix, (3 * Math.PI) / 4, [1, 1, 1]);
  modelMatrix = mat4.rotate(modelMatrix, -1.4, [0, 0, 1]);
  modelMatrix = mat4.rotate(modelMatrix, 0.6, [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, 0.28, [1, 0, 0]);
  modelMatrix = mat4.scale(modelMatrix, [0.6, 0.03, 0.3]);

  kDiffuse = [0.71, 0.61, 0.02];
  bindSceneUniforms(locations);
  drawCube(locations);

  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0.35, -0.04, -0.2]);
  modelMatrix = mat4.rotate(modelMatrix, (3 * Math.PI) / 4, [1, 1, 1]);
  modelMatrix = mat4.rotate(modelMatrix, -1.45, [0, 0, 1]);
  modelMatrix = mat4.rotate(modelMatrix, 0.6, [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, 0.28, [1, 0, 0]);
  modelMatrix = mat4.scale(modelMatrix, [0.6, 0.03, 0.3]);

  kDiffuse = [0.19, 0.63, 0.01];
  bindSceneUniforms(locations);
  drawCube(locations);

  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [-0.35, 0.1, 0.4]);
  modelMatrix = mat4.scale(modelMatrix, [0.3, 0.3, 0.3]);

  kDiffuse = [0.7, 0.02, 0.7];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0.35, 0.1, -0.2]);
  modelMatrix = mat4.scale(modelMatrix, [0.3, 0.3, 0.3]);

  kDiffuse = [0.66, 0.48, 0.13];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0.01, 0.265, 0.1]);
  modelMatrix = mat4.rotate(modelMatrix, Math.PI / 4, [1, 1, 1]);
  modelMatrix = mat4.rotate(modelMatrix, -0.6, [0, 0, 1]);
  modelMatrix = mat4.rotate(modelMatrix, 0.12, [0, 1, 0]);
  modelMatrix = mat4.rotate(modelMatrix, -0.25, [1, 0, 0]);
  modelMatrix = mat4.scale(modelMatrix, [1.35, 0.03, 0.25]);

  kDiffuse = [0.94, 0.05, 0.08];
  bindSceneUniforms(locations);
  drawCube(locations);

  modelMatrix = popMatrix(modelStack);

  pushMatrix(modelStack, modelMatrix);
  modelMatrix = mat4.translate(modelMatrix, [0, 0.48, 0.1]);
  modelMatrix = mat4.scale(modelMatrix, [0.4, 0.4, 0.4]);

  kDiffuse = [0.55, 0.55, 0.68];
  bindSceneUniforms(locations);
  drawSphere(locations);
  modelMatrix = popMatrix(modelStack);
}

// ==============================
// Frame render dispatcher
// ==============================
function drawScene() {
  gl.enable(gl.SCISSOR_TEST);

  // Left viewport area
  gl.useProgram(programFlat);
  drawFlatViewport(locFlat);

  // Mid viewport area
  gl.useProgram(programGouraud);
  drawGouraudViewport(locGouraud);

  // Right viewport area
  gl.useProgram(programPhong);
  drawPhongViewport(locPhong);
}

// ==============================
// Input & UI
// ==============================
// Mouse events
function onMouseDown(event) {
  document.addEventListener("mousemove", onMouseMove, false);
  document.addEventListener("mouseup", onMouseUp, false);
  document.addEventListener("mouseout", onMouseOut, false);

  if (
    event.layerX <= canvas.width &&
    event.layerX >= 0 &&
    event.layerY <= canvas.height &&
    event.layerY >= 0
  ) {
    prevMouseX = event.clientX;
    prevMouseY = canvas.height - event.clientY;
    var yLim = prevMouseY <= 300 && prevMouseY >= -100;
    if (prevMouseX >= 50 && prevMouseX <= 450 && yLim) activeViewport = 1;
    else if (prevMouseX >= 450 && prevMouseX <= 850 && yLim) activeViewport = 2;
    else if (prevMouseX >= 850 && prevMouseX <= 1250 && yLim)
      activeViewport = 3;
  }
}

function onMouseMove(event) {
  var mouseX = event.clientX;
  var diffX1 = mouseX - prevMouseX;
  prevMouseX = mouseX;

  var mouseY = canvas.height - event.clientY;
  var diffY2 = mouseY - prevMouseY;
  prevMouseY = mouseY;

  var yLim = mouseY <= 300 && mouseY >= -100;
  if (mouseX >= 50 && mouseX <= 450 && yLim && activeViewport == 1) {
    yawA = yawA + diffX1 / 5;
    pitchA = pitchA - diffY2 / 5;
  } else if (mouseX >= 450 && mouseX <= 850 && yLim && activeViewport == 2) {
    yawB = yawB + diffX1 / 5;
    pitchB = pitchB - diffY2 / 5;
  } else if (mouseX >= 850 && mouseX <= 1250 && yLim && activeViewport == 3) {
    yawC = yawC + diffX1 / 5;
    pitchC = pitchC - diffY2 / 5;
  }
  drawScene();
}

function onMouseUp(event) {
  document.removeEventListener("mousemove", onMouseMove, false);
  document.removeEventListener("mouseup", onMouseUp, false);
  document.removeEventListener("mouseout", onMouseOut, false);
}

function onMouseOut(event) {
  document.removeEventListener("mousemove", onMouseMove, false);
  document.removeEventListener("mouseup", onMouseUp, false);
  document.removeEventListener("mouseout", onMouseOut, false);
}

function setupSlider(sliderId, onUpdate) {
  const slider = document.getElementById(sliderId);
  if (!slider) {
    console.error(`Slider with id ${sliderId} not found.`);
    return;
  }

  onUpdate(parseFloat(slider.value));
  slider.addEventListener("input", (event) => {
    onUpdate(parseFloat(event.target.value));
    drawScene();
  });
}

function webGLStart() {
  canvas = document.getElementById("assn2");
  document.addEventListener("mousedown", onMouseDown, false);

  setupSlider("light-slider", (value) => {
    lightPos = [value, 3.0, 4.0];
  });

  setupSlider("camera-slider", (value) => {
    eyePos = [0.0, 0.0, value];
  });
  initGL(canvas);
  initSphereBuffer();
  initCubeBuffer();

  programFlat = initShaders(flatVertexShaderCode, flatFragShaderCode);
  programGouraud = initShaders(perVertVertexShaderCode, perVertFragShaderCode);
  programPhong = initShaders(perFragVertexShaderCode, perFragFragShaderCode);

  locFlat = getLocations(programFlat);
  locGouraud = getLocations(programGouraud);
  locPhong = getLocations(programPhong);

  drawScene();
}
