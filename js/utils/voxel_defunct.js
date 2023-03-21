// man.ent_mesh[6] = min_u;
// man.ent_mesh[7] = max_v;
// man.ent_mesh[14] = min_u;
// man.ent_mesh[15] = min_v;
// man.ent_mesh[22] = max_u;
// man.ent_mesh[23] = max_v;
// man.ent_mesh[30] = max_u;
// man.ent_mesh[31] = max_v;
// man.ent_mesh[38] = min_u;
// man.ent_mesh[39] = min_v;
// man.ent_mesh[46] = max_u;
// man.ent_mesh[47] = min_v;
const VOXEL_VERTEXATTR=(ctx, program)=> {
// notify GL we want a buffer to represent an array of
// VERTEX, ATTRIBUTE, DATA!
	const BPE = Int32Array.BYTES_PER_ELEMENT;
// we will assume the following for our vertex and fragment shaders:
// data type: GL.UNSIGNED_INT
// VERTEX ATTRIBUTE STRUCTURE:
// VERTEX POSITION(XYZ)
	const aVox = ctx.getAttribLocation(program, 'aVox');
	ctx.enableVertexAttribArray(aVox);
	ctx.vertexAttribIPointer(aVox, 1, ctx.INT, false, BPE, 0);
}

const VOXEL_DEBUGMESH=(ctx, program)=> {
	const POS_TO_IDX = (x,y,z) => {
		x == ~x;
		y == ~y;
		z == ~z;
		return z*(256) + y*16 + x;
	}
	const ENCODE_POS=(x,y,z)=> { return POS_TO_IDX(x,y,z); }
	const MAP=(dx,dy,dz)=> { return dx + dy*16 + dz*256; }

	let num_tri=0;
	const ENCODE_VOXEL=(x,y,z)=> {
		let i = num_tri*3;
// BOTTOM FACE
		TRIS[i]   = MAP(x,		y,		z);   
		TRIS[i+1] = MAP(x+1,	y,		z); 
		TRIS[i+2] = MAP(x,	  y+1,		z);

		TRIS[i+3] = MAP(x+1,	y,		z);
		TRIS[i+4] = MAP(x+1,  y+1,		z);
		TRIS[i+5] = MAP(x,	  y+1,		z);
		num_tri += 2;
		i += 6;
// BACK FACE
		TRIS[i]	  = MAP(x,		y,		z);
		TRIS[i+1] = MAP(x,		y,	  z+1);
		TRIS[i+2] = MAP(x+1,	y,		z);

		TRIS[i+3] = MAP(x+1,	y,		z);
		TRIS[i+4] = MAP(x,		y,	  z+1);
		TRIS[i+5] = MAP(x+1,	y,	  z+1);
		num_tri += 2;
		i += 6;
// LEFT FACE
		TRIS[i]   = MAP(x,	  y+1,	  z+1);
		TRIS[i+1] = MAP(x,		y,		z);
		TRIS[i+2] = MAP(x,	   y+1,		z);
		
		TRIS[i+3] = MAP(x,	   y+1,	  z+1);
		TRIS[i+4] = MAP(x,		 y,	  z+1);
		TRIS[i+5] = MAP(x,		 y,	    z);
		num_tri += 2;
		i += 6;
// FRONT FACE
		TRIS[i]   = MAP(x,	   y+1,		z); 
		TRIS[i+1] = MAP(x+1,   y+1,		z); 
		TRIS[i+2] = MAP(x+1,   y+1,	  z+1);

		TRIS[i+3] = MAP(x,	   y+1,		z); 
		TRIS[i+4] = MAP(x+1,   y+1,	  z+1);
		TRIS[i+5] = MAP(x,	   y+1,	  z+1);

		num_tri += 2;
		i += 6;
// RIGHT FACE
		TRIS[i]   = MAP(x+1,	 y,		z); 
		TRIS[i+1] = MAP(x+1,	 y,	  z+1);
		TRIS[i+2] = MAP(x+1,   y+1,	  z+1);

		TRIS[i+3] = MAP(x+1,	 y,		z);
		TRIS[i+4] = MAP(x+1,   y+1,	  z+1);
		TRIS[i+5] = MAP(x+1,   y+1,		z);
		num_tri += 2;
		i += 6;
// TOP FACE
		TRIS[i]   = MAP(x,		 y,	  z+1);
		TRIS[i+1] = MAP(x,	   y+1,	  z+1);
		TRIS[i+2] = MAP(x+1,	 y,	  z+1);

		TRIS[i+3] = MAP(x+1,	 y,	  z+1);
		TRIS[i+4] = MAP(x,	   y+1,	  z+1); 
		TRIS[i+5] = MAP(x+1,   y+1,	  z+1);
		num_tri += 2;
		i += 6;
	}

	const VERTS = new Int32Array(65536);
	const TRIS = new Uint16Array(36*65536);

	ENCODE_VOXEL(0,0,0);
	ENCODE_VOXEL(0,0,2);
	ENCODE_VOXEL(2,0,0);
	ENCODE_VOXEL(2,0,2);

	const MESH_LENGTH = num_tri*3;

// construct lattice
	for(let i = 0;i < VERTS.length;i++) {
		const iz = ~~(i / 256);
		const iy = ~~((i % 256) / 16);
		const ix = ~~((i % 256) % 16);
		VERTS[i] = ENCODE_POS(ix,iz,iy);
	}
	// GL_USE_PROGRAM(ctx, program);
	// const abfr = ctx.createBuffer();
	// SCENE.abuffer = abfr;

	// const tbfr = ctx.createBuffer();
	// SCENE.tbuffer = tbfr;

	// VOXEL_VERTEXATTR(ctx, program);
	// ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, tbfr);
	// ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, TRIS, ctx.STATIC_DRAW);
	// ctx.bindBuffer(ctx.ARRAY_BUFFER, abfr);
	// ctx.bufferData(ctx.ARRAY_BUFFER, MESH, ctx.STATIC_DRAW);

	return {
		mesh_length:MESH_LENGTH,
		mesh:VERTS,	  // mesh soup
		tris:TRIS,	  // element array
		// vbuffer:abfr, // vertex buffer
		// ebuffer:tbfr  // element buffer
	}
}
