// CREDITS: Daniel J. Cucuzza
// DATE: February 19th, 2023
// You can contact me at gaunletgames@gmail.com if you have
// any questions about the implementation or if you notice
// any errors.

// fsm := state machine, man := data object, 
//init := init state, before := function ran before setup(...) and enter(...)
const CONSTRUCTOR_FSE_OVERRIDE=(fsm,man,init,before)=> {
	if(!man) man = CONSTRUCTOR_MAN();
	const ent = { fsm:fsm, man:man } // get entity
	before(ent);
	fsm.setup(man); // invoke all setup functions
	fsm.set(man, init ? init : 'init'); // run the init state
	return ent;
}

// constructs a default finite state entity (base class most configurations should run)
const CONSTRUCTOR_FSE=(fsm, man, init)=> {
	if(!man) man = CONSTRUCTOR_MAN();
	const ent = { fsm:fsm, man:man } // get entity
	fsm.setup(man); // invoke all setup functions
	fsm.set(man, init ? init : 'init'); // run the init state
	return ent;
}
// constructs a default man object for a FSM
const CONSTRUCTOR_MAN=()=> {
	return {
		_cur:null, // assign first state
		cur:function() { return this._cur; },
		setcur(nxt) { this._cur = nxt; },
		dt:function() { return deltaTime / 1000; }
	}
};
// we assume that our state machine is initialized and does not modify existing
// data that the fsm requires.
class FSM {
	#_dict;
// states, middleman
	constructor(states) {
		this.assert(states != null && states.length > 0, "state bag was empty or null.");
		this.#_dict = [];
// append all new states to dictionary object
		for(let i = 0;i < states.length;i++) {
			const state = states[i];
			this.vstate(state, "state object was not constructed properly. see fsm.js.");
			this.#_dict[state.key] = state;
		}
	}
	pulse=(man)=> {
		const cur = man.cur();
		cur.pulse(this, man);
	}
	setup=(man)=> {
		for(const o in this.#_dict) { 
			const stt = this.#_dict[o];
			stt.setup(this, man);
		} 
	}
	remove=(man)=> {
		for(const o in this.#_dict) {
			const stt = this.#_dict[o];
			stt.remove(this, man);
		}
	}
	cswitch=(man, next_key)=> {
		const cur = man.cur();
		const next = this.sget(next_key);
		this.assert(next != null);
		cur.exit(next_key, this, man); 		// Notify old state of man that its leaving
		man.setcur(next);					// Context switch
		next.enter(cur.key, this, man);		// Notify new state of man that its entering
	}
	set=(man, next_key)=> {
		const next = this.sget(next_key);
		this.assert(next != null);	
		man.setcur(next);					// Context switch
		next.enter('set', this, man);		// Notify new state of man that its entering
	}
	sget=(key)=> key in this.#_dict ? this.#_dict[key] : null;
	assert(cond, output) { if(!cond) throw new Error("assertion failed:" + output); }
	vstate(state) { // determine if new state object has the required components
		return Object.hasOwn(state, 'key') &&
			Object.hasOwn(state, 'enter') &&
			Object.hasOwn(state, 'exit') &&
			Object.hasOwn(state, 'setup') &&
			Object.hasOwn(state, 'pulse');
	}
}
