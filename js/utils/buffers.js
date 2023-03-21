// BUFFER PRIMITIVES: {
//		class BufferI32_2D 		:= one dimensional Int32 array that acts as a two dimensional array.
//		class BufferI32_3D 		:= one dimensional Int32 array that acts as a three dimensional array.
//		class BufferF32			:= one dimensional float32 array (useful for depth buffers)
//		class ImageBuffer		:= p5js graphics buffer to draw into an offscreen image.
// }

// Buffered Image class that primarily contacts p5's render context. This is our fragment buffer.
// We'll write to this buffer and directly apply it to the canvas via the flush(); call.
class ImageBuffer {
	#_w; #_h; #_gl;
	constructor(w,h) {
		this.#_w = w;
		this.#_h = h;
		this.#_gl = createGraphics(w,h);
	}
	data=()  => { return this.#_gl.pixels; }
	bind=()	 => { this.#_gl.loadPixels(); }
	apply=() => { this.#_gl.updatePixels(); }
	flush=(cv,x=0,y=0,s=1) => { 
		if(cv != null) cv.image(this.#_gl,x,y,s*this.#_w,s*this.#_h);
		else image(this.#_gl,x,y,s*this.#_w,s*this.#_h);
	}
	flush2=(cv,x=0,y=0,sx=1,sy=1) => { 
		if(cv != null) cv.image(this.#_gl,x,y,sx*this.#_w,sy*this.#_h);
		else image(this.#_gl,x,y,sx*this.#_w,sy*this.#_h);
	}
	geti=(x,y) 	=> (4*(x-(x%1)+(y-(y%1))*this.#_w));
	w=() 		=> this.#_w;
	h=() 		=> this.#_h;
	glc=() 		=> this.#_gl;
}

class BufferI32_2D { 
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
	bounds_i=(i)=> {
		return i >= 0 && i <= this.#_s;
	}
	get_i=(x,y,z)=> {
		return x+y*this.#_w+z*this.#_w*this.#_h;
	}
	sample=(x,y,z) => this.#_buf[x+y*this.#_w+z*this.#_w*this.#_h];
	sample_i=(i) => this.#_buf[i];
}

class BufferI32_3D {
	#_w; #_h; #_d; #_s; #_buf;
	constructor(w,h,d) {
		this.#_w = w;
		this.#_h = h;
		this.#_d = d;
		this.#_s = w*h*d;
		this.#_buf = new Int32Array(this.#_s);
	}
	w=()=>this.#_w;
	h=()=>this.#_h;
	d=()=>this.#_d;
	s=()=>this.#_s;
	data=()=>this.#_buf;
	bounds=(x,y,z) => {
		const i = x + y*this.#_w + z*this.#_w*this.#_h;
		return i >= 0 && i <= this.#_s;
	}
	bounds_i=(i)=> {
		return i >= 0 && i <= this.#_s;
	}
	get_i=(x,y,z)=> {
		return x+y*this.#_w+z*this.#_w*this.#_h;
	}
	sample=(x,y,z) => this.#_buf[x+y*this.#_w+z*this.#_w*this.#_h];
	sample_i=(i) => this.#_buf[i];
}

class BufferF32 {
	#_w; #_buf;
	constructor(w) {
		this.#_w = w;
		this.#_buf = new Float32Array(w);
	}
	w=()	=> this.#_w;
	data=()	=> this.#_buf;
}