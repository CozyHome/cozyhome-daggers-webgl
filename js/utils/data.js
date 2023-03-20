// RASTERIZATION PRIMITIVES: {
// 		class ViewContext3D := transformational matrix wrapper for R^3 using Perlin's mini-lib.
// }
// DATA STRUCTURE PRIMITIVES: {
//		class QNode 	 :=   DCEL node wrapper for a FIFO queue.
//		class Queue 	 :=   reference to a DCEL of user specified data types.
//		class ObjectList :=   arraylist indexed by unique object UIDs mapped to references.
//		class UIDHandler :=	  arraylist stack responsible for generating, removing, and assigning unique UIDs.
// }

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

class Resources {
	#_hudimg;		 	// load hud image
	#_font;			 	// text font
	#_tracksheet;		// tracks 
	#_soundbook;		// sound list
	#_soundsampler;    	// sounds
	#_flipbook; 	 	// flipbook
	#_sounds;		 	// sounds
	#_level;		 	// level data
	#_tileset;			// tileset

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
	level=()=>this.#_level;
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
// loads level data into a JSON object
	construct_level=(lvlfp, assgn)=> { loadJSON(lvlfp, (data)=> { assgn(data); }); }
}