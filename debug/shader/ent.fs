#version 300 es
	precision highp float;
// uniform
	uniform sampler2D uSampler;
// interpolated
	in vec3 cPos; // clip-space vertex position
	in vec3 vPos; // view-space vertex position
	in vec3 wNor; // world-space vertex normal
	in vec3 vNor; // view-space vertex normal
	in vec2 vUV;  // tangent-space UV

	out vec4 fragColor;

	void main() {
		vec4 tex = texture(uSampler, vUV);
		if(tex.a < 0.1) discard;
		float fog = clamp(1. - vPos.z/8., 0., 1.);
		fragColor = vec4(mix(vec3(0.), tex.xyz, fog), 1.);
	}