

// takes a INT_Buffer32_3D structure and spits out a mesh
const VOXEL_MESH_3D=(buf) => {
	const w = buf.w(); // width
	const h = buf.h(); // height
	const d = buf.d(); // depth
	const s = buf.s(); // unwraveled
	const dat = buf.data();

	let mesh = [];

	const check_cell=(x,y,z,bits)=> {
// ignore out of bounds checks
		if(x < 0 || x >= w || // out of bounds x
		   y < 0 || y >= h ||
		   z < 0 || z >= d) // out of bounds y
			return bits;
	    else if(dat[x + y*w + z*w*h] != 0)   // this sector is not air
			return 0;
		return bits;
	}

// take the faces of the cube in CUBE_MESH()
// and stitch them together
	const assemble_cell=(bits)=> {
		let vox = [];
		let mask = 1;
		for(let i =0;i < 6;i++) {
			if((bits & mask)) vox = STITCH_MESHES(vox, VOXEL_FACE(i).flat());
			mask <<= 1;
		}
		return vox;
	}

	for(let i = 0;i < s;i++) {
		const iz = ~~(i / (buf.w()*buf.h()));
		const ix = (i % (buf.w()*buf.h())) % buf.w();
		const iy = ~~((i % (buf.w()*buf.h())) / buf.w());

// only draw voxels for objects that are non-zero in the array
		const at = dat[i];
		if(at == 0) continue;
// check neighbouring cells
		const bits = 
			check_cell(ix + 1, 	iy, 		iz, (1<<0)  ) 	 | 			// RIGHT FACE
			check_cell(ix,		iy - 1, 	iz, (1<<1)  ) 	 |			// FORWARD FACE
			check_cell(ix - 1, 	iy, 		iz, (1<<2)  )	 |			// LEFT FACE
			check_cell(ix,		iy + 1, 	iz, (1<<3)	)    |			// BACKWARD FACE
			check_cell(ix,		iy,		iz - 1, (1<<4)	)	 |			// BOTTOM
			check_cell(ix,		iy,		iz + 1,	(1<<5)					// TOP
		); 

		if(bits != 0) {
			mesh = STITCH_MESHES(
				TRANSFORM_MESH(assemble_cell(bits), 
					mMultiply4x4(mTranslate4x4(ix + 0.5 - w/2,iz + 0.5 - d/2,iy + 0.5 - h/2), mScale4x4(0.5))),
				mesh
			);
		}
	}
	return mesh;
}