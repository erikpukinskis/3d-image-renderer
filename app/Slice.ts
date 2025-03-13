/**
 * A "slice" is an 8x8x8 volume of voxels which is a convenient chunk to send to
 * a fragment shader for rendering.
 *
 * A slice is parameterized as:
 *  - slice origin: an arbitrary (non-grid-aligned) point in world space
 *  - depth: which level of the octree we are rendering
 *  - ray direction: a vector indicating which way the camera is pointed
 *
 * When rendering a scene, we start with a slice origin offscreen to the left of
 * the camera. When rendering the whole tree (not zoomed in) we start at a depth
 * of 2. At that depth, the octree has 8x8x8 voxels.
 *
 * The front face of the slice is a plane perpendicular to the camera. The slice
 * origin is on this plane. Voxel 000 is the nearest voxel to that point at the
 * desired depth.
 *
 * For any given voxel, with and x, y, and x value, the array index is obtained
 * with some bitwise operations:
 *
 *     index = x | (y << 3 ) | (z << 6)
 *
 * Here we shift the y value 3 bits to the right, leaving enough space for an 8,
 * shift the z value by 6 bits, leaving enough space for two 8s, and then
 * bitwise OR them all together. For example:
 *
 *    decimal coordinates: x = 1, y = 2, z = 3
 *    label for convenience: 123
 *    binary coordinates: x = 1, y = 10, z = 11
 *    binary index = 1 | 10000 | 11000000 = 11010001
 *    decimal index = 209
 */
export type Slice = Int32Array
