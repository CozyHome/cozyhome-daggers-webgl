#version 300 es
	precision highp float;
// uniforms
	uniform float 	uFudgeFactor;
	uniform mat4 	uViewMatrix;
	uniform mat4 	uInvMatrix;
	uniform mat4 	uProject;
	uniform mat4 	uMatrix;
// vertex attributes
	in vec3 aPos; // vertex (object-space) position 
	in vec3 aNor; // vertex (object-space) normal
	in vec2 aUV;  // vertex UV-coordinate

// interpolated
	out vec3 vPos; // vertex (view-space) position
	out vec3 cPos; // vertex (clip-space) position
	out vec3 wNor; // vertex (world-space) normal
	out vec3 vNor; // vertex (view-space) normal
	out	vec2 vUV;  // vertex tangent-space UV coordinate

	void main() {
		float div = uFudgeFactor;

// transform position to clip space:
		vec4 pos = uViewMatrix * uMatrix * vec4(aPos, 1.);
		vec4 nor = (vec4(aNor, 0.) * uInvMatrix);
// set output varyings
		vPos = pos.xyz; // (uViewMatrix * uMatrix * vec4(aPos, 1.)).xyz;
		wNor = nor.xyz; // inverse matrix transpose
		vNor = (vec4(wNor, 0.) * uViewMatrix).xyz;
		vUV	 = aUV;		// (no transforms for UV)
// perspective divide -> clip space
		gl_Position = (uProject * pos) * vec4(1., 1., 1., 1. + div);
// clip-space vertex position
		cPos = gl_Position.xyz;
	}