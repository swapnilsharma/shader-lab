// ================================================================
// SHADER LAB — GLSL Builder & WebGL Renderer
// ================================================================

function buildFrag(forST) {
  const waves = effects.filter(e => e.on && e.type === 'wave');
  const warps = effects.filter(e => e.on && e.type === 'warp');
  const grains = effects.filter(e => e.on && e.type === 'grain');
  const chromas = effects.filter(e => e.on && e.type === 'chroma');
  const scans = effects.filter(e => e.on && e.type === 'scanlines');
  const barrels = effects.filter(e => e.on && e.type === 'barrel');
  const vignettes = effects.filter(e => e.on && e.type === 'vignette');
  const grades = effects.filter(e => e.on && e.type === 'colorgrade');
  const pixels = effects.filter(e => e.on && e.type === 'pixelate');
  const posts = effects.filter(e => e.on && e.type === 'posterize');
  const dirgrads = effects.filter(e => e.on && e.type === 'dirgradient');

  const uT = forST ? 'iTime' : 'u_t';
  const uR = forST ? 'iResolution.xy' : 'u_res';
  const fc = forST ? 'fragCoord' : 'gl_FragCoord.xy';

  function fv(e, k) {
    if (forST) return parseFloat(e.data[k]).toFixed(6);
    const umap = {
      wave:{freq:`wf${e.id}`,amp:`wa${e.id}`,spd:`ws${e.id}`,pos:`wp${e.id}`,edge:`we${e.id}`,angle:`wang${e.id}`},
      warp:{str:`wp_str${e.id}`,scale:`wp_sc${e.id}`,wspd:`wp_sp${e.id}`,oct:`wp_oc${e.id}`},
      grain:{amount:`gr_am${e.id}`,size:`gr_sz${e.id}`,anim:`gr_an${e.id}`,streak:`gr_st${e.id}`,sangle:`gr_sa${e.id}`,slen:`gr_sl${e.id}`},
      chroma:{spread:`ch_sp${e.id}`,angle:`ch_an${e.id}`},
      scanlines:{count:`sl_cn${e.id}`,dark:`sl_dk${e.id}`,soft:`sl_sf${e.id}`,scroll:`sl_sc${e.id}`,scrollspd:`sl_ss${e.id}`},
      barrel:{str:`br_st${e.id}`,zoom:`br_zm${e.id}`},
      vignette:{str:`vi_st${e.id}`,soft:`vi_so${e.id}`},
      colorgrade:{contrast:`cg_co${e.id}`,sat:`cg_sa${e.id}`,bright:`cg_br${e.id}`,hue:`cg_hu${e.id}`},
      pixelate:{size:`px_sz${e.id}`},
      posterize:{bands:`po_bn${e.id}`,mix:`po_mx${e.id}`},
      dirgradient:{topstr:`dg_ts${e.id}`,botstr:`dg_bs${e.id}`,power:`dg_pw${e.id}`},
    };
    return umap[e.type]?.[k] || parseFloat(e.data[k]).toFixed(6);
  }
  function fwavecol(e) {
    if (forST) return `vec3(${e.data.r.toFixed(4)},${e.data.g.toFixed(4)},${e.data.b.toFixed(4)})`;
    return `wc${e.id}`;
  }
  function fpcol(e, k) {
    if (forST) return `vec3(${parseFloat(e.data[k+'r']).toFixed(4)},${parseFloat(e.data[k+'g']).toFixed(4)},${parseFloat(e.data[k+'b']).toFixed(4)})`;
    return `u_${k}${e.id}`;
  }

  const bgVec = forST ? `vec3(${bgR.toFixed(4)},${bgG.toFixed(4)},${bgB.toFixed(4)})` : 'u_bg';

  let u = 'precision mediump float;\n';
  if (!forST) {
    u += `uniform vec2 u_res;\nuniform float u_t;\nuniform vec3 u_bg;\n`;
    waves.forEach(e => { u += `uniform float wf${e.id},wa${e.id},ws${e.id},wp${e.id},we${e.id},wang${e.id};uniform vec3 wc${e.id};\n`; });
    warps.forEach(e => { u += `uniform float wp_str${e.id},wp_sc${e.id},wp_sp${e.id},wp_oc${e.id};\n`; });
    grains.forEach(e => { u += `uniform float gr_am${e.id},gr_sz${e.id},gr_an${e.id},gr_st${e.id},gr_sa${e.id},gr_sl${e.id};\n`; });
    chromas.forEach(e => { u += `uniform float ch_sp${e.id},ch_an${e.id};\n`; });
    scans.forEach(e => { u += `uniform float sl_cn${e.id},sl_dk${e.id},sl_sf${e.id},sl_sc${e.id},sl_ss${e.id};\n`; });
    barrels.forEach(e => { u += `uniform float br_st${e.id},br_zm${e.id};\n`; });
    vignettes.forEach(e => { u += `uniform float vi_st${e.id},vi_so${e.id};\n`; });
    grades.forEach(e => { u += `uniform float cg_co${e.id},cg_sa${e.id},cg_br${e.id},cg_hu${e.id};\n`; });
    pixels.forEach(e => { u += `uniform float px_sz${e.id};\n`; });
    posts.forEach(e => { u += `uniform float po_bn${e.id},po_mx${e.id};uniform vec3 u_c1${e.id},u_c2${e.id},u_c3${e.id},u_c4${e.id};\n`; });
    dirgrads.forEach(e => { u += `uniform float dg_ts${e.id},dg_bs${e.id},dg_pw${e.id};\n`; });
  }

  let s = u + `
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u2=f*f*(3.0-2.0*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),u2.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u2.x),u2.y);}
float fbm(vec2 p,float oct){float v=0.0,a=0.5;for(int i=0;i<6;i++){if(float(i)>=oct)break;v+=vnoise(p)*a;p*=2.0;a*=0.5;}return v;}
vec2 rot2(vec2 p,float a){float c=cos(a),s2=sin(a);return vec2(p.x*c-p.y*s2,p.x*s2+p.y*c);}
`;

  s += forST ? `void mainImage(out vec4 fragColor,in vec2 fragCoord){\n` : `void main(){\n`;
  s += `  vec2 uv=${fc}/${uR};\n  float t=${uT};\n  vec2 rawuv=uv;\n`;

  barrels.forEach(e => {
    s += `  {vec2 bc=uv*2.0-1.0;float r2=dot(bc,bc);bc*=1.0+${fv(e,'str')}*r2;uv=(bc*${fv(e,'zoom')})*0.5+0.5;}\n`;
  });
  pixels.forEach(e => {
    s += `  {vec2 res=${uR};uv=floor(uv*(res/${fv(e,'size')}))/(res/${fv(e,'size')});}\n`;
  });
  if (warps.length) {
    const w = warps[0];
    s += `  vec2 wuv=uv+${fv(w,'str')}*vec2(fbm(uv*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uv*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
  } else {
    s += `  vec2 wuv=uv;\n`;
  }
  s += `  vec3 col=${bgVec};\n`;

  const hasChroma = chromas.length > 0;
  if (hasChroma) {
    const ch = chromas[0];
    s += `  vec2 chD=vec2(cos(${fv(ch,'angle')}*0.01745),sin(${fv(ch,'angle')}*0.01745));\n`;
    s += `  vec2 uvR=uv+chD*${fv(ch,'spread')},uvB=uv-chD*${fv(ch,'spread')};\n`;
    if (warps.length) {
      const w = warps[0];
      s += `  vec2 wuvR=uvR+${fv(w,'str')}*vec2(fbm(uvR*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uvR*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
      s += `  vec2 wuvB=uvB+${fv(w,'str')}*vec2(fbm(uvB*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uvB*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
    } else {
      s += `  vec2 wuvR=uvR,wuvB=uvB;\n`;
    }
  }

  waves.forEach(w => {
    const freq=fv(w,'freq'),amp=fv(w,'amp'),spd=fv(w,'spd'),pos=fv(w,'pos'),edge=fv(w,'edge'),ang=fv(w,'angle');
    const col=fwavecol(w);
    s += `  {\n    vec2 ruv=rot2(wuv-0.5,${ang}*0.01745)+0.5;\n`;
    s += `    float wave=sin(ruv.x*${freq}*6.2832+t*${spd})*${amp};\n`;
    s += `    float m=smoothstep(${edge},0.0,abs(ruv.y-(${pos}+wave))-${edge}*0.3);\n`;
    if (hasChroma) {
      s += `    vec2 ruvR=rot2(wuvR-0.5,${ang}*0.01745)+0.5;\n`;
      s += `    vec2 ruvB=rot2(wuvB-0.5,${ang}*0.01745)+0.5;\n`;
      s += `    float mR=smoothstep(${edge},0.0,abs(ruvR.y-(${pos}+sin(ruvR.x*${freq}*6.2832+t*${spd})*${amp}))-${edge}*0.3);\n`;
      s += `    float mB=smoothstep(${edge},0.0,abs(ruvB.y-(${pos}+sin(ruvB.x*${freq}*6.2832+t*${spd})*${amp}))-${edge}*0.3);\n`;
      s += `    col+=vec3(${col}.r*mR,${col}.g*m,${col}.b*mB);\n`;
    } else {
      s += `    col+=${col}*m;\n`;
    }
    s += `    col=clamp(col,0.0,1.0);\n  }\n`;
  });

  posts.forEach(e => {
    s += `  {\n    float lum=dot(col,vec3(0.299,0.587,0.114));\n`;
    s += `    float band=floor(lum*${fv(e,'bands')})/${fv(e,'bands')};\n`;
    s += `    vec3 dark=mix(${fpcol(e,'c1')},${fpcol(e,'c2')},rawuv.y);\n`;
    s += `    vec3 bright=mix(${fpcol(e,'c3')},${fpcol(e,'c4')},rawuv.y);\n`;
    s += `    vec3 pcol=mix(dark,bright,band);\n`;
    s += `    col=mix(col,pcol,${fv(e,'mix')});col=clamp(col,0.0,1.0);\n  }\n`;
  });

  scans.forEach(e => {
    s += `  {float slY=rawuv.y;if(${fv(e,'scroll')}>0.5)slY=fract(rawuv.y+t*${fv(e,'scrollspd')});float sl=smoothstep(${fv(e,'soft')},1.0,abs(sin(slY*${fv(e,'count')}*3.14159)));col*=1.0-sl*${fv(e,'dark')};}\n`;
  });

  grains.forEach(e => {
    s += `  {vec2 gp=${fc}/${fv(e,'size')};\n`;
    s += `   vec2 go=vec2(0.0);if(${fv(e,'anim')}>0.5)go+=vec2(floor(t*24.0)*7.3,floor(t*24.0)*3.7);\n`;
    s += `   if(${fv(e,'streak')}>0.5){vec2 sd=vec2(cos(${fv(e,'sangle')}*0.01745),sin(${fv(e,'sangle')}*0.01745));float soff=dot(gp,vec2(-sd.y,sd.x));gp=vec2(dot(gp,sd)+fract(soff)*${fv(e,'slen')},soff);}\n`;
    s += `   float n=hash2(gp+go);col+=vec3((n-0.5)*${fv(e,'amount')});col=clamp(col,0.0,1.0);}\n`;
  });

  dirgrads.forEach(e => {
    s += `  {float iy=1.0-rawuv.y;col-=${fv(e,'topstr')}*pow(rawuv.y,${fv(e,'power')});col+=pow(iy,${fv(e,'power')})*${fv(e,'botstr')}*0.3;col=clamp(col,0.0,1.0);}\n`;
  });

  vignettes.forEach(e => {
    s += `  {vec2 vc=rawuv*2.0-1.0;col*=1.0-smoothstep(1.0-${fv(e,'soft')},1.0+${fv(e,'soft')},length(vc)*${fv(e,'str')});}\n`;
  });

  grades.forEach(e => {
    s += `  {col=clamp(col+${fv(e,'bright')},0.0,1.0);col=(col-0.5)*${fv(e,'contrast')}+0.5;float lum=dot(col,vec3(0.299,0.587,0.114));col=mix(vec3(lum),col,${fv(e,'sat')});\n`;
    s += `   float ha=${fv(e,'hue')}*0.01745;vec3 k=vec3(0.57735);float c2=cos(ha);col=col*c2+cross(k,col)*sin(ha)+k*dot(k,col)*(1.0-c2);col=clamp(col,0.0,1.0);}\n`;
  });

  s += forST ? `  fragColor=vec4(col,1.0);\n}\n` : `  gl_FragColor=vec4(col,1.0);\n}\n`;
  return s;
}

// ================================================================
// WebGL Rendering
// ================================================================
const errEl = document.getElementById('status-error');
const statusDot = document.getElementById('status-dot');

function mkShader(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(s);
    errEl.textContent = err;
    statusDot.className = 'statusbar-dot statusbar-dot--error';
    document.getElementById('status-text').textContent = 'Error';
    return null;
  }
  return s;
}

const vert = `attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}`;
const vbuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

function compile() {
  const fsrc = buildFrag(false);
  const vs = mkShader(gl.VERTEX_SHADER, vert);
  const fs = mkShader(gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return;
  const p = gl.createProgram(); gl.attachShader(p,vs); gl.attachShader(p,fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    errEl.textContent = 'Link error: ' + gl.getProgramInfoLog(p);
    statusDot.className = 'statusbar-dot statusbar-dot--error';
    return;
  }
  errEl.textContent = '';
  statusDot.className = 'statusbar-dot statusbar-dot--live';
  document.getElementById('status-text').textContent = 'Live';
  if (prog) gl.deleteProgram(prog);
  prog = p; gl.useProgram(prog);
  const pl = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
}

function ul(n) { return gl.getUniformLocation(prog, n); }

function setU(t) {
  gl.uniform2f(ul('u_res'), canvas.width, canvas.height);
  gl.uniform1f(ul('u_t'), t);
  gl.uniform3f(ul('u_bg'), bgR, bgG, bgB);
  effects.filter(e => e.on).forEach(e => {
    const d = e.data;
    if (e.type==='wave'){gl.uniform1f(ul(`wf${e.id}`),d.freq);gl.uniform1f(ul(`wa${e.id}`),d.amp);gl.uniform1f(ul(`ws${e.id}`),d.spd);gl.uniform1f(ul(`wp${e.id}`),d.pos);gl.uniform1f(ul(`we${e.id}`),d.edge);gl.uniform1f(ul(`wang${e.id}`),d.angle);gl.uniform3f(ul(`wc${e.id}`),d.r,d.g,d.b);}
    if (e.type==='warp'){gl.uniform1f(ul(`wp_str${e.id}`),d.str);gl.uniform1f(ul(`wp_sc${e.id}`),d.scale);gl.uniform1f(ul(`wp_sp${e.id}`),d.wspd);gl.uniform1f(ul(`wp_oc${e.id}`),d.oct);}
    if (e.type==='grain'){gl.uniform1f(ul(`gr_am${e.id}`),d.amount);gl.uniform1f(ul(`gr_sz${e.id}`),d.size);gl.uniform1f(ul(`gr_an${e.id}`),d.anim);gl.uniform1f(ul(`gr_st${e.id}`),d.streak);gl.uniform1f(ul(`gr_sa${e.id}`),d.sangle);gl.uniform1f(ul(`gr_sl${e.id}`),d.slen);}
    if (e.type==='chroma'){gl.uniform1f(ul(`ch_sp${e.id}`),d.spread);gl.uniform1f(ul(`ch_an${e.id}`),d.angle*Math.PI/180);}
    if (e.type==='scanlines'){gl.uniform1f(ul(`sl_cn${e.id}`),d.count);gl.uniform1f(ul(`sl_dk${e.id}`),d.dark);gl.uniform1f(ul(`sl_sf${e.id}`),d.soft);gl.uniform1f(ul(`sl_sc${e.id}`),d.scroll);gl.uniform1f(ul(`sl_ss${e.id}`),d.scrollspd);}
    if (e.type==='barrel'){gl.uniform1f(ul(`br_st${e.id}`),d.str);gl.uniform1f(ul(`br_zm${e.id}`),d.zoom);}
    if (e.type==='vignette'){gl.uniform1f(ul(`vi_st${e.id}`),d.str);gl.uniform1f(ul(`vi_so${e.id}`),d.soft);}
    if (e.type==='colorgrade'){gl.uniform1f(ul(`cg_co${e.id}`),d.contrast);gl.uniform1f(ul(`cg_sa${e.id}`),d.sat);gl.uniform1f(ul(`cg_br${e.id}`),d.bright);gl.uniform1f(ul(`cg_hu${e.id}`),d.hue);}
    if (e.type==='pixelate'){gl.uniform1f(ul(`px_sz${e.id}`),d.size);}
    if (e.type==='posterize'){
      gl.uniform1f(ul(`po_bn${e.id}`),d.bands);gl.uniform1f(ul(`po_mx${e.id}`),d.mix);
      gl.uniform3f(ul(`u_c1${e.id}`),d.c1r||0.51,d.c1g||0.78,d.c1b||0.49);
      gl.uniform3f(ul(`u_c2${e.id}`),d.c2r||0.20,d.c2g||0.60,d.c2b||0.32);
      gl.uniform3f(ul(`u_c3${e.id}`),d.c3r||0.15,d.c3g||0.49,d.c3b||0.28);
      gl.uniform3f(ul(`u_c4${e.id}`),d.c4r||0.06,d.c4g||0.26,d.c4b||0.25);
    }
    if (e.type==='dirgradient'){gl.uniform1f(ul(`dg_ts${e.id}`),d.topstr);gl.uniform1f(ul(`dg_bs${e.id}`),d.botstr);gl.uniform1f(ul(`dg_pw${e.id}`),d.power);}
  });
}

// --- Init frame & render loop ---
timeOffset = performance.now();
applyFrame();

function frame() {
  const now = performance.now();
  const t = playing ? (now - timeOffset) / 1000 : (pausedAt - timeOffset) / 1000;

  // FPS counter
  frameCount++;
  if (now - lastFpsTime >= 500) {
    currentFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
    document.getElementById('status-fps').textContent = currentFps + ' fps';
    frameCount = 0; lastFpsTime = now;
  }

  // Time display
  const totalSec = Math.max(0, t);
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1);
  document.getElementById('time-display').textContent = `${min}:${sec.padStart(4,'0')}`;

  if (needsRecompile) { needsRecompile = false; compile(); }
  if (prog) { setU(t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  requestAnimationFrame(frame);
}

// --- Boot ---
renderAddGrid();
renderPresets();
loadRandom();
frame();
