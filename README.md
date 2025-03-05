## Goals:

- Render a 512x512x512 image in 8 bits of color depth
- Do as much on the GPU as possible

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

## Ray casting voxels

It seems like the standard is to try to accurate detect ray intsersection with
voxel bounding boxes. This would mean using something like
[DDA](https://youtu.be/NbSee-XM7WA?si=ECz7EySgTKftHYz9) to cast the rays.

However, shaders don't do early termination of loops. And a ray casting across,
say, an 8x8 pixel grid could hit anywhere from 1 to 16 pixels. That means you'd
have to do 16 loops for every pixel, regardless of how deep the collision is, or
how many pixels the ray even passes through. And for an Octree it's even harder
to predict how many pixels you might need to move between to get to a leaf
voxel.

So I would like to consider another option, which is slightly lossier but which
is more amenable to working in shaders, which would do the following:

1. Work on a fixed size voxel grid (say 8x8x8)
2. Render one scale in any given shader pass (4 passes would give us a
   4096x4096x4096 image)
3. Use temporal accumulation to layer finer and finer "tiles" onto the image
4. Rather than DDA, use fixed step ray marching
5. Build a parallelogram so that (unless we're at the very edge of the image) we
   always have exactly 8 voxels to march through

This should allow for highly parallelizable rendering, and for fully opaque
images would work fine.

Notes:

- This approach, if we wanted to ray cast through partially transparent volumes,
  would likely require some kind of multi-pass rendering. That said, in games
  they seem to often use a lower resolution voxel grid for things like
  transparency and global illumination, and then draw that onto finer geometry.
  So that might work here too.

- On typical hardware GL_MAX_FRAGMENT_UNIFORM_VECTORS is 256, and we can pack 16
  8-bit voxels into each vector. So a grid size of 8-12 should be feasible.

## Octree Storage

The 512x512x512x8 bit image is roughly 134 million voxels, in the worst case
scenario that's ~150 megabytes. However we wouldn't store all of that in a
single octree, we would need to break that down into regions that are rendered
separately.

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
