// Note: using gl-matrix 4.0-beta
import { Mat4 } from "gl-matrix";

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
    const quadLocation = gl.getUniformLocation(shaderProgram, "uQuad");
    gl.uniform3fv(
      quadLocation,
      [
        // p00
        -1, -1, 0,
        // p01
        -1, 1, 0,
        // p10,
        1, -1, 0,
        // p11
        1, 1, 0,
      ]
    );

    // Set the camera uniform(s)
    // ————————————————————————
    // These are world-relative transforms that will apply to the whole world,
    // which is a little confusing. I am not super clear on what are best
    // practices for this matrix. Seems like gl-matrix uses a lookAt helper,
    // which makes this whole question go away. But I would like to understand
    // it deeply.
    const tx = 0;
    const ty = 0;
    const tz = -2;

    /**
     *    1  0  0  tx
     *    0  1  0  ty
     *    0  0  1  tz
     *    0  0  0  1
     */
    const translationMatrix = new Mat4(
      // x column
      1,
      0,
      0,
      0,
      // y column
      0,
      1,
      0,
      0,
      // z column
      0,
      0,
      1,
      0,
      // w column
      tx,
      ty,
      tz,
      1
    );

    const xRotation = 0;
    const yRotation = 0;

    /**
     * Rotation about the y-axis by angle a (radians):
     * https://en.wikipedia.org/wiki/Rotation_matrix#Basic_3D_rotations
     *
     * cos(a)   0   sin(a)
     *   0      1     0
     * -sin(a)  0   cos(a)
     */
    const yRotationMatrix = new Mat4(
      // x column
      Math.cos(yRotation),
      0,
      -1 * Math.sin(yRotation),
      0,
      // y column
      0,
      1,
      0,
      0,
      // z column
      Math.sin(yRotation),
      0,
      Math.cos(yRotation),
      0,
      // w column
      0,
      0,
      0,
      1
    );

    /**
     * Rotation about the y-axis by angle a (radians):
     * https://en.wikipedia.org/wiki/Rotation_matrix#Basic_3D_rotations
     *
     *   1     0       0
     *   0   cos(a)  -sin(a)
     *   0   sin(a)   cos(a)
     */
    const xRotationMatrix = new Mat4(
      // x column
      1,
      0,
      0,
      0,
      // y column
      0,
      Math.cos(xRotation),
      Math.sin(xRotation),
      0,
      // z column
      0,
      -1 * Math.sin(xRotation),
      Math.cos(xRotation),
      0,
      // w column
      0,
      0,
      0,
      1
    );

    const projectionLocation = gl.getUniformLocation(
      shaderProgram,
      "uProjection"
    );

    const projectionMatrix = new Mat4();
    Mat4.multiply(projectionMatrix, translationMatrix, yRotationMatrix);
    Mat4.multiply(projectionMatrix, projectionMatrix, xRotationMatrix);
    gl.uniformMatrix4fv(projectionLocation, false, projectionMatrix);

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
  uniform vec3 uQuad[4];
  uniform mat4 uProjection;

  // Interpolated position for this pixel
  varying vec4 vPosition;

  // Some colors for clarity:
  vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
  vec4 magenta = vec4(1.0, 0.0, 1.0, 1.0);
  
  void paintPointWithinQuad(out vec4 fragColor, in vec3 pIntersection, in vec3 normal, in vec3 p00, in vec3 p01, in vec3 p10, in vec3 p11) {

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
    float orientationA = dot(pIntersection - p00, cross(p01 - p00, normal));
    // p01->p11
    float orientationB = dot(pIntersection - p01, cross(p11 - p01, normal));
    // p11->p10
    float orientationC = dot(pIntersection - p11, cross(p10 - p11, normal));
    // p10->p00
    float orientationD = dot(pIntersection - p10, cross(p00 - p10, normal));

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

      // Convert the quad uniform to a homogeneous matrix
      vec4 hQuad[4];
      hQuad[0] = vec4(uQuad[0], 1);
      hQuad[1] = vec4(uQuad[1], 1);
      hQuad[2] = vec4(uQuad[2], 1);
      hQuad[3] = vec4(uQuad[3], 1);

      // Then apply the camera projection to the homogenous quad. This should
      // multiply each vec4 in the hQuad by the uProjection.
      vec4 pQuad[4];
      pQuad[0] = uProjection * hQuad[0];
      pQuad[1] = uProjection * hQuad[1];
      pQuad[2] = uProjection * hQuad[2];
      pQuad[3] = uProjection * hQuad[3];

      vec3 p00 = pQuad[0].xyz / pQuad[0].w;
      vec3 p01 = pQuad[1].xyz / pQuad[1].w;
      vec3 p10 = pQuad[2].xyz / pQuad[2].w;
      vec3 p11 = pQuad[3].xyz / pQuad[3].w;

      vec3 anyPointOnPlane = p00;
      vec3 rayOrigin = vec3(0.0);
      // n = (p10​ − p00​) × (p01​ − p00​)
      vec3 normal = cross(p10 - p00, p01 - p00);
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
        paintPointWithinQuad(fragColor, pIntersection, normal, p00, p01, p10, p11);
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
