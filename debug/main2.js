let RES;			// Resources
let P5GL;			// P5GL Drawing Context
let SCENE_E;		// Scene state machine

// adds some more data for our state machine entity
const CONSTRUCTOR_P5GL_FSE=(fsm,p5gl,man,init)=> {
	return CONSTRUCTOR_FSE_OVERRIDE(fsm,man,init, (ent)=> {
// give the entity access to drawing buffers
		ent.man.p5gl = p5gl;
// give entity access to I/O
		ent.man.onClick=()=>{};
		ent.man.onKey=(kc)=>{};
		ent.man.mouseOut=()=>{};
		ent.man.mouseOver=()=>{};
		ent.man.onFudge=(v)=>{};
		p5gl.p5c.mouseOut(()=>ent.man.mouseOut());
		p5gl.p5c.mouseOver(()=>ent.man.mouseOver());
	});
}

// (pw,ph) := p5canvas span
// (gw,gh) := webgl canvas span
const BOOTSTRAP_P5GL=(pw,ph,gw,gh)=> {
	const canvas = createCanvas(pw,ph);
	canvas.id("p5canvas");
	canvas.parent("#center_flexbox");

	frameRate(144);
	const gl_buffer = createGraphics(gw,gh,WEBGL);	// WEBGL Renderer
	const p5_buffer = createGraphics(pw,ph,P2D);	// P2D Renderer
	const gl_ctx = gl_buffer.drawingContext;
	const init = GL_DEBUG_INIT(gl_ctx, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER);

	return {
		p5c:canvas,	   		  // the sketch canvas
		glb:gl_buffer, 		  // the WEBGL2 graphics buffer
		p5b:p5_buffer,		  // the P2D graphics buffer
		ctx:gl_ctx,	   		  // WebGL2RenderingContext
		program:init.program, // initial compiled program (QOL)
		abuffer:init.abuffer, // initial vertex buffer assigned to (8) byte attribute system
		vert_size:init.vert_size // # of bytes per vertex (8)
	}
}

const FLUSH_GL=(p5gl)=> {
// renderer buffers
	const glb  = p5gl.glb;
	const p5b  = p5gl.p5b;
// canvas
	const p5c = p5gl.p5c;
	// p5c.translate(p5c.width,p5c.height);
	// scale(-1,-1);
	noSmooth();
	image(glb,0,0,p5c.width,p5c.height);
	smooth();
	image(p5b,0,0,p5c.width,p5c.height);
	
	// glb.clear();
	// glb.background(10,10,100);
}

function preload() {
	// RES = new Resources();
}

function setup() {
	P5GL = BOOTSTRAP_P5GL(960,720,960/6,720/6);
	SCENE_E = CONSTRUCTOR_P5GL_FSE(SCENE_FSM, P5GL);
}

function draw() {
	SCENE_E.fsm.pulse(SCENE_E.man);
	FLUSH_GL(P5GL);
}

function mousePressed() { 
	if(!SCENE_E) return;
	SCENE_E.man.onClick();
}
function keyPressed() { 
	if(!SCENE_E) return;
	SCENE_E.man.onKey(keyCode);
}
function changeFudge(el) { 
	if(!SCENE_E) return;
	SCENE_E.man.onFudge(el.value);
}