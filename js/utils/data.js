// RASTERIZATION PRIMITIVES: {
// 		class ViewContext3D := transformational matrix wrapper for R^3 using Perlin's mini-lib.
// }
// DATA STRUCTURE PRIMITIVES: {
//		class QNode 	 :=   DCEL node wrapper for a FIFO queue.
//		class Queue 	 :=   reference to a DCEL of user specified data types.
//		class ObjectList :=   arraylist indexed by unique object UIDs mapped to references.
//		class UIDHandler :=	  arraylist stack responsible for generating, removing, and assigning unique UIDs.
// }

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

class Board {
	#_buf;
	constructor(dim, col) {
		const w = ~~dim.x();
		const h = ~~dim.y();
		this.#_buf = new BufferI32_2D(w,h,1);
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
		if(uid==0 || uid >= this.length()) return null;
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
	count=()=> { return this.length() - this.#_uidh.reservedcount(); }
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
// reserved # of IDs
	count=()=> { return this.#_list.length; }
}

class QNode {
	#_prev; #_next; #_obj;
	constructor(obj) { this.#_obj = obj; }
	set_prev=(prev)=> { this.#_prev = prev; }
	set_next=(next)=> { this.#_next = next; }
	get_prev=()=> { return this.#_prev; }
	get_next=()=> { return this.#_next; }
	data=()=>{ return this.#_obj; }
}
class Queue {
	#_head; #_tail; #_count;
	constructor() { this.#_count = 0; }
	head=()=>{ return this.#_head; }
	push=(obj)=> {
		if(this.#_count > 0) {
			const next = new QNode(obj);
			next.set_prev(this.#_tail);
			this.#_tail.set_next(next);
			this.#_tail = next;
		}else {
			this.#_head = new QNode();
			this.#_tail = new QNode(obj);
			this.#_head.set_next(this.#_tail);
		}
		this.#_count++;
	}
	skip=(obj)=> {
		const next = new QNode(obj);
		const hn = this.#_head.get_next();
		this.#_head.set_next(next);
		next.set_prev(this.#_head);
		next.set_next(hn);
		if(hn) hn.set_prev(next);
		this.#_count++;
	}
	pop=()=> {
		if(this.#_count > 0) {
			const hn = this.#_head.get_next();
			this.#_head = hn;
			hn.set_prev(null);
			this.#_count--;
			return hn.data();
		}else {
			return null;
		}
	}
	peek=()=> {
		if(this.#_count > 0) return this.#_head.get_next().data();
		return null;
	}
	count=()=> { return this.#_count; }
	empty=()=> { return this.#_count <= 0; }
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
	constructor(ads) { this.#_ads = ads; }
	bind=(ad)=> { this.#_cad = this.#_ads[ad]; }
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

// hard-coded hud lookups for the image. Useful for drawing sprites in P2D for UI.
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
	draw_integral=(p5b,i,cx,cy,scl,pad)=> { // very beautiful algorithm :)
		let ix = cx;
		const sd = this.#_numberdim;
		let m10 = 1;
		if(i==0) {this.draw_sprite(p5b,ix,cy,scl,sd[0]); return; }
// raise pow until floor is zero
		for(;m10<10000;m10*=10) { 
			if(~~(i/m10)==0) break;
		} m10 = ~~(m10/10); // go down a level after doing so.
		while(m10 > 0) {
			let slice = ~~(i / m10);
			i -= slice * m10;
			m10 = ~~(m10/10);
			this.draw_sprite(p5b,ix,cy,scl,sd[slice]);
			ix += sd[slice].iw*scl+pad;
		}
	}
	draw_score=(p5b,sc,cx,cy,dx,dy,scl,iscl)=> {
		const sd = this.#_scoredim;
		this.draw_sprite(p5b,cx,cy,scl,sd);
		this.draw_integral(p5b,sc,cx+dx,cy+dy,iscl,0);
	}
// mhp:=max hp, chp:= cur hp, cx:= initial x, cy:= initial y
	draw_hearts=(p5b,mhp,chp,cx,cy,scl,rit)=> {
		let pad = 6;
		let ix=cx; let i=0;
		const fd = this.#_fullhdim;
		const hd = this.#_halfhdim;
		const ed = this.#_empthdim;
		for(;i<chp-1;i+=2) {
			this.draw_sprite(p5b,ix, cy, (i==chp-2)?scl*rit:scl, fd);
			ix += fd.iw*scl+pad;
		}
// if i is not a multiple of two, it will not equal chp. Therefore, this
// means we must draw half a heart.
		if(i != chp) {
			const hd = this.#_halfhdim;
			this.draw_sprite(p5b,ix, cy, scl*rit, hd);
			i+=2;
			ix += hd.iw*scl+pad;
		}
		for(;i<mhp;i+=2) {
			this.draw_sprite(p5b,ix, cy, scl, ed);
			ix += fd.iw*scl+pad;
		}
	}
	draw_sprite=(p5b,cx, cy, scl, sd)=> {
		const img 	= this.#_img;
		p5b.image(img, cx, cy, sd.iw*scl, sd.ih*scl, sd.ix, sd.iy, sd.iw, sd.ih);
	}
}

class BillboardContext {
	#_id;
	#_pos;			// world position
	#_tx;			// texture offset (used when clipping sprites)
	#_sd;			// sprite descriptor
	#_ox; #_oy;		// offsets
	constructor() {}
	bind(vals) {
		this.#_id   = vals.id;
		this.#_pos 	= vals.pos;
		this.#_ox	= vals.ox;
		this.#_oy	= vals.oy == null ? 0 : vals.oy;
		this.#_sd	= vals.sd;
	}
	bind_id=(id)	=> { this.#_id = id; }
	bind_ox=(ox)	=> { this.#_ox = ox; }
	bind_oy=(oy)	=> { this.#_oy = oy; }
	bind_pos=(pos)	=> { this.#_pos = pos; }
	bind_sd=(sd)	=> { this.#_sd = sd; }
	id=()	=>  this.#_id;
	sid=()	=> 	this.#_sd;
	pos=()	=>  this.#_pos;
	tx=()	=> 	this.#_tx;
	ox=()	=> 	this.#_ox;
	oy=()	=> 	this.#_oy;
}

// jlvl := json object data loaded from I/O
// dim := the level dimensions that will define several buffers in use (these will grow over time)
// loaded := whether or not the level has finished loading from I/O
// rbuf := render buffer used during the DDA-raycast procedure
// cbuf := collision buffer used during the physics procedure
class LevelContext {
	#_jlvl; #_dim;
	#_rbuf; #_cbuf;
	#_tset;

	constructor(jlvl, tset) {
		this.#_jlvl 	= jlvl;
		this.#_dim		= new vec2(Math.floor(jlvl.dim[0]), Math.floor(jlvl.dim[1]));
		this.#_tset 	= jlvl.tileset;
// RENDER BUFFER ALLOCATION
		const w			= this.#_dim.x(); 			// x dim
		const h			= this.#_dim.y(); 			// y dim
		this.#_rbuf		= new BufferI32_2D(w,h,2);
		const s			= this.#_rbuf.s();		
		const rbd		= this.#_rbuf.data();
		let i=0;
		for(;i<w*h;i++) { 							// POPULATE
			rbd[i]	 	= jlvl.r_sectors[i][0];		// PLANAR FACES
			rbd[i+w*h] 	= jlvl.r_sectors[i][1];		// UP AND DOWN FACES
		}
// COLLISION BUFFER ALLOCATION
		this.#_cbuf		= new BufferI32_2D(w,h,1);
		const cbd		= this.#_cbuf.data();
// read the level geometry walls that are not zero
		for(i=0;i<w*h;i++) {
			cbd[i]		= jlvl.r_sectors[i];
		}
	}
	dim=()=>this.#_dim;
	rbf=()=>this.#_rbuf;
	cbf=()=>this.#_cbuf;
	tset=()=>this.#_tset;
}

class Resources {
	#_hudimg;		 	// load hud image
	#_font;			 	// text font
	#_tracksheet;		// tracks 
	#_soundbook;		// sound list
	#_soundsampler;    	// sounds
	#_flipbook; 	 	// flipbook
	#_sounds;		 	// sounds
	#_level;		 	// level data

// ran in preload. We no longer need to worry about callbacks.
	constructor() {
// load in tracksheet details, as well as the track
		this.#_tracksheet = new Tracksheet();
		this.construct_level("json/room.json", (query)=> {
			if(!query.error) { this.#_level = query.level; }
		});
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
	tracksheet=()=>this.#_tracksheet;
	soundsampler=()=>this.#_soundsampler;
	soundbook=()=>this.#_soundbook;
	flipbook=()=>this.#_flipbook;
	jlvl=()=>this.#_level;
	font=()=>this.#_font;
	hudimg=()=>this.#_hudimg;
	jlvl=()=>this.#_level;
// provided a json path, this will load the level based on its configuration
// from Kapp's Final Project assignment back in Fall 2022.
// -DC @ 3/14/2023 PI DAY!~~
	construct_level=(fp, finish)=> {
		loadJSON(fp, (level)=> { // successful callback
	// get its dimensions and skew list
			const dim = level.dim;
			const r_sectors = level.r_sectors;
	// null checking
			if(!dim || !r_sectors) {
				finish({error:true, level:level, dim:dim});
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
					finish({error:true, level:level, dim:dim});
					return;
				}
				finish({error:false, level:level, dim:dim});
				return;
			}
		}, (error)=> { // error callback
			console.log("file was unable to be read.");
			finish({error:true,level:null});
			return;
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
	construct_soundbook=(adsfp, assgn)=> { loadJSON(adsfp, (data)=> { assgn(data); }); }
// loads animation data from a descriptor file
	construct_flipbook=(adsfp, assgn)=> { loadJSON(adsfp, (data)=> { assgn(data); }); }
}