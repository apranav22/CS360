// Global variables
let gl;
let canvas;
let shaderProgram;
let vertexBuffer;
let lightPosition = 0.0;
let currentRenderMode = 0; // 0: Phong, 1: Phong+Reflection, 2: Phong+Shadow, 3: Phong+Shadow+Reflection

// Vertex shader - creates a full-screen quad
const vertexShaderSource = `#version 300 es
in vec2 aPosition;
out vec2 vUV;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vUV = aPosition * 0.5 + 0.5;
}
`;

// Fragment shader - implements the entire ray tracer
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

// Uniforms
uniform float uLightPosition;
uniform int uRenderMode;
uniform vec2 uResolution;

// Constants
const int MAX_SPHERES = 7;
const int MAX_BOUNCES = 3;
const float EPSILON = 0.001;
const float MAX_DIST = 1000.0;

// Camera
const vec3 cameraPos = vec3(0.0, 3.0, 10.0);
const vec3 cameraTarget = vec3(0.0, 0.0, 0.0);
const vec3 cameraUp = vec3(0.0, 1.0, 0.0);
const float fov = 45.0;

// Sphere data now comes from uniforms (this is the fix)
uniform vec3  sphereCenter[MAX_SPHERES];
uniform float sphereRadius[MAX_SPHERES];
uniform vec3  sphereColor[MAX_SPHERES];
uniform float sphereShininess[MAX_SPHERES];
uniform float sphereReflectivity[MAX_SPHERES];
uniform float uAmbientStrength; // 0.0 to ~0.4

// Structures
struct Ray { vec3 origin; vec3 direction; };
struct HitInfo { bool hit; float t; vec3 point; vec3 normal; int i; };

bool raySphereIntersect(Ray r, int si, out float t) {
    vec3 oc = r.origin - sphereCenter[si];
    float a = dot(r.direction, r.direction);
    float b = 2.0 * dot(oc, r.direction);
    float c = dot(oc, oc) - sphereRadius[si] * sphereRadius[si];
    float d = b*b - 4.0*a*c;
    if (d < 0.0) return false;
    float s = sqrt(d);
    float t0 = (-b - s) / (2.0*a);
    float t1 = (-b + s) / (2.0*a);
    if (t0 > EPSILON) { t = t0; return true; }
    if (t1 > EPSILON) { t = t1; return true; }
    return false;
}

HitInfo findClosestIntersection(Ray r) {
    HitInfo h; h.hit = false; h.t = MAX_DIST; h.i = -1;
    for (int i = 0; i < MAX_SPHERES; i++) {
        float t;
        if (raySphereIntersect(r, i, t) && t < h.t) {
            h.hit = true; h.t = t; h.i = i;
            h.point = r.origin + t * r.direction;
            h.normal = normalize(h.point - sphereCenter[i]);
        }
    }
    return h;
}

bool isInShadow(vec3 p, vec3 L, vec3 lightPos) {
    Ray sRay;
    sRay.origin = p + EPSILON * L;
    sRay.direction = L;
    float maxDist = length(lightPos - p);
    for (int i = 0; i < MAX_SPHERES; i++) {
        float t;
        if (raySphereIntersect(sRay, i, t) && t < maxDist) return true;
    }
    return false;
}

vec3 shade(HitInfo h, vec3 viewDir, vec3 lightPos, bool useShadow) {
    vec3 base = sphereColor[h.i];

    // --- AMBIENT (always applied, independent of shadows or reflection) ---
    vec3 color = uAmbientStrength * base;

    // Lighting direction
    vec3 L = normalize(lightPos - h.point);

    // Shadow test
    if (!(useShadow && isInShadow(h.point, L, lightPos))) {
        // Diffuse
        float diff = max(dot(h.normal, L), 0.0);
        color += diff * base;

        // Specular (with optional intensity boost)
        float spec = pow(max(dot(viewDir, reflect(-L, h.normal)), 0.0), 0.8 *sphereShininess[h.i]);
        float specIntensity = 1.5;   // Increase this to make highlights stronger
        color += specIntensity * spec * vec3(1.0); 
    }

    return color;
}

vec3 trace(Ray r, int depth, bool refl, bool sh) {
    vec3 col = vec3(0.0);
    vec3 fac = vec3(1.0);
    vec3 lightPos = vec3(uLightPosition, 5.0, 5.0);

    for (int bounce = 0; bounce < depth; bounce++) {
        HitInfo h = findClosestIntersection(r);
        if (!h.hit) break;

        vec3 viewDir = normalize(-r.direction);
        vec3 ph = shade(h, viewDir, lightPos, sh);

        float reflAmt = sphereReflectivity[h.i];
        if (refl && bounce < depth - 1 && reflAmt > 0.0) {
            col += fac * (1.0 - reflAmt) * ph;
            fac *= reflAmt;
            r.origin = h.point + EPSILON * h.normal;
            r.direction = reflect(r.direction, h.normal);
        } else {
            col += fac * ph;
            break;
        }
    }
    return col;
}

void main() {
    float aspect = uResolution.x / uResolution.y;
    float scale = tan(radians(fov*0.5));
    vec2 ndc = vUV * 2.0 - 1.0;

    vec3 f = normalize(cameraTarget - cameraPos);
    vec3 r = normalize(cross(f, cameraUp));
    vec3 u = cross(r, f);

    Ray ray;
    ray.origin = cameraPos;
    ray.direction = normalize(ndc.x * scale * aspect * r + ndc.y * scale * u + f);

    bool refl = (uRenderMode == 1 || uRenderMode == 3);
    bool sh = (uRenderMode == 2 || uRenderMode == 3);
    int depth = refl ? MAX_BOUNCES : 1;

    vec3 col = trace(ray, depth, refl, sh);
    // col = pow(col, vec3(1.0/2.2));
    outColor = vec4(col, 1.0);
}`;

function setSphere(i, center, radius, color, shininess, reflectivity) {
  gl.uniform3fv(
    gl.getUniformLocation(shaderProgram, `sphereCenter[${i}]`),
    center,
  );
  gl.uniform1f(
    gl.getUniformLocation(shaderProgram, `sphereRadius[${i}]`),
    radius,
  );
  gl.uniform3fv(
    gl.getUniformLocation(shaderProgram, `sphereColor[${i}]`),
    color,
  );
  gl.uniform1f(
    gl.getUniformLocation(shaderProgram, `sphereShininess[${i}]`),
    shininess,
  );
  gl.uniform1f(
    gl.getUniformLocation(shaderProgram, `sphereReflectivity[${i}]`),
    reflectivity,
  );
}

// Initialize WebGL
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
// Create and compile shader
function createShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

// Initialize shaders
function initShaders() {
  shaderProgram = gl.createProgram();

  const vertexShader = createShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fragmentShader = createShader(
    gl,
    fragmentShaderSource,
    gl.FRAGMENT_SHADER,
  );

  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.bindAttribLocation(shaderProgram, 0, "aPosition");
  gl.linkProgram(shaderProgram);
  // check for compiiion and linking status
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getShaderInfoLog(vertexShader));
    console.log(gl.getShaderInfoLog(fragmentShader));
  }

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error("Could not initialize shaders");
    return null;
  }

  gl.useProgram(shaderProgram);
  setSphere(0, [-1.0, 0.0, -2.0], 1.0, [0.53, 0.15, 0.57], 32.0, 0.3);
  setSphere(1, [0.0, 2.5, -0.5], 1.0, [0.3, 0.3, 1.0], 64.0, 0.4);
  setSphere(2, [1.5, 2.2, 0.8], 1.0, [0.3, 0.5, 0.8], 128.0, 0.5);
  setSphere(3, [-1.5, 1.5, -0.5], 1.0, [0.32, 0.12, 0.55], 16.0, 0.2);
  setSphere(4, [2.0, 0.5, 1.5], 1.0, [0.3, 0.8, 0.8], 256.0, 0.6);
  setSphere(5, [-1.0, -1.0, 2.0], 1.0, [0.2, 0.95, 0.2], 8.0, 0.25);
  setSphere(6, [0.8, -1.0, 1.8], 1.0, [0.1, 0.5, 0.2], 48.0, 0.35);

  // Set resolution uniform
  gl.uniform2f(
    gl.getUniformLocation(shaderProgram, "uResolution"),
    canvas.width,
    canvas.height,
  );

  // Set light and render mode uniforms
  gl.uniform1f(gl.getUniformLocation(shaderProgram, "uLightPosition"), 0.0);
  gl.uniform1i(gl.getUniformLocation(shaderProgram, "uRenderMode"), 3);
  gl.uniform1f(gl.getUniformLocation(shaderProgram, "uAmbientStrength"), 0.5);

  // Get attribute and uniform locations
  shaderProgram.aPositionLocation = gl.getAttribLocation(
    shaderProgram,
    "aPosition",
  );
  shaderProgram.uLightPositionLocation = gl.getUniformLocation(
    shaderProgram,
    "uLightPosition",
  );
  shaderProgram.uRenderModeLocation = gl.getUniformLocation(
    shaderProgram,
    "uRenderMode",
  );

  return shaderProgram;
}

// Initialize buffers
function initBuffers() {
  vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  // 6 vertices = 2 triangles = fullscreen quad
  const vertices = new Float32Array([
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
  ]);

  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const loc = gl.getAttribLocation(shaderProgram, "aPosition");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

// Draw the scene
function drawScene() {
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clearColor(0.9, 0.9, 0.9, 1);

  gl.clear(gl.COLOR_BUFFER_BIT);

  // Bind the vertex buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(
    shaderProgram.aPositionLocation,
    vertexBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.enableVertexAttribArray(shaderProgram.aPositionLocation);

  // Set uniforms
  gl.uniform1f(shaderProgram.uLightPositionLocation, lightPosition);
  gl.uniform1i(shaderProgram.uRenderModeLocation, currentRenderMode);

  // Draw the quad using triangle strip
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Set light position (called from HTML)
function setLightPosition(value) {
  lightPosition = value;
  drawScene();
}

// Toggle animation (called from HTML)
let animationId = null;
let isAnimating = false;

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

function animate() {
  if (!isAnimating) return;

  // Animate light position
  lightPosition = Math.sin(Date.now() * 0.001) * 10.0;

  // Update the slider value
  const slider = document.getElementById("lightSlider");
  if (slider) {
    slider.value = lightPosition;
  }

  drawScene();
  animationId = requestAnimationFrame(animate);
}

// Initialize button handlers
function initButtonHandlers() {
  // Get all existing buttons from the HTML
  const buttons = document.querySelectorAll("button");

  if (buttons.length !== 4) {
    console.error("Expected 4 buttons for render modes");
    return;
  }

  const modes = [
    { name: "Phong", mode: 0 },
    { name: "Phong+Reflection", mode: 1 },
    { name: "Phong+Shadow", mode: 2 },
    { name: "Phong+Shadow+Reflection", mode: 3 },
  ];

  // Add click handlers to existing buttons
  buttons.forEach((button, index) => {
    const mode = modes[index].mode;

    button.addEventListener("click", () => {
      currentRenderMode = mode;
      // Update button styles
      buttons.forEach((btn, idx) => {
        btn.style.backgroundColor = idx === mode ? "#4CAF50" : "";
        btn.style.color = idx === mode ? "white" : "";
      });
      drawScene();
    });

    // Set initial active button
    if (mode === 0) {
      button.style.backgroundColor = "#4CAF50";
      button.style.color = "white";
    }
  });

  // Set up the light slider
  const lightSlider = document.getElementById("lightSlider");
  if (lightSlider) {
    lightSlider.addEventListener("input", (e) => {
      lightPosition = parseFloat(e.target.value);
      drawScene();
    });
  }
}

// Main entry point
function webGLStart() {
  canvas = document.getElementById("rayTracerCanvas");
  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  initGL(canvas);

  if (!gl) {
    return;
  }

  shaderProgram = initShaders();

  if (!shaderProgram) {
    return;
  }

  initBuffers();
  initButtonHandlers();

  // Set initial render mode
  currentRenderMode = 0;

  // Initial draw
  drawScene();
}

// Make functions available globally for HTML callbacks
window.webGLStart = webGLStart;
window.setLightPosition = setLightPosition;
window.toggleAnimation = toggleAnimation;
