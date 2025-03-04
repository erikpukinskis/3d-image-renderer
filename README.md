## Usage

Ensure you have [nvm](https://github.com/nvm-sh/nvm) and
[Yarn](https://yarnpkg.com/getting-started/install) installed.

```
nvm install
nvm use
yarn install
yarn start:app:dev
```

Visit http://localhost:5173/

## Octree Design

The goal is to use a sparse voxel octree to represent the images. The target is
a maximum of 512x512x512 and 8 bits of color depth at the root.

That is roughly 134 million voxels, in the worst case scenario that's ~150
megabytes. However we wouldn't store all of that in a single octree, we would
need to break that down into regions that are rendered separately.

An octree is stored as an array of 32-bit uints
(https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Scalars)

Each slice of 8 array entries represents an octant. The values in the array can
represent leaf or branch nodes:

- Values < 256 (leaf nodes) encode an opacity from 0 (fully transparent) to 255
  (fully opaque)
- Values >= 256 (branch nodes) encode an address for the octant the next level
  down.

An array index for the start of a branch node is obtained by subtracting 248
from the value. So the value 256 represents the octant starting at 256 - 248 =
index 8.

The octant in the slice from 0-7 is the root octant.

### Example

A 2 level deep octree, where only the bottom-most slice is fully opaque, the
rest transparent.

The root octant would then have four filled values, and four empty ones.
Assuming there is some form of de-duplication on the leaf octants, we only need
leaf octant, which will be at the address 256 (index 8):

| Index | Value | What it represents |
| ----- | ----- | ------------------ |
| 0     | 256   | The 8-15 octant    |
| 1     | 256   | The 8-15 octant    |
| 2     | 256   | The 8-15 octant    |
| 3     | 256   | The 8-15 octant    |
| 4     | 0     | 0% opaque          |
| 5     | 0     | 0% opaque          |
| 6     | 0     | 0% opaque          |
| 7     | 0     | 0% opaque          |
| 8     | 255   | 100% opaque        |
| 9     | 255   | 100% opaque        |
| 10    | 255   | 100% opaque        |
| 11    | 255   | 100% opaque        |
| 12    | 0     | 0% opaque          |
| 13    | 0     | 0% opaque          |
| 14    | 0     | 0% opaque          |
| 15    | 0     | 0% opaque          |

## Todo

- [x] Render a sphere using ray casting
- [x] Render a quad
- [x] Drag to rotate
- [x] Move glsl to their own files
- [ ] Cast into an octant
- [ ] Cast into an octree
- [ ] Additive transparency
- [ ] Shadow
- [ ] Subsurface scattering
