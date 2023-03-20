let RENDER_INDEX 	= 0;
let PLAYER_INDEX 	= 0;
let DIRECTOR_INDEX 	= 0;
let WALL_INDEX   	= 0;

const RENDER_ENTITY   = () => ENTITY_LIST.get_obj(RENDER_INDEX);
const PLAYER_ENTITY   = () => ENTITY_LIST.get_obj(PLAYER_INDEX);
const WALL_ENTITY 	  = () => ENTITY_LIST.get_obj(WALL_INDEX);
const DIRECTOR_ENTITY = () => ENTITY_LIST.get_obj(DIRECTOR_INDEX);


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