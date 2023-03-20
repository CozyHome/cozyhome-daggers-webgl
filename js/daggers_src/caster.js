const UNIT=16;
const NEAR= 0.001;
const FAR = 24;
const LENSD=FAR-NEAR;

const DIFFICULTIES = [
	{
		TYPE:"BEGINNER",
		MOB_HP	  : 2,
		TRACK_NO  : 1,
		START_HP  : 8,
		MAX_HP    : 8,
		MOB_RATE  : 4,
		FOOD_RATE : 37,
		DIAM_RATE : 6,
		SCORE_MUL : 2
	},
	{
		TYPE:"EXPERIENCED",
		MOB_HP	  : 2,
		TRACK_NO  : 0,
		START_HP  : 6,
		MAX_HP    : 6,
		MOB_RATE  : 3,
		FOOD_RATE : 49,
		DIAM_RATE : 4,
		SCORE_MUL : 3
	},
	{
		TYPE:"IMPOSSIBLE",
		MOB_HP	  : 2,
		TRACK_NO  : 2,
		START_HP  : 4,
		MAX_HP    : 4,
		MOB_RATE  : 1,
		FOOD_RATE : 79,
		DIAM_RATE : 4,
		SCORE_MUL : 6
	}
];

// jlvl := json object data loaded from I/O
// dim := the level dimensions that will define several buffers in use (these will grow over time)
// loaded := whether or not the level has finished loading from I/O
// rbuf := render buffer used during the DDA-raycast procedure
// cbuf := collision buffer used during the physics procedure
class LevelContext {
	#_jlvl; #_dim;
	#_rbuf; #_cbuf;
	#_tex2D;

	constructor(jlvl, tex2D) {
		this.#_jlvl 	= jlvl;
		this.#_tex2D 	= tex2D;
		this.#_dim		= new vec2(Math.floor(jlvl.dim[0]), Math.floor(jlvl.dim[1]));
// RENDER BUFFER ALLOCATION
		const w			= this.#_dim.x(); 			// x dim
		const h			= this.#_dim.y(); 			// y dim
		this.#_rbuf		= new BufferUI32_2D(w,h,2);
		const s			= this.#_rbuf.s();		
		const rbd		= this.#_rbuf.data();
		let i=0;
		for(;i<w*h;i++) { 							// POPULATE
			rbd[i]	 	= jlvl.r_sectors[i][0];		// PLANAR FACES
			rbd[i+w*h] 	= jlvl.r_sectors[i][1];		// UP AND DOWN FACES
		}
// COLLISION BUFFER ALLOCATION
		this.#_cbuf		= new BufferUI32_2D(w,h,1);
		const cbd		= this.#_cbuf.data();
		for(i=0;i<w*h;i++) {
			cbd[i]		= jlvl.c_sectors[i];
		}
	}
// encodes render information into a 64 bit unsigned integer for fast lookup
// during the scanline fragment process -DC @ 10/12/22 (two uint32's right next 2 eachother)
	encode_sector=(BUF, I, FCE_PX, FCE_NX, FCE_PY, FCE_NY, FCE_PZ, FCE_NZ)=> {
		let s32_a=BUF[I];
		s32_a |= (FCE_PX & 0xFF);			// 8 bits for each face
		s32_a |= ((FCE_NX & 0xFF) << 0x8);
		s32_a |= ((FCE_PY & 0xFF) << 0x10);
		s32_a |= ((FCE_NY & 0xFF) << 0x18);
		BUF[I]=s32_a;						// 32 bits reached
		let s32_b=BUF[I+1];
		s32_b |= ((FCE_PZ & 0xFF));
		s32_b |= ((FCE_NZ & 0xFF) << 0x8);
		BUF[2*I]=s32_b;						// 16 more bits available
	}
	dim=()=>this.#_dim;
	rbf=()=>this.#_rbuf;
	cbf=()=>this.#_cbuf;
	tex2D=()=>this.#_tex2D;
}

// useful for storing view transformations. We can now context switch
// between different perspectives. This also allows us to do some pretty
// cool effects involving zbuffering
class ViewContext {
	#_pos; #_fwd; #_fov; #_dim; #_scl;
	#_zbf; #_fbf; #_vbf; #_sbf; #_nbf;
	#_vbfdirty;
	constructor(pos,fwd,fov,dim,scl) {
// account for upscaling
		dim = new vec2(~~(dim.x()/scl),~~(dim.y()/scl));
		this.#_pos 	 = pos;   	// what is our initial point in the plane?
		this.#_fwd 	 = fwd;	  	// what is our initial looking direction?
		this.#_fov 	 = fov;	  	// what is our field of view??
		this.#_dim 	 = dim;	  	// what are our viewport's dimensions?
		this.#_scl   = scl; 	// by what factor are we upscaling?
		this.#_vbfdirty = true; // tell the renderer to compute our view vectors
// store our depth buffer in our viewing context
		this.#_zbf = new BufferI32(dim.x());
// we will pack our interpolated viewing vectors to avoid lerping across loops
		this.#_vbf = new BufferI32(2*dim.x()); 
// we will also store the planes hit in our casting stage in a buffer
		this.#_nbf = new BufferI32(3*dim.x());
// store our fragment data
		this.#_fbf = new ImageBuffer(dim.x(), dim.y());
// normalized screen space coordinates
		this.#_sbf = new BufferI32(2*dim.x()*dim.y());
// initialize screen space (precalculating gradients)
		const sbd  = this.#_sbf.data();
		let i = 0;
		for(;i<dim.x()-1;i++) 	 sbd[2*i]     = i/dim.x(); 
		for(i=1;i<dim.y()-1;i++) sbd[(2*i)-1] = i/dim.y();
	}	
	pos=()=>this.#_pos;
	fwd=()=>this.#_fwd;
	fov=()=>this.#_fov;
	zbf=()=>this.#_zbf;
	fbf=()=>this.#_fbf;
	vbf=()=>this.#_vbf;
	sbf=()=>this.#_sbf;
	nbf=()=>this.#_nbf;
	scl=()=>this.#_scl;
// after we've modified our movement we'll need to recompute our viewing vectors
// we can save cycles by toggling a dirty bit if our fwd or fovs have changed
	bind=(pos,fwd,fov)=> {
		this.#_pos=pos;
		this.#_fwd=fwd;
		this.#_fov=fov;
		this.#_vbfdirty=true;
// re-calculate viewing vectors
		if(this.#_vbfdirty) {
			const vbd = this.#_vbf.data();
			const sbd = this.#_sbf.data();
			const lv = rot2(this.#_fwd, -this.#_fov/2);
			const rv = rot2(this.#_fwd, +this.#_fov/2);
			let iw= 0; let ic=0; let it=0;
			vbd[ic++]=lv.x();
			vbd[ic++]=lv.y();
			for(iw=1;iw < this.#_dim.x()-1;iw++) {
				it = sbd[2*iw];
				vbd[ic++]=(1-it)*lv.x() + it*rv.x();
				vbd[ic++]=(1-it)*lv.y() + it*rv.y();
			}
			vbd[ic++]=rv.x(); vbd[ic++]=rv.y();
			this.#_vbfdirty=false;
		}
	}
	move=()=> {
		if(keyIsDown(81)) { 
			this.#_fov += 20*deltaTime/1000;
			this.#_vbfdirty = true;
		}
		if(keyIsDown(69)) {
			this.#_fov -= 20*deltaTime/1000;
			this.#_vbfdirty = true;
		}
		if(keyIsDown(83)) { 
			this.#_pos = sub2(this.#_pos, mul2(30*deltaTime/1000, this.#_fwd));
		}
		if(keyIsDown(87)) {
			this.#_pos = add2(this.#_pos, mul2(30*deltaTime/1000, this.#_fwd));
		}
		if(keyIsDown(68)) { 
			this.#_fwd = rot2(this.#_fwd, 200*deltaTime/1000); 
			this.#_vbfdirty = true;
		}
		if(keyIsDown(65)) { 
			this.#_fwd = rot2(this.#_fwd, -200*deltaTime/1000); 
			this.#_vbfdirty = true;
		}
	}
// draw to pixels buffer
	flush=()=> { this.#_fbf.flush(0,0,this.#_scl); }
}

function clip_sprite(v, u, sprite) { // scuffed as fuck
// these should really be held constant. 
// instead of running this per sprite, we should roll through
// the entire working set in one go.
	const vbf 	= v.vbf();
	const vbd 	= vbf.data();
	const fw  	= v.vbf().w()/2;
	const p 	= v.pos();
	const f 	= v.fwd();
	const o_f 	= perp2(f);
	const lv 	= new vec2(vbd[0],		 vbd[1]);
	const rv 	= new vec2(vbd[2*(fw-1)],vbd[2*fw-1]);
	const fv 	= new vec2(vbd[fw],		 vbd[fw+1]);
// we compute our perpendicular vectors
	const o_lv 	= perp2(mul2(-1,lv));
	const o_rv 	= perp2(rv);
// now we'll generate our line segment.
	const m    	= sprite.pos();
	const hw   	= sprite.w()/2;
	const a    	= add2(m, mul2(-hw,o_f)); const b = add2(m, mul2(+hw,o_f));
	const o_ab 	= perp2(sub2(a,b));
	const ap   	= sub2(a,p);
	const bp 	= sub2(b,p);
	const a_sl 	= dot2(ap,o_lv);
	const b_sl  = dot2(bp,o_lv);
	const a_sr 	= dot2(ap,o_rv);
	const b_sr  = dot2(bp,o_rv);
	const v_f   = dot2(ap,f);

	const vis = v_f > 0 && !(a_sl > 0 && b_sl > 0 || a_sr > 0 && b_sr > 0);
	if(vis) {
		const f_l 	 = 	toip2(p, fv, a, o_ab);
		const depth  = 	(f_l-NEAR)/(u*LENSD);
		const pl     =	add2(p, mul2(f_l,lv));
		const pr     =	add2(p, mul2(f_l,rv));
		const span	 = 	Math.abs(dot2(sub2(pl,pr), o_f));
		const len	 = 	sprite.w() / span;
		let begin = 0; let end = 0; let tx = 0;
		if(a_sl > 0 && b_sr > 0) {  // FULL CLIP
			end = fw-1;
			tx  = norm2(sub2(pl,a));
		}	
		if(a_sl > 0 && b_sr < 0) { // PARTIAL LEFT
			end = ~~(fw*norm2(sub2(b,pl))/span);
			tx  = norm2(sub2(pl,a));
		}
		if(b_sr > 0 && a_sl < 0) { // PARTIAL RIGHT
			begin = ~~(fw*norm2(sub2(a,pl))/span);
			end   = fw-1;
		}
		if(a_sl < 0 && b_sr < 0) { // UNCLIPPED
			begin 	 = ~~(fw*norm2(sub2(a,pl))/span);
			end 	 = ~~(fw*norm2(sub2(b,pl))/span);
		}
		sprite.clip(true,begin,end,len,depth,tx);
	}else {
		sprite.clip(false,0,0,0,0,0);
	}
}

// v:= viewing context w:= level context, u := world unit, sdata: sprite sampler, sprites := sprite objects
function DRAW(v,l,u,sprite_sampler,sprites) {
	const p   = v.pos();		// world position
	const f   = v.fwd();		// world forward
	const fov = v.fov();		// field of view
	const fbf = v.fbf();    	// fragment handler
	const zbf = v.zbf();		// depth handler
	const vbf = v.vbf();		// vspace handler
	const nbf = v.nbf();		// normals handler

	const rbf = l.rbf(); 		// level render buffer
	const spr = l.tex2D();		// texture sampler

	const zbd = zbf.data(); 	// zspace depths
	const vbd = vbf.data(); 	// vspace vectors
	const fbd = fbf.data(); 	// fragment pixels
	const nbd = nbf.data(); 	// worldspace normals
	
	const rbd = rbf.data(); 	// level render data
	const ltd = spr.data();   	// texture sampler data

	const ncx = p.x()/u;		// normalized world x
	const ncy = p.y()/u;		// normalized world y

// usually these buffers will correspond in length but just in
// case this is no longer the case I am explicitly referencing
// their sizes independently -DC @ 10/9/22
	const zw   = zbf.w(); 		// depth width
	const fw   = fbf.w(); 		// fragment width
	const fh   = fbf.h(); 		// fragment height
// DDA-START
	let xh, 	yh;
	let ivx,	ivy;
	let sx,	   	sy;
	let nd2px, 	nd2py;
	for(let i=zw-1;i>=0;i--) {
		let ivx = vbd[2*i];
		let ivy = vbd[2*i+1];
		nd2px =	ivx > 0 ?  1-(ncx % 1) : -ncx % 1;
		nd2py = ivy > 0 ?  1-(ncy % 1) : -ncy % 1;
		sx = ivx > 0 ? 0.5 : -0.5;
		sy = ivy > 0 ? 0.5 : -0.5;
		xh = DDA_X(ncx, ncy, ivx, ivy, sx, nd2px, rbf);
		yh = DDA_Y(ncx, ncy, ivx, ivy, sy, nd2py, rbf);
		const ni = 3*i;
		if(xh.toi < yh.toi) {
			zbd[i]	  = (xh.toi - NEAR)/(LENSD);		// normalized t
			nbd[ni]	  = ivx > 0 ? 1 : -1; 				// nx
			nbd[ni+1] = 0;								// ny
			nbd[ni+2] = xh.cx;							// c
		}else {
			zbd[i]=(yh.toi - NEAR)/(LENSD);				// normalized t
			nbd[ni]   = 0;								// nx
			nbd[ni+1] = ivy > 0 ? 1 : -1;				// ny
			nbd[ni+2] = xh.cy;							// c
		}
	}

// FRAGMENT-START
	for(let iw = 0; iw < fw;iw++) {
		const ni  = 3*iw;								// normal index to grab values
		const inx = nbd[ni];							// 'indexed' normal x
		const iny = nbd[ni+1];							// 'indexed' normal y
		const ind = nbd[ni+2];							// 'indexed' plane distance

		const ivx = vbd[2*iw];							// interpolated view x
		const ivy = vbd[2*iw+1];						// interpolated view y

		const depth01 = zbd[iw];						// normalized depth (not clamped)
		const depth   = depth01*LENSD;					// unitized time of impact
		const invd01  = Math.max(0,1-depth01);			// 1 minus src depth

		const hx = ncx+ivx*depth;					 	// hit x
		const hy = ncy+ivy*depth;						// hit y

		const rwh = fh/depth; 							// real wall height
		const wh  = Math.min(rwh, fh); 					// wall height to be rendered
		const hh  = wh/2;
		const dh  = Math.floor((fh - wh)/2) + 1; 		// distance to wall height

		let tid_w = rbf.sample(~~(hx+inx*.5),~~(hy+iny*.5),0);
		if(inx != 0) tid_w = inx > 0 ? tid_w & 0xFF : (tid_w >> 8)  & 0xFF;
		else tid_w = iny < 0 ? (tid_w >> 16) & 0xFF : (tid_w >> 24) & 0xFF;

		let ah=0; let ch = 0;
		for(;ch<dh;ch++,ah++) { 						// ceiling
			const i	  = fbf.geti(iw, ah);
			let lt	  = 1/(fh-2*ch);
			let wt 	  = fh*lt;
			let li    = 0.3-Math.sqrt(lt);
			let cx 	  = ncx + wt*ivx;
			let cy	  = ncy + wt*ivy;
			const ci  = spr.transform(
				rbf.sample(~~cx,~~cy,1) & 0xFF,
				UNIT*(ncx+wt*ivx), 
				UNIT*(ncy+wt*ivy)
			);
			fbd[i]    = ltd[ci]*li;
			fbd[i+1]  = ltd[ci+1]*li;
			fbd[i+2]  = ltd[ci+2]*li;
		}
		for(ch=0;ch<wh;ch++,ah++) { 					// walls
			const i = fbf.geti(iw, ch+fh/2 - hh);
			let fog   = invd01;
			fog *= fog;
			fog *= fog;
			const ci = spr.transform(
					tid_w,
					u*(inx*hy - iny*hx),
					u*((ch - hh)/rwh + 0.5)
			);
			fbd[i]  =ltd[ci]  *fog;
			fbd[i+1]=ltd[ci+1]*fog;
			fbd[i+2]=ltd[ci+2]*fog;
		}
		for(ch=0;ch<dh;ch++,ah++) { 					// floor
			const i	  = fbf.geti(iw, ah);
			let   lt  = 1/(2*ch + wh);
			let   wt  = fh*lt;
			let   li  = 0.3-Math.sqrt(lt);
			let   cx  = ncx + wt*ivx;
			let   cy  = ncy + wt*ivy;
			const ci  = spr.transform(
				(rbf.sample(~~(cx),~~(cy),1) >> 8) & 0x00FF,
				u*(ncx + wt*ivx),
				u*(ncy + wt*ivy)
			);
			fbd[i]    = ltd[ci]*li;
			fbd[i+1]  = ltd[ci+1]*li;
			fbd[i+2]  = ltd[ci+2]*li;
		}
	}
// draw sprites
	const dat = sprite_sampler.data();
	const fh2   = fh/2;
	for(let i=1;i<sprites.length;i++) {
		const sp = sprites[i];
		if(!sp.vis()) continue;
		const depth01 = Math.min(1,sp.d());
		const depth10 = 1-depth01;
		const depth   = depth01*LENSD;
		const rwh   = (sp.h()*fh)/(UNIT*depth);
		const wh    = Math.min(fh,rwh);
		const hh 	= wh>>1;
		const wdif  = sp.e() - sp.b();
		const rwdth = sp.l()*fw;
		for(let iw=0;iw<wdif;iw++) { // skip scanlines behind wall geometry
			const irw = sp.w()*(iw/rwdth) + sp.tx();
			for(let ih=0;ih<wh;ih++) {
				const i = fbf.geti(iw+sp.b(),ih+fh2 - hh);
				const ci = sprite_sampler.transform_sprite(sp.sid(),
					irw, 							// U
					sp.h()*((ih - hh)/rwh),	 		// V
					sp.ox(),					 	// UNTRANSFORMED U OFFSET
					sp.oy()					 		// UNTRANSFORMED V OFFSET
				);
 				if(!(dat[ci+3]&0xFF)) continue;  // cutoff
				fbd[i]	 = dat[ci]*depth10;
				fbd[i+1] = dat[ci+1]*depth10;
				fbd[i+2] = dat[ci+2]*depth10;
			}
		}
	}
}
function DDA_X(ncx, ncy, rx, ry, sx, ndpx, grd) {
	let  dt=0; let toi=0;
	let  cx=0; let  cy=0;
	let ndx=0; let ndy=0;
	if(Math.abs(rx) < 0.00001) 
		return { toi:1000,cx:-1,cy:-1 };
	if(rx > 0) {
		dt  = 1/rx;
		ncx += ndpx;
		toi = ndpx * dt;
		ncy += ry * toi;
		ndx = 1;
		ndy = ry/rx;
	}else {
		dt  = -1/rx;
		ncx += ndpx;
		toi = -ndpx * dt; 
		ncy += ry * toi;
		ndx = -1;
		ndy = -ry/rx;
	}
	while(toi<1000) { 						// safety check? nah fuck that : )
		cx = (ncx+sx) - (ncx+sx)%1;
		cy = (ncy) - (ncy%1);
		if(!grd.bounds(cx,cy,0)) break; 	// bounds check
		if(grd.sample(cx,cy,0) != 0) break; // did we hit a surface?
		ncx += ndx;
		ncy += ndy;
		toi += dt;
	}
	return {toi,cx,cy};
}
function DDA_Y(ncx, ncy, rx, ry, sy, ndpy, grd) {
	let dt=0;  let toi=0;
	let cx=0;  let cy=0;
	let ndx=0; let ndy=0;
	if(Math.abs(ry) < 0.00001) return {toi:1000, cx:-1, cy:-1};
	if(ry > 0) {
		dt  = 1/ry;
		ncy += ndpy;
		toi =  ndpy * dt;
		ncx += rx * toi;
		ndx = rx/ry;
		ndy = 1;
	}else {
		dt  = -1/ry;
		ncy += ndpy;
		toi = -ndpy * dt; 
		ncx += rx * toi;
		ndx = -rx/ry;
		ndy = -1;
	}
	while(toi<1000) {
		cx = ncx - (ncx)%1;
		cy = ncy+sy - (ncy+sy)%1;
		if(!grd.bounds(cx,cy,0)) break; // bounds check
		if(grd.sample(cx,cy,0) != 0) break; // did we hit a surface?
		ncx += ndx;
		ncy += ndy;
		toi += dt;
	}
	return {toi,cx,cy};
}
class BillboardContext {
	#_id;
	#_pos;			// world position
	#_w; #_h; #_d;	// width, height and depth of sprite
	#_b; #_l; #_e; 	// begin line, unclipped normalized sprite length, end line
	#_tx;			// texture offset (used when clipping sprites)
	#_vis;			// visibility for the bound viewContext
	#_sd;			// sprite descriptor (see Sampler2D)
	#_ox; #_oy;		// offsets
	constructor() {}
	bind(vals) {
		this.#_id   = vals.id;
		this.#_pos 	= vals.pos;
		this.#_w	= vals.w;
		this.#_h	= vals.h;
		this.#_ox	= vals.ox;
		this.#_oy	= vals.oy;
		this.#_sd	= vals.sd;
	}
	bind_id=(id)	=> { this.#_id = id; }
	bind_ox=(ox)	=> { this.#_ox = ox; }
	bind_oy=(oy)	=> { this.#_oy = oy; }
	bind_pos=(pos)	=> { this.#_pos = pos; }
	bind_w	=(w)	=> { this.#_w = w; }
	bind_h	=(h)	=> { this.#_h = h; }
	bind_sd=(sd)	=> { this.#_sd = sd; }
	clip=(vis,b,e,l,d,tx)=> { // view contexts will call clip() in clip_sprite(...)
		this.#_vis 	= vis;	// visibility
		this.#_b   	= b; 	// begin
		this.#_e   	= e; 	// end
		this.#_l	= l; 	// span
		this.#_d	= d; 	// depth
		this.#_tx	= tx; 	// offset
	}
	id=()	=>  this.#_id;
	sid=()	=> 	this.#_sd;
	pos=()	=>  this.#_pos;
	w=()	=> 	this.#_w;
	h=()	=> 	this.#_h;
	d=()	=> 	this.#_d;
	b=()	=> 	this.#_b;
	l=()	=> 	this.#_l;
	e=()	=> 	this.#_e;
	tx=()	=> 	this.#_tx;
	vis=()	=> 	this.#_vis && this.#_id != 0;
	ox=()	=> 	this.#_ox;
	oy=()	=> 	this.#_oy;
}
// a sorted list of all tracks loaded in setup()
class Tracksheet {
	#_tracks;
	constructor() { this.#_tracks = []; }
	add_track=(tobj)=> {
		this.#_tracks.push(tobj);
		this.#_tracks.sort((a,b)=>a.id-b.id);
	}
	get_track=(tid)=> { return this.#_tracks[tid]; }
}
// a sorted list of all sounds loaded in setup()
class Soundsampler {
	#_sounds;
	constructor() { this.#_sounds = []; }
	add_sound=(sobj)=> {
		this.#_sounds.push(sobj);
		this.#_sounds.sort((a,b)=>a.id-b.id);
	}
	get_sound=(sid)=> { return this.#_sounds[sid]; }
}
// a state machine custom tailored for record tracks
class Trackplayer {
	#_curtrack; #_tracksheet;
	constructor(tracksheet) {
		this.#_tracksheet = tracksheet;
		this.#_curtrack = tracksheet.get_track(0);
	}
	switch_track=(tid)=> {
		const next_track = this.#_tracksheet.get_track(tid);
// pause old track
		this.stop_track();
// clear the old onended callback
		this.#_curtrack = next_track;
	}
	play_track=()=> { this.#_curtrack.track.play(); }
	stop_track=()=> { this.#_curtrack.track.stop(); }
	pause_track=()=> { this.#_curtrack.track.pause(); }
	track_time=()=> { return this.#_curtrack.track.currentTime(); }
	track_length=()=> { return this.#_curtrack.track.duration(); }
	track_bpm=()=> { return this.#_curtrack.bpm; }
}
// Stores a javascript object that bundles sounds relative to the entity type
class Soundsheet {
// cad := current active entity context
// ads := active entity
// ss  := sound sampler
	#_ads; #_ss; #_cad;
	constructor(ads, ss) {
		this.#_ads = ads;
		this.#_ss = ss;
	}
	bind=(ad)=> {
		this.#_cad = this.#_ads[ad];
	}
	play_frame=(t)=> {
		t %= this.#_cad.length;
		const sid = this.#_cad[t].sid;
		this.#_ss.get_sound(sid).sound.play();
	}
}

// Stores animation descriptors provided a js object read from a
// *ads.json file.
class Flipsheet {
	#_ads; #_cad;
	constructor(ads) {
		this.#_ads = ads;
	}
	bind=(ad)=> {
		this.#_cad = this.#_ads[ad];
	}

	get_frame=(t)=> {
// return something valid for negative time values.
		const frms = this.#_cad.frames;
		if(t<0) return frms[0].tid;
// if we don't want to repeat, just return the last frame
		if(t>=1 && !this.#_cad.repeat) return frms[frms.length-1].tid;
// map to range [0,1]
		t %= 1; let i=0; let et=0;
		for(;i<frms.length;i++) {
			et += frms[i].ft;
			if(t<et) break;
		}
		return frms[(i % frms.length)].tid;
	}
}
// A custom buffer handler for level geometry that loads a tileset image into
// memory, and reformats it into a much more cache-friendly way for our scanline
// approach. Instead of directly encoding image data along xy, we are going to
// encode pixel information along our individual tile's columns onto a one dimensional
// strip. This way, subsequent samples to that same texture will be more likely
// to contain that data in the cache line.
class Sampler2D {
	#_buf; #_w; #_h; #_tds;
// at this point we guarantee that the image is loaded
	constructor(tds, tsimg) {
		let tw=0; // total width
		let th=0; // total height
// precalculate the number of pixels we need
		tds.sort((a,b)=>a.id-b.id);
		for(const td of tds) { tw += td.w; th += td.h; }
		this.#_w   	= tw;
		this.#_h	= th;
		this.#_tds	= tds;
		this.#_buf 	= new Uint8ClampedArray(4*tw*th);
		this.carve_buf(tsimg); // carve out the textures into our buffer
	}
	carve_buf=(tsimg)=> {
		tsimg.loadPixels();		 		// needed for p5 to populate the pixels buffer
		const buf 	= this.#_buf; 		// shorthand definition
		const tds	= this.#_tds;		// our texture descriptors
		const px 	= tsimg.pixels;		// pixels buffer of our texture set
		const img_w	= tsimg.width; 		// needed for indexing into image
// sort our texture descriptors based on their ids. This ensures that every carve
// will place our texture data into the right positions.
		let i=0; // our index into the buffer
		tds.sort((a,b)=>a.id-b.id);
		for(let td of tds) {
			const ox=td.ox; const oy=td.oy;
			const tx=td.w;	const ty=td.h;
// append an offset index to our texture descriptor for later use
// this is needed as our individual texture descriptors are not of
// uniform dimension.
			td.ofs = i;
// read a wxh block of pixels offset by ox,oy
			for(let ix=ox;ix<ox+tx;ix++) {
				for(let iy=oy;iy<oy+ty;iy++) {
					const pi=4*(ix+iy*img_w); // multiples of 4: RGBA
					buf[i++]=px[pi];
					buf[i++]=px[pi+1];
					buf[i++]=px[pi+2];
					buf[i++]=px[pi+3];
				}
			}
		}
	}
// transforms local uvs of texture to global uvs of sampler
// usage: let i=transform(ti,x,y);
// px[0] = buf[i]; px[1] = buf[i+1]; ...
	transform=(ti,x,y)=>{
		const td = this.#_tds[ti];
		x = ~~x; y = ~~y; // evil bit hacking >:) mwahahaha
		x  = (x>=0) ? (x % td.w) : td.w - ((-x)%td.w) - 1;
		y  = (y>=0) ? (y % td.h) : td.h - ((-y)%td.h) - 1;
		return td.ofs+((y+x*td.h)<<2);
	}
	transform_sprite=(ti,x,y,x0,y0)=>{
		const td = this.#_tds[ti];
		x *= td.sx; y *= td.sy;
		x += (x0 + td.cx); y += (y0 + td.cy);
		x = ~~x; y = ~~y; // evil bit hacking >:) mwahahaha
		x = x <= 0 ? 0 : x; x = x < td.w ? x : td.w-1;
		y = y <= 0 ? 0 : y; y = y < td.h ? y : td.h-1;
		return td.ofs+((y+x*td.h)<<2);
	}
	data=()=>this.#_buf;
// used for debugging tileset after carving
	drawts=(px,pw,ph)=> {
		const buf = this.#_buf;
		const w   = this.#_w; const h = this.#_h;
		let to	  =	0;
		for(const td of this.#_tds) {
			const tw = td.w;  const th = td.h;
			const ox = td.ox; const oy = td.oy;
			for(let ix=0;ix<tw;ix++) {
				for(let iy=0;iy<th;iy++) {
					const bi=4*(iy+ix*th)+td.ofs;
					const pi=4*(ix+(to+iy)*pw);
					px[pi]=buf[bi];
					px[pi+1]=buf[bi+1];
					px[pi+2]=buf[bi+2];
					px[pi+3]=buf[bi+3];
				}
			} to+=th;
		}
	}
	draw_carve=(px,pw,ph,tid)=> {
		const td  = this.#_tds[tid];
		const buf = this.#_buf;
		const w   = this.#_w; const h = this.#_h;
		const tw  = td.w;  const th = td.h;
		const ox  = td.ox; const oy = td.oy;
		for(let ix=0;ix<tw;ix++) {
			for(let iy=0;iy<th;iy++) {
				const bi=4*(iy+ix*th)+td.ofs;
				const pi=4*(ix+(iy)*pw);
				px[pi]=buf[bi];
				px[pi+1]=buf[bi+1];
				px[pi+2]=buf[bi+2];
				px[pi+3]=buf[bi+3];
			}
		}
	}
	dbg=(w,h)=> {
		loadPixels();
		this.drawts(pixels,w,h);
		updatePixels();
	}
	write_tid=(id1,id2)=> {
		this.#_tds[id1] = this.#_tds[id2];
	}
}
class BufferI32 {
	#_w; #_buf;
	constructor(w) {
		this.#_w = w;
		this.#_buf = new Float32Array(w);
	}
	w=()	=> this.#_w;
	data=()	=> this.#_buf;
}
class BufferUI32_2D { 
// contains unsigned int 32s
// used for buffers that act as if they are two dimensional, but really aren't.
// p := number of uint32s per coordinate pair (w,h)
// -DC @ 10/12/22
	#_w; #_h; #_s; #_p; #_buf;
	constructor(w, h, p=1) {
		this.#_w = w;
		this.#_h = h;
		this.#_p = p;
		this.#_s = w*h*p;
		this.#_buf = new Int32Array(this.#_s);
	}
	w=()=>this.#_w;
	h=()=>this.#_h;
	p=()=>this.#_p;
	s=()=>this.#_s;
	data=()=>this.#_buf;
// these functions are really just for QOL. I fully intend to inline accessing data in the array.
// There's no need to construct a stack frame every single time I access an object in the array.
	bounds=(x,y,z) => {
		const i = x + y*this.#_w + z*this.#_w*this.#_h;
		return i >= 0 && i <= this.#_s;
	}
	sample=(x,y,z) => this.#_buf[x+y*this.#_w+z*this.#_w*this.#_h];
}
// Buffered Image class that primarily contacts p5's render context. This is our fragment buffer.
// We'll write to this buffer and directly apply it to the canvas via the flush(); call.
class ImageBuffer {
	#_w; #_h; #_gl;
	constructor(w,h) {
		this.#_w = w;
		this.#_h = h;
		this.#_gl = createGraphics(w,h);
	}
	data=() 			=> { return this.#_gl.pixels; }
	bind=()				=> { this.#_gl.loadPixels(); }
	apply=() 			=> { this.#_gl.updatePixels(); }
	flush=(x=0,y=0,s=1) => { image(this.#_gl,x,y,s*this.#_w,s*this.#_h); }
	geti=(x,y) 			=> (4*(x-(x%1)+(y-(y%1))*this.#_w));
	w=() 				=> this.#_w;
	h=() 				=> this.#_h;
	glc=() 				=> this.#_gl;
}
class Resources {
	#_hudimg;		 	// load hud image
	#_font;			 	// text font
	#_spr2D;		 	// sampler2D
	#_tex2D;	 	 	// sampler2D
	#_tracksheet;		// tracks
	#_soundbook;		// sound list
	#_soundsampler;    	// sounds
	#_flipbook; 	 	// flipbook
	#_sounds;		 	// sounds
	#_level;		 	// level data

// ran in preload. We no longer need to worry about callbacks.
	constructor() {
// load in textures and sprites
		this.construct_sampler("json/lvl_tds.json", (sam, img) => {
			this.#_tex2D = sam;
			this.construct_level("json/level0.json", (jlvl)=> {
				this.#_level = jlvl;
			});
		});
		this.construct_sampler("json/ent_tds.json", (sam, img) => {
			this.#_spr2D = sam;
		});
// load in tracksheet
		this.#_tracksheet = new Tracksheet();
		this.construct_tracksheet("json/track_ds.json", (trackobj)=>{
			trackobj.track.setVolume(0.05);
			trackobj.track.setLoop(false);
			trackobj.track.playMode('restart');
			this.#_tracksheet.add_track(trackobj);
		});
		this.#_soundsampler = new Soundsampler();
		this.construct_soundsampler("json/sound_ds.json", (soundobj)=> {
			soundobj.sound.setVolume(0.2);
			this.#_soundsampler.add_sound(soundobj);
		});
		this.construct_soundbook("json/ent_sds.json", (soundbook)=> {
			this.#_soundbook = soundbook;
		});

// load in animation dataset (luckily, it is not dependent on our sprite
// data. Instead, it simply maps to ids which will plug into our spritesheet
// during runtime.
		this.construct_flipbook("json/ent_ads.json", (flipbook)=> {
			this.#_flipbook = flipbook;
		});
// load in font
		this.#_font = loadFont('images/pcsenior.ttf');
		this.#_hudimg = loadImage('images/hud.png');
	}
	tex2D=()=>this.#_tex2D;
	spr2D=()=>this.#_spr2D;
	tracksheet=()=>this.#_tracksheet;
	soundsampler=()=>this.#_soundsampler;
	soundbook=()=>this.#_soundbook;
	flipbook=()=>this.#_flipbook;
	jlvl=()=>this.#_level;
	font=()=>this.#_font;
	hudimg=()=>this.#_hudimg;
// helper function to generalize loading in a Sampler2D
	construct_sampler=(samfp, assgn)=> {
		loadJSON(samfp, (samdata) => {
			const imgfp = samdata.imgfp;
			loadImage(imgfp, (imgdata) => {
				assgn(new Sampler2D(samdata.tds, imgdata), imgdata);
			});
		});
	}
// helper function to generalize loading in a music sheet
	construct_tracksheet=(tsfp, assgn)=> {
		loadJSON(tsfp, (data)=> {
			for(const ds of data.mds) {
				loadSound(ds.path, (track) => {
					assgn({id: ds.id, bpm: ds.bpm, path: ds.path, tnam: ds.tnam, track: track});
				});
			}
		});
	}
	construct_soundsampler=(tsfp, assgn)=> {
		loadJSON(tsfp, (data)=> {
			for(const ds of data.mds) {
				loadSound(ds.path, (sound) => {
					assgn({id:ds.id,name:ds.name,path:ds.path,sound:sound});
				});
			}
		});
	}
// loads sound data from a descriptor file
	construct_soundbook=(adsfp, assgn)=> {
		loadJSON(adsfp, (data)=> {
			assgn(data);
		});
	}
// loads animation data from a descriptor file
	construct_flipbook=(adsfp, assgn)=> {
		loadJSON(adsfp, (data)=> {
			assgn(data);
		});
	}
// loads level data into a JSON object
	construct_level=(lvlfp, assgn)=> {
		loadJSON(lvlfp, (data)=> {
			assgn(data);
		});
	}
}

// hard-coded hud lookups for the image.
class HUDContext {
	#_img;
	#_fullhdim; // heart dimensions
	#_halfhdim;
	#_empthdim;
	#_scoredim; // score dimensions
	#_numberdim;
	constructor(img) { 
		this.#_img = img;
		this.#_fullhdim = {
			ix:	0,	// image x offset
			iy: 0,	// image y offset
			iw:	24,	// image sprite width
			ih:	22  // image sprite height
		}
		this.#_halfhdim = {
			ix:	29,	// image x offset
			iy: 0,	// image y offset
			iw:	24,	// image sprite width
			ih:	22  // image sprite height
		}
		this.#_empthdim = {
			ix: 58,	// image x offset
			iy: 0,	// image y offset
			iw: 24, // image sprite width
			ih: 22	// image sprite height
		}
		this.#_scoredim = {
			ix: 87,
			iy: 0,
			iw: 24,
			ih: 22
		}
		this.#_numberdim = [
			{ix:0,  iy:23, iw:5, ih:6}, // 0
			{ix:6,  iy:23, iw:4, ih:6}, // 1
			{ix:11, iy:23, iw:6, ih:6}, // 2
			{ix:17, iy:23, iw:6, ih:6}, // 3
			{ix:23, iy:23, iw:6, ih:6}, // 4
			{ix:29, iy:23, iw:6, ih:6}, // 5
			{ix:35, iy:23, iw:6, ih:6}, // 6
			{ix:41, iy:23, iw:6, ih:6}, // 7
			{ix:47, iy:23, iw:6, ih:6}, // 8
			{ix:53, iy:23, iw:6, ih:6}, // 9
			{ix:59, iy:23, iw:6, ih:6}, // .
		]
	}
	draw_integral=(i,cx,cy,scl,pad)=> { // very beautiful algorithm :)
		let ix = cx;
		const sd = this.#_numberdim;
		let m10 = 1;
		if(i==0) {this.draw_sprite(ix,cy,scl,sd[0]); return; }
// raise pow until floor is zero
		for(;m10<10000;m10*=10) { 
			if(~~(i/m10)==0) break;
		} m10 = ~~(m10/10); // go down a level after doing so.
		while(m10 > 0) {
			let slice = ~~(i / m10);
			i -= slice * m10;
			m10 = ~~(m10/10);
			this.draw_sprite(ix,cy,scl,sd[slice]);
			ix += sd[slice].iw*scl+pad;
		}
	}
	draw_score=(sc,cx,cy,dx,dy,scl,iscl)=> {
		const sd = this.#_scoredim;
		this.draw_sprite(cx,cy,scl,sd);
		this.draw_integral(sc,cx+dx,cy+dy,iscl,0);
	}
// mhp:=max hp, chp:= cur hp, cx:= initial x, cy:= initial y
	draw_hearts=(mhp,chp,cx,cy,scl,rit)=> {
		let pad = 6;
		let ix=cx; let i=0;
		const fd = this.#_fullhdim;
		const hd = this.#_halfhdim;
		const ed = this.#_empthdim;
		for(;i<chp-1;i+=2) {
			this.draw_sprite(ix, cy, (i==chp-2)?scl*rit:scl, fd);
			ix += fd.iw*scl+pad;
		}
// if i is not a multiple of two, it will not equal chp. Therefore, this
// means we must draw half a heart.
		if(i != chp) {
			const hd = this.#_halfhdim;
			this.draw_sprite(ix, cy, scl*rit, hd);
			i+=2;
			ix += hd.iw*scl+pad;
		}
		for(;i<mhp;i+=2) {
			this.draw_sprite(ix, cy, scl, ed);
			ix += fd.iw*scl+pad;
		}
	}
	draw_sprite=(cx, cy, scl, sd)=> {
		const img 	= this.#_img;
		image(img, cx, cy, sd.iw*scl, sd.ih*scl, sd.ix, sd.iy, sd.iw, sd.ih);
	}
}

// keeps track of all time variables used to simulate the gamestate
class Conductor {
	#_bpm; #_bps; #_plyr; #_crotchet;
	constructor(plyr) {
		this.#_plyr = plyr;
	}
	bind=(tid)=> {
		this.#_plyr.switch_track(tid);
		this.#_bpm = this.#_plyr.track_bpm();
		this.#_bps = this.#_bpm / 60;
		this.#_crotchet = 60 / this.#_bpm;
	}
	play=()=> {
		this.#_plyr.play_track();
	}
	pause=()=> {
		this.#_plyr.pause_track();
	}
	ftime=()	=> 	millis()/1000;
	time=()		=>  this.#_plyr.track_time();
	length=()	=>	this.#_plyr.track_length();
	bpm=()		=>	this.#_bpm;
	bps=()		=>	this.#_bps; 					// nicer unit to work with
	crotchet=()	=>	this.#_crotchet;
}

class Board {
	#_buf;
	constructor(dim, col) {
		const w = ~~dim.x();
		const h = ~~dim.y();
		this.#_buf = new BufferUI32_2D(w,h,1);
		const dat = this.#_buf.data();
		const s = this.#_buf.s();
		for(let i = 0;i < s;i++) {
			dat[i]=col[i];
		}
	}
// given two coordinates, swap their ids
	swap=(x1,y1,x2,y2)=> {
		const b = this.#_buf;
		const d = b.data();
		const i1 = (x1+y1*b.w());

		const i2 = (x2+y2*b.w());
		const id1 = d[i1];
		d[i1] = d[i2];
		d[i2] = id1;
	}
	swapf=(x1,y1,x2,y2)=> {
		const b = this.#_buf;
		const d = b.data();
		const i1 = ((~~x1)+(~~y1)*b.w());

		const i2 = ((~~x2)+(~~y2)*b.w());
		const id1 = d[i1];
		d[i1] = d[i2];
		d[i2] = id1;
	}
// set a particular coordinate to a number
	set=(x,y,id)=> {
		const b = this.#_buf;
		const d = b.data();
		d[(x+y*b.w())] = id;
	}
	setf=(x,y,id)=> {
		const b = this.#_buf;
		const d = b.data();
	
		d[((~~x)+(~~y)*b.w())] = id;
	}
	sample=(x,y)=> { return this.#_buf.sample(x,y,0); }
	samplef=(x,y)=> { 
		return this.#_buf.sample(~~x,~~y,0);
	}
	buf=()=> this.#_buf;
}

// simple list of objects that can be overridden after destructing.
class ObjectList {
	#_objs; #_uidh;
	constructor(uidh, nullobj) {
		this.#_uidh = uidh;
		this.#_objs = new Array();
// reserve the first slot for the null object
		this.#_uidh.reserve();
		this.#_objs.push(nullobj);
	}
	write_obj=(ctor, props)=> {
		const obj = ctor();
		const next = this.#_uidh.reserve();
// if our next index is larger, push. if not, overwrite.
		if(next >= this.#_objs.length) this.#_objs.push(obj);
		else this.#_objs[next] = obj;
// write ID
		props.id = next;
		obj.bind(props);
		return obj;
	}
	get_obj=(uid)=> {
// if requested UID is zero: return null
		if(uid==0) return null;
// if the entity in question houses a zero uid, that means its dead: return null		
		const obj = this.#_objs[uid];
		if(obj.uid() == 0) return null;
		else return obj;
	}
	rem_obj=(uid, dtor)=> {
// if attempting to remove null entity, dont!
		if(uid==0) return;
		dtor(this.#_objs[uid]);
		this.#_uidh.open(uid);
	}
	length=()=> { return this.#_objs.length; }
// primarily useful to expose the list to the renderer. terrible idea btw.
	data=()=> { return this.#_objs; }
}

// handles assign unique ids to every entity.
class UIDHandler {
	#_list; #_top;
	constructor() {
		this.#_list = new Array();
// any index at zero is an invalid index.
		this.#_top  = 0;
	}
// get a new id.
	reserve=()=> {
		if(this.#_list.length > 0) {
			return this.#_list.pop();
		}else {
			return this.#_top++;
		}
	}
// open up a new slot to assign to.
	open=(id)=> {
		this.#_list.push(id);
	}
}
class Integrator {
	#_onbt; #_nt; #_lt; #_nqn;
	constructor() {
		this.#_nt=0; this.#_lt=0; this.#_nqn=0; this.#_onbt=null;
	}
// where t := time position and c := crotchet duration
	integrate=(t,c)=> {
		if(t >= this.#_nt) {
			this.#_lt = this.#_nt;
// p5js has a habit of not running when tabs are switched. This causes the difference
// between the current song position and the last acknowledged time to grow. As a result,
// our integrations pile on top of each other as if we were 'zooming' to catch up. I don't
// particulary like this. this is the updated formula to fix this:
			this.#_nt += Math.ceil((t - this.#_lt)/c) * c;
			this.#_nqn++;
			if(this.#_onbt != null) this.#_onbt(this);
		}
	}
	bind=(onbt) => this.#_onbt = onbt;
	delta=(t,c)	=> (t-this.#_lt) / c; 	// [0,1] range between last and next qrtr note
	next=()		=> this.#_nt;		 	// time position of next qrtr note
	last=()		=> this.#_lt;		 	// time position of last qrtr note
	nqn=()		=> this.#_nqn;			// number of quarters
}
class BeatEntity {
	#_fsm; #_man; #_id;
	constructor() {}
	bind(vals) {
		this.#_id		= vals.id;
		this.#_fsm 		= vals.fsm;
		this.#_man 		= {
			_cur:null, // assign first state
			cur() { return this._cur; },
			setcur(nxt) { this._cur = nxt; },
			conductor: vals.inits.conductor,
			level:vals.inits.level,
			integrator: new Integrator(),
		};

// attach the UID operator inside of the BeatEntity. Otherwise, JS would
// get mad at us.
		this.#_man.uid = ()=> { return this.uid(); }
// also include a remove function
		this.#_man.remove = ()=> { this.remove(); }
		this.#_man.ent = this;

		if(vals.overrider != null) vals.overrider(this.#_man);
		this.#_fsm.setup(this.#_man); 			// setup man
		this.#_fsm.set(this.#_man, 'init');
	}
	pulse=()=> {
		const man = this.#_man;
		const fsm = this.#_fsm;
		const con = man.conductor;
		const itg = man.integrator;
		const crotchet = con.crotchet();
		const time = con.time();
		itg.integrate(time, crotchet);
		fsm.pulse(man);
	}
	uid=()=> { return this.#_id; }
	remove=()=> {
		ENTITY_LIST.rem_obj(this.#_id, (ent)=> {
			this.#_id = 0; // assign to zero to signify it is gone
		});
	}
}
// maps signals to real numbers
class InputMap {
	#_pk; #_nk; #_pv; #_nv; #_dv; #_lv; #_h;
	constructor(pk,nk,pv,nv,dv,h=false) {
		this.#_pk=pk; // positive keycode
		this.#_nk=nk; // negative keycode
		this.#_pv=pv; // positive value
		this.#_nv=nv; // negative value
		this.#_dv=dv; // dead value
		this.#_lv=dv; // last value
		this.#_h = h; // can we be continuously held down?
	}
	eval=()=> {
		let vl = this.#_dv;
		if(this.down(this.#_pk) && !this.down(this.#_nk)) vl = this.#_pv;
		if(!this.down(this.#_pk) && this.down(this.#_nk)) vl = this.#_nv;
// check for holding down
		if(this.#_h) {
			return vl;
		}else {
			if(vl != this.dead() && vl == this.#_lv) vl = this.dead();
			else this.#_lv = vl;
		}
		return vl;
	}
	low=() 		=> this.#_nv;
	dead=()		=> this.#_dv;
	high=()		=> this.#_pv;
	down=(kc) 	=> { return keyIsDown(kc);}
}
// associates input maps to durational signals
class BufferedInput {
	#_nt; #_im; #_act; #_p; #_ct; #_bv;
	constructor(im,p) {
		this.#_im   = im; 		 // input mapper
		this.#_nt   = 0;  		 // next time
		this.#_p    = p;  		 // priority
		this.#_ct   = 0;  		 // capture time
		this.#_bv   = im.dead(); // buffered value
		this.#_act  = false; 	 // is active
	}
// this is with respect to a time signature and a number line
	rhythm=(t, c, e, onlate)=> { // time position, duration, epsilon
		const im = this.#_im;
		const evl = im.eval();
		if(evl != im.dead()) {
			const fence = c*(1+Math.floor(t/c));
			const early = t > fence - e;
			const late =  t < fence + e;
			if(early) {
				this.#_act = true;
				this.#_bv  = evl;
				return;
			}
			if(late && onlate != null) {
				this.#_act = true;
				this.#_bv  = evl;
				onlate();
				return;
			}
		}
	}
	clear=()=> {
		const im   = this.#_im;
		this.#_bv  = im.dead();
		this.#_act = false;
	}
// standard capture (without rhythm)
	capture=(et, dt)=> {
		const im = this.#_im;
		const evl = im.eval();
		if(this.#_act) {
			if(et > this.#_nt) {
				this.#_act = false;		// we are no longer active.
				this.#_bv  = im.dead(); // after toggling, reset to dead.	
			}
		}else {
// set to toggle. begin countdown.
			if(evl != im.dead()) {
				this.#_act 	= true; 		// we are active.
				this.#_ct 	= this.#_nt;	// set capture time
				this.#_nt 	+= dt;			// set next time
				this.#_bv   = evl;			// set buffered value
			}
		}
	}
	bval=()=>this.#_bv;
	act=()=>this.#_act;
	captime=()=>this.#_ct;
	priority=()=>this.#_p;
}

const DIRECTOR_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
	},
	enter:function(prev,fsm,man) {
		DIRECTOR_INDEX=man.uid();
		fsm.cswitch(man, 'idle');

		man.roll=(con, board, l, h, success) => {
			const buf = board.buf();
			const s = buf.s();
			const i = ~~((noise(con.time())) * s + random(l,h));
			const x = i % (buf.w()-1) + 1;
			const y = ~~(i / (buf.w()-1)) + 1;
			if(board.sample(x,y)!=0) return;
// successfully rolled an empty slot
			success(x,y,i);
		}
		man.ent.set_playerattr = (playerattr) => {
			man.playerattr = playerattr;
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{	key:'idle',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.integrator.bind((itg)=> {
			this.beat(fsm,man,itg);
		});
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const con = man.conductor;
		const itg = man.integrator;
		if(con.time() > con.length() - 2) {
			man.playerattr.leave();
		}
	},
	beat:function(fsm,man,itg) {
		const con = man.conductor;
		const nqr = itg.nqn();
// spawning a food element
		if((nqr % man.difficulty.FOOD_RATE) == 0) {
			man.roll(con,ITEMBOARD,0,30,(x,y,i) => {
				ENTITY_LIST.write_obj(ENTITY_CTOR, {
					fsm:FOOD_FSM,
					key:'init',
					inits: { conductor:man.conductor, level:man.level },
					overrider:(man)=> { man.pos = new vec2(x+0.5,y+0.5); }
				});
			});
		}
// spawning a diamond element
		if((nqr % man.difficulty.DIAM_RATE) == 0) {
			man.roll(con,ITEMBOARD,0,1,(x,y,i) => {
				ENTITY_LIST.write_obj(ENTITY_CTOR, {
					fsm:DIAMOND_FSM,
					key:'init',
					inits: { conductor:man.conductor, level:man.level },
					overrider:(man)=> { man.pos = new vec2(x+0.5,y+0.5); }
				});
			});
		}

// spawning a skeleton element
		if((nqr % man.difficulty.MOB_RATE) == 0) {
			man.roll(con,TILEBOARD,0,50,(x,y,i) => {
// only spawn if we are not too close to player
				const mnh = sub2(new vec2(x+.5,y+.5),PLAYER_ENTITY().getlps().a());
				if(mnh.x() > 1 || mnh.x() < -1 && 
				   mnh.y() > 1 || mnh.y() < -1) {
					ENTITY_LIST.write_obj(ENTITY_CTOR, {
						fsm:SKELETON_FSM,
						key:'init',
						inits: { conductor:man.conductor, level:man.level },
						overrider:(sman)=> { 
							sman.pos 	= new vec2(x+0.5,y+0.5),
							sman.sheet 	= new Flipsheet(RES.flipbook()['skeleton']),
							sman.player = PLAYER_ENTITY(),
							sman.health = man.difficulty.MOB_HP
							sman.sounds = new Soundsheet(RES.soundbook()['skeleton'], RES.soundsampler());
						}
					});
				}
			});
		}
	}
}]);

const MENU_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		man.bounce = (itg, con)=> {
			let it = Math.cos(2*Math.PI*itg.delta(con.time(), con.crotchet()));
			return Math.min(1, Math.sqrt(1 - it));
		}
		man.lfv = new lerped2();
		man.lfv.bind(new vec2(100,0), new vec2(103,0));

		man.selectedindex = 0;
		man.selectdelay = 0.1;
		man.selecttime  = 0;
	},
	enter:function(prev,fsm,man) {
		man.selection = [{title:"BEGINNER", score:0},{title:"EXPERIENCED",score:0},{title:"IMPOSSIBLE",score:0}];
		for(let i =0;i < man.selection.length;i++) {
			const stor = window.localStorage.getItem(man.selection[i].title+"_HS");
			if(stor==null)continue;
			man.selection[i].score = int(stor);
		}	

		fsm.cswitch(man, 'menu');	
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'menu',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		noSmooth();
		man.conductor.bind(3, ()=>{ man.conductor.play(); });
		man.conductor.play();
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const v = man.view;
		let it = man.bounce(man.integrator, man.conductor);
		v.bind(v.pos(), v.fwd(), man.lfv.lerp(it).x());

		const w = man.level;
		const buf = v.fbf();
		const glc = buf.glc();

// clip & sort sprites
		man.sprites = Object.create(SPRITE_LIST.data());
		for(let i = 1;i < man.sprites.length;i++) clip_sprite(v, UNIT, man.sprites[i]);
		man.sprites.sort((a,b)=>b.d()-a.d());

		glc.background(0);
		buf.bind();
		DRAW(v,w,UNIT,man.sdata,man.sprites);
 		buf.apply();
		v.flush();
// await input
		const t = millis()/1000;
		if(t > man.selecttime + man.selectdelay) {
			if(keyIsDown(87)) {// W
				man.selecttime = t + man.selectdelay;
				man.selectedindex--;
				if(man.selectedindex < 0) man.selectedindex = man.selection.length-1;
			}else if(keyIsDown(83)) {
				man.selecttime = t + man.selectdelay;
				man.selectedindex++;
				if(man.selectedindex >= man.selection.length) man.selectedindex = 0;
			}else if(keyIsDown(13)) {
				man.launch(DIFFICULTIES[man.selectedindex]);
			}
		}

		textSize(36*(1+it*.06125));
		stroke(0); fill(0);
		strokeWeight(4);
		textAlign(CENTER);
		text("DAGGERS AND DIAMONDS",4+width/2,4+height*0.1);
		stroke(211,117,6);
		text("DAGGERS AND DIAMONDS",width/2,height*0.1);

		let mx = width/2;
		let my = height/2 - 30;
		let arrow = "";
		for(let i = 0;i < man.selection.length;i++) {
			my+=60;
			if(i != man.selectedindex) {
				stroke(220);
				strokeWeight(3);
				arrow="";
			}else { 
				stroke(211,117,6);
				strokeWeight(4);
				arrow=">";
			}
			text(arrow + man.selection[i].title + " HS:" + man.selection[i].score,mx,my);
		}

	}
}
]);

const RENDER_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		RENDER_INDEX = man.uid();
		noSmooth();
		man.lfv = new lerped2();
		man.lfv.bind(new vec2(100,0), new vec2(103,0));

		man.bounce = (itg, con)=> {
			let it = Math.cos(2*Math.PI*itg.delta(con.time(), con.crotchet()));
			return Math.min(1, Math.sqrt(1 - it));
		}
// allow the player to tell us who they are after they are instanced.
// this is an attribute class that the renderer can peak into. This way,
// we aren't directly modifying values.
		man.ent.set_playerattr = (playerattr) => {
			man.playerattr = playerattr;
		}

		man.ent.write_diamondtid=(id1,id2)=> {
			const SDATA = man.sdata;
			SDATA.write_tid(id1,id2);
		}
		textSize(36);
	},
	enter:function(prev, fsm, man) {
		fsm.set(man, 'scene');
	},
	exit:function(next, fsm, man) {
	},
	pulse:function(fsm, man) {}
},
{	key:'scene',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const pattr = man.playerattr;
		const v = man.view;
		const con = man.conductor;
		const itg = man.integrator;
		let it = man.bounce(itg, con);
		v.bind(v.pos(), v.fwd(), man.lfv.lerp(it).x());

		const w = man.level;
		const buf = v.fbf();
		const glc = buf.glc();

// clip & sort sprites
		man.sprites = Object.create(SPRITE_LIST.data());
		for(let i = 1;i < man.sprites.length;i++) clip_sprite(v, UNIT, man.sprites[i]);
		man.sprites.sort((a,b)=>b.d()-a.d());

		glc.background(0);
		buf.bind();
		DRAW(v,w,UNIT, man.sdata, man.sprites);
 		buf.apply();

// if we received damage
		if(pattr.ishurt()) {
			let it = (con.time() - pattr.lhtime())/pattr.thtime();
			it = Math.sqrt(it);
			tint(255,(1-it)*20 + 255*it,(1-it)*20+255*it, 90);
		}
// if we are low on health
		if(pattr.chealth() < 2) {
			let it = itg.delta(con.time(), con.crotchet());
			it = Math.sqrt(it);
			tint(255,(1-it)*20 + 255*it,(1-it)*20+255*it, 90);
		}
		imageMode(CORNER);
		v.flush();
// sine bounce curve (works a bit nicer)
		let rit = 1 + 0.125*Math.sqrt(Math.sin(Math.PI*itg.delta(con.time(),con.crotchet())));
		const hp_offs = new vec2(0.04*width, 0.05*height);
		const sc_offs = new vec2(0.96*width, 0.05*height);

// reset tint for UI
		tint(255);
		imageMode(CENTER);
		man.hud.draw_hearts(pattr.mhealth(),pattr.chealth(), hp_offs.x(),hp_offs.y(),2.4,rit);
		man.hud.draw_score(pattr.score(), sc_offs.x(), sc_offs.y(),10,10,2.4,2.6);
		imageMode(CORNER);
	}
}
]);
const SKELETON_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		man.soundoffset = 0;
		man.bounce = (dt)=> {
			let it = Math.cos(Math.PI*dt);
			return Math.min(1, Math.sqrt(1 - it*it));
		}
// convert the assigned position into a lerped position instead.
		man.lps = new lerped2();
		man.lps.binds(man.pos);

		man.sprite = SPRITE_LIST.write_obj(SPRITE_CTOR, {
			pos:mul2(UNIT,man.pos),
			w:12,
			h:48,
			ox:12,
			oy:0,
			sd:0
		});

		TILEBOARD.setf(man.lps.a().x(), man.lps.a().y(), man.uid());
		man.ent.damage = () => { return this.damage(fsm, man); }
		delete man.pos;
	},
	damage:function(fsm, man) {
		const hp = --man.health;
		if(hp <= 0) {
			man.sounds.bind('death'); man.sounds.play_frame(0);
			fsm.cswitch(man, 'remove');
		}else {
			man.sounds.bind('hurt'); man.sounds.play_frame(man.soundoffset++);
			fsm.cswitch(man, 'stun');
		}
		return hp;
	},
	enter:function(prev, fsm, man) {
		fsm.set(man, 'idle');
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {}
},
{	key:'remove',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {
// delete sprites
		SPRITE_LIST.rem_obj(man.sprite.id(), (spr)=> {
			spr.bind_id(0);
		});
		const at = man.lps.b();
		TILEBOARD.setf(at.x(),at.y(),0);
		man.ent.remove();
		for(key in man) delete man[key];	
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) { man.remove(); }
},
{
	key:'idle',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {
		man.sheet.bind('idle');
// reassign the 'beat' call to this state.
		man.integrator.bind((itg)=>{this.beat(fsm,man,itg)});
		man.lps.binds(man.lps.b());
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const con = man.conductor;
		const itg = man.integrator;
		const sid = man.sheet.get_frame(itg.delta(con.time(), con.crotchet()));
		man.sprite.bind_sd(sid);
	},
	beat:function(fsm,man,itg) {
		if((itg.nqn() % 2) != 0) return;
		const at = man.lps.b();
// manhattan distance
		const mnh = sub2(man.player.getlps().b(), at);
// signed manhattan vector
		const snh = new vec2(Math.sign(mnh.x()),Math.sign(mnh.y()));
		let absX = Math.abs(mnh.x());
		let absY = Math.abs(mnh.y());
// choose Y
		if(absY > absX) {
			const next = add2(at, new vec2(0, snh.y()));
			const idat = TILEBOARD.samplef(next.x(), next.y());
// determine if we hit another entity or piece of geometry
// with our new movement position
			if(idat == 0) {
				TILEBOARD.swapf(at.x(), at.y(), next.x(), next.y());
				man.lps.bind(at, next);
				fsm.cswitch(man, 'move');
// if we move into our player's tile: attack them
			}else if(idat == PLAYER_INDEX) {
				const ent = ENTITY_LIST.get_obj(PLAYER_INDEX);
				ent.hurt();
				man.sounds.bind('atck'); man.sounds.play_frame(0);
			}
		}else { // choose X
			const next = add2(at, new vec2(snh.x(), 0));
			const idat = TILEBOARD.samplef(next.x(), next.y());
			if(idat == 0) {
				TILEBOARD.swapf(at.x(), at.y(), next.x(), next.y());
				man.lps.bind(at, next);
				fsm.cswitch(man, 'move');
// if we move into our player's tile: attack them
			}else if(idat == PLAYER_INDEX) {
				const ent = ENTITY_LIST.get_obj(PLAYER_INDEX);
				ent.hurt();
				man.sounds.bind('atck'); man.sounds.play_frame(0);
			}
		}
	}
},
{
	key:'move',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {
		man.sheet.bind('atck');
// reassign the 'beat' call to this state.
		man.integrator.bind((itg)=>{this.beat(fsm,man,itg)});
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const con = man.conductor;
		const ecrotch = 0.75*con.crotchet();
		const itg = man.integrator;
		const sid = man.sheet.get_frame(itg.delta(con.time(), con.crotchet()));
		
		let dx = (con.time() % con.crotchet())/ecrotch;
		let it = Math.min(1, dx); 
		it = smstep(it);

		man.sprite.bind_sd(sid);
		man.sprite.bind_oy(4*man.bounce(it));
		man.sprite.bind_pos(mul2(UNIT, man.lps.lerp(it)));
	},
	beat:function(fsm,man,itg) {
		man.lps.binds(man.lps.b());
		fsm.cswitch(man, 'guard');
		return;
	}
},
{
	key:'guard',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {
// reassign the 'beat' call to this state.
		man.integrator.bind((itg)=>{this.beat(fsm,man,itg)});
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const con = man.conductor;
		const itg = man.integrator;
		const sid = man.sheet.get_frame(itg.delta(con.time(), con.crotchet()));
		man.sprite.bind_sd(sid);
	},
	beat:function(fsm,man,itg) {
		fsm.cswitch(man, 'idle');
		return;
	}
},
{	key:'stun',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.delay = 2;
		man.bounces = 1;
		man.integrator.bind((itg)=>{this.beat(fsm,man,itg);});
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const con = man.conductor;
		const itg = man.integrator;
		const sid = man.sheet.get_frame(itg.delta(con.time(), con.crotchet()));
		const ecrotch = con.crotchet()*.5;	

		let dx = (con.time() % con.crotchet())/ecrotch;
		let it = Math.min(1, dx); 
		it = smstep(it);

		man.sprite.bind_sd(sid);
		if(man.bounces > 0) {
			man.sprite.bind_oy(-8*man.bounce(it));
			if(dx>=1) {
				man.bounces--;
			}
		}
	},
	beat:function(fsm,man,itg) {
		if(man.delay <= 0) {
			man.delay = 0;
			fsm.cswitch(man, 'idle');
			delete man.bounces;
			delete man.delay;
		}else man.delay--;
	}
}]);
const PLAYER_FSM = new FSM([{	
	key:'init',
	setup:function(fsm,man) {
		PLAYER_INDEX = man.uid();
		man.soundoffset = 0;
		man.bounce = (dt)=> {
			let it = Math.cos(0.5*Math.PI*dt);
			return Math.min(1, Math.sqrt(1 - it*it));
		}
		man.capture = (con, onlate) => {
			// capture inputs
			const ibs = man.binputs;
			for(let i =0;i<ibs.length;i++) {
				ibs[i].b.rhythm(con.time(), 
					con.crotchet(), 
					0.2*con.crotchet(), 
					onlate
				);
			}
		}
		man.wish = (fwd, mv)=> {
			const rgt = perp2(fwd);
			return add2(
				mul2(mv.x(), fwd),
				mul2(mv.y(), rgt)
			);
		}
// construct our player's input maps.
		man.imaps = {
			vert: new InputMap(87,83,1,-1,0),
			hori: new InputMap(81,69,-1,1,0),
			turn: new InputMap(65,68,-90,90,0)
		};
// construct our player's input buffers.
		man.binputs = new Array(
			{name:"fwd", b: new BufferedInput(man.imaps.vert, 10)}, // fwd
			{name:"sid", b: new BufferedInput(man.imaps.hori, 20)}, // side
			{name:"trn", b: new BufferedInput(man.imaps.turn, 30)}  // turn
		);

		man.lps = new lerped2();			// lerped position
		man.lfw = new lerped2();			// lerped forward

		man.lps.binds(new vec2(1.5, 1.5));	// initialize to N(1.5,1.5);
		man.lfw.binds(new vec2(1,0));		// initialize to (1,0);

// allow other objects to read my data!
		man.ent.getlps= ()=> { return man.lps; }
		TILEBOARD.setf(man.lps.a().x(), man.lps.a().y(), PLAYER_INDEX);
// construct player state values
		man.chealth  = man.difficulty.START_HP;
		man.mhealth  = man.difficulty.MAX_HP;
		man.scoremul = man.difficulty.SCORE_MUL;
		man.score	 = 0;
		man.htime	 = 0; // how long to be hurt for
		man.lhtime	 = 0; // last hurt time
		man.streak	 = 0;
		man.thtime	 = () => { return man.conductor.crotchet(); }
// tell the renderer who we are
		man.bundle = {
			chealth:()=> { return man.chealth; }, 	// current HP
			mhealth:()=> { return man.mhealth; }, 	// max HP
			scoremul:()=> { return man.scoremul },	// score multiplier
			score:()=> { return man.score; },
			htime:()=> { return man.htime; },		// used for how long to be hurt for
			lhtime:()=> { return man.lhtime; },		// last hurt time
			thtime:()=> { return man.thtime(); },	// how long of a duration are we hurt for
			ishurt:()=> { return man.htime > 0; },	// simple binary check for easier code to read
			leave:()=> { man.leave(); }
		}
		man.leave = ()=> {
			fsm.cswitch(man, 'leave');
		}
		man.renderer.set_playerattr(man.bundle);
		man.director.set_playerattr(man.bundle);
// allow other entities to hurt us
		man.ent.hurt = () => {
// don't hurt since we are invulnerable
			if(man.htime > 0) return;
			man.chealth--;

			if(man.chealth <= 0) {
				man.sounds.bind('death'); man.sounds.play_frame(0);
				man.leave(man.score);
			} // death

			man.htime = man.thtime();
			man.lhtime = man.conductor.time();
			man.scoremul = man.difficulty.SCORE_MUL;
			man.renderer.write_diamondtid(8,9);
			man.streak = 0;
		}
		man.ent.heal = () => {
			man.chealth += 2;
			if(man.chealth > man.mhealth) man.chealth = man.mhealth;
			man.sounds.bind('food'); man.sounds.play_frame(0);
		}
		man.ent.score = () => {
			man.score += man.scoremul;
			man.sounds.bind('diamond'); man.sounds.play_frame(0);
		}
		man.ent.tryattack = (idat) => {
			if(idat != WALL_INDEX) {
				man.sounds.bind('atck'); man.sounds.play_frame(man.soundoffset++);
				const ent = ENTITY_LIST.get_obj(idat);
				const hpleft = ent.damage();
// successful kill
				if(hpleft <= 0) {
					man.streak += 1;
					man.scoremul = man.difficulty.SCORE_MUL*man.streak;
					if(man.streak > 3) man.streak = 3;
					man.renderer.write_diamondtid(8,9+man.streak);
				}
			}
		}
// when the song ends, transition to the menu on the next frame.
		man.ent.ended =() => {
			man.leave(man.score);
		}
	},
	enter:function(prev, fsm, man) {
		fsm.set(man, 'idle');
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {}
},
{	key:'idle',
	setup:function(fsm,man) {
// set transform data to the view
		const v = man.view;
		v.bind(mul2(UNIT, man.lps.a()), man.lfw.a(), v.fov());
	},
	beat:function(fsm,man,itg) {
// read inputs, choose the highest priority action and
// context switch to the according state after filling in the data.
		const ibs 	= man.binputs;
		const v 	= man.view;
		let i=0;		// iterator
		let hp=0; 	  	// highest priority
		let hpi = -1; 	// highest priority idx
		for(;i < ibs.length;i++) {
			const ib = ibs[i].b;
			if(!ib.act()) continue;
			if(hp < ib.priority()) {
				hp = ib.priority();
				hpi = i;
			}
		}
// time for a context switch
		if(hpi!=-1) {
			const hi = ibs[hpi];
			if(hi.name == "fwd") {
				const wish = man.wish(
					man.lfw.b(), 				// get latest forward direction
					new vec2(hi.b.bval(), 0) 	// get desired movement on XY
				);
				const next = add2(man.lps.a(), wish);
				const idat = TILEBOARD.samplef(next.x(), next.y());
				if(idat == 0) {
					TILEBOARD.swapf(man.lps.a().x(), man.lps.a().y(), next.x(), next.y());
					man.lps.bind(man.lps.a(), next);
					fsm.cswitch(man, 'move');
				}else {
					man.ent.tryattack(idat);
				}
			}else if(hi.name == "sid") {
				const wish = man.wish(
					man.lfw.b(), 				// get latest forward direction
					new vec2(0, hi.b.bval()) 	// get desired movement on XY
				);
				const next = add2(man.lps.a(), wish);
				const idat = TILEBOARD.samplef(next.x(), next.y());
				if(idat == 0) {
					TILEBOARD.swapf(man.lps.a().x(), man.lps.a().y(), next.x(), next.y());
					man.lps.bind(man.lps.a(), next);
					fsm.cswitch(man, 'move');
				}else {
					man.ent.tryattack(idat);
				}
			}else if(hi.name == "trn") {
				man.lfw.bind(man.lfw.a(), rot2(man.lfw.a(), hi.b.bval()));
				fsm.cswitch(man, 'turn');
			}
		}
// clear inputs for next beat cycle
		for(i=0;i< ibs.length;i++) ibs[i].b.clear();
// subtract hurt duration
		man.htime -= man.conductor.crotchet();
		man.htime = Math.max(man.htime, 0);
	},
	enter:function(prev, fsm, man) {
		man.integrator.bind((itg)=>{		
			this.beat(fsm,man,itg);
		});
		const at = man.lps.a();
		const idat = ITEMBOARD.samplef(at.x(), at.y());
// we picked up something
		if(idat != 0) {
			const ent = ENTITY_LIST.get_obj(idat);
			const type = ent.take();
			if(type == 'diamond') {
				man.ent.score();
			}else if(type == 'food') {
				man.ent.heal();
			}
		}
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const itg = man.integrator;
		const con = man.conductor;
		const v = man.view;
// capture inputs
		man.capture(con, () => {
			if(itg.delta(con.time(), con.crotchet()) < 0.25) {
				this.beat(fsm, man, itg);
				return;
			}
		});
		v.bind(mul2(UNIT, man.lps.a()), man.lfw.a(), v.fov());
	}
},
{	key:'move',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {

		const v   = man.view;
		const itg = man.integrator;
		const con = man.conductor;
		const ecrotch = con.crotchet()*0.5;

		let dx = (con.time() % con.crotchet())/ecrotch;
		dx = Math.min(1, dx);
		dx = man.bounce(dx);
		let it = smstep(dx);

		v.bind(mul2(UNIT, man.lps.lerp(it)), man.lfw.a(), v.fov());
		man.capture(con);

		if(dx >= 1) {
			man.lps.binds(man.lps.b());
			fsm.cswitch(man, 'idle');
			return;
		}
	}
},
{	key:'turn',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const v   = man.view;
		const itg = man.integrator;
		const con = man.conductor;
		const ecrotch = con.crotchet()*0.5;

		let dx = (con.time() % con.crotchet())/ecrotch;
		dx = Math.min(1, dx);
		dx = man.bounce(dx);
		let it = smstep(dx);

		v.bind(mul2(UNIT, man.lps.a()), man.lfw.slerp(it), v.fov());
		man.capture(con);

		if(dx >= 1) {
			man.lfw.binds(man.lfw.b());
			fsm.cswitch(man, 'idle');
			return;
		}

	}
},
{	key:'attack',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const v   = man.view;
		const itg = man.integrator;
		const con = man.conductor;
		const ecrotch = con.crotchet()*0.5;

		let dx = (con.time() % con.crotchet())/ecrotch;
		let it = Math.min(1, dx); 
		it = smstep(it);

		v.bind(mul2(UNIT, man.lps.a()), man.lfw.slerp(it), v.fov());
		man.capture(con);

		if(dx >= 1) {
			man.lfw.binds(man.lfw.b());
			fsm.cswitch(man, 'idle');
			return;
		}
	}
},
{
	key:'leave',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {
		man.hardleave(man.bundle.score());	
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {}
}
]);
const WALL_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		WALL_INDEX = man.uid();
	},
	enter:function(prev, fsm, man) {},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {}
}]);
const FOOD_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		man.lps = new lerped2();
		man.lps.binds(man.pos);
		delete man.pos;
		const at = man.lps.a();
		man.sprite = SPRITE_LIST.write_obj(SPRITE_CTOR, {
			pos:mul2(UNIT, at),
			w:12,
			h:24,
			ox:4,
			oy:0,
			sd:13
		});
		man.ent.take = () => { 
			fsm.cswitch(man, 'remove'); 
// play sound
			return 'food';
		}
		man.bounce = (itg, con)=> {
			let it = Math.cos(2*Math.PI*itg.delta(con.time(), con.crotchet()));
			return Math.min(1, Math.sqrt(1 - it));
		}

		ITEMBOARD.setf(at.x(),at.y(),man.uid());
	},
	enter:function(prev,fsm,man) { fsm.cswitch(man, 'idle'); },
	exit:function(next,fsm,man) {},	
	pulse:function(fsm,man) {}
},
{
	key:'idle',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const con = man.conductor;
		const itg = man.integrator;
		let dx = man.bounce(itg,con);
		dx = smstep(dx);		
		man.sprite.bind_oy(2*dx);
	}
},
{
	key:'remove',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
// clear onbeat.
		man.integrator.bind((itg)=>{});
		const at = man.lps.b();
		SPRITE_LIST.rem_obj(man.sprite.id(), (obj)=> {
			obj.bind_id(0);
		});
		man.remove();

		ITEMBOARD.setf(at.x(),at.y(),0);
		for(key in man) delete man[key];	
	},
	exit:function(next,fsm,man) {},	
	pulse:function(fsm,man) {}
}]);

const DIAMOND_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
// convert vec2 to lerped2
		man.lps = new lerped2();
		man.lps.binds(man.pos);
		delete man.pos;
// create sprite
		man.sprite = SPRITE_LIST.write_obj(SPRITE_CTOR, {
			pos:mul2(UNIT, man.lps.a()),
			w:12,
			h:24,
			ox:4,
			oy:0,
			sd:8
		});
		man.bounce = (itg, con)=> {
			let it = Math.cos(2*Math.PI*itg.delta(con.time(), con.crotchet()));
			return Math.min(1, Math.sqrt(1 - it));
		}

		ITEMBOARD.setf(man.lps.a().x(), man.lps.a().y(), man.uid());

		man.ent.take = () => { 
			fsm.cswitch(man, 'remove'); 
// play sound
			return 'diamond';
		}

	},
	enter:function(prev, fsm, man) {
		fsm.cswitch(man, 'idle');
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {}

},
{	key:'idle',
	setup:function(fsm, man) {},
	enter:function(prev, fsm, man) {},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const con = man.conductor;
		const itg = man.integrator;
		let dx = man.bounce(itg,con);
		dx = smstep(dx);		
		man.sprite.bind_oy(2*dx);

	}
},
{	key:'remove',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
// delete sprite
		SPRITE_LIST.rem_obj(man.sprite.id(), (obj)=> {
			obj.bind_id(0);
		});
// clear itemboard
		const at = man.lps.a();
		ITEMBOARD.setf(at.x(),at.y(),0);	
// delete entity
		man.remove();
// clear man object
		for(key in man) delete man[key];
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}

}]);

const GAME_FSM = new FSM([{
	key:'init',
// initialize window settings
	setup:function(fsm,gman) {
// construct and assign canvas to flexbox environment
		gman.canvas = createCanvas(1080,720);
		gman.canvas.id("p5canvas");
		gman.canvas.parent("#center_flexbox");

		frameRate(144);
		pixelDensity(1);

		textAlign(CENTER);
		textSize(36);
		textFont(gman.font);

// basic difficulty wrapper. This will be assigned when the player
// chooses a difficulty from the menu!
		gman.difficulty = DIFFICULTIES.impossible;

		gman.pt			= millis()/1000;
		gman.sdata	 	= RES.spr2D();
		gman.hud		= new HUDContext(RES.hudimg());
		gman.conductor 	= new Conductor(new Trackplayer(RES.tracksheet()));
		gman.level 		= new LevelContext(RES.jlvl(), RES.tex2D());
	},
	enter:function(prev,fsm,man) { fsm.cswitch(man, 'title'); },
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
},
{	key:'title',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,gman) {
		if(prev=='level') {
// apply localStorage to high score
			const difname = gman.difficulty.TYPE + "_HS";
			const lastscore = window.localStorage.getItem(difname);
			if(lastscore != null) {
				const actualscore = float(lastscore);
				if(actualscore < gman.endscore) {
					localStorage.setItem(difname, gman.endscore);
				}
			}else {
				localStorage.setItem(difname, gman.endscore);
			}
		}
// initiate loading sequence
// construct viewing frustrum
		gman.tview = new ViewContext(
			new vec2(UNIT*gman.level.dim().x()/2,UNIT*gman.level.dim().y()/2),
			new vec2(1,0),
			100,
			new vec2(width,height),
			4
		);
// construct null entities to be at position zero in the object lists
		const NULL_SPRITE = new BillboardContext();
		const NULL_ENTITY = new BeatEntity();
		NULL_SPRITE.clip(false,0,0,0,10000,0); // make sure this is never rendered
// preallocate and populate object lists
		SPRITE_LIST = new ObjectList(new UIDHandler(), NULL_SPRITE);
		ENTITY_LIST = new ObjectList(new UIDHandler(), NULL_ENTITY);
// render entity
		const tman = {
			_cur:null, // assign first state
			cur() { return this._cur; },
			setcur(nxt) { this._cur = nxt; },
			view:gman.tview,
			sdata:gman.sdata,
			level:gman.level,
			conductor:gman.conductor,
			integrator: new Integrator(),
			launch:function(difficulty) { gman.difficulty = difficulty; fsm.cswitch(gman, 'level'); }
		};
		gman.trenderer = {
			fsm:MENU_FSM,
			man:tman
		}
		gman.trenderer.fsm.setup(tman);
		gman.trenderer.fsm.set(tman, 'init');
	},
	exit:function(next,fsm,gman) {},
	pulse:function(fsm,gman) {
		gman.trenderer.fsm.pulse(gman.trenderer.man);
	}
},
{	key:'level',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,gman) {

// initiate loading sequence
		if(prev=='title') {
// construct viewing frustrum
			gman.lview = new ViewContext(
				new vec2(UNIT*2,UNIT*2),
				new vec2(1,0),
				100,
				new vec2(width,height),
				4
			);
// construct null entities to be at position zero in the object lists
			const NULL_SPRITE = new BillboardContext();
			const NULL_ENTITY = new BeatEntity();
			NULL_SPRITE.clip(false,0,0,0,10000,0); // make sure this is never rendered
// preallocate and populate object lists
			SPRITE_LIST = new ObjectList(new UIDHandler(), NULL_SPRITE);
			ENTITY_LIST = new ObjectList(new UIDHandler(), NULL_ENTITY);
// populate 2D boards used for items and geometry
			TILEBOARD = new Board(gman.level.dim(), gman.level.cbf().data());
			ITEMBOARD = new Board(gman.level.dim(), gman.level.cbf().data());
// bind the music to be at track zero
			gman.conductor.bind(gman.difficulty.TRACK_NO);
// the bare minimum required for each BeatEntity
			const inits = { conductor: gman.conductor, level: gman.level };
// wall entity
			ENTITY_LIST.write_obj(ENTITY_CTOR, {
				fsm:WALL_FSM,
				key:'init',
				inits,
			});
// render entity
			ENTITY_LIST.write_obj(ENTITY_CTOR, {
				fsm:RENDER_FSM, 
				key:'init',
				inits,
				overrider:(man)=>{man.hud = gman.hud; man.view = gman.lview; man.sdata = gman.sdata; }
			});
// director entity
			ENTITY_LIST.write_obj(ENTITY_CTOR, {
				fsm:DIRECTOR_FSM,
				key:'init',
				inits,
				overrider:(man)=>{man.difficulty = gman.difficulty; }
			});
// spawn player entity
			ENTITY_LIST.write_obj(ENTITY_CTOR, {
				fsm:PLAYER_FSM, 
				key:'init',
				inits,
				overrider:(man)=> {
					man.director = DIRECTOR_ENTITY(),
					man.sounds = new Soundsheet(RES.soundbook()['player'], RES.soundsampler());
					man.difficulty = gman.difficulty,
					man.view = gman.lview,
					man.renderer = RENDER_ENTITY(),
					man.hardleave = (score)=> { gman.endscore = score; man.conductor.play(); fsm.cswitch(gman, 'title'); }
				}
			});
			gman.conductor.play();
		}
	},
	exit:function(next,fsm,gman) {},
	pulse:function(fsm,gman) {
		const rt = millis()/1000;
		if(keyIsDown(80) && rt > gman.pt + 0.25) {
			fsm.cswitch(gman, 'pause');
			gman.pt = rt;
		}

		for(let i=0;i<ENTITY_LIST.length();i++) {
			const ent = ENTITY_LIST.get_obj(i);
			if(ent == null) continue; // dead ent
			else ent.pulse();
		}

		if(gman.cur()!='level') return;
// the renderer waits for changes, so it is manually called at the end of our loop.
		RENDER_ENTITY().pulse();
	}
},
{
	key:'pause',
	setup:function(fsm,gman) {},
	enter:function(prev,fsm,gman) {
		gman.conductor.pause();
	},
	exit:function(next,fsm,gman) {
		gman.conductor.play();
	},
	pulse:function(fsm,gman) {
		const rt = millis()/1000;
// pause
		if(keyIsDown(80) && rt > gman.pt + 0.25) {
			fsm.cswitch(gman, 'level');
			gman.pt = rt;
			return;
		}
		stroke(0); fill(0);
		textAlign(CENTER);
		text("PAUSED",4+width/2,4+height/2);
		stroke(220,220,0);
		text("PAUSED",width/2,height/2);

	},
}]);

// we will assume going forward that ALL ASSETS ARE LOADED IN PRELOAD. THIS WAY WE DON'T HAVE
// MULTIPLE DEPENDENCY CALLBACK CHAINS CLOGGING UP THE CODEBASE. FUCK THAT SHIT MY BRAIN IS
// LITERALLY MELTING AND THIS IS DUE TOMORROW
function preload() {
	RES = new Resources();
}

let RENDER_INDEX 	= 0;
let PLAYER_INDEX 	= 0;
let DIRECTOR_INDEX 	= 0;
let WALL_INDEX   	= 0;

const RENDER_ENTITY   = () => ENTITY_LIST.get_obj(RENDER_INDEX);
const PLAYER_ENTITY   = () => ENTITY_LIST.get_obj(PLAYER_INDEX);
const WALL_ENTITY 	  = () => ENTITY_LIST.get_obj(WALL_INDEX);
const DIRECTOR_ENTITY = () => ENTITY_LIST.get_obj(DIRECTOR_INDEX);

let RES;
let LEVEL;
let TILEBOARD;
let ITEMBOARD;
let GAME_ENTITY;
let SPRITE_LIST;
let ENTITY_LIST;
let VOLUME_AMOUNT;

const ENTITY_CTOR = () => { return new BeatEntity(); }
const SPRITE_CTOR = () => { return new BillboardContext(); }

function changeVolume(el) {
	VOLUME_AMOUNT = el.value;
	outputVolume(VOLUME_AMOUNT/100);
	localStorage.setItem("VOLUME", VOLUME_AMOUNT);
}

function setup() {
	const tempVOL = window.localStorage.getItem("VOLUME", VOLUME_AMOUNT);
	if(tempVOL != null) VOLUME = float(tempVOL);
	else { 
		VOLUME_AMOUNT= 10;
		outputVolume(VOLUME_AMOUNT/100);
	}

// hello mr freeman
	const gman = {
		font:RES.font(),
		_cur:null, // assign first state
		cur() { return this._cur; },
		setcur(nxt) { this._cur = nxt; },

	};
	GAME_ENTITY = { man:gman, fsm: GAME_FSM };
	GAME_ENTITY.fsm.setup(gman);
	GAME_ENTITY.fsm.set(gman, 'init');

}

function draw() {
	GAME_ENTITY.fsm.pulse(GAME_ENTITY.man);
}
