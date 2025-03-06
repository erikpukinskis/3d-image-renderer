#version 300 es
precision mediump float;
uniform vec2 uResolution;
uniform vec3 uSliceOrigin;
uniform uint uSlice[512];
uniform mat4 uProjection;
uniform float uFOV;

// Interpolated position for this pixel
in vec4 vPosition;

// Output color
out vec4 fragColor;

// Some colors for clarity:
vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
vec4 magenta = vec4(1.0, 0.0, 1.0, 1.0);

void mainImage(out vec4 outColor, vec2 fragCoord) {
  // Convert from pixel coordinates to uv
  vec2 uv = fragCoord / uResolution.xy;

  // Convert to normalized device coordinates
  vec2 ndc = (uv * 2.0 - 1.0) * uFOV;

  outColor = black;
}

// This is similar to ShaderToy's boilerplate:
void main() {
  // mainImage writes to this temporary variable
  vec4 color;

  mainImage(color, gl_FragCoord.xy);

  // Write to output variable instead of gl_FragColor
  fragColor = color;
}
