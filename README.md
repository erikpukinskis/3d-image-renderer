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

## Octree Representation

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

## Coordinate Systems

The renderer uses several coordinate systems, which are important to understand:

### 1. World/Octree Space

- **Bounds**: [0,0,0] to [1,1,1]
- **Purpose**: This is the fundamental coordinate system used by the octree. The
  entire octree is a 1x1x1 unit cube with its origin at the corner [0,0,0] and
  extending to [1,1,1].
- **Used in**: The `sampleSlice` function samples a camera-aligned 8x8x8 slice
  by stepping through the octree in world space.

### 2. Camera Space

- **Bounds**: Origin (0,0,0) at camera position, extending into negative z
  direction
- **Purpose**: Used for ray direction calculations and view frustum
- **Used in**: The fragment shader (`F_CAST_OCTREE_SLICE.glsl`)
- **Initial Setup**: The camera is initially positioned at [0.5,0.5,-6.0] in
  world space, looking toward the center of the octree at [0.5,0.5,0.5]. That
  said, the camera can move freely in world space.
- **Conversion from World to Camera Space**:
  ```
  cameraPos = worldPos * viewMatrix
  ```
  Where the viewMatrix combines rotation and translation to position the camera:
  ```
  viewMatrix = inverse(cameraTranslationMatrix * cameraRotationMatrix)
  ```

### 3. Clip Space

- **Bounds**: [-w,w] in all dimensions, where w is the fourth component of
  clip-space coordinates
- **Purpose**: Homogeneous coordinate space where the view frustum becomes a
  cube
- **Used in**: Intermediate space between camera space and NDC
- **Conversion from Camera to Clip Space**:
  ```
  clipPos = cameraPos * projectionMatrix
  ```
  Where projectionMatrix defines the view frustum parameters (field of view,
  aspect ratio, near and far planes)

### 4. Slice Space

- **Bounds**: Integer coordinates from [0,0,0] to [7,7,7], representing indices
  into an 8×8×8 grid
- **Purpose**: Indices into the 512-element slice array (8×8×8 = 512)
- **Used in**: Originates in `sampleSlice.ts` where the slice is generated, and
  then we project back from the slice into screen space in the fragment shader.
- **Conversion from World to Slice Space**:
  ```
  sliceX = floor(worldX * 8)
  sliceY = floor(worldY * 8)
  sliceZ = floor(worldZ * 8)
  ```
- **Conversion from Slice to World Space** (for determining sample points):
  ```
  worldX = (sliceX + 0.5) / 8
  worldY = (sliceY + 0.5) / 8
  worldZ = (sliceZ + 0.5) / 8
  ```
  This places the sample point at the center of each slice cell.

### 5. Normalized Device Coordinates (NDC)

- **Bounds**: [-1,-1,-1] to [1,1,1]
- **Purpose**: Standard WebGL screen-space coordinates
- **Used in**: Fragment shader
- **Conversion from Clip to NDC Space**:
  ```
  ndcX = clipX / clipW
  ndcY = clipY / clipW
  ndcZ = clipZ / clipW
  ```
  Where clipW is the fourth component of the clip-space position.

### Current Issues

There is currently inconsistency in how these coordinate systems are defined and
converted between:

- We've decided to standardize on world space coordinates in the range [0,0,0]
  to [1,1,1] to simplify octree traversal and the relationships between
  coordinate systems.
- Previously, the octree was defined in various places with inconsistent bounds
  (either [-0.5,-0.5,-0.5] to [0.5,0.5,0.5] or [0,0,0] to [1,1,1]).
- The code needs to be updated to consistently use the [0,1] range throughout
  all components.

#### Implementation Plan

To resolve these issues, we need to make the following changes:

1. Update `Octree.ts` to document that the octree uses [0,0,0] to [1,1,1]
   coordinates
2. Modify `sampleColor` in `sampleSlice.ts` to check bounds against 0 and 1
3. Update the octant traversal code in `sampleSlice.ts` to start at [0,0,0]
   instead of [-0.5,-0.5,-0.5]
4. Adjust the slice origin in `Renderer.tsx` to use a position that aligns with
   the [0,1] coordinate system
5. Ensure the shader code in `F_CAST_OCTREE_SLICE.glsl` correctly handles the
   ray-plane intersection with this coordinate system

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
