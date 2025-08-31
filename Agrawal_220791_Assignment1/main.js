////////////////////////////////////////////////////////////////////////
// A simple WebGL program to draw simple 2D shapes with animation.
//

// TODO: IMPLEMENT SQUARES = TWO TRIANGLES
// todo: decorators for 

var gl;
var color;
var animation;
var degree0 = 0;
var degree1 = 0;
var matrixStack = [];

let translationX = 0.0;
let tx = 0.0;
const translationSpeed = 0.003;
const translationRange = 0.7;
let translationDir = 1; // +1 moving to +range, -1 moving back to -range
let tDir = 1;
const tRange = 0.8;

// mMatrix is called the model matrix, transforms objects
// from local object space to world space.
var mMatrix = mat4.create();
var uMMatrixLocation;
var aPositionLocation;
var uColorLoc;

// Render mode control: 'triangles' | 'lines' | 'points'
var renderMode = 'triangles';
function setRenderMode(mode) {
  if (mode === 'points' || mode === 'lines' || mode === 'triangles') {
    renderMode = mode;
  }
}

var circleBuf;
var circleIndexBuf;
var sqVertexPositionBuffer;
var sqVertexIndexBuffer;

const vertexShaderCode = `#version 300 es
in vec2 aPosition;
uniform mat4 uMMatrix;

void main() {
  gl_Position = uMMatrix*vec4(aPosition,0.0,1.0);
  gl_PointSize = 3.0;
}`;

const fragShaderCode = `#version 300 es
precision mediump float;
out vec4 fragColor;

uniform vec4 color;

void main() {
  fragColor = color;
}`;

function pushMatrix(stack, m) {
  //necessary because javascript only does shallow push
  var copy = mat4.create(m);
  stack.push(copy);
}

function popMatrix(stack) {
  if (stack.length > 0) return stack.pop();
  else console.log("stack has no matrix to pop!");
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

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

function initShaders() {
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

  //finally use the program.
  gl.useProgram(shaderProgram);

  return shaderProgram;
}

function initGL(canvas) {
  try {
    // Request a depth buffer so z-values can occlude properly
    gl = canvas.getContext("webgl2", { depth: true, antialias: true }); // the graphics webgl2 context
    gl.viewportWidth = canvas.width; // the width of the canvas
    gl.viewportHeight = canvas.height; // the height
  } catch (e) {}
  if (!gl) {
    alert("WebGL initialization failed");
  }

  // Enable depth testing so smaller NDC z (closer to -1) appear in front
  if (gl) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
  }
}

function initSquareBuffer() {
  // buffer for point locations
  const sqVertices = new Float32Array([
    0.5, 0.5, 
    -0.5, 0.5, 
    -0.5, -0.5, 
    0.5, -0.5,
  ]);
  sqVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sqVertexPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, sqVertices, gl.STATIC_DRAW);
  sqVertexPositionBuffer.itemSize = 2;
  sqVertexPositionBuffer.numItems = 4;

  // buffer for point indices
  const sqIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  sqVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sqVertexIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sqIndices, gl.STATIC_DRAW);
  sqVertexIndexBuffer.itemsize = 1;
  sqVertexIndexBuffer.numItems = 6;
}

function drawSquare(color, mMatrix) {
  gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);

  // buffer for point locations
  gl.bindBuffer(gl.ARRAY_BUFFER, sqVertexPositionBuffer);
  gl.vertexAttribPointer(
    aPositionLocation,
    sqVertexPositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0
  );

  gl.uniform4fv(uColorLoc, color);

  // draw based on current render mode
  if (renderMode === 'triangles') {
    // buffer for point indices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sqVertexIndexBuffer);
    gl.drawElements(gl.TRIANGLES, sqVertexIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
  } else if (renderMode === 'lines') {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.drawArrays(gl.LINE_LOOP, 0, sqVertexPositionBuffer.numItems);
  } else {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.drawArrays(gl.POINTS, 0, sqVertexPositionBuffer.numItems);
  }
}

function initTriangleBuffer() {
  // buffer for point locations
  const triangleVertices = new Float32Array([
    0.0, 0.5, 
    -0.5, -0.5, 
    0.5, -0.5
  ]);
  triangleBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
  triangleBuf.itemSize = 2;
  triangleBuf.numItems = 3;

  // buffer for point indices
  const triangleIndices = new Uint16Array([0, 1, 2]);
  triangleIndexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleIndexBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangleIndices, gl.STATIC_DRAW);
  triangleIndexBuf.itemsize = 1;
  triangleIndexBuf.numItems = 3;
}

function drawTriangle(color, mMatrix) {
  gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);

  // buffer for point locations
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuf);
  gl.vertexAttribPointer(
    aPositionLocation,
    triangleBuf.itemSize,
    gl.FLOAT,
    false,
    0,
    0
  );

  gl.uniform4fv(uColorLoc, color);

  // draw based on current render mode
  if (renderMode === 'triangles') {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleIndexBuf);
    gl.drawElements(gl.TRIANGLES, triangleIndexBuf.numItems, gl.UNSIGNED_SHORT, 0);
  } else if (renderMode === 'lines') {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.drawArrays(gl.LINE_LOOP, 0, triangleBuf.numItems);
  } else {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.drawArrays(gl.POINTS, 0, triangleBuf.numItems);
  }
}

function initCircleBuffer() {
  // create a unit circle centered at origin with radius 0.5
  const segments = 60;
  const radius = 0.5;

  // vertices: first is center, followed by ring vertices
  const verts = new Float32Array((segments + 1) * 2);
  let idx = 0;
  // center
  verts[idx++] = 0.0; // x
  verts[idx++] = 0.0; // y
  // ring
  for (let i = 0; i < segments; i++) {
    const a = (i * 2.0 * Math.PI) / segments;
    verts[idx++] = radius * Math.cos(a);
    verts[idx++] = radius * Math.sin(a);
  }

  circleBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, circleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  circleBuf.itemSize = 2;
  circleBuf.numItems = segments + 1; // center + ring

  // indices for triangle fan: (0, i, i+1)
  const indices = new Uint16Array(segments * 3);
  let ii = 0;
  for (let i = 1; i <= segments; i++) {
    const next = i < segments ? i + 1 : 1; // wrap to first ring vertex
    indices[ii++] = 0; // center
    indices[ii++] = i;
    indices[ii++] = next;
  }

  circleIndexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, circleIndexBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  circleIndexBuf.itemsize = 1;
  circleIndexBuf.numItems = indices.length;
}

function drawCircle(color, mMatrix) {
  gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);

  // point locations
  gl.bindBuffer(gl.ARRAY_BUFFER, circleBuf);
  gl.vertexAttribPointer(
    aPositionLocation,
    circleBuf.itemSize,
    gl.FLOAT,
    false,
    0,
    0
  );

  gl.uniform4fv(uColorLoc, color);

  if (renderMode === 'triangles') {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, circleIndexBuf);
    gl.drawElements(gl.TRIANGLES, circleIndexBuf.numItems, gl.UNSIGNED_SHORT, 0);
  } else if (renderMode === 'lines') {
    // skip the center vertex (start at vertex 1), draw perimeter loop only
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.drawArrays(gl.LINE_LOOP, 1, circleBuf.numItems - 1);
  } else {
    // points: show ring points (omit center for consistency with lines)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.drawArrays(gl.POINTS, 0, circleBuf.numItems - 1);
  }
}

////////////////////////////////////////////////////////////////////////
function drawScene() {
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

  // stop the current loop of animation
  if (animation) {
    window.cancelAnimationFrame(animation);
  }

  var animate = function () {
  // Flush canvas to white each frame
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);

    // draw a black background square for the sky (behind everything)
    DrawSky();

    degree0 += 0.3;
    degree1 -= 0.3;

    // DrawMountain();
    DrawMoon();
    DrawClouds();

    DrawStar(0.32, 0.72, 0.05);
    DrawStar(0.5, 0.92, 0.03);
    DrawStar(-0.3, 0.8, 0.03);
    DrawStar(-0.1, 0.65, 0.04);
    DrawStar(-0.15, 0.55, 0.02);

    DrawGrass();
    DrawRiver();

    drawMountain(-0.6, 0.09, 1.2, 0.3, -0.555, 0.095);
    drawMountain(-0.076, 0.09, 1.8, 0.41, -0.014, 0.096);
    drawMountain(0.7, 0.12, 1.0, 0.22, -0.545, -0.005, true);

    drawTrees(true, 0.35, 0, 0.85, 0.85)
    drawTrees();
    drawTrees(true, -0.2, 0, 0.8, 0.8)

    // Boat motion: linear back-and-forth (triangle wave) between -range and +range
    translationX += translationDir * translationSpeed;
    if (translationX >= translationRange) {
      translationX = translationRange;
      translationDir = -1;
    } else if (translationX <= -translationRange) {
      translationX = -translationRange;
      translationDir = 1;
    }
    drawBoat(translationX);
    tx += tDir * translationSpeed;
    if (tx >= tRange) {
      tx = tRange;
      tDir = -1;
    } else if (tx <= -tRange) {
      tx = -tRange;
      tDir = 1;
    }
    drawBoat(tx, 0, 0.46, 0.8, [0.6, 0.0, 0.6, 0.9]); // purple

    // applying rotatory motion to the blades of the windmill

    drawFan(degree1);
    drawFan(degree1, 0.6, -0.2, 0.02, 1.0);

    // draw the bushes
    drawBush();
    drawBush(true, 0.8, 0, 1.02);
    drawBush(true, 1.48, -0.13, 1.6);
    drawBush(true, 2.15, 0.25, 1.3);

    drawHouse();
    drawCar();

    animation = window.requestAnimationFrame(animate);
  };

  animate();
}

// This is the entry point from the html
function webGLStart() {
  var canvas = document.getElementById("exampleAnimation2D");
  initGL(canvas);
  shaderProgram = initShaders();

  //get locations of attributes declared in the vertex shader
  aPositionLocation = gl.getAttribLocation(shaderProgram, "aPosition");

  uMMatrixLocation = gl.getUniformLocation(shaderProgram, "uMMatrix");

  //enable the attribute arrays
  gl.enableVertexAttribArray(aPositionLocation);

  uColorLoc = gl.getUniformLocation(shaderProgram, "color");

  initSquareBuffer();
  initTriangleBuffer();
  initCircleBuffer();
  // initFanBladesBuffer();
  drawScene();
}
//////////

function DrawSky() {
  // Full-canvas black square rendered far back so all other objects appear in front
  color = [0.0, 0.0, 0.0, 1.0];
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.0, 0.0, 0.99]);
  mMatrix = mat4.scale(mMatrix, [2.0, 2.0, 1.0]);
  drawSquare(color, mMatrix);
  mMatrix = popMatrix(matrixStack);
}

function DrawMoon() { // done
  color = [1.0, 1.0, 1.0, 1.0]; // white
  var numRays = 7;
  var rayLength = 0.22;
  var rayWidth = 0.03;
  var radius = 0.5;

  pushMatrix(matrixStack, mMatrix);

  mMatrix = mat4.translate(mMatrix, [-0.7, 0.8, 0.97]);
  // rotate about the moon's own pivot (center)
  mMatrix = mat4.rotate(mMatrix, degToRad(degree0), [0.0, 0.0, 1.0]);
  mMatrix = mat4.scale(mMatrix, [0.25, 0.25, 1]);

  drawCircle(color, mMatrix);
  // add rays around the moon
  for (let i = 0; i < numRays; i++) {
    pushMatrix(matrixStack, mMatrix);
    var angle = (i * 2.0 * Math.PI) / numRays; // radians
    mMatrix = mat4.rotate(mMatrix, angle, [0.0, 0.0, 1.0]);
    mMatrix = mat4.translate(mMatrix, [0.0, radius + rayLength / 2.0, 0.0]);
    mMatrix = mat4.scale(mMatrix, [rayWidth, rayLength, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
  }
  mMatrix = popMatrix(matrixStack);
}

function DrawClouds () {
  color = [0.8, 0.8, 0.8, 1.0]; // gray
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [-0.9, 0.48, 0.97]);
  mMatrix = mat4.scale(mMatrix, [0.5, 0.25, 1]);
  drawCircle(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  color = [0.95, 0.95, 0.95, 1.0]; // gray
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [-0.6, 0.43, -0.9]);
  mMatrix = mat4.scale(mMatrix, [0.35, 0.175, 1]);
  drawCircle(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  color = [0.85, 0.85, 0.85, 1.0]; // gray
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [-0.4, 0.43, -0.9]);
  mMatrix = mat4.scale(mMatrix, [0.3, 0.15, 1]);
  drawCircle(color, mMatrix);
  mMatrix = popMatrix(matrixStack);
}

function DrawStar(cx, cy, size) {
  // Draw a 4-point star using the existing triangle primitive.
  // Each arm is a scaled triangle with its base at the pivot and apex pointing out.

  col = [1.0, 1.0, 1.0, 1.0]; // white
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [cx, cy, 0.98]);
  for (let i = 0; i < 4; i++) {
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.rotate(mMatrix, i * (Math.PI / 2), [0.0, 0.0, 1.0]);
    // Make a slender arm: wider X makes fatter arms, Y controls length
    mMatrix = mat4.scale(mMatrix, [size * 0.4, size, 1.0]);
    // Move triangle so its base center sits at the pivot and apex points outward
    mMatrix = mat4.translate(mMatrix, [0.0, 0.5, 0.0]);
    drawTriangle(col, mMatrix);
    mMatrix = popMatrix(matrixStack);
  }
  mMatrix = popMatrix(matrixStack);
}

function DrawGrass() {
  // green rectangle
  color = [105/255, 226/255, 138/255, 1.0]; // green
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.0, -0.5, 0.69]);
  mMatrix = mat4.scale(mMatrix, [2.0, 1, 1.0]);
  drawSquare(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  // green triangle
  color = [120/255, 176/255, 72/255, 1.0]; // brown green
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.rotate(mMatrix, degToRad(160), [0, 0, 1]);
  mMatrix = mat4.scale(mMatrix, [1.8, 0.6, 1.0]);
  mMatrix = mat4.translate(mMatrix, [-0.45, 1, 0.68]);
  drawTriangle(color, mMatrix);
  mMatrix = popMatrix(matrixStack);
}

function DrawRiver() {
  // blue rect
  color = [0.0, 0.3, 0.7, 1.0]; // blue
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.0, -0.2, 0.68]);
  mMatrix = mat4.scale(mMatrix, [2.0, 0.3, 1.0]);
  drawSquare(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  // small white rectangles
  color = [1.0, 1.0, 1.0, 1.0]; // white
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.0, -0.1, 0.67]);
  mMatrix = mat4.scale(mMatrix, [0.5, 0.01, 1.0]);
  drawSquare(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.6, -0.3, 0.66]);
  mMatrix = mat4.scale(mMatrix, [0.5, 0.01, 1.0]);
  drawSquare(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [-0.6, -0.2, 0.66]);
  mMatrix = mat4.scale(mMatrix, [0.5, 0.01, 1.0]);
  drawSquare(color, mMatrix);
  mMatrix = popMatrix(matrixStack);
}

function drawMountain(t_x1, t_y1, s_x, s_y, t_x2 = 0, t_y2 = 0, single = false) {
    /*
    t_x1, t_x2 : Translation along X-axis for the first and second triangle respectively
    t_y1, t_y2 : Translation along Y-axis for the first and second triangle respectively
    s_x : Scale Factor on X Axis for both triangles
    s_y : Scale Factor on Y Axis for both triangles
    single : Since one of the mountains has only one triangle, this is used to denote that
    */
    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);
    pushMatrix(matrixStack, mMatrix);
    color = [122/255, 94/255, 70/255, 1.0];
    if (single) color = [145/255, 121/255, 87/255, 1.0];

    mMatrix = mat4.translate(mMatrix, [t_x1, t_y1, 0.8]);
    mMatrix = mat4.scale(mMatrix, [s_x, s_y, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    // if there is a single triangle in the mountain, we ignore the darker portion
    if (!single) {
      pushMatrix(matrixStack, mMatrix);
      color = [145/255, 121/255, 87/255, 1.0];
      mMatrix = mat4.translate(mMatrix, [t_x2, t_y2, 0.8]);
      mMatrix = mat4.rotate(mMatrix, 6.5, [0, 0, 1]);
      mMatrix = mat4.scale(mMatrix, [s_x, s_y, 1.0]);
      drawTriangle(color, mMatrix);
      mMatrix = popMatrix(matrixStack);
    }
}

function drawTrees(move = false, t_x = 0, t_y= 0, s_x = 0, s_y = 0) {
    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);
    if (move) {
        // applying global translation and scaling
        mMatrix = mat4.translate(mMatrix, [t_x, t_y, 0.6]);
        mMatrix = mat4.scale(mMatrix, [s_x, s_y, 0]);
    }

    pushMatrix(matrixStack, mMatrix);
    color = [68/255, 151/255, 85/255, 0.9];
    mMatrix = mat4.translate(mMatrix, [0.55, 0.45, 0.59]);
    mMatrix = mat4.scale(mMatrix, [0.35, 0.3, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = [106/255, 176/255, 90/255, 0.9];
    mMatrix = mat4.translate(mMatrix, [0.55, 0.5, 0.58]);
    mMatrix = mat4.scale(mMatrix, [0.375, 0.3, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = [128/255, 202/255, 95/255, 0.9];
    mMatrix = mat4.translate(mMatrix, [0.55, 0.55, 0.57]);
    mMatrix = mat4.scale(mMatrix, [0.4, 0.3, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    // stem of the tree
    pushMatrix(matrixStack, mMatrix);
    color = [0.57, 0.36, 0.15, 1.0];
    mMatrix = mat4.translate(mMatrix, [0.55, 0.14, 0.55]);
    mMatrix = mat4.scale(mMatrix, [0.04, 0.33, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
}

// translationX is taken as argument for the animation
function drawBoat(tx, ty=-0.1, tz = 0.45, s=1.0, c=[1, 0, 0, 0.9]) {
    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);

    // applying global translation
    mMatrix = mat4.translate(mMatrix, [tx, ty, tz]);
    mMatrix = mat4.scale(mMatrix, [s, s, 1.0]);
    pushMatrix(matrixStack, mMatrix);
    color = [0.83, 0.83, 0.83, 1];
    mMatrix = mat4.translate(mMatrix, [0, -0.15, -0]);
    mMatrix = mat4.scale(mMatrix, [0.18, 0.06, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.09, -0.15, -0]);
    mMatrix = mat4.rotate(mMatrix, -3.15, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.1, 0.06, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.09, -0.15, -0]);
    mMatrix = mat4.rotate(mMatrix, -3.15, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.1, 0.06, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = [0, 0, 0, 1.0];
    mMatrix = mat4.translate(mMatrix, [0.01, 0.006, -0.]);
    mMatrix = mat4.scale(mMatrix, [0.01, 0.25, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = [0, 0, 0, 1.0];
    mMatrix = mat4.translate(mMatrix, [-0.03, -0.01, -0]);
    mMatrix = mat4.rotate(mMatrix, 5.9, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.005, 0.23, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = c;
    mMatrix = mat4.translate(mMatrix, [0.115, 0.006, -0]);
    mMatrix = mat4.rotate(mMatrix, 4.72, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.2, 0.2, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
}

function drawFan(rotationAngle, tx = 0.8, ty = -0.3, tz = 0, s = 1.2) {
  // stick
  mat4.identity(mMatrix);
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [tx, ty, tz]);
  mMatrix = mat4.scale(mMatrix, [s,s,s]);
  pushMatrix(matrixStack, mMatrix);
  color = [55/255, 55/255, 55/255, 1];
  mMatrix = mat4.scale(mMatrix, [0.03, 0.55, 1.0]);
  drawSquare(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  // blades
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0, 0.16, tz-0.01]);

  pushMatrix(matrixStack, mMatrix);
  color =[0, 0, 0, 1]; 
  mMatrix = mat4.translate(mMatrix, [0, 0.1, tz]);
  mMatrix = mat4.scale(mMatrix, [0.04, 0.04, 1.0]);

  drawCircle(color, mMatrix);
  mMatrix = popMatrix(matrixStack);

  color = [178/255, 178/255, 56/255, 1];
  for (let i = 0; i < 4; i++) {
    pushMatrix(matrixStack, mMatrix);

    mMatrix = mat4.translate(mMatrix, [0, 0.1, tz+0.01]);
    mMatrix = mat4.rotate(mMatrix, rotationAngle/10 + i * Math.PI/2, [0, 0, 1]);
    mMatrix = mat4.translate(mMatrix, [0, -0.1, 0]);
    mMatrix = mat4.scale(mMatrix, [0.06, 0.2, 1.0]);

    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
  }
  popMatrix(matrixStack);
}

function drawBush(move=false, t_x=0, t_y=0, s=0) {
    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);
    if (move) {
        mMatrix = mat4.translate(mMatrix, [t_x, t_y, 0.2]);
        mMatrix = mat4.scale(mMatrix, [s, s, 0]);
    }
    k = 2;
    pushMatrix(matrixStack, mMatrix);
    color = [79/255, 175/255, 50/255, 0.9];
    mMatrix = mat4.translate(mMatrix, [-1, -0.55, 0.19]);
    mMatrix = mat4.scale(mMatrix, [0.075*k, 0.055*k, 1.0]);
    drawCircle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = [43/255, 100/255, 25/255, 0.9];
    mMatrix = mat4.translate(mMatrix, [-0.72, -0.55, 0.18]);
    mMatrix = mat4.scale(mMatrix, [0.07*k, 0.05*k, 1.0]);
    drawCircle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = [68/255, 151/255, 41/255, 0.9];
    mMatrix = mat4.translate(mMatrix, [-0.86, -0.53, 0.17]);
    mMatrix = mat4.scale(mMatrix, [0.13*k, 0.09*k, 1.0]);
    drawCircle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
}

function drawHouse() {
    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);
    // mMatrix = pushMatrix(matrixStack, mMatrix);
    // mMatrix = mat4.translate(mMatrix, [-0.0, -0.0, 0.0]);
    // roof of the house
    pushMatrix(matrixStack, mMatrix);
    color = [236/255, 91/255, 41/255, 1];
    mMatrix = mat4.translate(mMatrix, [-0.55, -0.33, 0.0]);
    mMatrix = mat4.scale(mMatrix, [0.4, 0.22, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.75, -0.33, 0]);
    mMatrix = mat4.rotate(mMatrix, 6.285, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.25, 0.22, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.35, -0.33, 0.0]);
    mMatrix = mat4.rotate(mMatrix, 6.285, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.25, 0.22, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    // base of the house
    pushMatrix(matrixStack, mMatrix);
    color = [0.83, 0.83, 0.83, 1];
    mMatrix = mat4.translate(mMatrix, [-0.55, -0.525, 0.01]);
    mMatrix = mat4.scale(mMatrix, [0.5, 0.25, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    // windows
    pushMatrix(matrixStack, mMatrix);
    color = [0.85, 0.7, 0, 0.9];
    mMatrix = mat4.translate(mMatrix, [-0.7, -0.5, 0]);
    mMatrix = mat4.scale(mMatrix, [0.08, 0.08, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.4, -0.5, 0]);
    mMatrix = mat4.scale(mMatrix, [0.08, 0.08, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    // door of the house
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.55, -0.58, 0]);
    mMatrix = mat4.scale(mMatrix, [0.08, 0.14, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
    // mMatrix = popMatrix(matrixStack);
}

// wheels for the car
function drawWheel(move = false, t_x = 0) {
    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);
    if (move) {
        // applying global translation for the other wheel
        mMatrix = mat4.translate(mMatrix, [t_x, 0, 0]);
    }
    pushMatrix(matrixStack, mMatrix);
    color = [0, 0, 0, 1];
    mMatrix = mat4.translate(mMatrix, [-0.63, -0.87, 0]);
    mMatrix = mat4.scale(mMatrix, [0.1, 0.1, 1.0]);
    drawCircle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    color = [0.51, 0.51, 0.51, 1];
    mMatrix = mat4.translate(mMatrix, [-0.63, -0.87, 0]);
    mMatrix = mat4.scale(mMatrix, [0.08, 0.08, 1.0]);
    drawCircle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
}

function drawCar() {
    // initialize the model matrix to identity matrix
    mat4.identity(mMatrix);
    pushMatrix(matrixStack, mMatrix);
    color = [30/255, 76/255, 172/255, 1];
    mMatrix = mat4.translate(mMatrix, [-0.5, -0.72, 0]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.2, 1.0]);
    drawCircle(color, mMatrix);
    popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0, -0.15, 0]);
    mMatrix = mat4.scale(mMatrix, [0.7, 0.7, 1.0]);
    color = [150/255, 150/255, 170/255, 0.65];
    drawSquare(color, mMatrix);
    popMatrix(matrixStack);

    // drawing wheels
    drawWheel();
    drawWheel(true, 0.27);

    mat4.identity(mMatrix);
    pushMatrix(matrixStack, mMatrix);
    color = [55/255, 126/255, 222/255,1];
    mMatrix = mat4.translate(mMatrix, [-0.5, -0.8, 0]);
    mMatrix = mat4.scale(mMatrix, [0.39, 0.1, 1.0]);
    drawSquare(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.305, -0.8, 0]);
    mMatrix = mat4.rotate(mMatrix, 6.285, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.14, 0.1, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.695, -0.8, 0]);
    mMatrix = mat4.rotate(mMatrix, 6.285, [0, 0, 1]);
    mMatrix = mat4.scale(mMatrix, [0.14, 0.1, 1.0]);
    drawTriangle(color, mMatrix);
    mMatrix = popMatrix(matrixStack);
}

