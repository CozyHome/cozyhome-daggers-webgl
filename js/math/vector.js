// CREDITS: Daniel J. Cucuzza
// DATE: February 19th, 2023
// You can contact me at gaunletgames@gmail.com if you have
// any questions about the implementation or if you notice
// any errors.

// I figured it's probably beneficial to move the 
// vector library into a separate file going forwards
// im going to continue keeping a glsl-type declaration 
// for compability reasons in the event older projects
// will migrate -DC @ 9/3/22
//vec2
const zero2 = ()   => new vec2(0,0);
const copy2 = (v)  => new vec2(v.x(),v.y());
const add2 = (v,w) => new vec2(v.x()+w.x(),v.y()+w.y()); // vector addition
const sub2 = (v,w) => new vec2(v.x()-w.x(),v.y()-w.y()); // vector subtraction
const mul2 = (c,v) => new vec2(c*v.x(),c*v.y());  		 // scalar multiplication
const dot2 = (v,w) => v.x()*w.x()+v.y()*w.y();	   		 // inner product of two vectors
const sqrnorm2 = (v) => v.x()*v.x() + v.y()*v.y();		 // squared "2-norm" of given vector
const norm2 = (v) => Math.sqrt(sqrnorm2(v));		     // "2-norm" of given vector
const perp2 = (v) => new vec2(-v.y(), v.x());	  		 // orthogonal complement of vector
const floor2 = (v) => new vec2(~~v.x(), ~~v.y()); 		 // vector component-wise fast floor
const unit2 = (v) => { 									 // vector normalization
	const u = norm2(v);
	return u > 0.0001 ? new vec2(v.x()/u,v.y()/u) : v;
}
const ref2 = (v,n) => { 								 // vector reflection
	const un = unit2(n);
	const vn = -2*dot2(v,n);
	return new vec2(v.x()+n.x()*vn, v.y()+n.y()*vn);
}
const rot2 = (a,v) => { 								 // vector rotation
	a *= Math.PI / 180;
	const sa = Math.sin(a);
	const ca = Math.cos(a);
	return new vec2(v.x()*ca - v.y()*sa, v.x()*sa + v.y()*ca);
}
const onto2 = (v,w) => { 								 // vector projection
	const ww = dot2(w,w); 								 // 'v' onto 'w'
	if(ww < 0.0001) return w;
	const vw = dot2(v,w);
	return mul2(vw/ww, w);
}
const onto2c = (v,w) => { // clamped vector projection [0,1]
	const ww = dot2(w,w); 								 // 'v' onto 'w'
	if(ww < 0.0001) return w;
	let vw = dot2(v,w);
	vw = clamp(vw,0,ww);
	return mul2(vw/ww, w);
}
const proj2 = (v,w) => { 								 // scalar projection
	const ww = dot2(w,w);
	if(ww < 0.0001) return w;
	const vw = dot2(v,w);
	return vw/Math.sqrt(ww);
}
const toip2 = (p0, r, c, n) => { 						 // time of impact to halfspace
	const rn = -dot2(r,n);
	const cn = dot2(c,n);
	const pn = dot2(p0,n);
	return Math.abs(rn) > 0.001 ? (pn - cn) / rn : -1;
}
const loip2 = (p0, r, c, n) => {						 // length of impact to halfspace
	return toip2 / norm2(r);
}
const lerp2 = (a,b,t) => {								 // affine combination/linear interpolation
	return new vec2((1-t)*a.x() + t*b.x(), (1-t)*a.y() + t*b.y());
}
const bilerp2 = (a,b,c,d,t1,t2) => {					 // bilinear interpolation
	return add2(lerp2(a,b,t1), lerp2(c,d,t2));
}
const invlerp2 = (a,b,c) => {							 // inverse linear interpolation
	return norm2(sub2(c,a)) / norm2(sub2(a,b));
}
const invbilerp2 = (a,b,c,d,e,f) => {					 // inverse bilinear interpolation
	return new vec2(
		invlerp2(a,b,e),
		invlerp2(c,d,f)
	);
}
const swap2 = (v,w) => {
	let vx = v.x();
	let vy = v.y();
	v._x = w.x();
	v._y = w.y();
	w._x = vx;
	w._y = vy;
}
const smstep = (t) => {									 // smoothstep function
	const v1 = t*t;
	const v2 = 1 - (1-t)*(1-t);
	return (1-t)*v1 + v2*t;
}
const clamp = (t,a=0,b=1) => {
	if(t < a) return a;
	if(t > b) return b;
	return t;
}
const min=(a,b)=> {
	return (a < b) ? a : b;
}
// determinant of 2x2
const DET_2D=(v,w)=> { return v.x()*w.y() - v.y()*w.x(); }
// sign test for edge (a,b) and point c, with sign s used
// if you want consistent reports for unknown winding orders.
// leave as is if you do not know what this does.
const ORIENT_2D=(a,b,c,s=1)=> {
	const ac   = sub2(c,a);
	const p_ab = perp2(sub2(b,a));
	return s*dot2(p_ab, ac) > 0;
}
const draw2 = (v, glc) => {								 // draws a vector in p5 graphics
	if(glc) glc.line(0,0,v.x(),v.y());
	else line(0,0,v.x(),v.y());
}
const draw2p = (p,v,glc) => {							 // draws a point, vector pair in p5 graphics 
	if(glc) glc.line(p.x(),p.y(),p.x()+v.x(),p.y()+v.y());
	else line(p.x(),p.y(),p.x()+v.x(),p.y()+v.y());
}
const line2 =(a,b,glc) => {								 // draws a line segment in p5 graphics
	if(glc) glc.line(a.x(), a.y(), b.x(), b.y());
	else line(a.x(), a.y(), b.x(), b.y());
}
const half2 =(a,b,glc) => {								 // draws a line segment in p5 graphics
	const t = a; const v = sub2(b,a);
	if(glc) {
		draw2p(t, mul2(16,v),glc);
		draw2p(t, mul2(-16,v),glc);
	}else {
		draw2p(t, mul2(16,v),glc);
		draw2p(t, mul2(-16,v),glc);
	}
}
const arrow2=(a,b,r=15,th=45,offs=0.5,glc=null)=> {
	const dif = mul2(r,unit2(sub2(b,a)));
	const right = rot2(180+th,dif);
	const left  = rot2(180-th,dif);
	const mid = lerp2(a,b,offs);
	if(glc) { 
		glc.line(a.x(),a.y(),b.x(),b.y());
		draw2p(mid,right,glc);
		draw2p(mid,left,glc);
	}
	else { 
		line(a.x(),a.y(),b.x(),b.y());
		draw2p(mid,right);
		draw2p(mid,left);
	}
}
const cir2=(p,r=16,glc=null)=> {
	if(glc) {
		glc.circle(p.x(),p.y(),r);
	}else {
		circle(p.x(),p.y(),r);
	}
}
const text2=(txt,p,glc=null)=> {
	if(glc) {
		glc.text(txt,p.x(),p.y());
	}else {
		text(txt,p.x(),p.y());
	}
}

const plane2 = (p,n,l=512,r=25,glc) => {							 // draws a plane in p5 graphics
	const prp = perp2(n);
	draw2p(p,mul2(l,prp),glc);
	draw2p(p,mul2(-l,prp),glc);
	draw2p(p,mul2(r,unit2(n)),glc);
}
class vec2 {
	constructor(x,y) {
		this._x=x;
		this._y=y;
	}
	x=()=>this._x;
	y=()=>this._y;
	f2d=()=>[this._x,this._y];
	f3d=()=>[this._x,this._y,1];
	at=(i)=> {
		switch(i) {
			default: return 0;
			case 1: return x;
			case 2: return y;
		}
	}
}
// tuples that should be considered as three states:
// enter, exit, inbetween (tweening) very useful for transience
class lerped2 {
	constructor() {}
	binds=(a)=> {
		this.bind(a,a);
	}
	bind=(a,b)=> {
		this._a=a;
		this._b=b;
	}
	lerp=(t)=> {
		return lerp2(this._a, this._b, t);
	}
	slerp=(t)=> {
		return unit2(this.lerp(t));
	}
	a=()=>this._a; // start
	b=()=>this._b; // end
}
//vec3
const add3 = (v,w) => new vec3(v.x()+w.x(),v.y()+w.y(), v.z()+w.z());
const sub3 = (v,w) => new vec3(v.x()-w.x(),v.y()-w.y(), v.z()+w.z());
const mul3 = (c,v) => new vec3(c*v.x(),c*v.y(),c*v.z());
const dot3 = (v,w) => v.x()*w.x()+v.y()*w.y()+v.z()*w.z();
const norm3 = (v) => Math.sqrt(dot3(v,v));
const cross3 = (v,w) => new vec3(
	v.y()*w.z()-v.z()*w.y(), //x
	v.z()*w.x()-w.z()*v.x(), //y
	v.x()*w.y()-w.x()*v.y()  //z
);
const unit3 = (v) => {
	const u = norm3(v);
	return u > 0.0001 ? new vec3(v.x()/u,v.y()/u,v.z()/u) : v;
}
const ref3 = (v,n) => {
	const un = unit3(n);
	const vn = -2*dot3(v,n);
	return new vec2(v.x()+n.x()*vn,v.y()+n.y()*vn,v.z()+n.z()*vn);
}
const proj3 = (v,w) => {
	const ww = dot3(w,w);
	if(wv < 0.0001) return w;
	const vw = dot3(v,w);
	return mul3(vw/ww, w);
}
const lerp3 = (a,b,t) => {
	return new vec3((1-t)*a.x() + t*b.x(), (1-t)*a.y() + t*b.y(), (1-t)*a.z() + t*b.z());
}
const angle3 = (v,w) => {
	v = unit3(v);
	w = unit3(w);
	return Math.acos(dot3(v,w)) * 180 / Math.PI;
}
// let u := be the right basis vector associated with vector w
const sangle3 = (v,w,u) => {
	v = unit3(v);
	w = unit3(w);
	const c = cross3(v,w);

	return Math.sign(dot3(c, u)) * Math.acos(dot3(v,w)) * 180 / Math.PI;
}
class vec3 {
	constructor(x,y,z) {
		this._x=x;
		this._y=y;
		this._z=z;
	}
	x=()=>this._x;
	y=()=>this._y;
	z=()=>this._z;
	f3D=()=>[this._x, this._y, this._z];
	f4D=()=>[this._x, this._y, this._z, 1];
	n4D=()=>[this._x, this._y, this._z, 0];
	at=(i)=> {
		switch(i) {
			default: return 0;
			case 1: return x;
			case 2: return y;
			case 3: return z;
		}
	}
}