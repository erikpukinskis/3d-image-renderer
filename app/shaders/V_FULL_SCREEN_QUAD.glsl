// This is pretty much the simplest possible vertex shader. It just proxies
// through verticies.

attribute vec4 aPosition; // Vertex data from the buffer
varying vec4 vPosition; // Passed to the fragment shader

void main() {
  vPosition = aPosition;
  gl_Position = aPosition;
}
