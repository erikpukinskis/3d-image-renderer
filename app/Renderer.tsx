// Note: using gl-matrix 4.0-beta
import { Mat4 } from "gl-matrix"
import React, { useRef, useState } from "react"
import V_FULL_SCREEN_QUAD from "./shaders/V_FULL_SCREEN_QUAD.glsl?raw"
import F_OCTANT_RAY_CAST from "./shaders/F_OCTREE_RAY_CAST.glsl?raw"

const CANVAS_WIDTH = 300
const CANVAS_HEIGHT = 300

/**
 * We scale up the Y rotation a little so that you can do a full 180 in a single drag
 */
const X_ROTATION_SPEED = 1
const Y_ROTATION_SPEED = 3

/**
 * Camera definition
 */
const CAMERA_DISTANCE = -6
const CAMERA_FOV = 0.2
const FULL_SCREEN_QUAD = new Float32Array([
  -1.0,
  -1.0,
  0.0, // bottom left
  1.0,
  -1.0,
  0.0, // bottom right
  -1.0,
  1.0,
  0.0, // top left
  -1.0,
  1.0,
  0.0, // top left
  1.0,
  -1.0,
  0.0, // bottom right
  1.0,
  1.0,
  0.0, // top right
])

/**
 * These are world-relative transforms that will apply to the whole world, which
 * is a little confusing. I am not super clear on what are best practices for
 * this matrix. Seems like gl-matrix uses a lookAt helper, which makes this
 * whole question go away. But I would like to understand it deeply.
 */
type Camera = {
  tx: number
  ty: number
  tz: number
  xRotation: number
  yRotation: number
}

export const Renderer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const cameraRef = useRef<Camera>({
    tx: 0,
    ty: 0,
    tz: CAMERA_DISTANCE,
    xRotation: 0,
    yRotation: 0,
  })

  const handleMount = (canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    render()
  }

  const render = () => {
    const canvas = canvasRef.current

    if (!canvas) return
    // Initialize the GL context
    const gl = canvas.getContext("webgl", {
      antialias: false,
    })

    if (!gl) {
      throw new Error("Could not get WebGL context")
    }

    const shaderProgram = createShaderProgram(gl)

    // useProgram is similar to bindBuffer, since we can only have one program
    // going at a time we need to tell OpenGL which is up.
    gl.useProgram(shaderProgram)
    gl.viewport(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Set the camera resolution and FOV uniforms
    const resolutionLocation = gl.getUniformLocation(
      shaderProgram,
      "uResolution"
    )
    gl.uniform2f(resolutionLocation, CANVAS_WIDTH, CANVAS_HEIGHT)
    const fovLocation = gl.getUniformLocation(shaderProgram, "uFOV")
    gl.uniform1f(fovLocation, CAMERA_FOV)

    // Set the quad uniforms
    const quadLocation = gl.getUniformLocation(shaderProgram, "uQuad")
    gl.uniform3fv(
      quadLocation,
      [
        // p00
        -1, -1, 0,
        // p01
        -1, 1, 0,
        // p10,
        1, -1, 0,
        // p11
        1, 1, 0,
      ]
    )

    // Set the camera uniform(s)
    // ————————————————————————
    const { tx, ty, tz, xRotation, yRotation } = cameraRef.current

    /**
     * Translation in 3D:
     * https://www.youtube.com/watch?v=bW9goiYaOBs
     *
     *    1  0  0  tx
     *    0  1  0  ty
     *    0  0  1  tz
     *    0  0  0  1
     */
    const translationMatrix = new Mat4(
      // x column
      1,
      0,
      0,
      0,
      // y column
      0,
      1,
      0,
      0,
      // z column
      0,
      0,
      1,
      0,
      // w column
      tx,
      ty,
      tz,
      1
    )

    /**
     * Rotation about the y-axis by angle a (radians):
     * https://en.wikipedia.org/wiki/Rotation_matrix#Basic_3D_rotations
     *
     * cos(a)   0   sin(a)
     *   0      1     0
     * -sin(a)  0   cos(a)
     */
    const yRotationMatrix = new Mat4(
      // x column
      Math.cos(yRotation),
      0,
      -1 * Math.sin(yRotation),
      0,
      // y column
      0,
      1,
      0,
      0,
      // z column
      Math.sin(yRotation),
      0,
      Math.cos(yRotation),
      0,
      // w column
      0,
      0,
      0,
      1
    )

    /**
     * Rotation about the y-axis by angle a (radians):
     * https://en.wikipedia.org/wiki/Rotation_matrix#Basic_3D_rotations
     *
     *   1     0       0
     *   0   cos(a)  -sin(a)
     *   0   sin(a)   cos(a)
     */
    const xRotationMatrix = new Mat4(
      // x column
      1,
      0,
      0,
      0,
      // y column
      0,
      Math.cos(xRotation),
      Math.sin(xRotation),
      0,
      // z column
      0,
      -1 * Math.sin(xRotation),
      Math.cos(xRotation),
      0,
      // w column
      0,
      0,
      0,
      1
    )

    const projectionLocation = gl.getUniformLocation(
      shaderProgram,
      "uProjection"
    )

    const projectionMatrix = new Mat4()
    Mat4.multiply(projectionMatrix, translationMatrix, yRotationMatrix)
    Mat4.multiply(projectionMatrix, projectionMatrix, xRotationMatrix)
    gl.uniformMatrix4fv(projectionLocation, false, projectionMatrix)

    // Draw
    const vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, FULL_SCREEN_QUAD, gl.STATIC_DRAW)
    const positionLocation = gl.getAttribLocation(shaderProgram, "aPosition")

    gl.vertexAttribPointer(
      positionLocation,
      3, // size (x,y,z)
      gl.FLOAT,
      false,
      0, // no stride needed, just consecutive vertices
      0 // no offset needed
    )

    gl.enableVertexAttribArray(positionLocation)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  const [grabbing, setGrabbing] = useState(false)

  const handleMouseDown = (down: React.MouseEvent) => {
    setGrabbing(true)

    document.body.style.cursor = "grabbing"
    const xRotationBase = cameraRef.current.xRotation
    const yRotationBase = cameraRef.current.yRotation

    let directionLock: "x" | "y" | undefined = undefined

    const handleMouseMove = (move: MouseEvent) => {
      const dx = move.clientX - down.clientX
      let dy = move.clientY - down.clientY

      let yRotation = yRotationBase + (dx * Y_ROTATION_SPEED) / CANVAS_HEIGHT

      if (Math.abs(yRotation) % (2 * Math.PI) > Math.PI) {
        dy = -1 * dy
      }

      let xRotation = xRotationBase + (dy * X_ROTATION_SPEED) / CANVAS_WIDTH
      xRotation = Math.min(Math.PI / 2, xRotation)

      const xDistance = Math.abs(dx)
      const yDistance = Math.abs(dy)

      if (directionLock === "x") {
        yRotation = yRotationBase
      } else if (directionLock === "y") {
        xRotation = xRotationBase
      } else if (xDistance > 10 && xDistance > yDistance) {
        directionLock = "y"
      } else if (yDistance > 10 && yDistance > xDistance) {
        directionLock = "x"
      }

      cameraRef.current = {
        ...cameraRef.current,
        xRotation,
        yRotation,
      }

      render()
    }

    const handleMouseUp = () => {
      // Set grabbing to false so the hover cursor on the canvas goes back to grab
      setGrabbing(false)
      // Also remove the cursor from the body which applies when we drag off the canvas
      document.body.style.removeProperty("cursor")

      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  return (
    <canvas
      ref={handleMount}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onMouseDown={handleMouseDown}
      style={{ cursor: grabbing ? "grabbing" : "grab" }}
    ></canvas>
  )
}

function createShaderProgram(gl: WebGLRenderingContext) {
  const program = gl.createProgram()

  if (!program) {
    throw new Error("Could not create WebGL program")
  }

  // The vertex shader is what tells the GPU where our verticies are, based on
  // whatever world data we feed it
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, V_FULL_SCREEN_QUAD)

  // The fragment shader renders all of the pixels inside that geometry
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, F_OCTANT_RAY_CAST)

  gl.attachShader(program, vertexShader)

  gl.attachShader(program, fragmentShader)

  // The program has to be "linked" before it can be "used". There's not a lot
  // of documentation out there, but it seems to be another kind of compile step
  // that just checks that the vertex and fragment shaders are both there and
  // make sense together. Also, after the program is in use we can modify the
  // individual shaders, but those changes won't take effect until we call
  // linkProgram again.
  gl.linkProgram(program)

  return program
}

function createShader(
  gl: WebGLRenderingContext,
  shaderType: number,
  source: string
) {
  const shader = gl.createShader(shaderType)

  if (!shader) {
    throw new Error(`Could not create type ${shaderType}shader`)
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  checkCompileStatus(gl, shader)

  return shader
}

function checkCompileStatus(gl: WebGLRenderingContext, shader: WebGLShader) {
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Unknown issue compiling shader"
    )
  }
}
