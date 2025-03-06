import { Vec3 } from "gl-matrix"

type SampleSliceArgs = {
  origin: Vec3
  rayDirection: Vec3
  depth: number
  octree: number[]
}

/**
 * @param origin - The origin of the slice in world space
 * @param rayDirection - The direction of the ray in world space
 * @param depth - The depth of the slice in the octree
 * @param octree - The octree to sample
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
 * We use a plane perpendicular to the camera—the "camera plane"—intersecting
 * the slice origin, and use that to locate the nearest voxel in the octree.
 * That is voxel 000.
 *
 * We will move through each xy combination, and determine 8 voxels along the
 * (camera's) z-axis. This group of 8 voxels is called a "core".
 *
 * Then to find voxel 001 we move the camera plane back one step. When we're
 * looking square on to the voxels, this step size will be exactly 1.0. But when
 * we're looking at a 45 degree angle, it will be sqrt(2). And any other angle
 * in between. We call this value zStep. Using this number guarantees that we
 * never put the same voxel in the slice twice.
 *
 * After we step the camera plane back, we find the next nearest voxel, and put
 * it in 001.
 *
 * Once we have stored all of the voxels up to 008, that's the first core. We
 * move on to the core starting at 010. We return the z-plane back to the slice
 * origin, and move the y-plane over by the yStep, which is calculated the same
 * way as the zStep.
 */
export function sampleSlice({
  origin,
  rayDirection,
  depth,
  octree,
}: SampleSliceArgs) {
  /**
   * The slice to be constructed is an 8x8x8 screen space projection of the
   * octree, containing 8-bit unsigned integers representing the color at that
   * voxel.
   *
   * The projection is always 8x8x8 even if it extends outside the image
   * volume, since we just fill in empty space with 0's.
   *
   * The voxels in a slice will be labeled 000 -> 888, where voxel "123" has
   * x=1, y=2, z=3
   */
  const slice: number[][][] = [
    [[], [], [], [], [], [], [], []],
    [[], [], [], [], [], [], [], []],
    [[], [], [], [], [], [], [], []],
    [[], [], [], [], [], [], [], []],
    [[], [], [], [], [], [], [], []],
    [[], [], [], [], [], [], [], []],
    [[], [], [], [], [], [], [], []],
    [[], [], [], [], [], [], [], []],
  ]

  /**
   * The steps determine how we move through world space space, such that the
   * samples we pull will form a camera-aligned volume.
   */
  const xStep = Math.sqrt(1 + rayDirection[1] ** 2 + rayDirection[2] ** 2)
  const yStep = Math.sqrt(1 + rayDirection[0] ** 2 + rayDirection[2] ** 2)
  const zStep = Math.sqrt(1 + rayDirection[0] ** 2 + rayDirection[1] ** 2)

  /**
   * A point in world space, which the voxel we are putting in the slice is
   * the nearest voxel to.
   */
  const voxelOrigin = Vec3.clone(origin)

  // We will iterate through 64 camera-aligned "cores" through the octree by
  // looping over x and y in pseudo-screens-space:
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      // Calculate the origin of this core:
      voxelOrigin.x = origin.x + x * xStep
      voxelOrigin.y = origin.y + y * yStep

      // Now we step down through the (camera's) z-axis:
      for (let z = 0; z < 8; z++) {
        voxelOrigin.z = origin.z + z * zStep

        // Find and store the voxel
        slice[x][y][z] = findNearestVoxel(octree, voxelOrigin, depth)
      }
    }
  }
}

/**
 * @param octree - The octree to sample
 * @param samplePoint - A point in world space
 * @param targetDepth - The depth which we are rendering
 * @returns The opacity of the voxel nearest to the point, an unsigned integer.
 *
 * Example:
 *
 * We are looking for the pixel nearest to 0.1, 0.1, 0.1 at target depth 2.
 *
 * We start at depth 0. The closest octant is going to be Octant 000. So we know
 * we need to look at array index 0.
 *
 * We read octree[0] and find that its value is 2080. We unpack that into an
 * opacity of 32 and an index of 8. That means for depth 1 we'll look at
 * indicies 8-15 for the octant.
 *
 * At depth 1, octant 00 is also the closest to our point. So we read octree[8]
 * and see it's 4128 (opacity 16, index 16).
 *
 * Lastly for depth 2, the target depth, I'm not sure if we would find 000 or
 * 011 is closest to the point. If it was 000, we'd look at octree[24], and if
 * 011 we'd look at octree[28]. Either way we'll find the value is 255. Since
 * that's less than 256 we know it's a leaf node, and we can return an opacity
 * of 255. We can also confirm it's a leaf node because  know that because if we
 * extract the index, we get 0.
 */
function findNearestVoxel(
  octree: Octree,
  samplePoint: Vec3,
  targetDepth: number
): number {
  if (samplePoint.x < 0 || samplePoint.x > 1) {
    return 0
  }

  if (samplePoint.y < 0 || samplePoint.y > 1) {
    return 0
  }

  if (samplePoint.z < 0 || samplePoint.z > 1) {
    return 0
  }

  // We are always looking at an octant. The root octant is at index 0, so that's where we start.
  let octantIndex = 0

  // Track current octant origin as we traverse
  let octantX = 0
  let octantY = 0
  let octantZ = 0

  // Traverse down to the desired depth
  for (let currentDepth = 0; currentDepth < targetDepth; currentDepth++) {
    // We've just stepped into a new depth. First task is to figure out which
    // node in the octant at this depth is closest to the point.

    // In order to know the bounding boxes for each octant, we calculate the
    // octant size and the node size. For example, at depth 2, the octant is
    // 8x8x8, so the octant size is 8 and the node size is 4.
    const octantSize = 1.0 / (1 << currentDepth)
    const nodeSize = octantSize / 2

    // We'll do that by asking, on which axes is the sample point more than
    // halfway past the octave origin?
    const x = samplePoint.x >= octantX + nodeSize ? 1 : 0
    const y = samplePoint.y >= octantY + nodeSize ? 1 : 0
    const z = samplePoint.z >= octantZ + nodeSize ? 1 : 0

    // Then we can find the decimal octant offset by bit shifting. So the x
    // value determines whether the last binary digit is 0 or 1, y value
    // determines the second, z value determines the third.
    const nearestNodeIndexWithinOctant = x + (y << 1) + (z << 2)

    // Now we can grab the value by adding that
    const value = octree[octantIndex + nearestNodeIndexWithinOctant]
    // Opacity is the first 8 bits of the value, and index are the rest. See the
    // docblock on Octree below for a more thorough explanation.
    const opacity = value & 0xff
    const nodeIndex = value >>> 8
    const isLeafNode = nodeIndex === 0

    // If it's a leaf node (no children), no need to go any deeper, just return
    // its opacity.
    if (isLeafNode) {
      return opacity
    }

    // Otherwise, we're looking at a branch node. So we set the octant index to
    // the node index for the next iteration.
    octantIndex = nodeIndex

    // And we narrow down the octant origin a little bit, to the node origin.
    // Because that's going to be the octant at the next level down.
    if (x) octantX += nodeSize
    if (y) octantY += nodeSize
    if (z) octantZ += nodeSize
  }

  // If we make it through the loop, we're still on an octant that has children,
  // but we've reached the target depth. So we just extract the opacity for the
  // whole octant and return that.
  return octree[octantIndex] & 0xff // Always return just the opacity component
}

/**
 * A 512x512x512x8 bit image is roughly 134 million voxels, in the worst case
 * scenario that's ~150 megabytes. However we wouldn't store all of that in a
 * single octree, we would need to break that down into regions that are
 * rendered separately.
 *
 * An octree is stored as an array of 32-bit uints
 * (https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Scalars)
 *
 * Each slice of 8 array entries represents an octant. The values in the array
 * can represent leaf or branch nodes.
 *
 * A leaf node is simply going to be an 8-bit unsigned integer, 0-255,
 * representing the opacity of the voxel.
 *
 * A branch node will be greater than 255, and it will be made up of two
 * components:
 *  - the weighted average of the 8 voxels that make up the octant (an opacity)
 *  - an index into the next level of the octree
 *
 * These two values are packed together into a single 32-bit uint, where:
 *
 *     const value = (index << 8) | opacity
 *     const opacity = value & 0xFF
 *     const index = value >>> 8
 *
 * Validation:
 *  - A voxel can only point to an octant with an index greater than its own index.
 *
 * Example:
 *
 * A 2 level deep octree, where only the bottom-most slice is fully opaque, the
 * rest transparent.
 *
 * The root octant would then have four filled values, and four empty ones.
 * Assuming there is some form of de-duplication on the leaf octants, we only
 * need leaf octant, which will be at the address 256 (index 8):
 *
 * | Index | Value | What it represents        |
 * | ----- | ----- | ------------------------- |
 * | 0     | 2080  | the octant at index 8     |
 * | 1     | 2080  | the octant at index 8     |
 * | 2     | 2080  | the octant at index 8     |
 * | 3     | 2080  | the octant at index 8     |
 * | 4     | 0     | 0% opaque                 |
 * | 5     | 0     | 0% opaque                 |
 * | 6     | 0     | 0% opaque                 |
 * | 7     | 0     | 0% opaque                 |
 * | 8     | 255   | 100% opaque               |
 * | 9     | 255   | 100% opaque               |
 * | 10    | 255   | 100% opaque               |
 * | 11    | 255   | 100% opaque               |
 * | 12    | 0     | 0% opaque                 |
 * | 13    | 0     | 0% opaque                 |
 * | 14    | 0     | 0% opaque                 |
 * | 15    | 0     | 0% opaque                 |
 */
type Octree = number[]
