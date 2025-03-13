/**
 * A 512x512x512x8 bit image is roughly 134 million voxels, in the worst case
 * scenario that's ~150 megabytes. However we wouldn't store all of that in a
 * single octree, we would need to break that down into regions that are
 * rendered separately.
 *
 * An octree is stored as an array of 32-bit uints
 * (https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Scalars)
 *
 * Each sequence of 8 array entries represents an octant. The values in the array
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
export type Octree = number[]
