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

  vec3 rayDirection = vec3(ndc, -1.0);

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

  // The first step, however is to figure out which "core" of the slice we are
  // looking down. For me, I am thinking of "voxels" as screen space entities,
  // whereas "nodes" are world space entities.  I don't _think_ this should
  // require any searching.

  // First, we'll take the camera plane of the slice, and figure out where the
  // ray intersects that. Call that the voxel origin. See "Ray-plane
  // intersection test" in F_QUAD_RAY_CAST.glsl for details on how this works.
  vec3 anyPointOnPlane = uSliceOrigin;
  vec3 rayOrigin = vec3(0.0);
  vec3 rayDirection = vec3(ndc, -1.0);
  // The normal of the camera plane of the slice is always going to be the same
  // as the rayDirection since the slice is camera aligned.
  vec3 normal = rayDirection;
  float denomenator = dot(rayDirection, normal);
  // Note: that the denomenator will never be zero since the rayDirection is
  // perpendicular to the camera plane.
  float t = dot(anyPointOnPlane - rayOrigin, normal) / denomenator;
  // Note: We don't need to check for -t (intersection behind the camera) for
  // the same reason.
  vec3 voxelOrigin = t * rayDirection;

  // Next we calculate the offset from the slice origin to the voxel origin.
  // Call that the voxel offset.
  vec3 voxelOffset = voxelOrigin - uSliceOrigin;

  // Then divide that offset by the voxel step, and the integer form of that
  // should give us our index within the slice.
  vec3 index = voxelOffset / uVoxelStep;

  // I don't think we have any guarantees that the ray even intersects the
  // slice. In that case x and/or y will be out of bounds (outside the 8x8x8
  // grid of the slice) so we just return black.
  if (index.x < 0 || index.x >= 8 || index.y < 0 || index.y >= 8)  {
    outColor = black;
    return;
  }

  // We can cast to int (truncate towards zero) to get the floor, because we
  // handle negative values above.
  int x = int(index.x);
  int y = int(index.y);



  // Once we have the core, we simply march through the 8 voxels, and return the
  // value of whichever one we find.

  for (int z = 0; z < 8; z++) {
    // See the documentation in Slice.ts for details on how this index is
    // calculated.
    int voxelIndex = x | (y << 3) | (z << 6);

    if (uSlice[voxelIndex] > 0) {
      outColor = magenta;
      return;
    }
  }

  outColor = black;
}

// This is similar to ShaderToy's boilerplate:
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  fragColor = color;
}
