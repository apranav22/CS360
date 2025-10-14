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
var spTexBuf;

var spVerts = [];
var spIndices = [];
var spNormals = [];
var spTexCoords = [];

// Cube buffers and shader
var cubePositionBuffer;
var cubeIndexBuffer;
var cubeNormalBuffer;
var cubeShaderProgram;
var cPositionLocation;
var cUMatrixLocation;
var cPMatrixLocation;
var cVMatrixLocation;
var cColorLocation;
var cTexCoordLocation;
var cTextureLocation;
var cUseTextureLocation;
var cubeTexCoordBuffer;

// Refractive cube shader
var refractiveCubeShaderProgram;
var rcPositionLocation;
var rcNormalLocation;
var rcUMMatrixLocation;
var rcUPMatrixLocation;
var rcUVMatrixLocation;
var rcNormalMatrixLocation;
var rcEyePosLocation;
var rcEnvMapLocation;
var rcRefractiveIndexLocation;

// Phong shader (with environment reflection mixing)
var phongShaderProgram;
var pPositionLocation;
var pNormalLocation;
var pModelLocation;
var pProjLocation;
var pViewLocation;
var pNormalMatrixLocation;
var pEyePosLocation;
var pLightPosLocation;
var pKAmbientLocation;
var pKDiffuseLocation;
var pKSpecularLocation;
var pEnvMapLocation;
var pReflectionMixLocation;

// Globe shader (textured + specular)
var globeShaderProgram;
var gPositionLocation;
var gNormalLocation;
var gTexCoordLocation;
var gMMatrixLocation;
var gVMatrixLocation;
var gPMatrixLocation;
var gNormalMatrixLocation;
var gLightPosLocation;
var gEyePosLocation;
var gTextureLocation;
var gSpecStrengthLocation;
var gShininessLocation;

// Plane buffers (simple quad in XZ plane at Y = 0)
var planePositionBuffer;
var planeTexCoordBuffer;
var planeIndexBuffer;

// Skybox shader refs
var skyboxShaderProgram;
var sbPositionLocation;
var sbTexCoordLocation; // in case we texture later
var sbUMatrixLocation;
var sbVMatrixLocation;
var sbPMatrixLocation;
var sbColorLocation;
var sbTextureLocation;
var sbUseTextureLocation;
var sbFlipYLocation;
var sbFlipXLocation;

// Skybox faces
var skyboxTextures = {
  posx: null,
  negx: null,
  posy: null,
  negy: null,
  posz: null,
  negz: null,
};
var skyboxReady = false;
var SKYBOX_SIZE = 50.0; // half-extent for cube
var envCubeMap = null; // cube map for reflections

// Teapot (JSON model) buffers
var teapotVertexPositionBuffer;
var teapotVertexNormalBuffer;
var teapotVertexIndexBuffer;
var teapotLoaded = false;
var teapotJSON = "teapot.json"; // input JSON model file

var uTextureLocation;
var uDiffuseTermLocation; // for solid color (teapot)
var uUseTextureLocation; // flag to switch between texture / color
var sampleTexture;
var woodTexture;
var fenceTexture;
var textureFile = "earthmap.jpg";

var eyePos = [0.0, 3.0, 9.0]; // camera/eye position
var xCam = 0;
var yCam = 0;
var zCam = 0;

var sphereLightPos = [5.0, 5.0, 5.0];
var globeSpecularStrength = 0.45;
var globeShininess = 48.0;
var teapotSpecularStrength = 0.6;
var teapotShininess = 4.0;

//////////////////////////////////////////////////////////////////////////
const vertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec2 aTexCoords;

uniform mat4 uMMatrix;
uniform mat4 uPMatrix;
uniform mat4 uVMatrix;

out vec2 fragTexCoord;

void main() {
  mat4 projectionModelView;
	projectionModelView=uPMatrix*uVMatrix*uMMatrix;

  // pass texture coordinate to frag shader
  fragTexCoord = aTexCoords;

  // calcuie clip space position
  gl_Position =  projectionModelView * vec4(aPosition,1.0);
}`;

const fragShaderCode = `#version 300 es
precision highp float;

out vec4 fragColor;
in vec2 fragTexCoord;
uniform sampler2D imageTexture;
uniform vec4 diffuseTerm;
uniform bool useTexture;

void main() {
  if(useTexture) {
    fragColor = texture(imageTexture, fragTexCoord);
  } else {
    fragColor = diffuseTerm;
  }
}`;

// Textured globe shader with phong specular highlight
const globeVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoords;

uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;
uniform mat3 uNormalMatrix;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoords;

void main() {
  vec4 worldPos = uMMatrix * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  vTexCoords = aTexCoords;
  gl_Position = uPMatrix * uVMatrix * worldPos;
}`;

const globeFragShaderCode = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoords;

uniform vec3 uLightPos;
uniform vec3 uEyePos;
uniform sampler2D uTexture;
uniform float uSpecularStrength;
uniform float uShininess;

out vec4 fragColor;

void main() {
  vec3 baseColor = texture(uTexture, vTexCoords).rgb;
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(uEyePos - vWorldPos);
  float NdotL = max(dot(N, L), 0.0);
  vec3 R = reflect(-L, N);
  float spec = 0.0;
  if (NdotL > 0.0) {
    spec = pow(max(dot(R, V), 0.0), 16.0);
  }

  vec3 lighting = baseColor + uSpecularStrength * spec * vec3(1.0);
  lighting = clamp(lighting, 0.0, 1.0);
  fragColor = vec4(lighting, 1.0);
}`;

// --- Reflective teapot shaders (environment mapping using skybox cube map) ---
const teapotVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;
uniform mat3 uNormalMatrix;
uniform vec3 uEyePos;
out vec3 vReflectDir;
out vec3 vWorldPos;
out vec3 vNormal;
void main(){
  vec3 worldPos = (uMMatrix * vec4(aPosition,1.0)).xyz;
  vec3 N = normalize(uNormalMatrix * aNormal);
  vec3 I = normalize(worldPos - uEyePos);
  vReflectDir = reflect(I, N);
  vWorldPos = worldPos;
  vNormal = N;
  gl_Position = uPMatrix * uVMatrix * vec4(worldPos,1.0);
}`;

const teapotFragShaderCode = `#version 300 es
precision highp float;
in vec3 vReflectDir;
in vec3 vWorldPos;
in vec3 vNormal;
out vec4 fragColor;
uniform samplerCube uEnvMap;
uniform vec3 uLightPos;
uniform vec3 uEyePos;
uniform float uSpecularStrength;
uniform float uShininess;
void main(){
  vec3 envColor = texture(uEnvMap, vReflectDir).rgb;
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(uEyePos - vWorldPos);
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 8.0);
  vec3 color = envColor + 1.0 * spec * vec3(1.0);
  color = clamp(color, 0.0, 1.0);
  fragColor = vec4(color, 1.0);
}`;

// Cube shaders (solid color, translation only applied externally)
const cubeVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec2 aTexCoords;
uniform mat4 uMMatrix; // standard model matrix (same convention as others)
uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
out vec2 vTex;
void main(){
  vTex = aTexCoords;
  gl_Position = uPMatrix * uVMatrix * uMMatrix * vec4(aPosition,1.0);
}`;

const cubeFragShaderCode = `#version 300 es
precision mediump float;
out vec4 fragColor;
in vec2 vTex;
uniform vec4 diffuseTerm;
uniform sampler2D imageTexture;
uniform bool useTexture;
void main(){
  if(useTexture){
    vec4 texColor = texture(imageTexture, vTex);
    // Discard fragment if alpha is below threshold
    if(texColor.a < 0.1) {
      discard;
    }
    fragColor = vec4(texColor.rgb, 1.0); 
  } else {
    fragColor = diffuseTerm;
  }
}`;

// Skybox (plane) simple solid color shader (can be extended later for cube map or gradient)
const skyboxVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec2 aTexCoords;
uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;
out vec2 sbTex;
void main(){
  sbTex = aTexCoords;
  gl_Position = uPMatrix * uVMatrix * uMMatrix * vec4(aPosition,1.0);
}`;

const skyboxFragmentShaderCode = `#version 300 es
precision mediump float;
out vec4 fragColor;
in vec2 sbTex;
uniform vec4 diffuseTerm;
uniform sampler2D imageTexture;
uniform bool useTexture;
uniform bool flipY;
uniform bool flipX;
void main(){
  vec2 uv = sbTex;
  if(flipY) uv.y = 1.0 - uv.y;
  if(flipX) uv.x = 1.0 - uv.x;
  if(useTexture){
    fragColor = texture(imageTexture, uv);
  } else {
    fragColor = diffuseTerm;
  }
}`;

// Refractive cube shaders (pure refraction only)
const refractiveCubeVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;
uniform mat3 uNormalMatrix;
uniform vec3 uEyePos;
out vec3 vRefractDir;
void main(){
  vec3 worldPos = (uMMatrix * vec4(aPosition,1.0)).xyz;
  vec3 N = normalize(uNormalMatrix * aNormal);
  vec3 I = normalize(worldPos - uEyePos);
  
  // refraction coeff. 
  float eta = 0.99;
  vRefractDir = refract(I, N, eta);
  
  gl_Position = uPMatrix * uVMatrix * vec4(worldPos,1.0);
}`;

const refractiveCubeFragShaderCode = `#version 300 es
precision highp float;
in vec3 vRefractDir;
out vec4 fragColor;
uniform samplerCube uEnvMap;
uniform float uRefractiveIndex;
void main(){
  // Sample refracted ray only
  fragColor = texture(uEnvMap, vRefractDir);
}`;

///// phong shader
const perFragVertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uEyePos;
uniform mat3 uNormalMatrix;

out vec3 vPosEye;
out vec3 vNEye;
out vec3 vL;
out vec3 vV;
out vec3 vReflectDir;

uniform vec3 uLightPos;

void main() {
  // Eye space for Phong lighting
  vPosEye = (uView * uModel * vec4(aPosition, 1.0)).xyz;
  vNEye = normalize(mat3(uView * uModel) * aNormal);
  vL = normalize(uLightPos - vPosEye);
  vV = normalize(-vPosEye);
  
  // World space for reflection
  vec3 worldPos = (uModel * vec4(aPosition, 1.0)).xyz;
  vec3 worldNormal = normalize(uNormalMatrix * aNormal);
  vec3 I = normalize(worldPos - uEyePos);
  vReflectDir = reflect(I, worldNormal);
  
  gl_Position = uProj * uView * uModel * vec4(aPosition, 1.0);
}`;

const perFragFragShaderCode = `#version 300 es
precision highp float;
out vec4 fragColor;

in vec3 vNEye;
in vec3 vL;
in vec3 vV;
in vec3 vReflectDir;

uniform vec3 uKAmbient;
uniform vec3 uKDiffuse;
uniform vec3 uKSpecular;
uniform samplerCube uEnvMap;
uniform float uReflectionMix;

void main() {
  vec3 N = normalize(vNEye);
  vec3 L = normalize(vL);
  vec3 V = normalize(vV);
  vec3 R = normalize(-reflect(L, N));

  float diffuse = max(dot(N, L), 0.0);
  float specular = pow(max(dot(R, V), 0.0), 16.0);
  float ambient = 0.15;

  // Phong shading
  vec3 phongColor = uKAmbient * ambient + uKDiffuse * diffuse + uKSpecular * specular;
  
  // Environment reflection
  vec3 reflectionColor = texture(uEnvMap, vReflectDir).rgb;
  
  // Mix Phong and reflection
  vec3 color = mix(phongColor, reflectionColor, uReflectionMix);
  fragColor = vec4(color, 1.0);
}`;

// Teapot shader program + locations
var teapotShaderProgram;
var tPositionLocation;
var tNormalLocation;
var tUMMatrixLocation;
var tUPMatrixLocation;
var tUVMatrixLocation;
var tNormalMatrixLocation;
var tEyePosLocation;
var tEnvMapLocation;
var tLightPosLocation;
var tSpecStrengthLocation;
var tShininessLocation;

function pushMatrix(stack, m) {
  //necessary because javascript only does shallow push
  var copy = mat4.create(m);
  stack.push(copy);
}

function popMatrix(stack) {
  if (stack.length > 0) return stack.pop();
  else console.log("stack has no matrix to pop!");
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

function initTeapotShaders() {
  teapotShaderProgram = gl.createProgram();
  var vsh = vertexShaderSetup(teapotVertexShaderCode);
  var fsh = fragmentShaderSetup(teapotFragShaderCode);
  gl.attachShader(teapotShaderProgram, vsh);
  gl.attachShader(teapotShaderProgram, fsh);
  gl.linkProgram(teapotShaderProgram);
  if (!gl.getProgramParameter(teapotShaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vsh));
    console.log(gl.getShaderInfoLog(fsh));
  }
  // get locations
  tPositionLocation = gl.getAttribLocation(teapotShaderProgram, "aPosition");
  tNormalLocation = gl.getAttribLocation(teapotShaderProgram, "aNormal");
  tUMMatrixLocation = gl.getUniformLocation(teapotShaderProgram, "uMMatrix");
  tUPMatrixLocation = gl.getUniformLocation(teapotShaderProgram, "uPMatrix");
  tUVMatrixLocation = gl.getUniformLocation(teapotShaderProgram, "uVMatrix");
  tNormalMatrixLocation = gl.getUniformLocation(
    teapotShaderProgram,
    "uNormalMatrix",
  );
  tEyePosLocation = gl.getUniformLocation(teapotShaderProgram, "uEyePos");
  tEnvMapLocation = gl.getUniformLocation(teapotShaderProgram, "uEnvMap");
  tLightPosLocation = gl.getUniformLocation(
    teapotShaderProgram,
    "uLightPos",
  );
  tSpecStrengthLocation = gl.getUniformLocation(
    teapotShaderProgram,
    "uSpecularStrength",
  );
  tShininessLocation = gl.getUniformLocation(
    teapotShaderProgram,
    "uShininess",
  );
}

function initCubeShaders() {
  cubeShaderProgram = gl.createProgram();
  var vsh = vertexShaderSetup(cubeVertexShaderCode);
  var fsh = fragmentShaderSetup(cubeFragShaderCode);
  gl.attachShader(cubeShaderProgram, vsh);
  gl.attachShader(cubeShaderProgram, fsh);
  gl.linkProgram(cubeShaderProgram);
  if (!gl.getProgramParameter(cubeShaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vsh));
    console.log(gl.getShaderInfoLog(fsh));
  }
  cPositionLocation = gl.getAttribLocation(cubeShaderProgram, "aPosition");
  cTexCoordLocation = gl.getAttribLocation(cubeShaderProgram, "aTexCoords");
  cUMatrixLocation = gl.getUniformLocation(cubeShaderProgram, "uMMatrix");
  cPMatrixLocation = gl.getUniformLocation(cubeShaderProgram, "uPMatrix");
  cVMatrixLocation = gl.getUniformLocation(cubeShaderProgram, "uVMatrix");
  cColorLocation = gl.getUniformLocation(cubeShaderProgram, "diffuseTerm");
  cTextureLocation = gl.getUniformLocation(cubeShaderProgram, "imageTexture");
  cUseTextureLocation = gl.getUniformLocation(cubeShaderProgram, "useTexture");
}

function initSkyboxShaders() {
  skyboxShaderProgram = gl.createProgram();
  var vsh = vertexShaderSetup(skyboxVertexShaderCode);
  var fsh = fragmentShaderSetup(skyboxFragmentShaderCode);
  gl.attachShader(skyboxShaderProgram, vsh);
  gl.attachShader(skyboxShaderProgram, fsh);
  gl.linkProgram(skyboxShaderProgram);
  if (!gl.getProgramParameter(skyboxShaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vsh));
    console.log(gl.getShaderInfoLog(fsh));
  }
  sbPositionLocation = gl.getAttribLocation(skyboxShaderProgram, "aPosition");
  sbTexCoordLocation = gl.getAttribLocation(skyboxShaderProgram, "aTexCoords");
  sbUMatrixLocation = gl.getUniformLocation(skyboxShaderProgram, "uMMatrix");
  sbVMatrixLocation = gl.getUniformLocation(skyboxShaderProgram, "uVMatrix");
  sbPMatrixLocation = gl.getUniformLocation(skyboxShaderProgram, "uPMatrix");
  sbColorLocation = gl.getUniformLocation(skyboxShaderProgram, "diffuseTerm");
  sbTextureLocation = gl.getUniformLocation(
    skyboxShaderProgram,
    "imageTexture",
  );
  sbUseTextureLocation = gl.getUniformLocation(
    skyboxShaderProgram,
    "useTexture",
  );
  sbFlipYLocation = gl.getUniformLocation(skyboxShaderProgram, "flipY");
  sbFlipXLocation = gl.getUniformLocation(skyboxShaderProgram, "flipX");
}

function initGlobeShaders() {
  globeShaderProgram = gl.createProgram();
  var vsh = vertexShaderSetup(globeVertexShaderCode);
  var fsh = fragmentShaderSetup(globeFragShaderCode);
  gl.attachShader(globeShaderProgram, vsh);
  gl.attachShader(globeShaderProgram, fsh);
  gl.linkProgram(globeShaderProgram);
  if (!gl.getProgramParameter(globeShaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vsh));
    console.log(gl.getShaderInfoLog(fsh));
  }

  gPositionLocation = gl.getAttribLocation(globeShaderProgram, "aPosition");
  gNormalLocation = gl.getAttribLocation(globeShaderProgram, "aNormal");
  gTexCoordLocation = gl.getAttribLocation(globeShaderProgram, "aTexCoords");

  gMMatrixLocation = gl.getUniformLocation(globeShaderProgram, "uMMatrix");
  gVMatrixLocation = gl.getUniformLocation(globeShaderProgram, "uVMatrix");
  gPMatrixLocation = gl.getUniformLocation(globeShaderProgram, "uPMatrix");
  gNormalMatrixLocation = gl.getUniformLocation(
    globeShaderProgram,
    "uNormalMatrix",
  );
  gLightPosLocation = gl.getUniformLocation(globeShaderProgram, "uLightPos");
  gEyePosLocation = gl.getUniformLocation(globeShaderProgram, "uEyePos");
  gTextureLocation = gl.getUniformLocation(globeShaderProgram, "uTexture");
  gSpecStrengthLocation = gl.getUniformLocation(
    globeShaderProgram,
    "uSpecularStrength",
  );
  gShininessLocation = gl.getUniformLocation(
    globeShaderProgram,
    "uShininess",
  );
}

function initRefractiveCubeShaders() {
  refractiveCubeShaderProgram = gl.createProgram();
  var vsh = vertexShaderSetup(refractiveCubeVertexShaderCode);
  var fsh = fragmentShaderSetup(refractiveCubeFragShaderCode);
  gl.attachShader(refractiveCubeShaderProgram, vsh);
  gl.attachShader(refractiveCubeShaderProgram, fsh);
  gl.linkProgram(refractiveCubeShaderProgram);
  if (!gl.getProgramParameter(refractiveCubeShaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vsh));
    console.log(gl.getShaderInfoLog(fsh));
  }
  // get locations
  rcPositionLocation = gl.getAttribLocation(
    refractiveCubeShaderProgram,
    "aPosition",
  );
  rcNormalLocation = gl.getAttribLocation(
    refractiveCubeShaderProgram,
    "aNormal",
  );
  rcUMMatrixLocation = gl.getUniformLocation(
    refractiveCubeShaderProgram,
    "uMMatrix",
  );
  rcUPMatrixLocation = gl.getUniformLocation(
    refractiveCubeShaderProgram,
    "uPMatrix",
  );
  rcUVMatrixLocation = gl.getUniformLocation(
    refractiveCubeShaderProgram,
    "uVMatrix",
  );
  rcNormalMatrixLocation = gl.getUniformLocation(
    refractiveCubeShaderProgram,
    "uNormalMatrix",
  );
  rcEyePosLocation = gl.getUniformLocation(
    refractiveCubeShaderProgram,
    "uEyePos",
  );
  rcEnvMapLocation = gl.getUniformLocation(
    refractiveCubeShaderProgram,
    "uEnvMap",
  );
  rcRefractiveIndexLocation = gl.getUniformLocation(
    refractiveCubeShaderProgram,
    "uRefractiveIndex",
  );
}

function initPhongShaders() {
  phongShaderProgram = gl.createProgram();
  var vsh = vertexShaderSetup(perFragVertexShaderCode);
  var fsh = fragmentShaderSetup(perFragFragShaderCode);

  if (!vsh || !fsh) {
    console.error("Phong shader compilation failed!");
    return;
  }

  gl.attachShader(phongShaderProgram, vsh);
  gl.attachShader(phongShaderProgram, fsh);
  gl.linkProgram(phongShaderProgram);
  if (!gl.getProgramParameter(phongShaderProgram, gl.LINK_STATUS)) {
    console.log("Phong Shader Link Error:");
    console.log(gl.getProgramInfoLog(phongShaderProgram));
    console.log("Vertex Shader:", gl.getShaderInfoLog(vsh));
    console.log("Fragment Shader:", gl.getShaderInfoLog(fsh));
    return;
  }
  // get locations
  pPositionLocation = gl.getAttribLocation(phongShaderProgram, "aPosition");
  pNormalLocation = gl.getAttribLocation(phongShaderProgram, "aNormal");
  pModelLocation = gl.getUniformLocation(phongShaderProgram, "uModel");
  pProjLocation = gl.getUniformLocation(phongShaderProgram, "uProj");
  pViewLocation = gl.getUniformLocation(phongShaderProgram, "uView");
  pNormalMatrixLocation = gl.getUniformLocation(
    phongShaderProgram,
    "uNormalMatrix",
  );
  pEyePosLocation = gl.getUniformLocation(phongShaderProgram, "uEyePos");
  pLightPosLocation = gl.getUniformLocation(phongShaderProgram, "uLightPos");
  pKAmbientLocation = gl.getUniformLocation(phongShaderProgram, "uKAmbient");
  pKDiffuseLocation = gl.getUniformLocation(phongShaderProgram, "uKDiffuse");
  pKSpecularLocation = gl.getUniformLocation(phongShaderProgram, "uKSpecular");
  pEnvMapLocation = gl.getUniformLocation(phongShaderProgram, "uEnvMap");
  pReflectionMixLocation = gl.getUniformLocation(
    phongShaderProgram,
    "uReflectionMix",
  );
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
      var utex = 1 - j / nstacks;
      var vtex = 1 - i / nslices;

      spVerts.push(radius * xcood, radius * ycoord, radius * zcoord);
      spNormals.push(xcood, ycoord, zcoord);
      spTexCoords.push(utex, vtex);
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

  // buffer for texture coordinates
  spTexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spTexBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spTexCoords), gl.STATIC_DRAW);
  spTexBuf.itemSize = 2;
  spTexBuf.numItems = spTexCoords.length / 2;
}

function initCubeBuffer() {
  // 24 unique vertices (4 per face) so flat coloring per face possible later
  var vertices = [
    // Front
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Back
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    // Top
    -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Bottom
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // Right
    0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
    // Left
    -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5,
  ];

  var indices = [
    0,
    1,
    2,
    0,
    2,
    3, // front
    4,
    5,
    6,
    4,
    6,
    7, // back
    8,
    9,
    10,
    8,
    10,
    11, // top
    12,
    13,
    14,
    12,
    14,
    15, // bottom
    16,
    17,
    18,
    16,
    18,
    19, // right
    20,
    21,
    22,
    20,
    22,
    23, // left
  ];

  cubePositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  cubePositionBuffer.itemSize = 3;
  cubePositionBuffer.numItems = vertices.length / 3;

  cubeIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW,
  );
  cubeIndexBuffer.itemSize = 1;
  cubeIndexBuffer.numItems = indices.length;

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

  cubeNormalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  cubeNormalBuffer.itemSize = 3;
  cubeNormalBuffer.numItems = normals.length / 3;

  // Simple UVs per face (each quad uses full texture range)
  var uvs = [
    // Front
    0, 0, 1, 0, 1, 1, 0, 1,
    // Back
    0, 0, 1, 0, 1, 1, 0, 1,
    // Top
    0, 0, 1, 0, 1, 1, 0, 1,
    // Bottom
    0, 0, 1, 0, 1, 1, 0, 1,
    // Right
    0, 0, 1, 0, 1, 1, 0, 1,
    // Left
    0, 0, 1, 0, 1, 1, 0, 1,
  ];
  cubeTexCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeTexCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  cubeTexCoordBuffer.itemSize = 2;
  cubeTexCoordBuffer.numItems = uvs.length / 2;
}

// Creates a 2x2 plane centered at origin on XZ (Y=0). Scalable via model matrix.
function initPlaneBuffer() {
  var positions = [
    -1.0, 0.0, -1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 1.0,
  ];
  var uvs = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
  var indices = [0, 1, 2, 0, 2, 3];

  planePositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, planePositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  planePositionBuffer.itemSize = 3;
  planePositionBuffer.numItems = positions.length / 3;

  planeTexCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, planeTexCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  planeTexCoordBuffer.itemSize = 2;
  planeTexCoordBuffer.numItems = uvs.length / 2;

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

function initSkyboxTextures() {
  var faces = ["posx", "negx", "posy", "negy", "posz", "negz"];
  var loaded = 0;
  function onFaceLoaded() {
    loaded++;
    if (loaded === faces.length) {
      skyboxReady = true;
      createCubeMap();
      drawScene();
    }
  }
  faces.forEach(function (face) {
    var tex = gl.createTexture();
    tex.image = new Image();
    tex.image.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        tex.image,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      skyboxTextures[face] = tex;
      onFaceLoaded();
    };
    tex.image.src = "Field/" + face + ".jpg";
  });
}

function createCubeMap() {
  // Create cube map texture for environment reflections
  envCubeMap = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, envCubeMap);

  // Map face names to cube map targets
  var faceTargets = {
    posx: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    negx: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
    posy: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
    negy: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
    posz: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
    negz: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
  };

  // Copy each face from the 2D textures to the cube map
  for (var face in faceTargets) {
    if (skyboxTextures[face] && skyboxTextures[face].image) {
      gl.texImage2D(
        faceTargets[face],
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        skyboxTextures[face].image,
      );
    }
  }

  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
}

// ---------------- Teapot JSON model loading (borrowed from simpleLoadObjMesh.js) ----------------
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
  gl.bindBuffer(gl.ARRAY_BUFFER, spTexBuf);
  gl.vertexAttribPointer(
    aTexCoordLocation,
    spTexBuf.itemSize,
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

function drawTeapot() {
  if (!teapotLoaded || !envCubeMap) return;

  gl.useProgram(teapotShaderProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, teapotVertexPositionBuffer);
  gl.enableVertexAttribArray(tPositionLocation);
  gl.vertexAttribPointer(
    tPositionLocation,
    teapotVertexPositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, teapotVertexNormalBuffer);
  gl.enableVertexAttribArray(tNormalLocation);
  gl.vertexAttribPointer(
    tNormalLocation,
    teapotVertexNormalBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, teapotVertexIndexBuffer);

  gl.uniformMatrix4fv(tUMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(tUVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(tUPMatrixLocation, false, pMatrix);

  var normalMatrix = mat3.create();
  mat4.toInverseMat3(mMatrix, normalMatrix);
  mat3.transpose(normalMatrix);
  gl.uniformMatrix3fv(tNormalMatrixLocation, false, normalMatrix);

  gl.uniform3fv(tEyePosLocation, eyePos);
  if (tLightPosLocation) gl.uniform3fv(tLightPosLocation, sphereLightPos);
  if (tSpecStrengthLocation)
    gl.uniform1f(tSpecStrengthLocation, teapotSpecularStrength);
  if (tShininessLocation) gl.uniform1f(tShininessLocation, teapotShininess);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, envCubeMap);
  gl.uniform1i(tEnvMapLocation, 0);

  gl.drawElements(
    gl.TRIANGLES,
    teapotVertexIndexBuffer.numItems,
    gl.UNSIGNED_INT,
    0,
  );

  // Switch back to main (sphere) shader to not break subsequent draws
  gl.useProgram(shaderProgram);
}

function drawCube() {
  if (!cubeIndexBuffer) return;
  gl.drawElements(gl.TRIANGLES, cubeIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
}

function bindCubeGeometry() {
  if (!cubePositionBuffer) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer);
  if (typeof cPositionLocation === "number" && cPositionLocation !== -1) {
    gl.enableVertexAttribArray(cPositionLocation);
    gl.vertexAttribPointer(
      cPositionLocation,
      cubePositionBuffer.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }
  if (
    cubeTexCoordBuffer &&
    typeof cTexCoordLocation === "number" &&
    cTexCoordLocation !== -1
  ) {
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeTexCoordBuffer);
    gl.enableVertexAttribArray(cTexCoordLocation);
    gl.vertexAttribPointer(
      cTexCoordLocation,
      cubeTexCoordBuffer.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
}

function drawRefractiveCube() {
  if (!cubeIndexBuffer || !envCubeMap) return;

  gl.useProgram(refractiveCubeShaderProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer);
  gl.enableVertexAttribArray(rcPositionLocation);
  gl.vertexAttribPointer(
    rcPositionLocation,
    cubePositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuffer);
  gl.enableVertexAttribArray(rcNormalLocation);
  gl.vertexAttribPointer(
    rcNormalLocation,
    cubeNormalBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);

  gl.uniformMatrix4fv(rcUMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(rcUVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(rcUPMatrixLocation, false, pMatrix);

  var normalMatrix = mat3.create();
  mat4.toInverseMat3(mMatrix, normalMatrix);
  mat3.transpose(normalMatrix);
  gl.uniformMatrix3fv(rcNormalMatrixLocation, false, normalMatrix);

  gl.uniform3fv(rcEyePosLocation, eyePos);
  gl.uniform1f(rcRefractiveIndexLocation, 1.52);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, envCubeMap);
  gl.uniform1i(rcEnvMapLocation, 0);

  gl.drawElements(gl.TRIANGLES, cubeIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
}

function drawPhongSphere(color, lightPos, reflectionMix) {
  if (!envCubeMap) return;

  gl.useProgram(phongShaderProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
  gl.enableVertexAttribArray(pPositionLocation);
  gl.vertexAttribPointer(
    pPositionLocation,
    spBuf.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
  gl.enableVertexAttribArray(pNormalLocation);
  gl.vertexAttribPointer(
    pNormalLocation,
    spNormalBuf.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);

  gl.uniformMatrix4fv(pModelLocation, false, mMatrix);
  gl.uniformMatrix4fv(pViewLocation, false, vMatrix);
  gl.uniformMatrix4fv(pProjLocation, false, pMatrix);

  var normalMatrix = mat3.create();
  mat4.toInverseMat3(mMatrix, normalMatrix);
  mat3.transpose(normalMatrix);
  gl.uniformMatrix3fv(pNormalMatrixLocation, false, normalMatrix);

  gl.uniform3fv(pEyePosLocation, eyePos);
  gl.uniform3fv(pLightPosLocation, lightPos);
  gl.uniform3fv(pKAmbientLocation, color);
  gl.uniform3fv(pKDiffuseLocation, color);
  gl.uniform3fv(pKSpecularLocation, [1.0, 1.0, 1.0]);
  gl.uniform1f(pReflectionMixLocation, reflectionMix);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, envCubeMap);
  gl.uniform1i(pEnvMapLocation, 0);

  gl.drawElements(gl.TRIANGLES, spIndexBuf.numItems, gl.UNSIGNED_INT, 0);
}

function drawPlane(material) {
  if (!planePositionBuffer || !planeIndexBuffer) return;
  var prevProgram = gl.getParameter(gl.CURRENT_PROGRAM);
  gl.useProgram(skyboxShaderProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, planePositionBuffer);
  gl.enableVertexAttribArray(sbPositionLocation);
  gl.vertexAttribPointer(
    sbPositionLocation,
    planePositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );

  if (sbTexCoordLocation !== -1 && planeTexCoordBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, planeTexCoordBuffer);
    gl.enableVertexAttribArray(sbTexCoordLocation);
    gl.vertexAttribPointer(
      sbTexCoordLocation,
      planeTexCoordBuffer.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);

  gl.uniformMatrix4fv(sbUMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(sbVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(sbPMatrixLocation, false, pMatrix);

  var useTex = 0;
  var color = [0.6, 0.75, 0.95, 1.0]; // default
  var flipY = 0;
  var flipX = 0;
  if (material) {
    if (material.color) color = material.color;
    if (material.texture) {
      useTex = 1;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, material.texture);
      gl.uniform1i(sbTextureLocation, 0);
    }
    if (material.flipY) flipY = 1;
    if (material.flipX) flipX = 1;
  }
  gl.uniform4fv(sbColorLocation, color);
  gl.uniform1i(sbUseTextureLocation, useTex);
  gl.uniform1i(sbFlipYLocation, flipY);
  if (sbFlipXLocation) gl.uniform1i(sbFlipXLocation, flipX);

  gl.drawElements(
    gl.TRIANGLES,
    planeIndexBuffer.numItems,
    gl.UNSIGNED_SHORT,
    0,
  );
  gl.useProgram(prevProgram);
}

function drawSkybox() {
  if (!skyboxReady) return;
  // Keep original model matrix
  pushMatrix(matrixStack, mMatrix);
  var size = SKYBOX_SIZE;

  // Disable depth write so sky renders behind everything but still gets depth test state for existing depth
  gl.depthMask(false);

  // Helper to draw one face
  function face(transformFn, tex, flip) {
    pushMatrix(matrixStack, mMatrix);
    mMatrix = transformFn(mMatrix);
    // upload matrices inside drawPlane via globals; just call drawPlane with texture
    drawPlane({ texture: tex, color: [1, 1, 1, 1], flipY: flip });
    mMatrix = popMatrix(matrixStack);
  }

  // +X (right): center at (size,0,0), plane facing -X so rotate +90 Z then +90 Y? We'll rotate Y -90 to face inward.
  face(
    function (mm) {
      mm = mat4.translate(mm, [size, 0, 0]);
      mm = mat4.rotate(mm, degToRad(90), [0, 1, 0]);
      mm = mat4.rotate(mm, degToRad(90), [1, 0, 0]); // face inward

      mm = mat4.scale(mm, [size, 1, size]);
      return mm;
    },
    skyboxTextures.posx,
    false,
  );

  // -X (left)
  face(
    function (mm) {
      mm = mat4.translate(mm, [-size, 0, 0]);
      mm = mat4.rotate(mm, degToRad(-90), [0, 1, 0]);
      mm = mat4.rotate(mm, degToRad(90), [1, 0, 0]); // face inward
      mm = mat4.scale(mm, [size, 1, size]);
      return mm;
    },
    skyboxTextures.negx,
    false,
  );

  // +Z (front)
  face(
    function (mm) {
      mm = mat4.translate(mm, [0, 0, size]);
      // facing inward already if plane default normal +Y? Our plane lies on XZ with normal +Y; need to rotate to face -Z.
      // Rotate -90 around X to make plane vertical then 180 around Y to face inward.
      mm = mat4.rotate(mm, degToRad(180), [0, 1, 0]);
      mm = mat4.rotate(mm, degToRad(90), [1, 0, 0]);
      mm = mat4.rotate(mm, degToRad(180), [0, 1, 0]);
      mm = mat4.scale(mm, [size, 1, size]);
      return mm;
    },
    skyboxTextures.posz,
    true,
  );

  // -Z (back)
  face(
    function (mm) {
      mm = mat4.translate(mm, [0, 0, -size]);
      mm = mat4.rotate(mm, degToRad(-180), [0, 1, 0]);
      mm = mat4.rotate(mm, degToRad(90), [1, 0, 0]);
      // facing inward (no 180 rotate) so players sees inside
      mm = mat4.scale(mm, [size, 1, size]);
      return mm;
    },
    skyboxTextures.negz,
    false,
  );

  // +Y (top)
  face(
    function (mm) {
      mm = mat4.translate(mm, [0, size, 0]);
      // plane is XZ with normal +Y; need to rotate 180 around X to face downward interior
      mm = mat4.rotate(mm, degToRad(90), [0, 1, 0]);
      mm = mat4.rotate(mm, degToRad(180), [1, 0, 0]);
      mm = mat4.scale(mm, [size, 1, size]);
      return mm;
    },
    skyboxTextures.posy,
    false,
  ); // often needs vertical flip

  // -Y (bottom)
  face(
    function (mm) {
      mm = mat4.translate(mm, [0, -size, 0]);
      mm = mat4.rotate(mm, degToRad(90), [0, 1, 0]);
      // plane normal +Y currently points up; we want it to face upward into box? For interior bottom we keep as is.
      mm = mat4.scale(mm, [size, 1, size]);
      return mm;
    },
    skyboxTextures.negy,
    false,
  ); // often needs vertical flip

  gl.depthMask(true);
  mMatrix = popMatrix(matrixStack);
}

// Helper to draw the textured sphere "globe" with specular highlights.
function drawGlobe() {
  if (!sampleTexture || !globeShaderProgram) return;

  var prevProgram = gl.getParameter(gl.CURRENT_PROGRAM);
  gl.useProgram(globeShaderProgram);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.scale(mMatrix, [1.2, 1.2, 1.2]);

  if (typeof gPositionLocation === "number" && gPositionLocation !== -1) {
    gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
    gl.enableVertexAttribArray(gPositionLocation);
    gl.vertexAttribPointer(
      gPositionLocation,
      spBuf.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }

  if (typeof gNormalLocation === "number" && gNormalLocation !== -1) {
    gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
    gl.enableVertexAttribArray(gNormalLocation);
    gl.vertexAttribPointer(
      gNormalLocation,
      spNormalBuf.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }

  if (typeof gTexCoordLocation === "number" && gTexCoordLocation !== -1) {
    gl.bindBuffer(gl.ARRAY_BUFFER, spTexBuf);
    gl.enableVertexAttribArray(gTexCoordLocation);
    gl.vertexAttribPointer(
      gTexCoordLocation,
      spTexBuf.itemSize,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);

  if (gMMatrixLocation) gl.uniformMatrix4fv(gMMatrixLocation, false, mMatrix);
  if (gVMatrixLocation) gl.uniformMatrix4fv(gVMatrixLocation, false, vMatrix);
  if (gPMatrixLocation) gl.uniformMatrix4fv(gPMatrixLocation, false, pMatrix);

  var normalMatrix = mat3.create();
  mat4.toInverseMat3(mMatrix, normalMatrix);
  mat3.transpose(normalMatrix);
  if (gNormalMatrixLocation)
    gl.uniformMatrix3fv(gNormalMatrixLocation, false, normalMatrix);

  if (gLightPosLocation) gl.uniform3fv(gLightPosLocation, sphereLightPos);
  if (gEyePosLocation) gl.uniform3fv(gEyePosLocation, eyePos);
  if (gSpecStrengthLocation)
    gl.uniform1f(gSpecStrengthLocation, globeSpecularStrength);
  if (gShininessLocation)
    gl.uniform1f(gShininessLocation, globeShininess);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sampleTexture);
  if (gTextureLocation) gl.uniform1i(gTextureLocation, 0);

  gl.drawElements(gl.TRIANGLES, spIndexBuf.numItems, gl.UNSIGNED_INT, 0);

  mMatrix = popMatrix(matrixStack);
  gl.useProgram(prevProgram);
}

// Draw four wooden legs around the table center using the cube shader.
// Assumes current mMatrix has the table translation applied (but NOT the table top scale).
function drawLegs() {
  var prevProgram = gl.getParameter(gl.CURRENT_PROGRAM);
  gl.useProgram(cubeShaderProgram);
  // view & projection (once)
  gl.uniformMatrix4fv(cVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(cPMatrixLocation, false, pMatrix);

  // Base scale for leg thickness/height relative to current mMatrix
  pushMatrix(matrixStack, mMatrix); // push untranslated table frame
  mMatrix = mat4.scale(mMatrix, [0.5, 5.0, 0.5]);
  // We'll position each leg by translating from this scaled origin
  for (var i = 0; i < 4; i++) {
    pushMatrix(matrixStack, mMatrix);
    var angle = degToRad(i * 90 + 45);
    // Radius chosen to spread legs; adjust if needed
    var radius = 8.0;
    mMatrix = mat4.translate(mMatrix, [
      radius * Math.cos(angle),
      -0.5,
      radius * Math.sin(angle),
    ]);
    bindCubeGeometry();
    gl.uniformMatrix4fv(cUMatrixLocation, false, mMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, woodTexture);
    gl.uniform1i(cTextureLocation, 0);
    gl.uniform1i(cUseTextureLocation, 1);
    drawCube();
    mMatrix = popMatrix(matrixStack);
  }
  mMatrix = popMatrix(matrixStack);
  gl.useProgram(prevProgram);
}

function initTextures(textureFile) {
  var tex = gl.createTexture();
  tex.image = new Image();
  tex.image.src = textureFile;
  tex.image.onload = function () {
    handleTextureLoaded(tex);
  };
  return tex;
}

function handleTextureLoaded(texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

  var format = texture.image.src.endsWith(".png") ? gl.RGBA : gl.RGB;

  gl.texImage2D(
    gl.TEXTURE_2D, // 2D texture
    0, // mipmap level
    format, // internal format
    format, // format
    gl.UNSIGNED_BYTE, // type of data
    texture.image, // array or <img>
  );

  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );

  drawScene();
}

function drawScene() {
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clearColor(0.8, 0.8, 0.8, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  mat4.identity(mMatrix);
  mat4.identity(vMatrix);
  vMatrix = mat4.lookAt(eyePos, [xCam, yCam, zCam], [0, 1, 0], vMatrix);

  mat4.identity(pMatrix);
  mat4.perspective(60, 1.0, 0.01, 1000, pMatrix);

  mMatrix = mat4.rotate(mMatrix, degToRad(zAngle), [0, 1, 0]);
  mMatrix = mat4.rotate(mMatrix, degToRad(yAngle), [1, 0, 0]);

  drawSkybox();
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [1.5, -0.4, 2]);
  mMatrix = mat4.scale(mMatrix, [0.7, 0.7, 0.7]);
  drawGlobe();
  mMatrix = popMatrix(matrixStack);

  if (teapotLoaded) {
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-1.5, 0.5, 0.0]);
    mMatrix = mat4.scale(mMatrix, [0.2, 0.2, 0.2]);
    drawTeapot();
    mMatrix = popMatrix(matrixStack);
  }

  gl.useProgram(cubeShaderProgram);
  gl.uniformMatrix4fv(cVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(cPMatrixLocation, false, pMatrix);

  // draw textured (or colored) cubes
  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [2.5, -0.1, -0.5]);
  mMatrix = mat4.scale(mMatrix, [1.8, 1.8, 1.8]);
  gl.uniformMatrix4fv(cUMatrixLocation, false, mMatrix);
  gl.uniform1i(cUseTextureLocation, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fenceTexture);
  gl.uniform1i(cTextureLocation, 0);
  bindCubeGeometry();
  drawCube();
  mMatrix = popMatrix(matrixStack);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [2.5, -0.3, -0.5]);
  mMatrix = mat4.scale(mMatrix, [0.6, 0.6, 0.6]);
  var blueColor = [0.0, 0.0, 0.4];
  var reflectionMix = 0.6;
  drawPhongSphere(blueColor, sphereLightPos, reflectionMix);
  mMatrix = popMatrix(matrixStack);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [-1, 0.0, 3.0]);
  mMatrix = mat4.scale(mMatrix, [1, 2, 0.1]);
  drawRefractiveCube();
  mMatrix = popMatrix(matrixStack);

  gl.useProgram(shaderProgram);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.translate(mMatrix, [0.0, -1.2, 0.0]);

  pushMatrix(matrixStack, mMatrix);
  mMatrix = mat4.scale(mMatrix, [5, 0.1, 5]);
  bindSphereGeometry();
  gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
  gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
  gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, woodTexture);
  gl.uniform1i(uTextureLocation, 0);
  gl.uniform1i(uUseTextureLocation, 1);
  drawSphere();
  mMatrix = popMatrix(matrixStack);
  // Draw wooden legs
  drawLegs();
  // Pop table translation
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
    zAngle = zAngle + diffX / 5;
    prevMouseX = mouseX;

    var mouseY = canvas.height - event.clientY;
    var diffY = mouseY - prevMouseY;
    yAngle = yAngle - diffY / 5;
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

// This is the entry point from the html
function webGLStart() {
  canvas = document.getElementById("3DTextureMapExample");
  document.addEventListener("mousedown", onMouseDown, false);

  initGL(canvas);
  shaderProgram = initShaders();
  initTeapotShaders();
  initCubeShaders();
  initSkyboxShaders();
  initGlobeShaders();
  initRefractiveCubeShaders();
  initPhongShaders();

  aPositionLocation = gl.getAttribLocation(shaderProgram, "aPosition");
  aTexCoordLocation = gl.getAttribLocation(shaderProgram, "aTexCoords");

  uMMatrixLocation = gl.getUniformLocation(shaderProgram, "uMMatrix");
  uPMatrixLocation = gl.getUniformLocation(shaderProgram, "uPMatrix");
  uVMatrixLocation = gl.getUniformLocation(shaderProgram, "uVMatrix");

  uTextureLocation = gl.getUniformLocation(shaderProgram, "imageTexture");
  uDiffuseTermLocation = gl.getUniformLocation(shaderProgram, "diffuseTerm");
  uUseTextureLocation = gl.getUniformLocation(shaderProgram, "useTexture");

  gl.enableVertexAttribArray(aPositionLocation);
  gl.enableVertexAttribArray(aTexCoordLocation);

  initSphereBuffer();
  sampleTexture = initTextures(textureFile);
  woodTexture = initTextures("wood_texture.jpg");
  fenceTexture = initTextures("fence_alpha.png");

  initCubeBuffer();
  initPlaneBuffer();
  initSkyboxTextures();

  // load teapot model asynchronously
  initTeapot();
  drawScene();
}
