#version 300 es
precision mediump float;
uniform vec2 uResolution;
uniform vec3 uQuad[4];
uniform mat4 uProjection;
uniform float uFOV;

// Interpolated position for this pixel
in vec4 vPosition;

// Output color
out vec4 fragColor;

// Some colors for clarity:
vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
vec4 magenta = vec4(1.0, 0.0, 1.0, 1.0);

void paintPointWithinQuad(
  out vec4 fragColor,
  vec3 pIntersection,
  vec3 normal,
  vec3 p00,
  vec3 p01,
  vec3 p10,
  vec3 p11
) {
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

  if (
    orientationA < 0.0 ||
    orientationB < 0.0 ||
    orientationC < 0.0 ||
    orientationD < 0.0
  ) {
    fragColor = black;
  } else {
    fragColor = magenta;
  }
}

void mainImage(out vec4 outColor, vec2 fragCoord) {
  // Convert from pixel coordinates to uv
  vec2 uv = fragCoord / uResolution.xy;

  // Convert to normalized device coordinates
  vec2 ndc = (uv * 2.0 - 1.0) * uFOV;

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
    outColor = black;
  } else {
    paintPointWithinQuad(outColor, pIntersection, normal, p00, p01, p10, p11);
  }
}

// This is similar to ShaderToy's boilerplate:
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  fragColor = color;
}
