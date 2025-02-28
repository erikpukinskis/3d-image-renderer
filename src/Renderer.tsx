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

    // Draw
    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, FULL_SCREEN_QUAD, gl.STATIC_DRAW);

    gl.vertexAttribPointer(
      gl.getAttribLocation(shaderProgram, "vertexData"),
      3,
      gl.FLOAT,
      false,
      0,
      0
    );

    // Enable the vertex attribute array
    gl.enableVertexAttribArray(
      gl.getAttribLocation(shaderProgram, "vertexData")
    );

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
        attribute vec4 vertexData;

        void main() {
            gl_Position = vertexData;
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
  const ALL_GREEN_EVERYTHING = `
        precision mediump float;

        void main() {
            gl_FragColor = vec4(0.25,0.2,0.3,1);
        }
    `;

  var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

  if (!fragmentShader) {
    throw new Error("Could not create fragment shader");
  }

  gl.shaderSource(fragmentShader, ALL_GREEN_EVERYTHING);
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
