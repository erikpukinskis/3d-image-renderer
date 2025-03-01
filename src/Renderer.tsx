const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = 300;

const FULL_SCREEN_QUAD = new Float32Array([
  -1.0,
  -1.0,
  0.0, // bottom left
  1.0,
  -1.0,
  0.0, // bottom right
  -1.0,
  1.0,
  0.0, // top left
  -1.0,
  1.0,
  0.0, // top left
  1.0,
  -1.0,
  0.0, // bottom right
  1.0,
  1.0,
  0.0, // top right
]);

export const Renderer: React.FC = () => {
  const render = (canvas: HTMLCanvasElement) => {
    if (!canvas) return;

    console.log("Rendering canvas");

    // Initialize the GL context
    const gl = canvas.getContext("webgl", {
      antialias: false,
    });

    if (!gl) {
      throw new Error("Could not get WebGL context");
    }

    const shaderProgram = createShaderProgram(gl);

    // useProgram is similar to bindBuffer, since we can only have one program
    // going at a time we need to tell OpenGL which is up.
    gl.useProgram(shaderProgram);
    gl.viewport(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Set the resolution uniform
    const resolutionLocation = gl.getUniformLocation(
      shaderProgram,
      "uResolution"
    );
    gl.uniform2f(resolutionLocation, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Set the quad uniforms
    const p00Location = gl.getUniformLocation(shaderProgram, "uP00");
    gl.uniform3f(p00Location, -1, -1, -1);

    const p01Location = gl.getUniformLocation(shaderProgram, "uP01");
    gl.uniform3f(p01Location, -1, 1, -1);

    const p10Location = gl.getUniformLocation(shaderProgram, "uP10");
    gl.uniform3f(p10Location, 1, -1, -1);

    const p11Location = gl.getUniformLocation(shaderProgram, "uP11");
    gl.uniform3f(p11Location, 1, 1, -1);

    // Draw
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, FULL_SCREEN_QUAD, gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(shaderProgram, "aPosition");

    gl.vertexAttribPointer(
      positionLocation,
      3, // size (x,y,z)
      gl.FLOAT,
      false,
      0, // no stride needed, just consecutive vertices
      0 // no offset needed
    );

    gl.enableVertexAttribArray(positionLocation);

    console.log("Drawing screen quad triangles");
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return (
    <canvas ref={render} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}></canvas>
  );
};

function createShaderProgram(gl: WebGLRenderingContext) {
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Could not create WebGL program");
  }

  // The vertex shader is what tells the GPU where our verticies are, based on
  // whatever world data we feed it
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, V_FULL_SCREEN_QUAD);

  // The fragment shader renders all of the pixels inside that geometry
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, F_QUAD_RAY_CAST);

  gl.attachShader(program, vertexShader);

  gl.attachShader(program, fragmentShader);

  // The program has to be "linked" before it can be "used". There's not a lot
  // of documentation out there, but it seems to be another kind of compile step
  // that just checks that the vertex and fragment shaders are both there and
  // make sense together. Also, after the program is in use we can modify the
  // individual shaders, but those changes won't take effect until we call
  // linkProgram again.
  gl.linkProgram(program);

  return program;
}

/**
 * This is pretty much the simplest possible vertex shader. It just proxies
 * through verticies.
 */
const V_FULL_SCREEN_QUAD = `
  attribute vec4 aPosition; // Vertex data from the buffer
  varying vec4 vPosition; // Passed to the fragment shader

  void main() {
    vPosition = aPosition;
    gl_Position = aPosition;
  }     
`;

/**
 * Renders a sphere
 */
// const F_SPHERE_RAY_CAST = `
//   precision mediump float;
//   uniform vec2 uResolution;
//   varying vec4 vPosition;    // Interpolated position for this pixel

//   void mainImage(out vec4 fragColor, in vec2 fragCoord) {
//       // Convert from pixel coordinates to uv
//       vec2 uv = fragCoord/uResolution.xy;

//       // Convert to normalized device coordinates
//       vec2 ndc = uv * 2.0 - 1.0;

//       // (kx^2 + ky^2)t^2 + (2(vxkx + vyky))t + (vx^2 + vy^2 - r^2) = 0
//       // where
//       // v(x,y) = ray origin
//       // k(x,y) = ray direction
//       // r = radius of the sphere
//       // t = hit distance

//       vec3 rayDirection = vec3(ndc, -1.0);
//       vec3 rayOrigin = vec3(0.0, 0.0, 2.0);
//       float radius = 1.0;

//       // Terms from the quadratic equation:
//       float a = dot(rayDirection, rayDirection);
//       float b = 2.0 * dot(rayOrigin, rayDirection);
//       float c = dot(rayOrigin,rayOrigin) - radius * radius;

//       float discriminant = b * b - 4.0 * a * c;

//       if (discriminant < 0.0) {
//           fragColor = vec4(0.0, 0.0, 0.0, 1.0);
//       } else {
//           fragColor = vec4(1.0, 0.0, 1.0, 1.0);
//       }
//   }

//   // This is similar boilerplate to what ShaderToy uses
//   void main() {
//       // mainImage writes to this temporary variable
//       vec4 color;

//       mainImage(color, gl_FragCoord.xy);

//       // gl_FragCoord is a built-in variable that contains the pixel coordinates
//       gl_FragColor = color;
//   }
// `;

/**
 * Renders a quad
 */
const F_QUAD_RAY_CAST = `
  precision mediump float;
  uniform vec2 uResolution;
  uniform vec3 uP00;
  uniform vec3 uP01;
  uniform vec3 uP10;
  uniform vec3 uP11;

  // Interpolated position for this pixel
  varying vec4 vPosition;

  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      // Some colors for clarity:
      vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
      vec4 magenta = vec4(1.0, 0.0, 1.0, 1.0);

      // Convert from pixel coordinates to uv
      vec2 uv = fragCoord/uResolution.xy;

      // Convert to normalized device coordinates
      vec2 ndc = uv * 2.0 - 1.0;

      vec3 anyPointOnPlane = uP00;
      vec3 rayOrigin = vec3(0.0);
      // n = (p10​ − p00​) × (p01​ − p00​)
      vec3 normal = cross(uP10 - uP00, uP01 - uP00);
      vec3 rayDirection = vec3(ndc, -1.0);

      // Equation for calculating whether the ray intersects the plane:
      // t = ((a-p0) dot n)/(v dot n)
      // where
      // a = point on the plane
      // p0 = plane origin
      // n = plane normal
      // v = ray direction
      float t = dot(anyPointOnPlane - rayOrigin, normal) / dot(rayDirection, normal);

      if (t < 0.0) {
        fragColor = black;
      } else {
        fragColor = magenta;
      }

      // do a slab test
  }

  // This is similar boilerplate to what ShaderToy uses
  void main() {
      // mainImage writes to this temporary variable
      vec4 color;

      mainImage(color, gl_FragCoord.xy);

      // gl_FragCoord is a built-in variable that contains the pixel coordinates
      gl_FragColor = color;
  }
`;

function createShader(
  gl: WebGLRenderingContext,
  shaderType: number,
  source: string
) {
  const shader = gl.createShader(shaderType);

  if (!shader) {
    throw new Error(`Could not create type ${shaderType}shader`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  checkCompileStatus(gl, shader);

  return shader;
}

function checkCompileStatus(gl: WebGLRenderingContext, shader: WebGLShader) {
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Unknown issue compiling shader"
    );
  }
}
