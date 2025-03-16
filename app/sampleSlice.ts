import { Vec3 } from "gl-matrix"
import { Slice } from "./Slice"
import { Octree } from "./Octree"

type SampleSliceArgs = {
  /**
   * Origin of the slice (world space)
   *
   * Eventually, this slice origin will vary as we do the temporal
   * accumulation. But for now we just render the root slice. Cursor has this
   * starting at z=1, for reasons that are still unclear to me.
   */
  sliceOrigin: Vec3

  /**
   * Direction the camera is pointed in (world space)
   *
   * TODO(erik): These probably need to be parameters to render() and we
   * probably need to move some of this up into initialization. But for now
   * this will get us going.
   *
   * TODO(erik): This should be the camera's direction
   */

  rayDirection: Vec3
  depth: number
  octree: Octree
}

/**
 * Samples a screen-oriented 3D slice of voxels at a certain depth and location
 * in an octree.
 *
 * @param origin - The origin of the slice in world space
 * @param rayDirection - The direction of the ray in world space
 * @param depth - The depth of the slice in the octree
 * @param octree - The octree to sample
 * @returns Slice
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
 *
 * This is kind of a form of DDA, although it's a very simple version where we
 * don't try to rasterize a nice line, we just sample a string of pixels along a
 * ray.
 */
export function sampleSlice({
  sliceOrigin,
  rayDirection,
  depth,
  octree,
}: SampleSliceArgs): Slice {
  /**
   * The slice to be constructed is an 8x8x8 screen-aligned projection of the
   * octree, containing 8-bit unsigned integers representing the color at that
   * voxel.
   *
   * The projection is always 8x8x8 even if it extends outside the image volume,
   * since we just fill in empty space with 0's (fully transparent).
   *
   * The voxels in a slice will be labeled 000 -> 888, where voxel "123" has
   * x=1, y=2, z=3
   */
  const slice = new Uint32Array(512)

  /**
   * Spacing of the voxels in a slice (world space deltas)
   */
  const step = getStepLength(rayDirection, depth)

  // DEBUG: Log octree traversal parameters
  console.log("SampleSlice parameters:", {
    depth,
    step: [step.x, step.y, step.z],
    sliceOrigin: [sliceOrigin.x, sliceOrigin.y, sliceOrigin.z],
    octreeLength: octree.length,
  })

  /**
   * Origin for each voxel as we iterate through the slice (world space)
   *
   * Our goal is to add our 512 voxels to the slice. As we step through the
   * x,y,z indexes, we'll update this nodeOrigin to be a new point in world
   * space. That's going to the "origin" for the voxel. Which we're calling the
   * "node origin".
   *
   * Once we have this node origin, we will figure out which voxel in the octree
   * is closest to it and that's what gets inserted into the slice at a given
   * index (000, 001, etc).
   */
  const nodeOrigin = Vec3.clone(sliceOrigin)

  // Track non-zero values for debugging
  let nonZeroValues = 0

  // We will iterate through 64 camera-aligned "cores" through the octree by
  // looping over x and y in pseudo-screens-space:
  for (let xIndex = 0; xIndex < 8; xIndex++) {
    for (let yIndex = 0; yIndex < 8; yIndex++) {
      // Calculate the origin of this core:
      nodeOrigin.x = sliceOrigin.x + xIndex * step.x
      nodeOrigin.y = sliceOrigin.y + yIndex * step.y

      // Now we step down through the (camera's) z-axis:
      for (let zIndex = 0; zIndex < 8; zIndex++) {
        nodeOrigin.z = sliceOrigin.z + zIndex * step.z

        // Find and store the voxel. See the documentation in Slice.ts for
        // details on how this node index is calculated.
        const nodeIndex = xIndex | (yIndex << 3) | (zIndex << 6)
        const color = sampleColor(octree, nodeOrigin, depth)
        slice[nodeIndex] = color

        // Track non-zero values for debugging
        if (color > 0) {
          nonZeroValues++
        }
      }
    }
  }

  // DEBUG: Log the results
  console.log(
    `Generated slice with ${nonZeroValues} non-zero values at depth ${depth}`
  )

  return slice
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
function sampleColor(
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

  // DEBUG: Log sample points occasionally to see what coordinates we're trying to sample
  const randomSample = Math.random() < 0.01 // Only log ~1% of samples to avoid console flood
  if (randomSample) {
    console.log(
      "Sampling point:",
      [samplePoint.x, samplePoint.y, samplePoint.z],
      "at depth",
      targetDepth
    )
  }

  // We are always looking at an octant. The root octant is at index 0, so that's where we start.
  let octantIndex = 0

  /**
   * The origin (slice space) of the current octree node we're considering.
   *
   * As we are descending down the octree looking for the closest node, we will
   * keep track of the most recent node origin.
   */
  const nodeOrigin = new Vec3(0, 0, 0)

  // DEBUG: Track the traversal path
  let traversalPath = [octantIndex]

  // Traverse down to the desired depth
  for (let currentDepth = 0; currentDepth < targetDepth; currentDepth++) {
    // We've just stepped into a new depth. First task is to figure out which
    // node in the octant at this depth is closest to the point.

    /**
     * The (world space) size of an octave at this depth
     *
     * In order to know the bounding boxes for each octant, we calculate the
     * octant size and the node size. For example, at depth 2, the octree is
     * 8x8x8, so the octant size is 8 and the node size is 4.
     */
    const octantSize = 1.0 / (1 << currentDepth)
    /**
     * The (world space) size of a node at this depth
     */
    const nodeSize = octantSize / 2

    // Now we'll ask: on which axes is the sample point more than halfway past
    // the octave origin? These are deltas in "octant space" which is a thing we
    // rarely use. Basically, 0..1 where 0 is the first node and 1 is the
    // second.
    const x = samplePoint.x >= nodeOrigin.x + nodeSize ? 1 : 0
    const y = samplePoint.y >= nodeOrigin.y + nodeSize ? 1 : 0
    const z = samplePoint.z >= nodeOrigin.z + nodeSize ? 1 : 0

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

    // DEBUG: Add this step to the traversal path
    traversalPath.push(octantIndex + nearestNodeIndexWithinOctant)

    // If it's a leaf node (no children), no need to go any deeper, just return
    // its opacity.
    if (isLeafNode) {
      // DEBUG log traversal for non-zero opacity nodes (occasionally)
      if (opacity > 0 && Math.random() < 0.1) {
        console.log(
          `Found opacity ${opacity} at traversal path:`,
          traversalPath
        )
      }
      return opacity
    }

    // Otherwise, we're looking at a branch node. So we set the octant index to
    // the node index for the next iteration.
    octantIndex = nodeIndex

    // And we narrow down the octant origin a little bit, to the node origin.
    // Because that's going to be the octant at the next level down.
    if (x) nodeOrigin.x += nodeSize
    if (y) nodeOrigin.y += nodeSize
    if (z) nodeOrigin.z += nodeSize
  }

  // If we make it through the loop, we're still on an octant that has children,
  // but we've reached the target depth. So we just extract the opacity for the
  // whole octant and return that.
  const finalOpacity = octree[octantIndex] & 0xff

  // DEBUG log traversal for non-zero opacity nodes (occasionally)
  if (finalOpacity > 0 && Math.random() < 0.1) {
    console.log(
      `Found opacity ${finalOpacity} at traversal path:`,
      traversalPath
    )
  }

  return finalOpacity // Always return just the opacity component
}

/**
 * The steps determine how we move through world space, such that the samples
 * we pull will form a camera-aligned volume.
 *
 * @param rayDirection - The direction of the ray (world space)
 * @param depth - The depth in the octree
 * @returns Vec3 of step lengths in each dimension (world space)
 *
 * At depth d, each voxel has a side length of 1/(2^d). Since we're sampling
 * an 8x8x8 slice, we need to scale our step size.
 *
 * We use √3 (the length of a diagonal of a unit cube) in the numerator to
 * ensure we step far enough along the ray that we never sample the same voxel
 * twice. Using this value ensures our step size is always large enough to
 * "escape" the current voxel regardless of ray direction.
 */
export function getStepLength(rayDirection: Vec3, depth: number) {
  const depthScale = Math.sqrt(3) / ((1 << depth) * 8)

  return new Vec3(
    Math.sqrt(1 + rayDirection[1] ** 2 + rayDirection[2] ** 2) * depthScale,
    Math.sqrt(1 + rayDirection[0] ** 2 + rayDirection[2] ** 2) * depthScale,
    Math.sqrt(1 + rayDirection[0] ** 2 + rayDirection[1] ** 2) * depthScale
  )
}
