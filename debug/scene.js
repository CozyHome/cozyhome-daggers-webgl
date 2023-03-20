let SPRITE_LIST;
let ENTITY_LIST;

// provided a json path, this will load the level based on its configuration
// from Kapp's Final Project assignment back in Fall 2022.
// -DC @ 3/14/2023 PI DAY!~~
const LOAD_LEVEL=(fp, finish)=> {
	loadJSON(fp, (level)=> { // successful callback
// get its dimensions and skew list
		const dim = level.dim;
		const r_sectors = level.r_sectors;
// null checking
		if(!dim || !r_sectors) {
			finish({error:true, level:level});
		}
// type checking
		if(Number.isInteger(dim[0]) && Number.isInteger(dim[1])) {
// dimension checking
			let dx = dim[0]; let dy = dim[1];
			if(dx < 0) dx = 1; else if(dx > 64) dx = 64;
			if(dy < 0) dy = 1; else if(dy > 64) dy = 64;
// if our dimensions listed do not correspond to the size of our r_sectors array, we have
// an invalid dimension set, return
			if(r_sectors.length > dx*dy) {
				finish({error:true, level:level});
				return;
			}
			finish({error:false, level:level});
			return;
		}
	}, (error)=> { // error callback
		console.log("file was unable to be read.");
		finish({error:true,level:null});
		return;
	});
}

const SCENE_FSM=new FSM([{
	key:'init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) { fsm.cswitch(man, 'shader_init'); }
},
{
	key:'shader_init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
// attempt to load the JSON file for our level
		LOAD_LEVEL('json/room.json', (query)=> {
// dependency injection: instead of returning a query after LOAD_LEVEL(...)
// we'll need to wait and make sure we get our response. Once we do, set our
// data member to level.
			if(!query.error) { man.level = query.level; }
		});
		loadStrings('debug/shader/voxel.vs', (strs)=> { man.voxel_vs_src = strs.join('\n'); });
		loadStrings('debug/shader/voxel.fs', (strs)=> { man.voxel_fs_src = strs.join('\n'); });
		loadJSON("json/lvl_tds.json", (obj)=> {
			const tileset = {};
			man.tileset = tileset;
			tileset.imgfp = obj.imgfp; // image filepath
			tileset.tdl = obj.tds;     // tile descriptor list 
			tileset.tdl.sort((b,a)=>(b.id - a.id));
			loadImage(tileset.imgfp, (img)=> { tileset.img = img; });
		});
		loadJSON("json/ent_tds.json", (obj)=> {
			const entset = {};
			man.entset = entset;
			entset.imgfp = obj.imgfp; // image filepath
			entset.tdl = obj.tds;     // tile descriptor list 
			entset.tdl.sort((b,a)=>(b.id - a.id));
			loadImage(entset.imgfp, (img)=> { entset.img = img; });
		});
		loadStrings('debug/shader/ent.vs', (strs)=> { man.ent_vs_src = strs.join('\n'); });
		loadStrings('debug/shader/ent.fs', (strs)=> { man.ent_fs_src = strs.join('\n'); });
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
// level is not loaded
		if(!man.level) return;								// level geometry loaded
		if(!man.voxel_vs_src || !man.voxel_fs_src) 	return; // world vertex and fragment shader are loaded
		if(!man.ent_vs_src 	 || !man.ent_fs_src) 	return; // entity vertex and fragment shader are loaded
		if(!man.tileset 	 || !man.tileset.img) 	return;	// tileset and tileset image are loaded
		if(!man.entset 	 	 || !man.entset.img) 	return;	// tileset and tileset image are loaded
		fsm.cswitch(man, 'voxel_compile');
		return;
	},
},
{
	key:'voxel_compile',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		const p5gl = man.p5gl;
		const ctx = p5gl.ctx;
// compile the fragment and vertex shader
		const p_query = GL_CONSTRUCT_PROGRAM(ctx, man.voxel_vs_src, man.voxel_fs_src);

		if(p_query.error) {
			console.error(p_query.msg);
			return;
		}
// copy compilation into state object
		man.prog = p_query.program; 
		man.fs = p_query.fs;
		man.vs = p_query.vs;
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
// program failed to compile
		if(!man.prog) return;
// set program type

		const program = man.prog;
		const ctx = man.p5gl.ctx;
		GL_USE_PROGRAM(ctx, program);
		GL_INIT_VERTEXATTR(ctx, program);

		fsm.cswitch(man, 'ent_compile');
		return;
	}
},
{
	key:'ent_compile',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		const p5gl = man.p5gl;
		const ctx = p5gl.ctx;
// compile the fragment and vertex shader
		const p_query = GL_CONSTRUCT_PROGRAM(ctx, man.ent_vs_src, man.ent_fs_src);

		if(p_query.error) {
			console.error(p_query.msg);
			return;
		}
// copy compilation into state object
		man.ent_prog = p_query.program; 
		man.ent_fs = p_query.fs;
		man.ent_vs = p_query.vs;
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
// program failed to compile
		if(!man.prog) return;
// set program type

		const program = man.ent_prog;
		const ctx = man.p5gl.ctx;
		GL_USE_PROGRAM(ctx, program);
		GL_INIT_VERTEXATTR(ctx, program);

		fsm.cswitch(man, 'draw_game');
		return;
	}
},
{
	key:'draw_game',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
// generate the required state to siphon faces off of a cube
		GENERATE_VOXEL_MESH();
// create camera
		man.view = new ViewContext3D(new vec3(5.5,0.5,5.5),new vec3(0,0,0));
		man.active = true;
		man.fudge = 1;

		man.onClick=()		=> { if(man.active) { requestPointerLock(); } };
		man.onKey=(kc)		=> { if(kc == 27) { man.active = false; } };
		man.mouseOut=()		=> { man.active = false; }
		man.mouseOver=()	=> { man.active = true; }
		man.onFudge=(v)		=> { man.fudge = v; }

		const ctx = man.p5gl.ctx;
		this.init_world_mesh(fsm,man);
		this.init_ent(fsm,man);
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const p5gl = man.p5gl;		// multipurpose graphics package
		const view = man.view;		// viewport
		const glb = p5gl.glb;		// webgl buffer
// set background
		glb.clear();
		glb.background(10,10,100);
// move our viewport
		if(man.active) {
			view.mouselook(16 * deltaTime/1000, movedX, 0);
			view.move(3 * deltaTime/1000);
		}

		this.draw_ents(fsm,man);
		this.draw_world(fsm,man);

	},
	init_ent:function(fsm,man) {
		const ctx = man.p5gl.ctx;
		const program = man.ent_prog;
		
		GL_USE_PROGRAM(ctx, program);

		const mesh = QUAD_MESH_TDS(man.entset.tdl[0], man.entset.img.width,man.entset.img.height,12/32,14/32);
		const ent_vertex_buffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, ent_vertex_buffer);
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(mesh), ctx.STATIC_DRAW);
		GL_INIT_VERTEXATTR(ctx, program);

// load texture into scene
		const img = man.entset.img;
		const tex = GL_CREATE_TEXTURE(ctx, img, false);
		ctx.bindTexture(ctx.TEXTURE_2D, tex);
		ctx.activeTexture(ctx.TEXTURE0);
		man.ent_tex = tex;

		man.ent_mesh = mesh;
		man.ent_vertex_buffer = ent_vertex_buffer;
		man.ent_matrix = mTranslate4x4(5.5,14/32,5.5);
	
		man.et = 0;
		man.etc = 0;
	},
	init_world_mesh:function(fsm,man) {
		const ctx = man.p5gl.ctx;
		const program = man.prog;
		
		GL_USE_PROGRAM(ctx, program);

		man.world = new WorldContext();
		man.world.bind(man.level, man.tileset);
		const mesh = man.world.bake_mesh();

		const vertex_buffer = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, vertex_buffer);
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(mesh), ctx.STATIC_DRAW);
		GL_INIT_VERTEXATTR(ctx, program);

// load texture into scene
		const img = man.tileset.img;
		const tex = GL_CREATE_TEXTURE(ctx, img);
		ctx.bindTexture(ctx.TEXTURE_2D, tex);
		man.world_tex = tex;

		man.mesh = mesh;
		man.vertex_buffer = vertex_buffer;
		man.matrix = mTranslate4x4(0,0,0);
	},
	draw_ents:function(fsm,man) {
		man.et += deltaTime/1000;

		const p5gl = man.p5gl;
		const p5b = p5gl.p5b;
		
		const view 		  = man.view;
		const view_matrix = view.mat();
		const matrix 	  = man.ent_matrix;
// set predefined attributes for our mesh
		const ctx 	  = man.p5gl.ctx;
		const program = man.ent_prog;

		GL_USE_PROGRAM(ctx, program);
		
		ctx.activeTexture(ctx.TEXTURE1);
		ctx.bindTexture(ctx.TEXTURE_2D, man.ent_tex);
// REMEMBER: BIND BUFFERS FIRST. ATTRIBUTES LAST!
		const mesh 			= man.ent_mesh;
		const vertex_buffer = man.ent_vertex_buffer;
		ctx.bindBuffer(ctx.ARRAY_BUFFER, vertex_buffer);

		if(man.et > 1/8) {
			let iw = man.entset.img.width;
			let ih = man.entset.img.height;
			const tds = man.entset.tdl[man.etc % man.entset.tdl.length];
			const min_u = MIN_U(tds,iw,ih), max_u = MAX_U(tds,iw,ih);
			const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);
			
			man.ent_mesh[6] = min_u;
			man.ent_mesh[7] = max_v;
			
			man.ent_mesh[14] = min_u;
			man.ent_mesh[15] = min_v;
			
			man.ent_mesh[22] = max_u;
			man.ent_mesh[23] = max_v;
			
			man.ent_mesh[30] = max_u;
			man.ent_mesh[31] = max_v;
			
			man.ent_mesh[38] = min_u;
			man.ent_mesh[39] = min_v;
			
			man.ent_mesh[46] = max_u;
			man.ent_mesh[47] = min_v;
			man.et = 0; man.etc++;
			ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(mesh), ctx.STATIC_DRAW);
		}
// set proper texture
		
// set uniforms before draw
		GL_SET_UNIFORM(ctx, program, '1f', 		  'uFudgeFactor', man.fudge);
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uProject', 	 false, GL_DEBUG_PERSPECTIVE(width,height));
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uViewMatrix', false, mInverse4x4(view_matrix));
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uMatrix', 	 false, matrix);
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uInvMatrix',  false, mInverse4x4(matrix));
		GL_SET_UNIFORM(ctx, program, '1i', 		  'uSampler', 1);
		GL_INIT_VERTEXATTR(ctx, program);

// set vertex attribute data
		ctx.drawArrays(ctx.TRIANGLES, 0, mesh.length / 8);
	},
	draw_world:function(fsm,man) {
		const p5gl = man.p5gl;
		const p5b = p5gl.p5b;
		
		const view = man.view;
		const view_matrix = view.mat();
		const matrix = man.matrix;
// set predefined attributes for our mesh
		const program = man.prog;
		const ctx = man.p5gl.ctx;

		GL_USE_PROGRAM(ctx, program);
		
		const mesh = man.mesh;
		const vertex_buffer = man.vertex_buffer;

		ctx.activeTexture(ctx.TEXTURE0);
		ctx.bindTexture(ctx.TEXTURE_2D, man.world_tex);
// set vertex attribute data
		ctx.bindBuffer(ctx.ARRAY_BUFFER, vertex_buffer);
// set uniforms before draw
		GL_SET_UNIFORM(ctx, program, '1f', 		  'uFudgeFactor', man.fudge);
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uProject', 	 false, GL_DEBUG_PERSPECTIVE(width,height));
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uViewMatrix', false, mInverse4x4(view_matrix));
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uMatrix', 	 false, matrix);
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uInvMatrix',  false, mInverse4x4(matrix));
		GL_SET_UNIFORM(ctx, program, '1i', 		  'uSampler', 0);
		GL_INIT_VERTEXATTR(ctx, program);

		ctx.drawArrays(ctx.TRIANGLES, 0, mesh.length / 8);

		const flr = (a) => { return Math.floor(a*10)/10; }
		p5b.clear();
		p5b.noStroke(); p5b.fill(255);

		const pos = view.pos();
		p5b.text(`X: ${flr(pos.x())}, Y: ${flr(pos.y())}, Z: ${flr(pos.z())}`,32,32);
		p5b.text(`FPS: ${flr(frameRate())}`,32,48);
		// this.sample_world(man);	
	},
	sample_world:function(man) {
		const view = man.view;
		const brd = man.world.brd();
		const p5gl = man.p5gl;
		const p5b = p5gl.p5b;
		const pos = view.pos();

		let ix = ~~pos.x(); let iy = ~~pos.z();
		if(brd.bounds(ix,iy,0)) {
			const wall_at = brd.sample(ix,iy,0);
			console.log(wall_at);
		}
	}
}]);

// responsible for handling internal state for sprite objects
class SpriteContext {
	#_tdl;
}

// responsible for loading in the world and generating the mesh to be displayed
class WorldContext {
// geo  := level object
// tset := tileset object
// brd  := level geometry board in more compact form
	#_geo; #_tset; #_brd;
	constructor() {}
	bind=(geo,tset)=> {
		const dim = geo.dim;
		const lvl = geo.r_sectors;
		const brd = new BufferI32_3D(dim[0],dim[1],2);

		this.#_geo 	 = geo;		// level geometry
		this.#_tset  = tset;	// tileset
		this.#_brd 	 = brd;		// tileboard

		if(!dim) console.error("dimension element is not present in provided level object.");
// construct a new integer board representing the sector data for each voxel
		const dat = this.#_brd.data();
		const w = brd.w(); const h = brd.h();
// load walls into data structure
		for(let i=0;i<w*h;i++) {
			dat[i] = lvl[i];			// copy wall data
			dat[i+w*h] = lvl[i+w*h];	// copy ceil data
		}
	}
	brd=()=>{ return this.#_brd; }
// bake the mesh via the state induced by bind(...)
	bake_mesh=()=> {
		const iw = this.#_tset.img.width;
		const ih = this.#_tset.img.width;
// UV-helpers
		const TDS=(i)=>{ return this.#_tset.tdl[i]; };
		const mesh = [];
// simplify referencess
		const brd = this.#_brd;
		const dat = brd.data();
		const w = brd.w(); const h = brd.h();

// determine the state of adjacency members in our group
		const check_cell=(x,y,bits)=> {
// ignore out of bounds checks
			if(x < 0 || x >= w || y < 0 || y >= h) // out of bounds x,y
				return 0; //bits; (out of bounds)
	    	else if(dat[x + y*w] != 0)   		   // this sector is not air
				return 0;
			return bits;
		}
// write a vertex to the mesh
		const write_attr=(j,pt,nr,u,v,mesh)=> {
			write_p3(j,pt,mesh);
			write_v3(nr,mesh);
			mesh.push(u); mesh.push(v);
		}
// write an arbitrary vector3 to the mesh
		const write_v3=(v,mesh)=> {
			mesh.push(v._x);
			mesh.push(v._y);
			mesh.push(v._z);
		}
// write an arbitrary point to the mesh
		const write_p3=(j,pt,mesh)=> {
			const jx = (j % 4) % 2; const jy = ~~((j % 4) / 2); const jz = ~~(j / 4);
			mesh.push(pt._x + jx); // X
			mesh.push(pt._z + jz); // Z
			mesh.push(pt._y + jy); // Y
		}
		const assemble_ceil=(pt,mesh,i,ceil)=> {
			let nor = new vec3(0,0,0);
			nor._y = -(i & 0x1) + ((i & 0x2) >> 1);

			if((i & 0x1) != 0) { // floor
				const tds = TDS((ceil >> 8) & 0xFF);

				const min_u = MIN_U(tds,iw,ih), max_u = MAX_U(tds,iw,ih);
				const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);

				write_attr(0,pt,nor,min_u,min_v,mesh);
				write_attr(1,pt,nor,max_u,min_v,mesh);
				write_attr(2,pt,nor,min_u,max_v,mesh);

				write_attr(1,pt,nor,max_u,min_v, mesh);
				write_attr(3,pt,nor,max_u,max_v, mesh);
				write_attr(2,pt,nor,min_u,max_v, mesh);
				return;
			}
			if((i & 0x2) != 0) { // ceil
				const tds = TDS(ceil & 0xFF);

				const min_u = MIN_U(tds,iw,ih), max_u = MAX_U(tds,iw,ih);
				const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);

				write_attr(4,pt,nor,min_u,min_v,mesh);
				write_attr(6,pt,nor,min_u,max_v,mesh);
				write_attr(5,pt,nor,max_u,min_v,mesh);

				write_attr(5,pt,nor,max_u,min_v, mesh);
				write_attr(6,pt,nor,min_u,max_v, mesh);
				write_attr(7,pt,nor,max_u,max_v, mesh);
				return;
			}
		}
// determines the index into a three dimensional unit cube's vertices
		const assemble_wall=(pt,mesh,i,wall)=> {
			let nor = new vec3(0,0,0);
			nor._x = (i & 0x1) - ((i & 0x4) >> 2);
			nor._z = ((i & 0x2) >> 1) - ((i & 0x8) >> 3);

			if((i & 0x1) != 0) { // right
				const tds = TDS((wall >> 8) & 0xFF);

				const min_u = MIN_U(tds,iw,ih), max_u = MAX_U(tds,iw,ih);
				const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);

				write_attr(1,pt,nor,min_u,min_v,mesh);
				write_attr(3,pt,nor,max_u,min_v,mesh);
				write_attr(5,pt,nor,min_u,max_v,mesh);

				write_attr(3,pt,nor,max_u,min_v, mesh);
				write_attr(7,pt,nor,max_u,max_v, mesh);
				write_attr(5,pt,nor,min_u,max_v, mesh);
				return;
			}
			if((i & 0x8) != 0) { // front
				const tds = TDS((wall >> 16) & 0xFF);
				
				const max_u = MIN_U(tds,iw,ih), min_u = MAX_U(tds,iw,ih);
				const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);

				write_attr(3,pt,nor,max_u,min_v,mesh);
				write_attr(2,pt,nor,min_u,min_v,mesh);
				write_attr(6,pt,nor,min_u,max_v,mesh);
				
				write_attr(7,pt,nor,max_u,max_v,mesh);
				write_attr(3,pt,nor,max_u,min_v,mesh);
				write_attr(6,pt,nor,min_u,max_v,mesh);
				return;
			}
			if((i & 0x4) != 0) { // left
				const tds = TDS(wall & 0xFF);
				
				const min_u = MIN_U(tds,iw,ih), max_u = MAX_U(tds,iw,ih);
				const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);

				write_attr(2,pt,nor,max_u,min_v,mesh);
				write_attr(0,pt,nor,min_u,min_v,mesh);
				write_attr(4,pt,nor,min_u,max_v,mesh);

				write_attr(6,pt,nor,max_u,max_v,mesh);
				write_attr(2,pt,nor,max_u,min_v,mesh);
				write_attr(4,pt,nor,min_u,max_v,mesh);
				return;
			}
			if((i & 0x2) != 0) { // back
				const tds = TDS((wall >> 24) & 0xFF);
				
				const min_u = MIN_U(tds,iw,ih), max_u = MAX_U(tds,iw,ih);
				const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);

				write_attr(0,pt,nor,min_u,min_v,mesh);
				write_attr(1,pt,nor,max_u,min_v,mesh);
				write_attr(4,pt,nor,min_u,max_v,mesh);
				
				write_attr(1,pt,nor,max_u,min_v,mesh);
				write_attr(5,pt,nor,max_u,max_v,mesh);
				write_attr(4,pt,nor,min_u,max_v,mesh);
				return;
			}
		}

// origin point for our mesh builder
		const pt = new vec3(0,0,0);
// for every cell in the working set, we'll want to check the adjacency state of each
// neighbor 
		for(let i=0;i<w*h;i++) {
			const wall = dat[i]; const ceil = dat[i+w*h];
			let ix = ~~(i % w); let iy = ~~(i / w);
// origin point updated for every voxel
			pt._x = ix; pt._y = iy;
			const bits = 
				check_cell(ix + 1, 	iy, 	0x1) 	 | 	// RIGHT FACE
				check_cell(ix,		iy - 1, 0x2) 	 |	// FORWARD FACE
				check_cell(ix - 1, 	iy, 	0x4)	 |	// LEFT FACE
				check_cell(ix,		iy + 1,	0x8);		// BACKWARD FACE
// walls
			if(wall != 0) {	
// if wall visible, assemble it
				for(let i =0;i<4;i++) {
					if(((1 << i) & bits) != 0) assemble_wall(pt,mesh,(1 << i),wall);
				}
			}else {
// ceils
				for(let i=0;i<2;i++) {
// if wall visible, assemble it
					assemble_ceil(pt,mesh,(1 << i),ceil);
				}	
			}
		}
		return mesh;
	}
}

const MIN_U=(tds,iw,ih)=>{ return (tds.ox) / iw; }
const MAX_U=(tds,iw,ih)=>{ return (tds.ox + tds.w) / iw; }
const MIN_V=(tds,iw,ih)=>{ return (tds.oy) / ih; }
const MAX_V=(tds,iw,ih)=>{ return (tds.oy + tds.h) / ih; }

// primitive quad used in glue operations w.r.t tile descriptor
const QUAD_MESH_TDS=(tds,iw=1,ih=1,ext_w=0.5,ext_h=0.5)=> {
	const min_u = MIN_U(tds,iw,ih), max_u = MAX_U(tds,iw,ih);
	const min_v = MAX_V(tds,iw,ih), max_v = MIN_V(tds,iw,ih);
	return [
		-ext_w, +ext_h, 0, 0,0,1,  min_u,max_v,
		-ext_w, -ext_h, 0, 0,0,1,  min_u,min_v,
		+ext_w, +ext_h, 0, 0,0,1,  max_u,max_v,

		+ext_w, +ext_h, 0, 0,0,1,  max_u,max_v,
		-ext_w, -ext_h, 0, 0,0,1,  min_u,min_v,
		+ext_w, -ext_h, 0, 0,0,1,  max_u,min_v
	];
}