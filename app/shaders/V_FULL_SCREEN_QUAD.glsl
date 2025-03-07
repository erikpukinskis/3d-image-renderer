#version 300 es
// This is pretty much the simplest possible vertex shader. It just proxies the
// geometry through to the fragment shader.

// I do wonder if this is even necessary, or if there's some way to just render
// without a vertex shader.

in vec4 aPosition; // Vertex data from the buffer 
out vec4 vPosition; // Passed to the fragment shader

void main() {
  vPosition = aPosition;
  gl_Position = aPosition;
}
