// CREDITS: Daniel J. Cucuzza
// DATE: February 19th, 2023
// You can contact me at gaunletgames@gmail.com if you have
// any questions about the implementation or if you notice
// any errors.

// UPDATE:I've reverted to a 3x3 implemenation strictly for
// two dimensional usage. This will be used in the GJK implementation.
// -DC @ 2/16/23

// CONTEXT: this was initially a 4x4 implementation provided by Ken Perlin
// during his Computer Graphics course @ NYU. I've heavily modified it for
// 3x3 means!
const mIdentity3x3 =()=> [1,0,0, 0,1,0, 0,0,1];
// inverse algorithm via laplace expansion
const mInverse3x3 =(a)=> {
// cofactor expansion of 3x3
	const dst = [];
	dst.push(a[4]*a[8] - a[7]*a[5]); // ei_fh
	dst.push(a[2]*a[7] - a[1]*a[8]); // gf_di
	dst.push(a[1]*a[5] - a[4]*a[2]); // dh_eg

	dst.push(a[6]*a[5] - a[3]*a[8]); // ch_bi
	dst.push(a[0]*a[8] - a[6]*a[2]); // ai_cg
	dst.push(a[3]*a[2] - a[0]*a[5]); // bg_ah

	dst.push(a[3]*a[7] - a[4]*a[6]); // bf_ec
	dst.push(a[6]*a[1] - a[0]*a[7]); // cd_af
	dst.push(a[0]*a[4] - a[3]*a[1]); // ae_bd
// determinant of 3x3 matrix
	const eps = 0.0001;
	const det = a[0]*dst[0] + a[3]*dst[1] + a[6]*dst[2];
// avoid division by zero
	if(det > eps || det < -eps) {
		for(let i=0;i<dst.length;i++) dst[i] /= det;
		return dst;
	}else {
		console.log("determinant of " + a + " is zero.");
		return mIdentity3x3();
	}
}
// hard-coded matrix multiplication to avoid
// overcomplicating things :)
const mMultiply3x3=(a,b)=> {
	let dst = [];
	dst.push(a[0]*b[0]+a[1]*b[3]+a[2]*b[6]); // a0 * b0
	dst.push(a[0]*b[1]+a[1]*b[4]+a[2]*b[7]); // a0 * b1
	dst.push(a[0]*b[2]+a[1]*b[5]+a[2]*b[8]); // a0 * b2

	dst.push(a[3]*b[0]+a[4]*b[3]+a[5]*b[6]); // a1 * b0
	dst.push(a[3]*b[1]+a[4]*b[4]+a[5]*b[7]); // a1 * b1
	dst.push(a[3]*b[2]+a[4]*b[5]+a[5]*b[8]); // a1 * b2

	dst.push(a[6]*b[0]+a[7]*b[3]+a[8]*b[6]); // a2 * b0
	dst.push(a[6]*b[1]+a[7]*b[4]+a[8]*b[7]); // a2 * b1
	dst.push(a[6]*b[2]+a[7]*b[5]+a[8]*b[8]); // a2 * b2

	return dst;
}
// rotation matrix (assuming counterclockwise rotation)
const mRot3x3=(t=0)=> {
	const c = Math.cos(t);
	const s = Math.sin(t);
	return [c,s,0, -s,c,0, 0,0,1];
}
// dilation matrix
const mScale3x3=(x=1,y)=> {
	if(y === undefined) y = x;
	return [x,0,0, 0,y,0, 0,0,1];
}
// transform a point in one space to another
const mTransform3x3=(m,p)=> {
	let x = p[0], y = p[1], z = p[2] === undefined ? 1 : p[2];
	return [
			m[0] * x + m[3] * y + m[6] * z,
			m[1] * x + m[4] * y + m[7] * z,
			m[2] * x + m[5] * y + m[8] * z,
	];
}
// transform a point in one space to another absolute
const mTransformAbs3x3=(m,p)=> {
	const abs=(x)=> { return x > 0 ? x : -x; }
	let x = p[0], y = p[1], z = p[2] === undefined ? 1 : p[2];
	return [
			-abs(m[0]) * x - abs(m[3]) * y + abs(m[6]) * z,
			-abs(m[1]) * x - abs(m[4]) * y + abs(m[7]) * z,
			-abs(m[2]) * x - abs(m[5]) * y + abs(m[8]) * z,
	];
}
// translation matrix
const mTranslate3x3 = (x=0,y=0) => {
	return [1,0,0, 0,1,0, x,y,1];
}
// transpose of a matrix
const mTranspose3x3=(m)=> {
	return [ m[0],m[3],m[6],
	m[1],m[4],m[7],
	m[2],m[5],m[8]];
}
// state-based stack matrix for ease of chaining
// multiple transformations together
const Matrix3x3 = function() {
	let stack = [ mIdentity3x3() ];
	let top = 0;
	let m = () => stack[top];

	this.get = () => m();
	this.set = src => stack[top] = src;
	this.identity  = ()      => this.set(mIdentity3x3());
	this.translate = (x,y) => this.set(mMultiply3x3(m(), mTranslate3x3(x,y)));
	this.scale     = (x,y) => this.set(mMultiply3x3(m(), mScale3x3(x,y)));
	this.rot      = theta   => this.set(mMultiply3x3(m(), mRot3x3(theta)));
	this.getcol	   = (col)	 => {
		col *= 3;
		const m = this.get();
		return [m[col],m[col+1],m[col+2]];
	}
	this.push = () => {
		stack[top+1] = stack[top].slice();
		top++;
	}
	this.pop = () => {
		if (top == 0)
			console.log('stack is empty!');
		else
			top--;
	}
}

// faster syntax for a matrix transform with vec2 type
const MT=(m,v)=> {
	let p=[v.x(),v.y()];
	p = mTransform3x3(m,p);
	return new vec2(p[0],p[1]);
}
// faster syntax for a matrix direction transform with vec2 type
const MTD=(m,v)=> {
	let p=[v.x(),v.y(),0];
	p = mTransform3x3(m,p);
	return new vec2(p[0],p[1]);
}
const MTD_ABS=(m,v)=> {
	let p=[v.x(),v.y(),0];
	p = mTransformAbs3x3(m,p);
	return new vec2(p[0],p[1]);
}

// tell P5 we want to append a matrix transformation.
const PUSH_P5=(gm,glc=null)=> {
		if(glc==null) applyMatrix(gm[0], gm[1], gm[3], gm[4], gm[6], gm[7]);
		else {
 			glc.applyMatrix(gm[0], gm[1], gm[3], gm[4], gm[6], gm[7]);
		}
}
// tell p5 we want to override a matrix transformation
const WRITE_P5=(gm,glc=null)=> {
		resetMatrix();
		PUSH_P5(gm,glc);
}
