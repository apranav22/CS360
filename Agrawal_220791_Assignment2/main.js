////////////////////////////////////////////////////////////////////////
//  A simple WebGL program to draw a 3D cube wirh basic interaction.
//
// TODO: set up three viewports
var gl;
var canvas;

var buf;
var indexBuf;
var cubeNormalBuf;
var spBuf;
var spIndexBuf;
var spNormalBuf;

var spVerts = [];
var spIndicies = [];
var spNormals = [];

var aPositionLocation; // global variables are a problem
var aNormalLocation;
var uColorLocation;

var uPMatrixLocation;
var uMMatrixLocation;
var uVMatrixLocation;
var uNMatrixLocation;

var lightPosition = [5.0, 5.0, 5.0, 1]; // worldspace
var lightColor = [1.0, 1.0, 1.0];

var vMatrix = mat4.create(); // view matrix
var mMatrix = mat4.create();
var pMatrix = mat4.create(); //projection matrix
var nMatrix = mat3.create(); // normal matrix

var eyePos = [0.0, 0.0, 2.0]; // is this for zoom?
var COI = [0.0, 0.0, 0.0];
var viewUp = [0.0, 1.0, 0.0];

var degree1 = 0.0;
var degree0 = 0.0;

var degree0_0 = 0.0;
var degree0_1 = 0.0;

var degree1_0 = 0.0;
var degree1_1 = 0.0;

var degree2_0 = 0.0;
var degree2_1 = 0.0;

var prevMouseX = 0.0;
var prevMouseY = 0.0;

var matrixStack = [];

function pushMatrix(stack, m) {
  //necessary because javascript only does shallow push
  var copy = mat4.create(m);
  stack.push(copy);
}

function popMatrix(stack) {
  if (stack.length > 0) return stack.pop();
  else console.log("stack has no matrix to pop!");
}

function initSphere(nslices, nstacks, radius) {
  var theta1, theta2;

  for (i = 0; i < nslices; i++) {
    spVerts.push(0);
    spVerts.push(-radius);
    spVerts.push(0);

    spNormals.push(0);
    spNormals.push(-1.0);
    spNormals.push(0);
  }

  for (j = 1; j < nstacks - 1; j++) {
    theta1 = (j * 2 * Math.PI) / nslices - Math.PI / 2;
    for (i = 0; i < nslices; i++) {
      theta2 = (i * 2 * Math.PI) / nslices;
      spVerts.push(radius * Math.cos(theta1) * Math.cos(theta2));
      spVerts.push(radius * Math.sin(theta1));
      spVerts.push(radius * Math.cos(theta1) * Math.sin(theta2));

      spNormals.push(Math.cos(theta1) * Math.cos(theta2));
      spNormals.push(Math.sin(theta1));
      spNormals.push(Math.cos(theta1) * Math.sin(theta2));
    }
  }

  for (i = 0; i < nslices; i++) {
    spVerts.push(0);
    spVerts.push(radius);
    spVerts.push(0);

    spNormals.push(0);
    spNormals.push(1.0);
    spNormals.push(0);
  }

  // setup the connectivity and indices
  for (j = 0; j < nstacks - 1; j++)
    for (i = 0; i <= nslices; i++) {
      var mi = i % nslices;
      var mi2 = (i + 1) % nslices;
      var idx = (j + 1) * nslices + mi;
      var idx2 = j * nslices + mi;
      var idx3 = j * nslices + mi2;
      var idx4 = (j + 1) * nslices + mi;
      var idx5 = j * nslices + mi2;
      var idx6 = (j + 1) * nslices + mi2;

      spIndicies.push(idx);
      spIndicies.push(idx2);
      spIndicies.push(idx3);
      spIndicies.push(idx4);
      spIndicies.push(idx5);
      spIndicies.push(idx6);
    }
}

function initSphereBuffer() {
  var nslices = 30; // use even number
  var nstacks = nslices / 2 + 1;
  var radius = 1.0;
  initSphere(nslices, nstacks, radius);

  spBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spVerts), gl.STATIC_DRAW);
  spBuf.itemSize = 3;
  spBuf.numItems = nslices * nstacks;

  spNormalBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spNormals), gl.STATIC_DRAW);
  spNormalBuf.itemSize = 3;
  spNormalBuf.numItems = nslices * nstacks;

  spIndexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint32Array(spIndicies),
    gl.STATIC_DRAW
  );
  spIndexBuf.itemsize = 1;
  spIndexBuf.numItems = (nstacks - 1) * 6 * (nslices + 1);
}

function getLocations(program) {
  return {
    aPositionLocation: gl.getAttribLocation(program, "aPosition"),
    aNormalLocation: gl.getAttribLocation(program, "aNormal"),
    uColorLocation: gl.getUniformLocation(program, "objColor"),
    uMMatrixLocation: gl.getUniformLocation(program, "uMMatrix"),
    uVMatrixLocation: gl.getUniformLocation(program, "uVMatrix"),
    uPMatrixLocation: gl.getUniformLocation(program, "uPMatrix"),
    uNMatrixLocation: gl.getUniformLocation(program, "uNMatrix"),
    uLightPositionLocation: gl.getUniformLocation(program, "uLightPosition"),
    uLightColorLocation: gl.getUniformLocation(program, "uLightColor")
  };
}

function drawSphere(color, locations) {
  gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
  gl.vertexAttribPointer(
    locations.aPositionLocation,
    spBuf.itemSize,
    gl.FLOAT,
    false,
    0,
    0
  );
  
  // draw elementary arrays - triangle indices
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);
  // 2. Set up the NORMAL data 
  gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf); // Bind normal buffer
  gl.vertexAttribPointer(
    locations.aNormalLocation,
    spNormalBuf.itemSize, // Should be 3 (for x, y, z)
    gl.FLOAT,
    false,
    0,
    0
  );

  gl.uniform4fv(locations.uColorLocation, color);
  gl.uniformMatrix4fv(locations.uMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(locations.uVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(locations.uPMatrixLocation, false, pMatrix);
  gl.uniformMatrix3fv(locations.uNMatrixLocation, false, nMatrix);
  gl.uniform4fv(locations.uLightPositionLocation, lightPosition);
  gl.uniform3fv(locations.uLightColorLocation, lightColor);

  gl.drawElements(gl.TRIANGLES, spIndexBuf.numItems, gl.UNSIGNED_INT, 0);

}

// Cube generation function with normals
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
  buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  buf.itemSize = 3;
  buf.numItems = vertices.length / 3;

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
  cubeNormalBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  cubeNormalBuf.itemSize = 3;
  cubeNormalBuf.numItems = normals.length / 3;


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
  indexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );
  indexBuf.itemSize = 1;
  indexBuf.numItems = indices.length;
}

function drawCube(color, locations) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.vertexAttribPointer(
    locations.aPositionLocation,
    buf.itemSize,
    gl.FLOAT,
    false,
    0,
    0
  );

  // draw elementary arrays - triangle indices
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);

  // 2. Set up the NORMAL data (THIS IS THE NEW PART)
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf); // Bind normal buffer
  gl.vertexAttribPointer(
    locations.aNormalLocation,
    cubeNormalBuf.itemSize, // Should be 3 (for x, y, z)
    gl.FLOAT,
    false,
    0,
    0
  );
  
  gl.uniform4fv(locations.uColorLocation, color);
  gl.uniformMatrix4fv(locations.uMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(locations.uVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(locations.uPMatrixLocation, false, pMatrix);

  gl.uniformMatrix3fv(locations.uNMatrixLocation, false, nMatrix);
  gl.uniform4fv(locations.uLightPositionLocation, lightPosition);
  gl.uniform3fv(locations.uLightColorLocation, lightColor);

  gl.drawElements(gl.TRIANGLES, indexBuf.numItems, gl.UNSIGNED_SHORT, 0);

}

// Vertex shader code
const vertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uMMatrix;
uniform mat4 uPMatrix;
uniform mat4 uVMatrix;

out vec3 vNormal;

void main() {
  mat4 projectionModelView;
	projectionModelView=uPMatrix*uVMatrix*uMMatrix;
  gl_Position = projectionModelView*vec4(aPosition,1.0);
  gl_PointSize=5.0;
  vNormal=aNormal;
}`;

// Fragment shader code
const fragShaderCode = `#version 300 es
precision mediump float;
out vec4 fragColor;
uniform vec4 objColor;

void main() {
  fragColor = objColor;
}`;

const flatVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;
uniform mat3 uNMatrix;

// Uniforms for lighting (moved from fragment shader)
uniform vec4 objColor;
uniform vec4 uLightPosition;
uniform vec3 uLightColor;

// Use 'flat' to prevent interpolation of the final color
out vec4 vFinalColor;

void main() {
  // Transform position and normal to view space
  mat4 modelViewMatrix = uVMatrix * uMMatrix;
  vec3 vPositionView = (modelViewMatrix * vec4(aPosition, 1.0)).xyz;
  vec3 vNormalView = normalize(uNMatrix * aNormal);

  // --- Perform Lighting Calculation Here ---
  vec3 lightPosView = (uVMatrix * uLightPosition).xyz;
  vec3 lightDir = normalize(lightPosView - vPositionView);
  float intensity = max(dot(vNormalView, lightDir), 0.0);
  
  // Calculate final color and pass it to the fragment shader
  vFinalColor = objColor * vec4(uLightColor * intensity, 1.0);

  // Standard position calculation
  gl_Position = uPMatrix * vec4(vPositionView, 1.0);
}`;

const flatFragShaderCode = `#version 300 es
precision mediump float;

// Receive the non-interpolated color from the vertex shader
flat in vec4 vFinalColor;

out vec4 fragColor;

void main() {
  // Simply assign the flat color to the output
  fragColor = vFinalColor;
}`;

const perVertVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;
uniform mat3 uNMatrix;

// Uniforms for lighting (moved from fragment shader)
uniform vec4 objColor;
uniform vec4 uLightPosition;
uniform vec3 uLightColor;

// Use 'flat' to prevent interpolation of the final color
flat out vec4 vFinalColor;

void main() {
  // Transform position and normal to view space
  mat4 modelViewMatrix = uVMatrix * uMMatrix;
  vec3 vPositionView = (modelViewMatrix * vec4(aPosition, 1.0)).xyz;
  vec3 vNormalView = normalize(uNMatrix * aNormal);

  // --- Perform Lighting Calculation Here ---
  vec3 lightPosView = (uVMatrix * uLightPosition).xyz;
  vec3 lightDir = normalize(lightPosView - vPositionView);
  float intensity = max(dot(vNormalView, lightDir), 0.0);
  
  // Calculate final color and pass it to the fragment shader
  vFinalColor = objColor * vec4(uLightColor * intensity, 1.0);

  // Standard position calculation
  gl_Position = uPMatrix * vec4(vPositionView, 1.0);
}`;

const perVertFragShaderCode = `#version 300 es
precision mediump float;

// Receive the non-interpolated color from the vertex shader
flat in vec4 vFinalColor;

out vec4 fragColor;

void main() {
  // Simply assign the flat color to the output
  fragColor = vFinalColor;
}`;

const perFragVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;
uniform mat3 uNMatrix;

// Uniforms for lighting (moved from fragment shader)
uniform vec4 objColor;
uniform vec4 uLightPosition;
uniform vec3 uLightColor;

// Use 'flat' to prevent interpolation of the final color
flat out vec4 vFinalColor;

void main() {
  // Transform position and normal to view space
  mat4 modelViewMatrix = uVMatrix * uMMatrix;
  vec3 vPositionView = (modelViewMatrix * vec4(aPosition, 1.0)).xyz;
  vec3 vNormalView = normalize(uNMatrix * aNormal);

  // --- Perform Lighting Calculation Here ---
  vec3 lightPosView = (uVMatrix * uLightPosition).xyz;
  vec3 lightDir = normalize(lightPosView - vPositionView);
  float intensity = max(dot(vNormalView, lightDir), 0.0);
  
  // Calculate final color and pass it to the fragment shader
  vFinalColor = objColor * vec4(uLightColor * intensity, 1.0);

  // Standard position calculation
  gl_Position = uPMatrix * vec4(vPositionView, 1.0);
}`;

const perFragFragShaderCode = `#version 300 es
precision mediump float;

// Receive the non-interpolated color from the vertex shader
flat in vec4 vFinalColor;

out vec4 fragColor;

void main() {
  // Simply assign the flat color to the output
  fragColor = vFinalColor;
}`;

function vertexShaderSetup(vertexShaderCode) {
  shader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(shader, vertexShaderCode);
  gl.compileShader(shader);
  // Error check whether the shader is compiled correctly
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
  // Error check whether the shader is compiled correctly
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function initShaders(vertexShaderCode, fragShaderCode) {
  shaderProgram = gl.createProgram();

  var vertexShader = vertexShaderSetup(vertexShaderCode);
  var fragmentShader = fragmentShaderSetup(fragShaderCode);

  // attach the shaders
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  //link the shader program
  gl.linkProgram(shaderProgram);

  // check for compilation and linking status
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vertexShader));
    console.log(gl.getShaderInfoLog(fragmentShader));
  }
  return shaderProgram;
}

function initGL(canvas) {
  try {
    gl = canvas.getContext("webgl2"); // the graphics webgl2 context
    gl.enable(gl.SCISSOR_TEST);
    gl.enable(gl.DEPTH_TEST);
  } catch (e) {}
  if (!gl) {
    alert("WebGL initialization failed");
  }
}

function createViewport(x, y, width, height) {
  gl.viewport(x, y, width, height);
  gl.scissor(x, y, width, height);
  gl.clearColor(0.9, 0.9, 0.95, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function mat3FromMat4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];

  out[3] = a[4];
  out[4] = a[5];
  out[5] = a[6];

  out[6] = a[8];
  out[7] = a[9];
  out[8] = a[10];

  return out;
}
//////////////////////////////////////////////////////////////////////
// Main drawing routine


function drawSceneFlat() {
  
  // create the first viewport
  createViewport(0, 0, canvas.width / 3, canvas.height);
  // get uniforms and attrs. 
  // aPositionLocation = gl.getAttribLocation(flatShaderProgram, "aPosition");
  // aNormalLocation = gl.getAttribLocation(flatShaderProgram, "aNormal");

  // uMMatrixLocation = gl.getUniformLocation(flatShaderProgram, "uMMatrix");
  // uVMatrixLocation = gl.getUniformLocation(flatShaderProgram, "uVMatrix");
  // uPMatrixLocation = gl.getUniformLocation(flatShaderProgram, "uPMatrix");
  // uNMatrixLocation = gl.getUniformLocation(flatShaderProgram, "uNMatrix");
  
  // uColorLocation = gl.getUniformLocation(flatShaderProgram, "objColor");

  // uLightPositionLocation = gl.getUniformLocation(flatShaderProgram, "uLightPosition");
  // uLightColorLocation = gl.getUniformLocation(flatShaderProgram, "uLightColor");

  //enable the attribute arrays
  gl.enableVertexAttribArray(flatLocations.aPositionLocation);
  gl.enableVertexAttribArray(flatLocations.aNormalLocation);

  gl.useProgram(flatShaderProgram);

  mat4.identity(vMatrix);
  vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

  //set up perspective projection matrix
  mat4.identity(pMatrix);
  mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);
  
  //set up the model matrix
  mat4.identity(mMatrix);
  // transformations applied here on model matrix 
  mMatrix = mat4.rotate(mMatrix, degToRad(degree0_0), [0, 1, 0]);
  mMatrix = mat4.rotate(mMatrix, degToRad(degree0_1), [1, 0, 0]);
  
  // set up the normal matrix
  mat3.identity(nMatrix);

  var modelViewMatrix = mat4.create();
  mat4.multiply(modelViewMatrix, vMatrix, mMatrix);
  mat4.inverse(modelViewMatrix, modelViewMatrix);
  mat4.transpose(modelViewMatrix, modelViewMatrix);
  mat3FromMat4(nMatrix, modelViewMatrix);
  

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.scale(mMatrix, [1, 1.6, 1]);
  mMatrix = mat4.translate(mMatrix, [0, 0, 0]);
  // Now draw the cube
  var color = [1, 0, 0, 1]; // specify color for the cube
  drawCube(color, flatLocations);
  mMatrix = popMatrix(matrixStack);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0, 1.25, 0]);
  mMatrix = mat4.scale(mMatrix, [0.5, 0.5, 0.5]);
  
  color = [0, 0, 1, 1]; // specify color for the sphere
  drawSphere(color, flatLocations);
  mMatrix = popMatrix(matrixStack);
}

function drawScenePerVert() {
  // create the second viewport
  createViewport(canvas.width / 3, 0, canvas.width / 3, canvas.height);
  // get uniforms and attrs. 
  aPositionLocation = gl.getAttribLocation(perVertShaderProgram, "aPosition");
  aNormalLocation = gl.getAttribLocation(perVertShaderProgram, "aNormal");
  uMMatrixLocation = gl.getUniformLocation(perVertShaderProgram, "uMMatrix");
  uVMatrixLocation = gl.getUniformLocation(perVertShaderProgram, "uVMatrix");
  uPMatrixLocation = gl.getUniformLocation(perVertShaderProgram, "uPMatrix");
  uColorLocation = gl.getUniformLocation(perVertShaderProgram, "objColor");

  //enable the attribute arrays
  gl.enableVertexAttribArray(aPositionLocation);
  gl.enableVertexAttribArray(aNormalLocation);

  gl.useProgram(perVertShaderProgram);
  mat4.identity(vMatrix);
  vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

  //set up perspective projection matrix
  mat4.identity(pMatrix);
  mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);
  
  //set up the model matrix
  mat4.identity(mMatrix);
  // transformations applied here on model matrix 
  mMatrix = mat4.rotate(mMatrix, degToRad(degree1_0), [0, 1, 0]);
  mMatrix = mat4.rotate(mMatrix, degToRad(degree1_1), [1, 0, 0]);

  // Now draw the cube
  var color = [0.5, 0, 0, 1]; // specify color for the cube
  drawCube(color, perVertLocations);
}

function drawScenePerFrag() {
  // create the third viewport
  createViewport((2 * canvas.width) / 3, 0, canvas.width / 3, canvas.height);
  // get uniforms and attrs. 
  aPositionLocation = gl.getAttribLocation(perFragShaderProgram, "aPosition");
  aNormalLocation = gl.getAttribLocation(perFragShaderProgram, "aNormal");
  uMMatrixLocation = gl.getUniformLocation(perFragShaderProgram, "uMMatrix");
  uVMatrixLocation = gl.getUniformLocation(perFragShaderProgram, "uVMatrix");
  uPMatrixLocation = gl.getUniformLocation(perFragShaderProgram, "uPMatrix");
  uColorLocation = gl.getUniformLocation(perFragShaderProgram, "objColor");

  //enable the attribute arrays
  gl.enableVertexAttribArray(aPositionLocation);
  gl.enableVertexAttribArray(aNormalLocation);  

  // set up the view matrix, multiply into the modelview matrix
  gl.useProgram(shaderProgram);
  mat4.identity(vMatrix);
  vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

  //set up perspective projection matrix
  mat4.identity(pMatrix);
  mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);

  //set up the model matrix
  mat4.identity(mMatrix);

  // transformations applied here on model matrix
  mMatrix = mat4.rotate(mMatrix, degToRad(degree2_0), [0, 1, 0]);
  mMatrix = mat4.rotate(mMatrix, degToRad(degree2_1), [1, 0, 0]);

  // Now draw the cube
  var color = [0.5, 0, 0, 1]; // specify color for the cube
  drawCube(color, perFragLocations);
}

function render() {
  drawSceneFlat();
  drawScenePerVert();
  drawScenePerFrag();
}

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
  }
}

function onMouseMove(event) {
  // make mouse interaction only within canvas
  var mouseX = event.clientX;
  var diffX1 = mouseX - prevMouseX;
  prevMouseX = mouseX;

  if (
    event.layerX <= canvas.width / 3 &&
    event.layerX >= 0 &&
    event.layerY <= canvas.height &&
    event.layerY >= 0
  ) {
    
    degree0_0 = degree0_0 + diffX1 / 5;

    var mouseY = canvas.height - event.clientY;
    var diffY2 = mouseY - prevMouseY;
    prevMouseY = mouseY;

    degree0_1 = degree0_1 - diffY2 / 5;

    render();
  }
  else if (
    event.layerX <= (2 * canvas.width) / 3 &&
    event.layerX >= canvas.width / 3 &&
    event.layerY <= canvas.height &&
    event.layerY >= 0
  ) {
    
    degree1_0 = degree1_0 + diffX1 / 5;
    
    var mouseY = canvas.height - event.clientY;
    var diffY2 = mouseY - prevMouseY;
    prevMouseY = mouseY;
    degree1_1 = degree1_1 - diffY2 / 5;

    render();
  }

  else if (
    event.layerX <= canvas.width &&
    event.layerX >= (2 * canvas.width) / 3 &&
    event.layerY <= canvas.height &&
    event.layerY >= 0
  ) {
    
    degree2_0 = degree2_0 + diffX1 / 5;
    
    var mouseY = canvas.height - event.clientY;
    var diffY2 = mouseY - prevMouseY;
    prevMouseY = mouseY;
    degree2_1 = degree2_1 - diffY2 / 5;

    render();
  }

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

function SliderZoom() {
  var slider = document.getElementById("slider2");
  eyePos[2] = slider.value;
  render();
}

function SliderLight() {
  var slider = document.getElementById("slider1");
  var temp = degToRad(slider.value); // rotate the light around the z-axis
  lightPosition[0] = Math.cos(temp) * 5.0;
  lightPosition[1] = Math.sin(temp) * 5.0;  // check if this works
  render();
}

// This is the entry point from the html
function webGLStart() {
  canvas = document.getElementById("simple3DCubeRender");
  document.addEventListener("mousedown", onMouseDown, false);

  var slider1 = document.getElementById("slider1");
  slider1.addEventListener("input", SliderLight, false);

  slider2 = document.getElementById("slider2");
  slider2.addEventListener("input", SliderZoom, false); // TODO: fix the implementation of this shitty slider function
  initGL(canvas);

  // Initialize all shader programs first
  flatShaderProgram = initShaders(flatVertexShaderCode, flatFragShaderCode);
  perVertShaderProgram = initShaders(perVertVertexShaderCode, perVertFragShaderCode);
  perFragShaderProgram = initShaders(perFragVertexShaderCode, perFragFragShaderCode);

  //set locations
  flatLocations = getLocations(flatShaderProgram);
  perVertLocations = getLocations(perVertShaderProgram);
  perFragLocations = getLocations(perFragShaderProgram);

  // Initialize buffers once
  initCubeBuffer();
  initSphereBuffer();

  // Perform the initial draw
  render();
}
