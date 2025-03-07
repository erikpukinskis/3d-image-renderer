#version 300 es
precision mediump float;
uniform vec2 uResolution;
uniform vec3 uSliceOrigin;
uniform vec3 uVoxelStep;
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

  // Alright. So, here we are rendering a slice. The slice is 512 levels of
  // opacity 0 (transparent) to 255 (opaque). They are arranged in a 3 dimensional
  // (x,y,z) volume stored as an array of uint32. The volume is camera aligned.

  // Although the slice is screen-aligned, it is not pixel-aligned.

  // We are going to draw in a quad. In this first implementation it's a full
  // screen quad, but once we add in the temporal accumulation, we will be
  // rendering in smaller screen-aligned quads as well.

  // So, the fragCoord is going to be the pixel to cast.

  // We'll use the uProjection matrix to help us project into world space from the
  // camera.

  // We'll use uVoxelStep to calculate the position in world space of a voxel. The
  // world-space position of any given voxel (x,y,z) in a slice is:

  //     vec3(
  //       v0: uSliceOrigin.x + x * uVoxelStep.x,
  //       v1: uSliceOrigin.y + y * uVoxelStep.y,
  //       v2: uSliceOrigin.z + z * uVoxelStep.z
  //      )

  // The first step, however is to figure out which "core" of the slice we are
  // looking down. This involves doing the opposite of the above, and solving
  // for values of x, y, and z which intersect the ray.

  // Once we have the core, we simply march through the 8 voxels, and return the
  // value of whichever one we find.

  // It's so tempting to ask Cursor to take a stab at implementing this for me
  // 😆 but I am going to force myself to give it a go first.

  outColor = black;
}

// This is similar to ShaderToy's boilerplate:
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  fragColor = color;
}
