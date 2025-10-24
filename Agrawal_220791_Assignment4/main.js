////////////////////////////////////////////////////////////////////////
var gl;
var canvas;
var matrixStack = [];

var zAngle = 0.0;
var yAngle = 0.0;
var prevMouseX = 0.0;
var prevMouseY = 0.0;

var aPositionLocation;
var aTexCoordLocation;
var uVMatrixLocation;
var uMMatrixLocation;
var uPMatrixLocation;

var vMatrix = mat4.create(); // view matrix
var mMatrix = mat4.create(); // model matrix
var pMatrix = mat4.create(); // projection matrix

var spBuf;
var spIndexBuf;
var spNormalBuf;

var spVerts = [];
var spIndices = [];
var spNormals = [];

// Teapot (JSON model) buffers
var teapotVertexPositionBuffer;
var teapotVertexNormalBuffer;
var teapotVertexIndexBuffer;
var teapotLoaded = false;
var teapotJSON = "teapot.json";

// Plane buffers (simple quad in XZ plane at Y = 0)
var planePositionBuffer;
var planeNormalBuffer;
var planeIndexBuffer;

var uDiffuseTermLocation;
var uNormalMatrixLocation;
var uLightPosLocation;
var uEyePosLocation;
var uLightColorLocation;
var uAmbientStrengthLocation;
var uSpecularStrengthLocation;
var uShininessLocation;
var aNormalLocation;

var eyePos = [9.0, 4.0, 0.0]; // camera/eye position
var xCam = 0;
var yCam = 0;
var zCam = 0;

var lightPos = [10, 15, -10];
var lightColor = [1, 1, 1];
var ambientStrength = 0.5;
var specularStrength = 1;
var shininess = 32.0;

var isAnimating = false;
var animationId = null;

// Shadow mapping
var shadowFramebuffer;
var shadowDepthTexture;
var shadowMapSize = 2048;
var shadowShaderProgram;
var sShadowPositionLocation;
var sShadowMMatrixLocation;
var sShadowVMatrixLocation;
var sShadowPMatrixLocation;
var lightViewMatrix = mat4.create();
var lightProjectionMatrix = mat4.create();

// Main shader with shadows
var uShadowMapLocation;
var uLightViewMatrixLocation;
var uLightProjectionMatrixLocation;

//////////////////////////////////////////////////////////////////////////
// Shadow depth shader (simple depth recording)
const shadowVertexShaderCode = `#version 300 es
in vec3 aPosition;

uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;

void main() {
  gl_Position = uPMatrix * uVMatrix * uMMatrix * vec4(aPosition, 1.0);
}`;

const shadowFragShaderCode = `#version 300 es
precision highp float;

out vec4 fragColor;

void main() {
  // Depth is automatically written to the depth buffer
  fragColor = vec4(1.0);
}`;

// Main vertex shader with shadow mapping
const vertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uMMatrix;
uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
uniform mat3 uNormalMatrix;
uniform mat4 uLightViewMatrix;
uniform mat4 uLightProjectionMatrix;

out vec3 fragNormal;
out vec3 fragWorldPos;
out vec4 fragPosLightSpace;

void main() {
  mat4 projectionModelView;
	projectionModelView=uPMatrix*uVMatrix*uMMatrix;

  // transform normal to world space
  fragNormal = normalize(uNormalMatrix * aNormal);
  
  // world position for lighting
  vec4 worldPos = uMMatrix * vec4(aPosition, 1.0);
  fragWorldPos = worldPos.xyz;
  
  // position in light space for shadow mapping
  fragPosLightSpace = uLightProjectionMatrix * uLightViewMatrix * worldPos;

  // calculate clip space position
  gl_Position = projectionModelView * vec4(aPosition,1.0);
}`;

const fragShaderCode = `#version 300 es
precision highp float;

out vec4 fragColor;
in vec3 fragNormal;
in vec3 fragWorldPos;
in vec4 fragPosLightSpace;

uniform vec4 diffuseTerm;
uniform vec3 uLightPos;
uniform vec3 uEyePos;
uniform vec3 uLightColor;
uniform float uAmbientStrength;
uniform float uSpecularStrength;
uniform float uShininess;
uniform sampler2D uShadowMap;

float calculateShadow(vec4 fragPosLightSpace, vec3 normal, vec3 lightDir) {
  // Perspective divide
  vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;
  
  // Transform to [0,1] range
  projCoords = projCoords * 0.5 + 0.5;
  
  // Check if outside shadow map bounds
  if(projCoords.z > 1.0 || projCoords.x < 0.0 || projCoords.x > 1.0 || 
     projCoords.y < 0.0 || projCoords.y > 1.0) {
    return 0.0;
  }
  
  // Get closest depth value from light's perspective
  float closestDepth = texture(uShadowMap, projCoords.xy).r;
  
  // Get depth of current fragment from light's perspective
  float currentDepth = projCoords.z;
  
  // Add bias to prevent shadow acne
  float bias = max(0.005 * (1.0 - dot(normal, lightDir)), 0.0005);
  
  // PCF (Percentage Closer Filtering) for soft shadows
  float shadow = 0.0;
  vec2 texelSize = 1.0 / vec2(textureSize(uShadowMap, 0));
  for(int x = -1; x <= 1; ++x) {
    for(int y = -1; y <= 1; ++y) {
      float pcfDepth = texture(uShadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
      shadow += currentDepth - bias > pcfDepth ? 1.0 : 0.0;
    }
  }
  shadow /= 9.0;
  
  return shadow;
}

void main() {
  vec3 baseColor = diffuseTerm.rgb;
  
  // Normalize vectors
  vec3 N = normalize(fragNormal);
  vec3 L = normalize(uLightPos - fragWorldPos);
  vec3 V = normalize(uEyePos - fragWorldPos);
  vec3 R = reflect(-L, N);
  
  // Ambient
  vec3 ambient = uAmbientStrength * uLightColor * baseColor;
  
  // Diffuse
  float diff = max(dot(N, L), 0.0);
  vec3 diffuse = diff * uLightColor * baseColor;
  
  // Specular
  float spec = pow(max(dot(R, V), 0.0), uShininess);
  vec3 specular = uSpecularStrength * spec * uLightColor;
  
  // Calculate shadow
  float shadow = calculateShadow(fragPosLightSpace, N, L);
  
  // Combine lighting (shadow only affects diffuse and specular, not ambient)
  vec3 finalColor = ambient + (1.0 - shadow) * (diffuse + specular);
  fragColor = vec4(finalColor, 1.0);
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

// ==============================
// Refactored Helper Functions
// ==============================

// Bind buffer and set up vertex attribute pointer
function bindAttribute(location, buffer, itemSize) {
  if (typeof location === "number" && location !== -1 && buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, itemSize, gl.FLOAT, false, 0, 0);
  }
}

// Compute and return normal matrix from model matrix
function computeNormalMatrix(modelMatrix) {
  var normalMatrix = mat3.create();
  mat4.toInverseMat3(modelMatrix, normalMatrix);
  mat3.transpose(normalMatrix);
  return normalMatrix;
}

// Set MVP matrices for a shader program
function setMVPUniforms(mLoc, vLoc, pLoc) {
  if (mLoc) gl.uniformMatrix4fv(mLoc, false, mMatrix);
  if (vLoc) gl.uniformMatrix4fv(vLoc, false, vMatrix);
  if (pLoc) gl.uniformMatrix4fv(pLoc, false, pMatrix);
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

  // check for compiiion and linking status
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vertexShader));
    console.log(gl.getShaderInfoLog(fragmentShader));
  }

  //finally use the program.
  gl.useProgram(shaderProgram);

  return shaderProgram;
}

function initShadowShaders() {
  shadowShaderProgram = gl.createProgram();

  var vertexShader = vertexShaderSetup(shadowVertexShaderCode);
  var fragmentShader = fragmentShaderSetup(shadowFragShaderCode);

  gl.attachShader(shadowShaderProgram, vertexShader);
  gl.attachShader(shadowShaderProgram, fragmentShader);
  gl.linkProgram(shadowShaderProgram);

  if (!gl.getProgramParameter(shadowShaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vertexShader));
    console.log(gl.getShaderInfoLog(fragmentShader));
  }

  sShadowPositionLocation = gl.getAttribLocation(
    shadowShaderProgram,
    "aPosition",
  );
  sShadowMMatrixLocation = gl.getUniformLocation(
    shadowShaderProgram,
    "uMMatrix",
  );
  sShadowVMatrixLocation = gl.getUniformLocation(
    shadowShaderProgram,
    "uVMatrix",
  );
  sShadowPMatrixLocation = gl.getUniformLocation(
    shadowShaderProgram,
    "uPMatrix",
  );

  return shadowShaderProgram;
}

function initShadowFramebuffer() {
  // Create framebuffer
  shadowFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);

  // Create depth texture
  shadowDepthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.DEPTH_COMPONENT32F,
    shadowMapSize,
    shadowMapSize,
    0,
    gl.DEPTH_COMPONENT,
    gl.FLOAT,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Attach depth texture to framebuffer
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.TEXTURE_2D,
    shadowDepthTexture,
    0,
  );

  // Check framebuffer status
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Shadow framebuffer is not complete!");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function initGL(canvas) {
  try {
    gl = canvas.getContext("webgl2"); // the graphics webgl2 context
    gl.viewportWidth = canvas.width; // the width of the canvas
    gl.viewportHeight = canvas.height; // the height
  } catch (e) {}
  if (!gl) {
    alert("WebGL initialization failed");
  }
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

// New sphere initialization function
function initSphere(nslices, nstacks, radius) {
  for (var i = 0; i <= nslices; i++) {
    var angle = (i * Math.PI) / nslices;
    var comp1 = Math.sin(angle);
    var comp2 = Math.cos(angle);

    for (var j = 0; j <= nstacks; j++) {
      var phi = (j * 2 * Math.PI) / nstacks;
      var comp3 = Math.sin(phi);
      var comp4 = Math.cos(phi);

      var xcood = comp4 * comp1;
      var ycoord = comp2;
      var zcoord = comp3 * comp1;

      spVerts.push(radius * xcood, radius * ycoord, radius * zcoord);
      spNormals.push(xcood, ycoord, zcoord);
    }
  }

  // now compute the indices here
  for (var i = 0; i < nslices; i++) {
    for (var j = 0; j < nstacks; j++) {
      var id1 = i * (nstacks + 1) + j;
      var id2 = id1 + nstacks + 1;

      spIndices.push(id1, id2, id1 + 1);
      spIndices.push(id2, id2 + 1, id1 + 1);
    }
  }
}

function initSphereBuffer() {
  var nslices = 50;
  var nstacks = 50;
  var radius = 1.0;

  initSphere(nslices, nstacks, radius);

  // buffer for vertices
  spBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spVerts), gl.STATIC_DRAW);
  spBuf.itemSize = 3;
  spBuf.numItems = spVerts.length / 3;

  // buffer for indices
  spIndexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint32Array(spIndices),
    gl.STATIC_DRAW,
  );
  spIndexBuf.itemsize = 1;
  spIndexBuf.numItems = spIndices.length;

  // buffer for normals
  spNormalBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spNormals), gl.STATIC_DRAW);
  spNormalBuf.itemSize = 3;
  spNormalBuf.numItems = spNormals.length / 3;
}

// Creates a 2x2 plane centered at origin on XZ (Y=0). Scalable via model matrix.
function initPlaneBuffer() {
  var positions = [
    -1.0, 0.0, -1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 1.0,
  ];

  var normals = [0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0];

  var indices = [0, 1, 2, 0, 2, 3];

  planePositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, planePositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  planePositionBuffer.itemSize = 3;
  planePositionBuffer.numItems = positions.length / 3;

  planeNormalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, planeNormalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  planeNormalBuffer.itemSize = 3;
  planeNormalBuffer.numItems = normals.length / 3;

  planeIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW,
  );
  planeIndexBuffer.itemSize = 1;
  planeIndexBuffer.numItems = indices.length;
}

function initTeapot() {
  var request = new XMLHttpRequest();
  request.open("GET", teapotJSON);
  request.overrideMimeType("application/json");
  request.onreadystatechange = function () {
    if (request.readyState === 4 && request.status < 400) {
      try {
        processTeapot(JSON.parse(request.responseText));
      } catch (e) {
        console.error("Failed parsing teapot JSON", e);
      }
    }
  };
  request.send();
}

function processTeapot(objData) {
  // positions
  teapotVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, teapotVertexPositionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(objData.vertexPositions),
    gl.STATIC_DRAW,
  );
  teapotVertexPositionBuffer.itemSize = 3;
  teapotVertexPositionBuffer.numItems = objData.vertexPositions.length / 3;

  // normals
  teapotVertexNormalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, teapotVertexNormalBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(objData.vertexNormals),
    gl.STATIC_DRAW,
  );
  teapotVertexNormalBuffer.itemSize = 3;
  teapotVertexNormalBuffer.numItems = objData.vertexNormals.length / 3;

  // indices
  teapotVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, teapotVertexIndexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint32Array(objData.indices),
    gl.STATIC_DRAW,
  );
  teapotVertexIndexBuffer.itemSize = 1;
  teapotVertexIndexBuffer.numItems = objData.indices.length;

  teapotLoaded = true;
  // once loaded, render
  drawScene();
}

function bindSphereGeometry() {
  gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
  gl.vertexAttribPointer(
    aPositionLocation,
    spBuf.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
  gl.vertexAttribPointer(
    aNormalLocation,
    spNormalBuf.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);
}

function drawSphere() {
  gl.drawElements(gl.TRIANGLES, spIndexBuf.numItems, gl.UNSIGNED_INT, 0);
}

function bindPlaneGeometry() {
  gl.bindBuffer(gl.ARRAY_BUFFER, planePositionBuffer);
  gl.vertexAttribPointer(
    aPositionLocation,
    planePositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, planeNormalBuffer);
  gl.vertexAttribPointer(
    aNormalLocation,
    planeNormalBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);
}

function drawPlane() {
  gl.drawElements(
    gl.TRIANGLES,
    planeIndexBuffer.numItems,
    gl.UNSIGNED_SHORT,
    0,
  );
}

function bindTeapotGeometry() {
  gl.bindBuffer(gl.ARRAY_BUFFER, teapotVertexPositionBuffer);
  gl.vertexAttribPointer(
    aPositionLocation,
    teapotVertexPositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, teapotVertexNormalBuffer);
  gl.vertexAttribPointer(
    aNormalLocation,
    teapotVertexNormalBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, teapotVertexIndexBuffer);
}

function drawTeapot() {
  gl.drawElements(
    gl.TRIANGLES,
    teapotVertexIndexBuffer.numItems,
    gl.UNSIGNED_INT,
    0,
  );
}

// Render shadow map from light's perspective
function renderShadowMap() {
  // Setup light view matrix (looking at origin)
  mat4.identity(lightViewMatrix);
  lightViewMatrix = mat4.lookAt(
    lightPos,
    [0, 0, 0],
    [0, 1, 0],
    lightViewMatrix,
  );

  // Setup light projection matrix (orthographic for directional-like light)
  mat4.identity(lightProjectionMatrix);
  mat4.ortho(-15, 15, -15, 15, 0.1, 50, lightProjectionMatrix);

  // Bind shadow framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
  gl.viewport(0, 0, shadowMapSize, shadowMapSize);
  gl.clear(gl.DEPTH_BUFFER_BIT);

  // Use shadow shader
  gl.useProgram(shadowShaderProgram);

  // Store original matrices
  var savedMMatrix = mat4.create(mMatrix);

  // Render all objects from light's perspective (without camera rotation)
  mat4.identity(mMatrix);
  // DO NOT apply camera rotations (zAngle, yAngle) to shadow map

  // Draw sphere
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [4.0, 0, -2.0]);
  mMatrix = mat4.scale(mMatrix, [1.5, 1.5, 1.5]);

  gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
  gl.vertexAttribPointer(sShadowPositionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(sShadowPositionLocation);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);

  gl.uniformMatrix4fv(sShadowMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(sShadowVMatrixLocation, false, lightViewMatrix);
  gl.uniformMatrix4fv(sShadowPMatrixLocation, false, lightProjectionMatrix);

  drawSphere();
  mMatrix = popMatrix(matrixStack);

  // Draw teapot
  if (teapotLoaded) {
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-2.0, 0.1, 0.0]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);

    gl.bindBuffer(gl.ARRAY_BUFFER, teapotVertexPositionBuffer);
    gl.vertexAttribPointer(sShadowPositionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(sShadowPositionLocation);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, teapotVertexIndexBuffer);

    gl.uniformMatrix4fv(sShadowMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(sShadowVMatrixLocation, false, lightViewMatrix);
    gl.uniformMatrix4fv(sShadowPMatrixLocation, false, lightProjectionMatrix);

    drawTeapot();
    mMatrix = popMatrix(matrixStack);
  }

  // Draw plane
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.0, -1.5, 0.0]);
  mMatrix = mat4.scale(mMatrix, [8.0, 1.0, 8.0]);

  gl.bindBuffer(gl.ARRAY_BUFFER, planePositionBuffer);
  gl.vertexAttribPointer(sShadowPositionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(sShadowPositionLocation);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);

  gl.uniformMatrix4fv(sShadowMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(sShadowVMatrixLocation, false, lightViewMatrix);
  gl.uniformMatrix4fv(sShadowPMatrixLocation, false, lightProjectionMatrix);

  drawPlane();
  mMatrix = popMatrix(matrixStack);

  // Restore original matrix
  mMatrix = mat4.create(savedMMatrix);

  // Unbind shadow framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function drawScene() {
  // First pass: Render shadow map
  renderShadowMap();

  // Second pass: Render scene with shadows
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clearColor(0, 0, 0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  mat4.identity(mMatrix);
  mat4.identity(vMatrix);

  // Orbit camera around origin using Cartesian rotation matrices
  // Create rotation matrix
  var rotationMatrix = mat4.create();
  mat4.identity(rotationMatrix);

  // Apply rotations: first rotate around Y axis (horizontal), then X axis (vertical)
  mat4.rotate(rotationMatrix, degToRad(zAngle), [0, 1, 0], rotationMatrix);
  mat4.rotate(rotationMatrix, degToRad(yAngle), [1, 0, 0], rotationMatrix);

  // Transform the initial eye position by the rotation matrix
  var currentEyePos = [
    rotationMatrix[0] * eyePos[0] +
      rotationMatrix[4] * eyePos[1] +
      rotationMatrix[8] * eyePos[2],
    rotationMatrix[1] * eyePos[0] +
      rotationMatrix[5] * eyePos[1] +
      rotationMatrix[9] * eyePos[2],
    rotationMatrix[2] * eyePos[0] +
      rotationMatrix[6] * eyePos[1] +
      rotationMatrix[10] * eyePos[2],
  ];

  vMatrix = mat4.lookAt(currentEyePos, [0, 0, 0], [0, 1, 0], vMatrix);

  mat4.identity(pMatrix);
  mat4.perspective(60, 1.0, 0.01, 1000, pMatrix);

  gl.useProgram(shaderProgram);

  // Set lighting uniforms (shared by all objects)
  gl.uniform3fv(uLightPosLocation, lightPos);
  gl.uniform3fv(uEyePosLocation, currentEyePos);
  gl.uniform3fv(uLightColorLocation, lightColor);
  gl.uniform1f(uAmbientStrengthLocation, ambientStrength);
  gl.uniform1f(uSpecularStrengthLocation, specularStrength);
  gl.uniform1f(uShininessLocation, shininess);

  // Set shadow map texture and light matrices
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture);
  gl.uniform1i(uShadowMapLocation, 0);
  gl.uniformMatrix4fv(uLightViewMatrixLocation, false, lightViewMatrix);
  gl.uniformMatrix4fv(
    uLightProjectionMatrixLocation,
    false,
    lightProjectionMatrix,
  );

  // Draw sphere (solid color - blue)
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [4.0, 0, -2.0]);
  mMatrix = mat4.scale(mMatrix, [1.5, 1.5, 1.5]);

  bindSphereGeometry();
  gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

  var normalMatrix = computeNormalMatrix(mMatrix);
  gl.uniformMatrix3fv(uNormalMatrixLocation, false, normalMatrix);

  // Use solid color for sphere (blue)
  gl.uniform4fv(uDiffuseTermLocation, [0.2, 0.5, 0.8, 1.0]);

  drawSphere();
  mMatrix = popMatrix(matrixStack);

  // Draw teapot (solid color)
  if (teapotLoaded) {
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-2.0, 0.5, 0.0]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);

    bindTeapotGeometry();
    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

    normalMatrix = computeNormalMatrix(mMatrix);
    gl.uniformMatrix3fv(uNormalMatrixLocation, false, normalMatrix);

    // Use solid color for teapot (gold)
    gl.uniform4fv(uDiffuseTermLocation, [0.176, 0.549, 0.384, 1.0]);

    drawTeapot();
    mMatrix = popMatrix(matrixStack);
  }

  // Draw plane (ground)
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.0, -1.5, 0.0]);
  mMatrix = mat4.scale(mMatrix, [8.0, 1.0, 8.0]);

  bindPlaneGeometry();
  gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

  normalMatrix = computeNormalMatrix(mMatrix);
  gl.uniformMatrix3fv(uNormalMatrixLocation, false, normalMatrix);

  // Use solid color for plane (gray)
  gl.uniform4fv(uDiffuseTermLocation, [0.4, 0.4, 0.4, 1.0]);

  drawPlane();
  mMatrix = popMatrix(matrixStack);
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
  if (
    event.layerX <= canvas.width &&
    event.layerX >= 0 &&
    event.layerY <= canvas.height &&
    event.layerY >= 0
  ) {
    var mouseX = event.clientX;
    var diffX = mouseX - prevMouseX;
    zAngle = zAngle - diffX / 2;
    prevMouseX = mouseX;

    var mouseY = canvas.height - event.clientY;
    var diffY = mouseY - prevMouseY;
    yAngle = yAngle - diffY / 2;
    prevMouseY = mouseY;

    drawScene();
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

// Event handler for light position slider
function setLightPosition(value) {
  lightPos[0] = value;
  drawScene();
}

// Event handler for animation checkbox
function toggleAnimation(enabled) {
  isAnimating = enabled;
  if (enabled) {
    animate();
  } else {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }
}

// Animation loop
function animate() {
  if (!isAnimating) return;

  zAngle += 0.5;
  drawScene();

  animationId = requestAnimationFrame(animate);
}

// This is the entry point from the html
function webGLStart() {
  canvas = document.getElementById("3DTextureMapExample");
  document.addEventListener("mousedown", onMouseDown, false);

  initGL(canvas);
  shaderProgram = initShaders();
  initShadowShaders();
  initShadowFramebuffer();

  aPositionLocation = gl.getAttribLocation(shaderProgram, "aPosition");
  aNormalLocation = gl.getAttribLocation(shaderProgram, "aNormal");

  uMMatrixLocation = gl.getUniformLocation(shaderProgram, "uMMatrix");
  uPMatrixLocation = gl.getUniformLocation(shaderProgram, "uPMatrix");
  uVMatrixLocation = gl.getUniformLocation(shaderProgram, "uVMatrix");
  uNormalMatrixLocation = gl.getUniformLocation(shaderProgram, "uNormalMatrix");

  uDiffuseTermLocation = gl.getUniformLocation(shaderProgram, "diffuseTerm");

  uLightPosLocation = gl.getUniformLocation(shaderProgram, "uLightPos");
  uEyePosLocation = gl.getUniformLocation(shaderProgram, "uEyePos");
  uLightColorLocation = gl.getUniformLocation(shaderProgram, "uLightColor");
  uAmbientStrengthLocation = gl.getUniformLocation(
    shaderProgram,
    "uAmbientStrength",
  );
  uSpecularStrengthLocation = gl.getUniformLocation(
    shaderProgram,
    "uSpecularStrength",
  );
  uShininessLocation = gl.getUniformLocation(shaderProgram, "uShininess");

  // Shadow mapping uniforms
  uShadowMapLocation = gl.getUniformLocation(shaderProgram, "uShadowMap");
  uLightViewMatrixLocation = gl.getUniformLocation(
    shaderProgram,
    "uLightViewMatrix",
  );
  uLightProjectionMatrixLocation = gl.getUniformLocation(
    shaderProgram,
    "uLightProjectionMatrix",
  );

  gl.enableVertexAttribArray(aPositionLocation);
  gl.enableVertexAttribArray(aNormalLocation);

  initSphereBuffer();
  initPlaneBuffer();

  // load teapot model asynchronously
  initTeapot();

  drawScene();
}
