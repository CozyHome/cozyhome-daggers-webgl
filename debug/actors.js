let UNIT = 1;
let SPRITE_LIST;
let ENTITY_LIST;
let TILEBOARD;
let ITEMBOARD;

let RENDER_INDEX 	= 0;
let PLAYER_INDEX 	= 0;
let DIRECTOR_INDEX 	= 0;
let WALL_INDEX   	= 0;

const RENDER_ENTITY   = () => ENTITY_LIST.get_obj(RENDER_INDEX);
const PLAYER_ENTITY   = () => ENTITY_LIST.get_obj(PLAYER_INDEX);
const WALL_ENTITY 	  = () => ENTITY_LIST.get_obj(WALL_INDEX);
const DIRECTOR_ENTITY = () => ENTITY_LIST.get_obj(DIRECTOR_INDEX);

const ENTITY_CTOR = () => { return new BeatEntity(); }
const SPRITE_CTOR = () => { return new BillboardContext(); }

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
			const rgt = mTD4x4(mRoty4x4(90*Math.PI/180), fwd);
			return add3(
				mul3(mv.x(), fwd),
				mul3(mv.y(), rgt)
			);
		}
// construct our player's input maps.
		man.imaps = {
			vert: new InputMap(87, 83,  +1,  -1, 0),
			hori: new InputMap(81, 69,  -1,  +1, 0),
			turn: new InputMap(65, 68, +90, -90, 0)
		};
// construct our player's input buffers.
		man.binputs = new Array(
			{name:"fwd", b: new BufferedInput(man.imaps.vert, 10)}, // fwd
			{name:"sid", b: new BufferedInput(man.imaps.hori, 20)}, // side
			{name:"trn", b: new BufferedInput(man.imaps.turn, 30)}  // turn
		);

		man.lps = new lerped3();			// lerped position
		man.lfw = new lerped3();			// lerped forward

		man.lps.binds(new vec3(1.5, 0.5, 1.5));	// initialize to N(1.5,1.5);
		man.lfw.binds(new vec3(0,0,1));		// initialize to (1,0);

// allow other objects to read my data!
		man.ent.getlps= ()=> { return man.lps; }
		TILEBOARD.setf(man.lps.a().x(), man.lps.a().z(), PLAYER_INDEX);
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
				if(ent) {
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
		v.bind(mul3(UNIT, man.lps.a()), man.lfw.a(), /* v.fov()*/ );
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
					new vec3(hi.b.bval(), 0) 	// get desired movement on XY
				);
				const next = add3(man.lps.a(), wish);
				const idat = TILEBOARD.samplef(next.x(), next.z());
				if(idat == 0) {
					TILEBOARD.swapf(man.lps.a().x(), man.lps.a().z(), next.x(), next.z());
					man.lps.bind(man.lps.a(), next);
					fsm.cswitch(man, 'move');
				}else {
					man.ent.tryattack(idat);
				}
			}else if(hi.name == "sid") {
				const wish = man.wish(
					man.lfw.b(), 				// get latest forward direction
					new vec3(0, hi.b.bval()) 	// get desired movement on XY
				);
				const next = add3(man.lps.a(), wish);
				const idat = TILEBOARD.samplef(next.x(), next.z());
				if(idat == 0) {
					TILEBOARD.swapf(man.lps.a().x(), man.lps.a().z(), next.x(), next.z());
					man.lps.bind(man.lps.a(), next);
					fsm.cswitch(man, 'move');
				}else {
					man.ent.tryattack(idat);
				}
			}else if(hi.name == "trn") {
				man.lfw.bind(man.lfw.a(), rot3_y(hi.b.bval(), man.lfw.a()));
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
		const idat = ITEMBOARD.samplef(at.x(), at.z());
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
		v.bind(mul3(UNIT, man.lps.a()), man.lfw.a(), /*v.fov()*/);
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

		v.bind(mul3(UNIT, man.lps.lerp(it)), man.lfw.a(), /*v.fov()*/ );
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

		v.bind(mul3(UNIT, man.lps.a()), man.lfw.slerp(it), /*v.fov()*/);
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

		v.bind(mul3(UNIT, man.lps.a()), man.lfw.slerp(it), v.fov());
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

const SKELETON_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		man.soundoffset = 0;
		man.bounce = (dt)=> {
			let it = Math.cos(Math.PI*dt);
			return Math.min(1, Math.sqrt(1 - it*it));
		}
// convert the assigned position into a lerped position instead.
		man.lps = new lerped3();
		man.lps.binds(man.pos);

		man.sprite = SPRITE_LIST.write_obj(SPRITE_CTOR, {
			pos:mul3(UNIT,man.pos), sd:0
		});

		TILEBOARD.setf(man.lps.a().x(), man.lps.a().z(), man.uid());
		man.ent.damage = () => { return this.damage(fsm, man); }
		delete man.pos;
	},
	damage:function(fsm, man) {
		const hp = --man.health;
		if(hp <= 0) {
			man.sounds.bind('death'); man.sounds.play_frame(0);
			man.sprite.bind_sd(0);
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
		TILEBOARD.setf(at.x(),at.z(),0);
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
		const mnh = sub3(man.player.getlps().b(), at);
// signed manhattan vector
		const snh = new vec3(Math.sign(mnh.x()), 0, Math.sign(mnh.z()));
		let absX = Math.abs(mnh.x());
		let absY = Math.abs(mnh.z());
// choose Y
		if(absY > absX) {
			const next = add3(at, new vec3(0, 0, snh.z()));
			const idat = TILEBOARD.samplef(next.x(), next.z());
// determine if we hit another entity or piece of geometry
// with our new movement position
			if(idat == 0) {
				TILEBOARD.swapf(at.x(), at.z(), next.x(), next.z());
				man.lps.bind(at, next);
				fsm.cswitch(man, 'move');
// if we move into our player's tile: attack them
			}else if(idat == PLAYER_INDEX) {
				const ent = ENTITY_LIST.get_obj(PLAYER_INDEX);
				ent.hurt();
				man.sounds.bind('atck'); man.sounds.play_frame(0);
			}
		}else { // choose X
			const next = add3(at, new vec3(snh.x(), 0, 0));
			const idat = TILEBOARD.samplef(next.x(), next.z());
			if(idat == 0) {
				TILEBOARD.swapf(at.x(), at.z(), next.x(), next.z());
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
		man.sprite.bind_pos(mul3(UNIT, man.lps.lerp(it)));
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

const FOOD_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		man.lps = new lerped3();
		man.lps.binds(man.pos);
		delete man.pos;
		const at = man.lps.a();
		man.sprite = SPRITE_LIST.write_obj(SPRITE_CTOR, {
			pos:mul3(UNIT, at), sd:13
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

		ITEMBOARD.setf(at.x(),at.z(),man.uid());
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

		ITEMBOARD.setf(at.x(),at.z(),0);
		for(key in man) delete man[key];	
	},
	exit:function(next,fsm,man) {},	
	pulse:function(fsm,man) {}
}]);

const DIAMOND_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
// convert vec2 to lerped2
		man.lps = new lerped3();
		man.lps.binds(man.pos);
		delete man.pos;
// create sprite
		man.sprite = SPRITE_LIST.write_obj(SPRITE_CTOR, {
			pos:mul3(UNIT, man.lps.a()), sd:8
		});
		man.bounce = (itg, con)=> {
			let it = Math.cos(2*Math.PI*itg.delta(con.time(), con.crotchet()));
			return Math.min(1, Math.sqrt(1 - it));
		}

		ITEMBOARD.setf(man.lps.a().x(), man.lps.a().z(), man.uid());

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
		ITEMBOARD.setf(at.x(),at.z(),0);	
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
		const p5gl = gman.p5gl;
		const p5b  = p5gl.p5b;

// construct and assign canvas to flexbox environment
		p5b.frameRate(144);
		p5b.pixelDensity(1);

		p5b.textAlign(CENTER);
		p5b.textSize(36);
		p5b.textFont(gman.font);

// basic difficulty wrapper. This will be assigned when the player
// chooses a difficulty from the menu!
		gman.difficulty = DIFFICULTIES.impossible;

		gman.pt			= millis()/1000;
		gman.hud		= new HUDContext(RES.hudimg());
		gman.conductor 	= new Conductor(new Trackplayer(RES.tracksheet()));
		gman.level 		= new LevelContext(RES.jlvl());
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
		gman.tview = new ViewContext3D(
			new vec3(UNIT*gman.level.dim().x()/2, 0.5, UNIT*gman.level.dim().y()/2),
			new vec3(0,0,0)
		);
// construct null entities to be at position zero in the object lists
		const NULL_SPRITE = {};
		const NULL_ENTITY = new BeatEntity();
// preallocate and populate object lists
		SPRITE_LIST = new ObjectList(new UIDHandler(), NULL_SPRITE);
		ENTITY_LIST = new ObjectList(new UIDHandler(), NULL_ENTITY);
// render entity
		const tman = {
			p5gl:gman.p5gl,
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
		gman.trenderer = { fsm:MENU_FSM, man:tman }
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
			gman.lview = new ViewContext3D(
				new vec3(UNIT*2,0.5, 0.5, UNIT*2),
				new vec3(0,0,0),
			);
// construct null entities to be at position zero in the object lists
			const NULL_SPRITE = {};
			const NULL_ENTITY = new BeatEntity();
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
				overrider:(man)=>{ man.p5gl = gman.p5gl; man.hud = gman.hud; man.view = gman.lview; man.sdata = gman.sdata; }
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
		const p5gl = man.p5gl;
		const p5b = p5gl.p5b;

		const v = man.view;
		let it = man.bounce(man.integrator, man.conductor);
		v.bind(v.pos(), v.fwd(), man.lfv.lerp(it).x());

		const w   = man.level;
// const buf = v.fbf();
// const glc = buf.glc();

// // clip & sort sprites
// 		man.sprites = Object.create(SPRITE_LIST.data());
// 		for(let i = 1;i < man.sprites.length;i++) clip_sprite(v, UNIT, man.sprites[i]);
// 		man.sprites.sort((a,b)=>b.d()-a.d());

// 		glc.background(0);
// 		buf.bind();
// 		DRAW(v,w,UNIT,man.sdata,man.sprites);
//  		buf.apply();
// 		v.flush();

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

		p5b.clear();
		p5b.textSize(36*(1+it*.06125));
		p5b.stroke(0); p5b.fill(0);
		p5b.strokeWeight(4);
		p5b.textAlign(CENTER);
		p5b.text("DAGGERS AND DIAMONDS",4+width/2,4+height*0.1);
		p5b.text("(WebGL)",4+width/2,64+height*0.1);
		p5b.stroke(211,117,6);
		p5b.text("(WebGL)",width/2,60+height*0.1);
		p5b.text("DAGGERS AND DIAMONDS",width/2,height*0.1);

		let mx = width/2;
		let my = height/2 - 30;
		let arrow = "";
		for(let i = 0;i < man.selection.length;i++) {
			my+=60;
			if(i != man.selectedindex) {
				p5b.stroke(220);
				p5b.strokeWeight(3);
				arrow="";
			}else { 
				p5b.stroke(211,117,6);
				p5b.strokeWeight(4);
				arrow=">";
			}
			p5b.text(arrow + man.selection[i].title + " HS:" + man.selection[i].score,mx,my);
		}
	}
}
]);

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
			man.roll(con,ITEMBOARD,0,30,(x,z,i) => {
				ENTITY_LIST.write_obj(ENTITY_CTOR, {
					fsm:FOOD_FSM,
					key:'init',
					inits: { conductor:man.conductor, level:man.level },
					overrider:(man)=> { man.pos = new vec3(x+0.5,0.5,z+0.5); }
				});
			});
		}
// spawning a diamond element
		if((nqr % man.difficulty.DIAM_RATE) == 0) {
			man.roll(con,ITEMBOARD,0,1,(x,z,i) => {
				ENTITY_LIST.write_obj(ENTITY_CTOR, {
					fsm:DIAMOND_FSM,
					key:'init',
					inits: { conductor:man.conductor, level:man.level },
					overrider:(man)=> { man.pos = new vec3(x+0.5,0.5,z+0.5); }
				});
			});
		}

// spawning a skeleton element
		if((nqr % man.difficulty.MOB_RATE) == 0) {
			man.roll(con,TILEBOARD,0,50,(x,z,i) => {
// only spawn if we are not too close to player
				const mnh = sub3(new vec3(x+.5,0.5,z+.5),PLAYER_ENTITY().getlps().a());
				if(mnh.x() > 1 || mnh.x() < -1 && 
				   mnh.z() > 1 || mnh.z() < -1) {
					ENTITY_LIST.write_obj(ENTITY_CTOR, {
						fsm:SKELETON_FSM,
						key:'init',
						inits: { conductor:man.conductor, level:man.level },
						overrider:(sman)=> { 
							sman.pos 	= new vec3(x+0.5,0.5,z+0.5),
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

const RENDER_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		RENDER_INDEX = man.uid();
		noSmooth();
		man.lfv = new lerped3();
		man.lfv.bind(new vec3(100,0), new vec3(103,0));

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
			const SDATA = man.tileset.tdl;
			// console.log(SDATA);
			// SDATA.write_tid(id1,id2);
		}
		textSize(36);
	},
	enter:function(prev, fsm, man) { fsm.set(man, 'shader_init'); },
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {}
},
{
	key:'shader_init',
	setup:function(fsm,man) { },
	enter:function(prev, fsm, man) { 
		loadStrings('debug/shader/voxel.vs', (strs)=> { man.voxel_vs_src = strs.join('\n'); });
		loadStrings('debug/shader/voxel.fs', (strs)=> { man.voxel_fs_src = strs.join('\n'); });
		loadJSON("json/lvl_tds.json", (obj)=> {
			const tileset = {}; man.tileset = tileset;
			tileset.imgfp = obj.imgfp; // image filepath
			tileset.tdl = obj.tds;     // tile descriptor list 
			tileset.tdl.sort((b,a)=>(b.id - a.id));
			loadImage(tileset.imgfp, (img)=> { tileset.img = img; });
		});
		loadJSON("json/ent_tds.json", (obj)=> {
			const entset = {}; man.entset = entset;
			entset.imgfp = obj.imgfp; // image filepath
			entset.tdl = obj.tds;     // tile descriptor list 
			entset.tdl.sort((b,a)=>(b.id - a.id));
			loadImage(entset.imgfp, (img)=> { entset.img = img; });
		});
		loadStrings('debug/shader/ent.vs', (strs)=> { man.ent_vs_src = strs.join('\n'); });
		loadStrings('debug/shader/ent.fs', (strs)=> { man.ent_fs_src = strs.join('\n'); });
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		if(!man.voxel_vs_src || !man.voxel_fs_src) 	return; // world vertex and fragment shader are loaded
		if(!man.ent_vs_src 	 || !man.ent_fs_src) 	return; // entity vertex and fragment shader are loaded
		if(!man.tileset 	 || !man.tileset.img) 	return;	// tileset and tileset image are loaded
		if(!man.entset 	 	 || !man.entset.img) 	return;	// tileset and tileset image are loaded
		fsm.cswitch(man, 'voxel_compile');
		return;
	}
},
{
	key:'voxel_compile',
	setup:function(fsm,man) { },
	enter:function(prev, fsm, man) {
		const p5gl = man.p5gl;
		const ctx = p5gl.ctx;
// compile the fragment and vertex shader
		const p_query = GL_CONSTRUCT_PROGRAM(ctx, man.voxel_vs_src, man.voxel_fs_src);

		if(p_query.error) {
			console.error(p_query.msg);
			return;
		}
// copy compilation into state object
		man.vox_prog 	= p_query.program; 
		man.fs 		 	= p_query.fs;
		man.vs 		 	= p_query.vs;
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
// program failed to compile
		if(!man.vox_prog) return;
// set program type
		const program = man.vox_prog;
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
		if(!man.ent_prog) return;
// set program type
		const program = man.ent_prog;
		const ctx = man.p5gl.ctx;
		GL_USE_PROGRAM(ctx, program);
		GL_INIT_VERTEXATTR(ctx, program);

		fsm.cswitch(man, 'scene');
		return;
	}
},
{	key:'scene',
	setup:function(fsm,man) {},
	enter:function(prev, fsm, man) {
// generate the required state to siphon faces off of a cube
		GENERATE_VOXEL_MESH();
// create camera
		man.active = true; man.fudge = 1;

		man.onClick=()		=> { if(man.active) { requestPointerLock(); } };
		man.onKey=(kc)		=> { if(kc == 27) { man.active = false; } };
		man.mouseOut=()		=> { man.active = false; }
		man.mouseOver=()	=> { man.active = true; }
		man.onFudge=(v)		=> { man.fudge = v; }

		const ctx = man.p5gl.ctx;
		this.init_world(fsm,man);
		this.init_ent(fsm,man);
	},
	init_world:function(fsm,man) {
		const ctx = man.p5gl.ctx;
		const program = man.vox_prog;
		
		GL_USE_PROGRAM(ctx, program);

		man.world = new WorldContext();
		man.world.bind(RES.jlvl(), man.tileset);
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
		man.matrix = mTranslate4x4(0,0.0,0);
	},
	init_ent:function(fsm,man) {
		const ctx = man.p5gl.ctx;
		const program = man.ent_prog;
		
		GL_USE_PROGRAM(ctx, program);

		// const mesh = QUAD_MESH_TDS(man.entset.tdl[0], man.entset.img.width,man.entset.img.height,12/32,14/32);
		const mesh = QUAD_MESH_SPRITE(man.entset.tdl[14], man.entset.img.width, man.entset.img.height, 10/32,12/32);
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
		man.ent_matrix = mTranslate4x4(5.5,5/32,5.5);

		man.et = 0; man.etc = 0;
	},
	exit:function(next, fsm, man) {},
	pulse:function(fsm, man) {
		const p5gl = man.p5gl;
		const p5b = p5gl.p5b;
		p5b.noSmooth();

		const pattr = man.playerattr;
		const v = man.view;
		const con = man.conductor;
		const itg = man.integrator;
		let it = man.bounce(itg, con);

		this.draw_world(fsm,man);
		this.draw_ents(fsm,man);

		IS_HURT = false;

// if we received damage
		if(pattr.ishurt()) {
			let it = (con.time() - pattr.lhtime())/pattr.thtime();
			it = Math.sqrt(it);
			IS_HURT = true;
			HURT_IT = it;
		}
// if we are low on health
		if(pattr.chealth() < 2) {
			let it = itg.delta(con.time(), con.crotchet());
			it = Math.sqrt(it);
			IS_HURT = true;
			HURT_IT = it;
		}
		// imageMode(CORNER);
		// v.flush();
// sine bounce curve (works a bit nicer)
		let rit = 1 + 0.125*Math.sqrt(Math.sin(Math.PI*itg.delta(con.time(),con.crotchet())));
		const hp_offs = new vec2(0.04*width, 0.05*height);
		const sc_offs = new vec2(0.96*width, 0.05*height);

// reset tint for UI
		p5b.imageMode(CENTER);
		man.hud.draw_hearts(p5b, pattr.mhealth(),pattr.chealth(), hp_offs.x(),hp_offs.y(),2.4,rit);
		man.hud.draw_score(p5b, pattr.score(), sc_offs.x(), sc_offs.y(),10,10,2.4,2.6);
		p5b.imageMode(CORNER);
	},
	draw_ents:function(fsm,man) {
		const p5gl = man.p5gl;
		const p5b = p5gl.p5b;
		
		const view 		  = man.view;
		const view_matrix = view.mat();
		const inv_view_matrix = mInverse4x4(view_matrix);
		const em 	  	  = man.ent_matrix;
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
// set vertex attribute data
		GL_INIT_VERTEXATTR(ctx, program);
// set uniforms before draw
		GL_SET_UNIFORM(ctx, program, '1f', 		  'uFudgeFactor', man.fudge);
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uProject', 	 false, GL_DEBUG_PERSPECTIVE(width,height));
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uViewMatrix', false, mInverse4x4(view_matrix));
		GL_SET_UNIFORM(ctx, program, '1i', 		  'uSampler', 1);

		const iw = man.entset.img.width;
		const ih = man.entset.img.height;
		for(let i=1;i<SPRITE_LIST.length();i++) {
			const sprite = SPRITE_LIST.data()[i];
			if(sprite && sprite.id() > 0) {
				const pos = sprite.pos();
				em[12] = pos._x; em[13] = -4/32 + pos._y + sprite.oy()/32; em[14] = pos._z;
				const tds = man.entset.tdl[sprite.sid() % man.entset.tdl.length];
				const min_u = MIN_U(tds,iw,ih); const min_v = MIN_V(tds,iw,ih);
				GL_SET_UNIFORM(ctx, program, '2f', 'uUVOffset', min_u, min_v);
				GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uMatrix', 	 false, em);
				ctx.drawArrays(ctx.TRIANGLES, 0, mesh.length / 8);
			}
		}
	},
	draw_world:function(fsm,man) {
		const p5gl = man.p5gl;
		const p5b = p5gl.p5b;
		
		const view = man.view;
		const view_matrix = view.mat();
		const matrix = man.matrix;
// set predefined attributes for our mesh
		const program = man.vox_prog;
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
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uProject', 	 false, GL_DEBUG_PERSPECTIVE(p5b.width,p5b.height));
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uViewMatrix', false, mInverse4x4(view_matrix));
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uMatrix', 	 false, matrix);
		GL_SET_UNIFORM(ctx, program, 'Matrix4fv', 'uInvMatrix',  false, mInverse4x4(matrix));
		GL_SET_UNIFORM(ctx, program, '1i', 		  'uSampler', 0);
		GL_INIT_VERTEXATTR(ctx, program);

		ctx.drawArrays(ctx.TRIANGLES, 0, mesh.length / 8);

// // swap the Ys and Zs
// 		view_matrix[11] = view_matrix[10];
// 		view_matrix[10] = y;

		const flr = (a) => { return Math.floor(a*10)/10; }
		p5b.clear(); p5b.noStroke(); p5b.fill(255);

		const pos = view.pos();
		p5b.textSize(10);
		p5b.text(`X: ${flr(pos.x())}, Y: ${flr(pos.y())}, Z: ${flr(pos.z())}`,128,128);
		p5b.text(`FPS: ${flr(frameRate())}`,128,128+32);
		// this.sample_world(man);	
	}
}
]);