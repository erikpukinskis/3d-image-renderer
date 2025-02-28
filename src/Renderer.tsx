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

    // Draw
    var vertexBuffer = gl.createBuffer();
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
  var vertexShader = createTriangleShader(gl);

  // The fragment shader renders all of the pixels inside that geometry
  var fragmentShader = createFragmentShader(gl);

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
function createTriangleShader(gl: WebGLRenderingContext) {
  const FULL_SCREEN_QUAD = `
    attribute vec4 aPosition; // Vertex data from the buffer
    varying vec4 vPosition; // Passed to the fragment shader

    void main() {
      vPosition = aPosition;
      gl_Position = aPosition;
    }     
  `;

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);

  if (!vertexShader) {
    throw new Error("Could not create vertex shader");
  }

  gl.shaderSource(vertexShader, FULL_SCREEN_QUAD);
  gl.compileShader(vertexShader);
  checkCompileStatus(gl, vertexShader);

  return vertexShader;
}

/**
 * Since we're ray casting, the fragment shader is doing the bulk of the work.
 */
function createFragmentShader(gl: WebGLRenderingContext) {
  const UV_DEMO = `
    precision mediump float;
    uniform vec2 uResolution;
    varying vec4 vPosition;    // Interpolated position for this pixel
    
    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        // Convert from pixel coordinates to uv
        vec2 uv = fragCoord/uResolution.xy;

        // Convert to normalized device coordinates
        vec2 ndc = uv * 2.0 - 1.0;

        // (bx^2 + by^2)t^2 + (2(axbx + ayby))t + (ax^2 + ay^2 - r^2) = 0
        // where
        // a = ray origin
        // b = ray direction
        // r = radius of the sphere
        // t = hit distance

        vec3 rayDirection = vec3(ndc, -1.0);
        vec3 rayOrigin = vec3(0.0, 0.0, 2.0);
        float radius = 1.0;

        // Terms from the quadratic equation:
        float a = dot(rayDirection, rayDirection);
        float b = 2.0 * dot(rayOrigin, rayDirection);
        float c = dot(rayOrigin,rayOrigin) - radius * radius;

        float discriminant = b * b - 4.0 * a * c;

        if (discriminant < 0.0) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            fragColor = vec4(1.0, 0.0, 1.0, 1.0);
        }
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

  var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

  if (!fragmentShader) {
    throw new Error("Could not create fragment shader");
  }

  gl.shaderSource(fragmentShader, UV_DEMO);
  gl.compileShader(fragmentShader);
  checkCompileStatus(gl, fragmentShader);

  return fragmentShader;
}

function checkCompileStatus(gl: WebGLRenderingContext, shader: WebGLShader) {
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Unknown issue compiling shader"
    );
  }
}
