///// MESH \\\\\
// dependent upon: gfx.js

// compatability with perlin's assignments
let add      = (a,b) => [ a[0]+b[0], a[1]+b[1], a[2]+b[2] ];
let subtract = (a,b) => [ b[0]-a[0], b[1]-a[1], b[2]-a[2] ];
let cross    = (a,b) => [ a[1] * b[2] - a[2] * b[1],
a[2] * b[0] - a[0] * b[2],
a[0] * b[1] - a[1] * b[0] ];
let norm = a => Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
let normalize = a => {
		let s = norm(a);
		return s < .00001 ? [0,0,0] : [ a[0] / s, a[1] / s, a[2] / s ];
}

const STITCH_MESHES = (a,b)=> {
	if(a.length >= b.length)
		return a.concat(b);
	else 
		return b.concat(a);
}

// stitch two meshes together as if they are part of the same
// attribute array
const GLUE_MESHES = (a,b,vert_size=8) => {
	let mesh = a.slice();
	mesh.push(a.slice(a.length - vert_size, a.length));
	mesh.push(b.slice(0, vert_size));
	mesh.push(b);
	return mesh.flat();
}

const UV_MESH = (f, nu, nv, data) => {
	let mesh = [];
// 	this mesh cloud will be computed as the following:
// 	1 - constructing a two dimensional mapping (u,v) -> vertex position (u,v)
// 	2 - given the vertices, construct a two dimensional mapping (u,v) -> surface normal (u,v)
// 	3 - given surface normals, loop through each vertex in mapping and its adjoining face normals
// 		-> construct vertex normals
	const strips = nv+1;
	const samples = nu+1;
	
	const vertices = new Array((1+strips)*(samples));
	const normals = new Array(nu*nv);
	
	const N_TO_V = (ni) => { return ni + ~~(ni / nu); }
	const V_TO_N = (vi) => { return vi - ~~(vi / samples); }

	const N_BOUNDS = (ni) => {
		if(ni >= 0 && ni < normals.length) {
			return true;
		}else {
			return false;
		}
	}

// construct point cloud of all vertices that will be configured together
	for(let iv = 0; iv <= strips; iv++) {
		for(let iu = 0;iu < samples;iu++) {
			const i = iu + iv*samples;
			vertices[i] = f(iu/samples, iv/strips, data);
		}
	}
// now, all points will be indexed in the following manner:
// ix := ~~(i % samples);
// iy := ~~(i / samples);
//
// iterate the table's normals and assign them to the appropriate summation
// we assume bottom left corner convention:
// D -- C		 D := vertices[i + samples];
// |	|		 C := vertices[i + samples + 1];
// |	|		 B := vertices[i + 1];
// A -- B		 A := vertices[i];
	for(let inv = 0; inv <= nv; inv++) {
		for(let inu = 0; inu < nu;inu++) {
			const i = inu + inv*nu; // unwrapped (normal) index
// we map from our normal's index to our vertex index
			const vi = N_TO_V(i); // vertex index

			const D = vertices[vi + samples];
			const C = vertices[vi + samples + 1];
			const B = vertices[vi + 1];
			const A = vertices[vi];

			const AB = subtract(A,B); // A to B
			const BC = subtract(B,C); // B to C
			const CD = subtract(C,D); // C to D
			const DA = subtract(D,A); // D to A		
	
// composition of normals
			let F = [ 0, 0, 0 ]; 
			F = add(F, cross(AB, BC));
			F = add(F, cross(BC, CD));
			F = add(F, cross(CD, DA));
			F = add(F, cross(DA, AB));
			normals[i] = F;
		}
	}

// constructing vertex normals
// we will loop (PER VERTEX) 
	for(let iv = 0; iv <= strips; iv++) {
		for(let iu = 0;iu < samples;iu++) {
			const vi = iu + iv*samples; // unwrapped vertex index

			const ni = V_TO_N(vi); // normal index of upper right face
			let VF = [0, 0, 0];

			if(N_BOUNDS(ni)) 		VF = add(VF, normals[ni]);
			if(N_BOUNDS(ni-1)) 		VF = add(VF, normals[ni-1]);
			if(N_BOUNDS(ni-nu)) 	VF = add(VF, normals[ni-nu]);
			if(N_BOUNDS(ni-nu-1)) 	VF = add(VF, normals[ni-nu-1]);
			VF = normalize(VF);

			let vert = vertices[vi];
			vert[3] = VF[0]; vert[4] = VF[1]; vert[5] = VF[2];
// assuming deep copy
			vertices[vi] = vert;
		}
	}
	
// construct triangle strips
	for(let iv = 0; iv < strips; iv++) {
		let strip = [];
		for(let iu = 0; iu <= samples;iu++) {
			const vi = iu + iv*samples; // unwrapped vertex index
// fixing the last triangle of every triangle strip :)
// this was a bitch.
			if(iu == samples) {
				strip = strip.concat(vertices[vi - samples]);
				strip = strip.concat(vertices[vi]);
			}else {
				strip = strip.concat(vertices[vi]);
				strip = strip.concat(vertices[vi+samples]);
			}
		}
		mesh = GLUE_MESHES(mesh, strip);
	}
	let final = [];
	final = final.concat(vertices[0]);
	final = final.concat(vertices[samples]);
	mesh = GLUE_MESHES(mesh, final);

	return mesh.flat();
}

const UV_MESH2 = (f,nu,nv)=> {
	let mesh = [];
	for (let iv = 0 ; iv < nv ; iv++) {
		let v = iv / nv;
		let strip = [];
		for (let iu = 0 ; iu <= nu ; iu++) {
			let u = iu / nu;
			strip = strip.concat(f(u,v));
			strip = strip.concat(f(u,v+1/nv));
		}
		mesh = GLUE_MESHES(mesh, strip);
	}
	return mesh;
}

// multiplies every vertex attribute structure by both the
// transformation matrix and inverse transformation matrix for
// the normals.
const TRANSFORM_MESH = (mesh, matrix, vert_size=8) => {
	let result = [];
	let IMT = mTranspose4x4(mInverse4x4(matrix));
	for (let n = 0 ; n < mesh.length ; n += vert_size) {
			let V = mesh.slice(n, n + vert_size);
			let P  = V.slice(0, 3);
			let N  = V.slice(3, 6);
			let UV = V.slice(6, 8);
			P = mTransform4x4(matrix, [P[0], P[1], P[2], 1]);
			N = mTransform4x4(IMT,    [N[0], N[1], N[2], 0]);
			result.push(P[0],P[1],P[2], N[0],N[1],N[2], UV);
	}
	return result.flat();
}
// primitive quad used in glue operations
const QUAD_MESH=()=> [
	-0.5, +0.5, 0, 0,0,1,  0,1,
	-0.5, -0.5, 0, 0,0,1,  0,0,
	+0.5, +0.5, 0, 0,0,1,  1,1,

	+0.5, +0.5, 0, 0,0,1,  1,1,
	-0.5, -0.5, 0, 0,0,1,  0,0,
	+0.5, -0.5, 0, 0,0,1,  1,0
];

// cube primitive
const CUBE_MESH=()=> {
	let mesh = [];
	for(let i = 0;i < 6;i++) {
		mesh = STITCH_MESHES(mesh, VOXEL_CUBE[i]);
	}
	return mesh;
}

const VOXEL_CUBE = [];
const GENERATE_VOXEL_MESH=()=> {
	const FACE = () => {
		return TRANSFORM_MESH(QUAD_MESH(), mTranslate4x4([0,0,1]));
	}
	VOXEL_CUBE.push(TRANSFORM_MESH(FACE(), mRoty4x4(Math.PI/2)));
	VOXEL_CUBE.push(TRANSFORM_MESH(FACE(), mRoty4x4(Math.PI)));
	VOXEL_CUBE.push(TRANSFORM_MESH(FACE(), mRoty4x4(3*Math.PI/2)));
	VOXEL_CUBE.push(FACE());
	VOXEL_CUBE.push(TRANSFORM_MESH(FACE(), mRotx4x4(Math.PI/2)));
	VOXEL_CUBE.push(TRANSFORM_MESH(FACE(), mRotx4x4(-Math.PI/2)));
}	

const VOXEL_FACE=(i)=> { return VOXEL_CUBE[i]; }

// generate sphere given the dimensions {x,y} being the number of cuts along
// the latitude and longitude bases
const SPHERE_MESH=(x=40,y=20) => UV_MESH((u,v) => {
	let theta = 2 * Math.PI * u;
	let phi = Math.PI * v - Math.PI/2;
	let cu = Math.cos(theta);
	let su = Math.sin(theta);
	let cv = Math.cos(phi);
	let sv = Math.sin(phi);
	return [
		cu * cv, su * cv, sv, // X, Y, Z
		cu * cv, su * cv, sv, // NX, NY, NZ
		u, v				  // U, V
	];
}, x,y);

const TORUS_MESH=() => UV_MESH((u,v,r) => {
	const theta = 2 * Math.PI * u;
	const phi   = 2 * Math.PI * v;
	const cu = Math.cos(theta);
	const su = Math.sin(theta);
	const cv = Math.cos(phi);
	const sv = Math.sin(phi);
	return [
		cu*(1 + r*cv), su*(1 + r*cv), r*sv, // XYZ
		cu * cv, su * cv, sv, // DEL XYZ
		u, v]; // UV
}, 20, 10, .4);

const DISK_MESH = UV_MESH((u,v) => {
	const theta = 2 * Math.PI * u;
	const phi   = 2 * Math.PI * v;
	const cu = Math.cos(theta);
	let su = Math.sin(theta);
	return [v * cu, v * su, 0,  0, 0, 1,   u, v];
}, 20, 2);
///// MESH \\\\\
