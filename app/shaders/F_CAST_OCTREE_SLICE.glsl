#version 300 es
precision mediump float;

/**
 * Screen resolution in pixels 
 */
uniform vec2 uResolution;

/**
 * Origin of the slice (world space)
 */
uniform vec3 uSliceOrigin;

/**
 * Step size between voxels (world space)
 */
uniform vec3 uVoxelStep;

/**
 * 8x8x8 voxel volume data (slice space)
 */
uniform uint uSlice[512];

/**
 * View matrix (transforms from world space to camera space)
 */
uniform mat4 uView;

/**
 * Projection matrix (transforms from camera space to clip space)
 */
uniform mat4 uProjection;

/**
 * The camera's field of view
 */
uniform float uFOV;

// Interpolated position for this pixel
in vec4 vPosition;

// Output color
out vec4 fragColor;

// Some colors for clarity:
vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
vec4 magenta = vec4(1.0, 0.0, 1.0, 1.0);
vec4 red = vec4(1.0, 0.0, 0.0, 1.0);

void mainImage(out vec4 outColor, vec2 fragCoord) {
  // Convert from pixel coordinates to uv
  vec2 uv = fragCoord / uResolution.xy;

  /**
   * Convert from UV to normalized device coordinates (NDC space)
   */
  vec2 ndc = (uv * 2.0 - 1.0);

  /**
   * The point on the near plane that's intersected by
   * this pixel's ray. (clip space)
   *
   * Clip space is the set of points on the near plane of the camera's view
   * frustum. We're finding t
   */
  vec4 clipPos = vec4(ndc, -1.0, 1);

  /**
   * The point on the near plane that's intersected by
   * this pixel's ray (camera space)
   */
  vec4 viewPos = inverse(uProjection) * clipPos;

  // This division is what creates the perspective effect, making distant
  // objects smaller. Note that since we set w=1 in the clipPos, anything on the
  // near plane will not be affected by this, since it's just divided by one.
  // Points farther away would have different w values after the perspective
  // division.
  viewPos /= viewPos.w;

  /**
   * Normalized ray direction (camera space)
   *
   * The ray origin is always 0,0,0 in camera space.
   * 
   * Obtained by discarding the distance to the view position.
   */
  vec3 rayDirection = normalize(viewPos.xyz);

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
  // ray intersects that. Call that the voxel origin. 

  /**
   * Convert slice origin from world space to camera space
   */
  vec4 sliceOriginCamera = uView * vec4(uSliceOrigin, 1.0);
  
  /**
   * Ray-plane intersection calculation (all in camera space)
   */
  vec3 anyPointOnPlane = sliceOriginCamera.xyz;
  vec3 rayOrigin = vec3(0.0);
  vec3 normal = rayDirection;
  float denomenator = dot(rayDirection, normal);

  // Note: that the denomenator will never be zero since the rayDirection is
  // perpendicular to the camera plane.
  float t = dot(anyPointOnPlane - rayOrigin, normal) / denomenator;
 
  // Note: Also we don't need to check for -t (intersection behind the camera) for
  // the same reason.
  
  /**
   * Point where the ray intersects the slice plane (camera space)
   */
  vec3 voxelOrigin = t * rayDirection;

  // Next we calculate the offset from the slice origin to the voxel origin.
  // Call that the voxel offset (camera space)
  vec3 voxelOffset = voxelOrigin - sliceOriginCamera.xyz;

  /**
   * Convert voxel step from world space to camera space
   * Note: For rotation only, we don't include translation
   */
  vec3 voxelStepCamera = (uView * vec4(uVoxelStep, 0.0)).xyz;

  // Then divide that offset by the voxel step, and the integer form of that
  // should give us our index within the slice.
  vec3 index = voxelOffset / voxelStepCamera;

  // We don't have any guarantees that the ray even intersects the slice. In
  // that case x and/or y will be out of bounds (outside the 8x8x8 grid of the
  // slice) so we just return black.
  // TODO(erik): Do we need to bounds check z here?
  if (index.x < 0.0 || index.x >= 8.0 || index.y < 0.0 || index.y >= 8.0)  {
    outColor = red; // Change to red to see where this happens
    return;
  }

  // We can cast to int (truncate towards zero) to get the floor, because we
  // handle negative values above.
  int x = int(index.x);
  int y = int(index.y);

  // DEBUG visualization - remove the early return to see actual octree results
  // float xNorm = float(x) / 8.0;
  // float yNorm = float(y) / 8.0;
  // outColor = vec4(xNorm, yNorm, 0.5, 1.0);
  // return;

  // Once we have the core, we simply march through the 8 voxels, and return the
  // value of whichever one we find.
  bool foundNonZero = false;
  
  for (int z = 0; z < 8; z++) {
    // See the documentation in Slice.ts for details on how this index is
    // calculated.
    int voxelIndex = x | (y << 3) | (z << 6);
    
    // Debug coloring based on the voxel index's value
    uint sliceValue = uSlice[voxelIndex];
    if (sliceValue > uint(0)) {
      // If we found a non-zero value, use its intensity for coloring
      float intensity = float(sliceValue) / 255.0;
      outColor = vec4(intensity, 0.0, intensity, 1.0); // Magenta with variable intensity
      foundNonZero = true;
      return;
    }
  }
  
  if (!foundNonZero) {
    // If we didn't find any non-zero values, color based on position for debugging
    float xNorm = float(x) / 8.0;
    float yNorm = float(y) / 8.0;
    outColor = vec4(xNorm * 0.2, yNorm * 0.2, 0.5, 1.0); // Dimmer position-based coloring
  }
}

// This is similar to ShaderToy's boilerplate:
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  fragColor = color;
}
