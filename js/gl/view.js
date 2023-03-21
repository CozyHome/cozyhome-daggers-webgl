class ViewContext3D {
	#_cm;
// pos := vec3 position
// rot :+ vec3 euler angles
	constructor(pos, rot) {
		this.#_cm = new Matrix4x4();
		if(pos != null) this.#_cm.translate(pos.f4d());
		if(rot != null) {
			this.#_cm.rotx(rot.x()*Math.PI/180);
			this.#_cm.roty(rot.y()*Math.PI/180);
			this.#_cm.rotz(rot.z()*Math.PI/180);
		}
	}
	mouselook=(ds,mx,my)=> {
// integrate
		let dx = -my*ds; let dy = mx*ds;
		const m = this.#_cm.get();
		let deltaM = mIdentity4x4();

		if(Math.abs(dy) > 0.001) {
			deltaM = mRoty4x4(dy * Math.PI/180, deltaM);
		}
// translate to origin
		const pos = this.#_cm.getvec(3);
		this.#_cm.setcol(3, [0,0,0,0]);

		this.#_cm.set(mMultiply4x4(deltaM, this.#_cm.get()));
// teleport back to position
		this.#_cm.setcol(3, pos.f4D());
// get the signed angle so we know not to overshoot our x rotation.
		const x_angle = sangle3(
			this.up(), 			 // up
			new vec3(0,1,0), 	 // global-up
			this.rgt()  		 // right
		);

		const MAX_VERTICAL = 80;
		if(x_angle + dx > MAX_VERTICAL) {
			dx = MAX_VERTICAL - x_angle;
		}else if(x_angle + dx < -MAX_VERTICAL) {
			dx = (-MAX_VERTICAL - x_angle);
		}
		if(Math.abs(dx) > 0.001) {
			this.#_cm.rotx(-dx * Math.PI/180);
		}
	}
	move=(ds)=> {
// construct input vector and transform it along the basis of cm
		let wish = new vec3(0,0,0);
	
		if(keyIsDown(87)) wish._z += 1; // W
		if(keyIsDown(83)) wish._z -= 1; // S

		if(keyIsDown(65)) wish._x -= 1; // A
		if(keyIsDown(68)) wish._x += 1; // D

// keep it unit, then scale
		wish = mul3(ds, unit3(wish));

// convert vec3 type to vec4 direction, transform and add
// to current matrix
		let pos = this.#_cm.getvec(3);
		pos = add3(
			pos, add3(mul3(wish._z, this.fwd()),
					  mul3(wish._x, this.rgt()))
		);
		this.#_cm.setcol(3, pos.f4D());
	}
	bind=(pos,fwd,fov)=> {
		this.#_cm.setcol(3, [+pos._x,+pos._y,+pos._z, 1]);
		const rgt = mTD4x4(mRoty4x4(90*Math.PI/180), fwd);
		this.#_cm.setcol(2, [fwd._x,fwd._y,fwd._z,0]); // fwd
		this.#_cm.setcol(0, [rgt._x,rgt._y,rgt._z,0]); // fwd
		// const rgt = mTD4x4(mRoty4x4(90*Math.PI/180), fwd);
		// console.log(...rgt.f3d());
		// this.#_cm.setcol(1, [rgt._x,rgt._y,rgt._z]); // rgt
	}

	pos=()=> { return this.#_cm.getvec(3); }
	fwd=()=> { return this.#_cm.getvec(2); }
	up=()=>  { return this.#_cm.getvec(1); }
	rgt=()=> { return this.#_cm.getvec(0); }
	mat=()=> { return this.#_cm.get(); }
}