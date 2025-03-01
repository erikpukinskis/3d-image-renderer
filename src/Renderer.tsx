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
    gl.uniform3f(p00Location, -1, -1, -2);

    const p01Location = gl.getUniformLocation(shaderProgram, "uP01");
    gl.uniform3f(p01Location, -1, 1, -2);

    const p10Location = gl.getUniformLocation(shaderProgram, "uP10");
    gl.uniform3f(p10Location, 1, -1, -2);

    const p11Location = gl.getUniformLocation(shaderProgram, "uP11");
    gl.uniform3f(p11Location, 1, 1, -2);

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

  // Some colors for clarity:
  vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
  vec4 magenta = vec4(1.0, 0.0, 1.0, 1.0);
  
  void paintPointWithinQuad(out vec4 fragColor, in vec3 pIntersection, in vec3 normal) {

    // Slab Test
    // —————————
    // For a point P and a line segment from A to B, you can determine which
    // side P is on using:
    //
    //     orientation = (P - A) · perp(B - A)
    //
    // Where perp is the perpendicular vector (in 2D this would be like
    // turning 90 degrees). This is called an edge test.
    //
    //  - If > 0: P is on one side
    //  - If < 0: P is on the other side
    //  - If = 0: P is exactly on the line
    //
    // So for your quad, you could:
    //
    //  1. Take two opposite edges
    //  2. Check if P is on the correct side of both
    //  3. Do the same for the other two edges
    //
    // If all four tests pass, P is inside the quad.

    // Edge tests (Clockwise traversal)
    // p00->p01
    float orientationA = dot(pIntersection - uP00, cross(uP01 - uP00, normal));
    // p01->p11
    float orientationB = dot(pIntersection - uP01, cross(uP11 - uP01, normal));
    // p11->p10
    float orientationC = dot(pIntersection - uP11, cross(uP10 - uP11, normal));
    // p10->p00
    float orientationD = dot(pIntersection - uP10, cross(uP00 - uP10, normal));

   if (orientationA < 0.0 || orientationB < 0.0 || orientationC < 0.0 || orientationD < 0.0) {
      fragColor = black;
    } else {
      fragColor = magenta;
    }
  }
    
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      // Convert from pixel coordinates to uv
      vec2 uv = fragCoord/uResolution.xy;

      // Convert to normalized device coordinates
      vec2 ndc = uv * 2.0 - 1.0;

      vec3 anyPointOnPlane = uP00;
      vec3 rayOrigin = vec3(0.0);
      // n = (p10​ − p00​) × (p01​ − p00​)
      vec3 normal = cross(uP10 - uP00, uP01 - uP00);
      vec3 rayDirection = vec3(ndc, -1.0);

      // Ray-plane intersection test
      // ———————————————————————————
      // 
      // In https://www.youtube.com/watch?v=x_SEyKtCBPU, we derived the equation:
      //
      //     t = ((a-p0) dot n)/(v dot n)
      //
      //     a = point on the plane
      //     n = plane normal
      //     p0 = ray origin
      //     v = ray direction
      //
      // We can then say:
      //
      // - If t < 0: v intersects the plane
      // - If t >= 0: v does not intersect the plane
      // 
      // And the point of intersection is:
      //
      //      b = tv
      //

      float denomenator = dot(rayDirection, normal);
      float t = dot(anyPointOnPlane - rayOrigin, normal) / denomenator;
      vec3 pIntersection = t * rayDirection;

      if (t < 0.0) {
        fragColor = black;
      } else {
        paintPointWithinQuad(fragColor, pIntersection, normal);
      }
  }

  // This is similar to ShaderToy's boilerplate:
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
