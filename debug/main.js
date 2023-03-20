let SPHERE;
let MESH;
let TRIS;
let MESH_LENGTH;
let SCENE;

// REMEMBER:
// VERTEX ATTRS ARE NOT SAVED PER BUFFER.
// YOU NEED TO REWRITE THEM EVERY TIME YOUR SCHEME CHANGES.

// (pw,ph) := p5canvas span
// (gw,gh) := webgl canvas span
const BOOTSTRAP_P5GL=(pw,ph,gw,gh)=> {
	const canvas = createCanvas(pw,ph);
	canvas.id("p5canvas");
	canvas.parent("#center_flexbox");

	const gl_canvas = createGraphics(gw,gh,WEBGL);
	const gl_ctx = gl_canvas.drawingContext;
	const init = GL_DEBUG_INIT(gl_ctx, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER);

	return {
		p5c:canvas,
		glc:gl_canvas,
		ctx:gl_ctx,
		program:init.program,
		abuffer:init.abuffer,
		vert_size:init.vert_size
	}
}

const FLUSH_GL=(scene)=> {
	const gl  = scene.glc;
	const p5c = scene.p5c;
	image(gl,0,0,p5c.width,p5c.height);
	gl.clear();
	gl.background(10,10,100);
}

let img;
let VOXEL_VS; let VOXEL_FS;
function preload() {
	img = loadImage('images/stone.png');
	loadStrings('debug/shader/voxel.fs', (strs)=> { VOXEL_FS = strs.join('\n'); });
	loadStrings('debug/shader/voxel.vs', (strs)=> { VOXEL_VS = strs.join('\n'); });
}

function setup() {
	SPHERE = new Float32Array(SPHERE_MESH());
	SCENE = BOOTSTRAP_P5GL(1280,960,640,480);
	GENERATE_VOXEL_MESH();

// create texture
	const ctx = SCENE.ctx;
	const TEX = ctx.createTexture();
	ctx.bindTexture(ctx.TEXTURE_2D, TEX);
	img.loadPixels();
	const px = img.pixels;
	ctx.texImage2D(
		ctx.TEXTURE_2D, 	// texture 2D type
		0,					// LEVEL OF DETAIL
		ctx.RGBA, 			// RGBA format (INTERNAL FORMAT)
		img.width,			// texture width
		img.height,			// texture height
		0,					// border width (must be 0)
		ctx.RGBA,			// CONVERTED FORMAT
		ctx.UNSIGNED_BYTE,	// 8 bits per channel (32 bits total)
		px					// the actual pixels array!
	);

// x coordinate of texture will clamp to edge
	ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
// y coordinate of texture will clamp to edge
	ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
// texture minification filter (when far away)
	ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
// texture maxification filter (when close by)
	ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
// tell WebGL this is the currently active image in the gl context
	ctx.activeTexture(ctx.TEXTURE0);
	ctx.bindTexture(ctx.TEXTURE_2D, TEX);
	
//	ctx.bindBuffer(ctx.ARRAY_BUFFER, SCENE.abuffer);
	SCENE.vprog = GL_CONSTRUCT_PROGRAM(SCENE.ctx, VOXEL_VS, VOXEL_FS).program;
	SCENE.vert_size = 1;
	const vmesh = VOXEL_DEBUGMESH(ctx, SCENE.vprog);	
	
	MESH = vmesh.mesh;
	TRIS = vmesh.tris;
	MESH_LENGTH = vmesh.mesh_length;

	GL_SET_UNIFORM(ctx, SCENE.vprog, '1i', 'uSampler', 0);
//	ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(total), ctx.DYNAMIC_DRAW);
//	ctx.bufferSubData(ctx.ARRAY_BUFFER, 0, new Float32Array(MESH));

// initialize camera (pos, euler)
	SCENE.view = new ViewContext3D(new vec3(-0.5,-0.5,-0.5),new vec3(0,180,0));
// handling entering/exiting pointer lock 
	SCENE.p5c.mouseOut(()=>{ active=false;});
	SCENE.p5c.mouseOver(()=>{ active=true;});
	textSize(32);
}

function draw() {
	fill(255); noStroke();
	scale(1,-1);
	translate(0,-height);

	const rm = new Matrix4x4();
	if(active) {
		SCENE.view.mouselook(16 * deltaTime/1000, movedX, movedY);
		SCENE.view.move(16 * deltaTime/1000);
	}
	
	const ctx = SCENE.ctx;

// reassign program
// reassign attribute buffer
//	ctx.bindBuffer(ctx.ARRAY_BUFFER, SCENE.abuffer);
	if(MESH != null) {
// set program
		GL_USE_PROGRAM(ctx, SCENE.vprog);
// set uniforms
		GL_SET_UNIFORM(ctx, SCENE.vprog, '1f', 'uFudgeFactor', fudge);
		GL_SET_UNIFORM(ctx, SCENE.vprog, 'Matrix4fv', 'uProject', false, GL_DEBUG_PERSPECTIVE(width,height));
// set vertex attributes
		ctx.bindBuffer(ctx.ARRAY_BUFFER, SCENE.abuffer);
		VOXEL_VERTEXATTR(ctx, ctx.abuffer, SCENE.vprog);
// bind elements
		ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, SCENE.tbuffer);
// draw
		GL_DEBUG_ELEMENTS(
			ctx, 
			SCENE.vprog, 
			SCENE.tbuffer, 
			MESH_LENGTH, 
			SCENE.vert_size, 
			SCENE.view.mat(), 				// view matrix
			rm.get(), 						// object matrix
			MATERIALS[3]
		);
	}
	
	FLUSH_GL(SCENE);
	translate(8,height-32);
	scale(1,-1);
	text(~~frameRate(),0,0);
}


let fudge = 5;
let naught = 0.6;
let frequency = 2;
let active = false;

function changeFudge(el) { fudge=el.value; }
function mousePressed() { if(active) { requestPointerLock(); } }
function keyPressed() { if(keyCode == 27) { active = false; } }
