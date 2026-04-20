// ================================================================
// SHADER LAB — Renderer v3
// WebGL setup, GLSL builder, uniform setter, RAF loop, mini-renderers
// ================================================================

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl');
let noiseTex = null;
let prog = null;
let frameCount = 0, lastFpsTime = performance.now(), currentFps = 60;
let miniRenderers = [];

// ── Noise Texture ──────────────────────────────────────────────
function initNoiseTex(glCtx) {
  const sz = 256, data = new Uint8Array(sz * sz * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  const tex = glCtx.createTexture();
  glCtx.activeTexture(glCtx.TEXTURE1);
  glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
  glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, sz, sz, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, data);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.REPEAT);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.REPEAT);
  return tex;
}

// ── GLSL Helpers ───────────────────────────────────────────────
const GLSL_HELPERS = `
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u2=f*f*(3.0-2.0*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),u2.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u2.x),u2.y);}
float fbm(vec2 p,float oct){float v=0.0,a=0.5;for(int i=0;i<8;i++){if(float(i)>=oct)break;v+=vnoise(p)*a;p*=2.0;a*=0.5;}return v;}
vec2 rot2(vec2 p,float a){float c=cos(a),s2=sin(a);return vec2(p.x*c-p.y*s2,p.x*s2+p.y*c);}
vec3 bmScreen(vec3 b,vec3 s){return 1.0-(1.0-b)*(1.0-s);}
vec3 bmOverlay(vec3 b,vec3 s){return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(0.5),b));}
`;

// ── JS helper: blend-mode GLSL expression ──────────────────────
function glslBlend(mode, bg, fg) {
  switch (mode) {
    case 'multiply': return `(${bg}*${fg})`;
    case 'screen':   return `bmScreen(${bg},${fg})`;
    case 'overlay':  return `bmOverlay(${bg},${fg})`;
    case 'add':      return `clamp(${bg}+${fg},0.0,1.0)`;
    case 'lighten':  return `max(${bg},${fg})`;
    case 'darken':   return `min(${bg},${fg})`;
    default:         return fg;
  }
}

// ── Hex helper ────────────────────────────────────────────────
function hexToRgb(h) {
  h = (h || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}

// ── Layer type classifiers ─────────────────────────────────────
// Wave, rectangle, circle are content layers but emit their own inline blend
// (they write directly to `col`) rather than returning a color via contentFn_*.
const CONTENT_TYPES = new Set(['solid','gradient','mesh-gradient','image','wave','rectangle','circle']);
const CONTENT_TYPES_WITH_FN = new Set(['solid','gradient','mesh-gradient','image']);
const UV_PREP_TYPES = new Set(['noise-warp','pixelate','ripple']);

function isContent(t)       { return CONTENT_TYPES.has(t); }
function isContentWithFn(t) { return CONTENT_TYPES_WITH_FN.has(t); }
function isUVPrep(t)        { return UV_PREP_TYPES.has(t); }

// ── Uniform name helpers ───────────────────────────────────────
function u(prefix, id, k) { return `u_${prefix}_${id}_${k}`; }

// ── GLSL: stops sampler function (multi-stop gradient lookup) ──
function glslGrStopsFn(id) {
  const cnt = u('gr',id,'cnt');
  const col = u('gr',id,'col');
  const pos = u('gr',id,'pos');
  return `vec3 grSample_${id}(float t){
  t=clamp(t,0.0,1.0);
  vec3 result=${col}[0];
  int n=${cnt};
  for(int i=0;i<5;i++){
    if(i+1>=n) break;
    float a=${pos}[i];
    float b=${pos}[i+1];
    if(t>=a && t<=b){
      float mu=(t-a)/max(b-a,0.00001);
      result=mix(${col}[i],${col}[i+1],mu);
    }
  }
  for(int j=0;j<6;j++){
    if(j>=n) break;
    if(j==n-1 && t>=${pos}[j]) result=${col}[j];
  }
  return result;
}\n`;
}

// ── GLSL: gradient content function (waveGradient algorithm) ───
function glslGradientFn(id) {
  const p = k => u('gr',id,k);
  return glslGrStopsFn(id) + `vec3 contentFn_${id}(vec2 puv){
  float grScl=${p('scl')};
  puv=(puv-0.5)/max(grScl,0.001)+0.5;
  float wg_seed=${p('seed')};float wg_speed=${p('spd')};
  float wg_freqX=${p('fqx')};float wg_freqY=${p('fqy')};
  float wg_angle=${p('ang')};float wg_amplitude=${p('amp')};
  float wg_softness=${p('sft')};float wg_blend=${p('bld')};
  vec3 col=vec3(0.0);
  float wgt=u_t*wg_speed;
  vec2 wg_tuv=puv-0.5;
  vec2 wg_ss=vec2(sin(wg_seed*4.37),cos(wg_seed*5.91))*100.0;
  float wg_deg=vnoise(vec2(wgt*0.1,wg_tuv.x*wg_tuv.y)+wg_ss);
  float wg_ratio=u_res.x/u_res.y;
  wg_tuv.y*=1.0/wg_ratio;
  float wg_ca=cos(radians((wg_deg-0.5)*720.0+180.0)),wg_sa=sin(radians((wg_deg-0.5)*720.0+180.0));
  wg_tuv=mat2(wg_ca,-wg_sa,wg_sa,wg_ca)*wg_tuv;
  wg_tuv.y*=wg_ratio;
  vec2 wg_uv2=(puv*u_res*2.0-u_res)/(u_res.x+u_res.y)*2.0;
  float wg_pra=fract(sin(wg_seed*5.63)*173.29)*6.2832;
  float wg_pc=cos(wg_pra),wg_ps=sin(wg_pra);
  wg_uv2=mat2(wg_pc,-wg_ps,wg_ps,wg_pc)*wg_uv2;
  float wg_ao=sin(wg_seed*2.73)*30.0;
  float wg_dca=cos(radians(wg_angle+wg_ao)),wg_dsa=sin(radians(wg_angle+wg_ao));
  vec2 wg_ruv=mat2(wg_dca,-wg_dsa,wg_dsa,wg_dca)*wg_uv2;
  float wg_fxM=wg_freqX*(1.0+0.5*sin(wg_seed*3.17+wg_freqX));
  float wg_fyM=wg_freqY*(1.0+0.5*sin(wg_seed*3.17+wg_freqY));
  float wg_phX=fract(sin(wg_seed*7.19)*437.58)*6.2832;
  float wg_phY=fract(cos(wg_seed*3.41)*291.37)*6.2832;
  float wg_harm=sin(wg_seed*1.23)*0.5;
  float wg_a=wg_fyM*wg_ruv.y-sin(wg_ruv.x*wg_fxM+wg_ruv.y-wgt+wg_phX);
  wg_a+=wg_harm*sin(wg_ruv.x*wg_fxM*2.0+wg_ruv.y*0.5+wgt*0.7+wg_phY);
  wg_a=smoothstep(cos(wg_a)*wg_softness,sin(wg_a)*wg_softness+3.0,cos(wg_a-wg_fyM*wg_ruv.y)-sin(wg_a-wg_fxM*wg_ruv.x));
  wg_a*=wg_amplitude;
  vec2 wg_warped=cos(wg_a)*wg_uv2+sin(wg_a)*vec2(-wg_uv2.y,wg_uv2.x);
  wg_warped=wg_warped*0.5+0.5;
  vec2 wg_bUV=mix(wg_tuv,wg_warped-0.5,wg_blend);
  float wg_lr1=-5.0+sin(wg_seed*1.83)*20.0;
  float wg_lr2=10.0+cos(wg_seed*2.47)*20.0;
  float wg_rc1=cos(radians(wg_lr1)),wg_rs1=sin(radians(wg_lr1));
  float wg_rc2=cos(radians(wg_lr2)),wg_rs2=sin(radians(wg_lr2));
  float wg_t1=clamp((mat2(wg_rc1,-wg_rs1,wg_rs1,wg_rc1)*wg_bUV).x+0.5,0.0,1.0);
  float wg_t2=clamp((mat2(wg_rc2,-wg_rs2,wg_rs2,wg_rc2)*wg_bUV).x+0.5,0.0,1.0);
  vec3 wg_l1=grSample_${id}(wg_t1);
  vec3 wg_l2=grSample_${id}(wg_t2);
  col=mix(wg_l1,wg_l2,smoothstep(0.3,-0.3,wg_bUV.y));
  col=mix(col,col*col+0.5*sqrt(col),0.3);
  return col;
}\n`;
}

// ── GLSL: liquid computation (shared by mesh-gradient + liquid effect) ──
function glslLiquidBody(prefix, id) {
  const p = k => u(prefix, id, k);
  return `  float lq_seed=${p('seed')};float lq_speed=${p('spd')};
  float lq_scale=${p('sc')};float lq_turbAmp=${p('ta')};
  float lq_turbFreq=max(${p('tf')},0.01);int lq_turbIter=int(${p('ti')});
  float lq_waveFreq=${p('wf')};float lq_distBias=${p('db')};
  float lq_exposure=${p('ex')};float lq_contrast=${p('co')};float lq_saturation=${p('sa')};
  vec3 lq_stops[5];
  lq_stops[0]=${p('c0')};lq_stops[1]=${p('c1')};lq_stops[2]=${p('c2')};lq_stops[3]=${p('c3')};lq_stops[4]=${p('c4')};
  vec2 lq_r=u_res;vec2 lq_p=(puv*lq_r*2.0-lq_r)/lq_r.y;
  float lq_t=u_t*0.3*lq_speed;
  float lq_sa=lq_seed*2.3999632;float lq_cs=cos(lq_sa),lq_sn=sin(lq_sa);
  lq_p=mat2(lq_cs,-lq_sn,lq_sn,lq_cs)*lq_p;
  float lq_sO1=fract(sin(lq_seed*127.1)*43758.5);
  float lq_sO2=fract(sin(lq_seed*311.7)*43758.5);
  float lq_sO3=fract(sin(lq_seed*269.5)*43758.5);
  vec2 lq_sP=(vec2(lq_sO1,lq_sO2)-0.5)*6.2832;
  float lq_tV=0.0,lq_tW=0.0;
  for(float li=0.0;li<4.0;li++){
    float lq_eph=li/4.0;
    vec2 lq_q=lq_p*lq_scale;float lq_la=lq_sP.x,lq_ld=lq_sP.y;
    for(int lj=2;lj<13;lj++){
      if(lj>=lq_turbIter)break;float lq_fj=float(lj);
      lq_q+=lq_turbAmp*sin(lq_q.yx/lq_turbFreq*lq_fj+lq_t+vec2(lq_la,lq_ld))/lq_fj;
      lq_la+=cos(lq_fj+lq_ld*1.2+lq_q.x*2.0-lq_t+lq_sO3*lq_fj);
      lq_ld+=sin(lq_fj*lq_q.y+lq_la+lq_sO1+lq_t);
    }
    float lq_v=0.5+0.5*sin(length(lq_q.yx+vec2(lq_la,lq_ld)*0.2)*lq_waveFreq+li*li+lq_sO1);
    float lq_w=smoothstep(0.0,0.5,lq_eph)*smoothstep(1.0,0.5,lq_eph);
    lq_tV+=lq_v*lq_w;lq_tW+=lq_w;
  }
  float lq_val=lq_tV/max(lq_tW,0.001);
  lq_val=clamp((lq_val-0.3)/0.4,0.0,1.0);
  lq_val=pow(lq_val,exp(-lq_distBias));
  for(int si=0;si<5;si++) lq_stops[si]=pow(lq_stops[si],vec3(2.2));
  float lq_ti=clamp(lq_val,0.0,1.0)*4.0;
  int lq_idx=int(floor(lq_ti));float lq_lt=fract(lq_ti);
  vec3 lq_colA=lq_stops[0],lq_colB=lq_stops[1];
  if(lq_idx==1){lq_colA=lq_stops[1];lq_colB=lq_stops[2];}
  if(lq_idx==2){lq_colA=lq_stops[2];lq_colB=lq_stops[3];}
  if(lq_idx>=3){lq_colA=lq_stops[3];lq_colB=lq_stops[4];}
  vec3 lq_col=mix(lq_colA,lq_colB,lq_lt)*lq_exposure;
  float lq_lum=dot(lq_col,vec3(0.2126,0.7152,0.0722));
  lq_col=clamp((lq_col-0.5)*lq_contrast+0.5,0.0,1.0);
  float lq_lum2=dot(lq_col,vec3(0.2126,0.7152,0.0722));
  lq_col=mix(vec3(lq_lum2),lq_col,lq_saturation);
  vec3 lq_result=pow(clamp(lq_col,0.0,1.0),vec3(0.4545));`;
}

function glslMeshGradientBody(id) {
  const p = k => u('mg', id, k);
  const cols = u('mg', id, 'cols');
  const cnt  = u('mg', id, 'cnt');
  // Copy uniform array into a local array so we can index it with a loop
  // counter on all drivers (some WebGL 1 drivers reject loop-indexed reads
  // from uniform arrays in fragment shaders even though the spec allows it).
  let stopsCopy = '';
  for (let i = 0; i < 16; i++) stopsCopy += `  lq_stops[${i}]=${cols}[${i}];\n`;
  // Unrolled pair selection: guaranteed-constant indices on both sides.
  let pairSelect = `  vec3 lq_colA=lq_stops[0],lq_colB=lq_stops[1];\n`;
  for (let i = 1; i < 15; i++) {
    pairSelect += `  if(lq_idx==${i}){lq_colA=lq_stops[${i}];lq_colB=lq_stops[${i+1}];}\n`;
  }
  return `  float lq_seed=${p('seed')};float lq_speed=${p('spd')};
  float lq_scale=${p('sc')};float lq_turbAmp=${p('ta')};
  float lq_turbFreq=max(${p('tf')},0.01);int lq_turbIter=int(${p('ti')});
  float lq_waveFreq=${p('wf')};float lq_distBias=${p('db')};
  float lq_exposure=${p('ex')};float lq_contrast=${p('co')};float lq_saturation=${p('sa')};
  int lq_cnt=int(max(2.0,min(16.0,float(${cnt}))));
  vec3 lq_stops[16];
${stopsCopy}  vec2 lq_r=u_res;vec2 lq_p=(puv*lq_r*2.0-lq_r)/lq_r.y;
  float lq_t=u_t*0.3*lq_speed;
  float lq_sa=lq_seed*2.3999632;float lq_cs=cos(lq_sa),lq_sn=sin(lq_sa);
  lq_p=mat2(lq_cs,-lq_sn,lq_sn,lq_cs)*lq_p;
  float lq_sO1=fract(sin(lq_seed*127.1)*43758.5);
  float lq_sO2=fract(sin(lq_seed*311.7)*43758.5);
  float lq_sO3=fract(sin(lq_seed*269.5)*43758.5);
  vec2 lq_sP=(vec2(lq_sO1,lq_sO2)-0.5)*6.2832;
  float lq_tV=0.0,lq_tW=0.0;
  for(float li=0.0;li<4.0;li++){
    float lq_eph=li/4.0;
    vec2 lq_q=lq_p*lq_scale;float lq_la=lq_sP.x,lq_ld=lq_sP.y;
    for(int lj=2;lj<13;lj++){
      if(lj>=lq_turbIter)break;float lq_fj=float(lj);
      lq_q+=lq_turbAmp*sin(lq_q.yx/lq_turbFreq*lq_fj+lq_t+vec2(lq_la,lq_ld))/lq_fj;
      lq_la+=cos(lq_fj+lq_ld*1.2+lq_q.x*2.0-lq_t+lq_sO3*lq_fj);
      lq_ld+=sin(lq_fj*lq_q.y+lq_la+lq_sO1+lq_t);
    }
    float lq_v=0.5+0.5*sin(length(lq_q.yx+vec2(lq_la,lq_ld)*0.2)*lq_waveFreq+li*li+lq_sO1);
    float lq_w=smoothstep(0.0,0.5,lq_eph)*smoothstep(1.0,0.5,lq_eph);
    lq_tV+=lq_v*lq_w;lq_tW+=lq_w;
  }
  float lq_val=lq_tV/max(lq_tW,0.001);
  lq_val=clamp((lq_val-0.3)/0.4,0.0,1.0);
  lq_val=pow(lq_val,exp(-lq_distBias));
  float lq_segs=float(lq_cnt-1);
  float lq_ti=clamp(lq_val,0.0,1.0)*lq_segs;
  int lq_idx=int(floor(lq_ti));float lq_lt=fract(lq_ti);
  if(lq_idx>=lq_cnt-1){lq_idx=lq_cnt-2;lq_lt=1.0;}
  if(lq_idx<0){lq_idx=0;lq_lt=0.0;}
${pairSelect}  lq_colA=pow(lq_colA,vec3(2.2));
  lq_colB=pow(lq_colB,vec3(2.2));
  vec3 lq_col=mix(lq_colA,lq_colB,lq_lt)*lq_exposure;
  float lq_lum=dot(lq_col,vec3(0.2126,0.7152,0.0722));
  lq_col=clamp((lq_col-0.5)*lq_contrast+0.5,0.0,1.0);
  float lq_lum2=dot(lq_col,vec3(0.2126,0.7152,0.0722));
  lq_col=mix(vec3(lq_lum2),lq_col,lq_saturation);
  vec3 lq_result=pow(clamp(lq_col,0.0,1.0),vec3(0.4545));`;
}

function glslMeshGradientFn(id) {
  return `vec3 contentFn_${id}(vec2 puv){\n${glslMeshGradientBody(id)}\n  return lq_result;\n}\n`;
}

function glslSolidFn(id) {
  return `vec3 contentFn_${id}(vec2 puv){ return ${u('sl',id,'c')}; }\n`;
}

function glslImageFn(id) {
  const xU  = u('im',id,'x');
  const yU  = u('im',id,'y');
  const wU  = u('im',id,'w');
  const hU  = u('im',id,'h');
  const fmU = u('im',id,'fit');
  return `vec3 contentFn_${id}(vec2 puv){
  if(uHasImage<0.5) return vec3(0.0);
  vec2 cvs=u_res;
  vec2 pix=puv*cvs;
  vec2 boxC=cvs*0.5+vec2(${xU},-${yU});
  vec2 boxHS=vec2(max(${wU},1.0),max(${hU},1.0))*0.5;
  vec2 lp=pix-boxC;
  if(abs(lp.x)>boxHS.x||abs(lp.y)>boxHS.y) return vec3(0.0);
  vec2 boxUv=lp/boxHS*0.5+0.5;
  float boxAR=max(${wU},1.0)/max(${hU},1.0);
  float iAR=max(uImgAr,0.0001);
  vec2 iuv;
  if(${fmU}<0.5){
    if(boxAR>iAR){ iuv.x=boxUv.x; iuv.y=(boxUv.y-0.5)*(iAR/boxAR)+0.5; }
    else         { iuv.y=boxUv.y; iuv.x=(boxUv.x-0.5)*(boxAR/iAR)+0.5; }
  } else if(${fmU}<1.5){
    if(boxAR>iAR){ iuv.y=boxUv.y; iuv.x=(boxUv.x-0.5)*(boxAR/iAR)+0.5; }
    else         { iuv.x=boxUv.x; iuv.y=(boxUv.y-0.5)*(iAR/boxAR)+0.5; }
    if(iuv.x<0.0||iuv.x>1.0||iuv.y<0.0||iuv.y>1.0) return vec3(0.0);
  } else {
    iuv=boxUv;
  }
  iuv.y=1.0-iuv.y;
  return texture2D(uImage,clamp(iuv,vec2(0.0),vec2(1.0))).rgb;
}\n`;
}

// ── GLSL: uniform declarations per layer ───────────────────────
function glslUniformDecls(layers) {
  let s = '';
  layers.forEach(l => {
    const id = l.id;
    switch(l.type) {
      case 'solid':
        s += `uniform vec3 ${u('sl',id,'c')};\n`; break;
      case 'gradient':
        s += `uniform float ${u('gr',id,'seed')},${u('gr',id,'spd')},${u('gr',id,'fqx')},${u('gr',id,'fqy')},${u('gr',id,'ang')},${u('gr',id,'amp')},${u('gr',id,'sft')},${u('gr',id,'bld')},${u('gr',id,'scl')};\n`;
        s += `uniform vec3 ${u('gr',id,'col')}[6];\n`;
        s += `uniform float ${u('gr',id,'pos')}[6];\n`;
        s += `uniform int ${u('gr',id,'cnt')};\n`; break;
      case 'mesh-gradient':
        s += `uniform float ${u('mg',id,'seed')},${u('mg',id,'spd')},${u('mg',id,'sc')},${u('mg',id,'ta')},${u('mg',id,'tf')},${u('mg',id,'ti')},${u('mg',id,'wf')},${u('mg',id,'db')},${u('mg',id,'ex')},${u('mg',id,'co')},${u('mg',id,'sa')};\n`;
        s += `uniform vec3 ${u('mg',id,'cols')}[16];\n`;
        s += `uniform int ${u('mg',id,'cnt')};\n`; break;
      case 'image':
        s += `uniform float ${u('im',id,'x')},${u('im',id,'y')},${u('im',id,'w')},${u('im',id,'h')},${u('im',id,'fit')};\n`;
        break; // also uses shared uImage, uHasImage, uImgAr
      case 'noise-warp':
        s += `uniform float ${u('nw',id,'str')},${u('nw',id,'sc')},${u('nw',id,'sp')},${u('nw',id,'oc')},${u('nw',id,'ang')};\n`; break;
      case 'pixelate':
        s += `uniform float ${u('px',id,'s')};\n`; break;
      case 'wave':
        s += `uniform float ${u('wv',id,'f')},${u('wv',id,'a')},${u('wv',id,'s')},${u('wv',id,'p')},${u('wv',id,'e')},${u('wv',id,'ang')};\n`;
        s += `uniform vec3 ${u('wv',id,'c')};\n`; break;
      case 'rectangle':
        s += `uniform float ${u('rc',id,'x')},${u('rc',id,'y')},${u('rc',id,'w')},${u('rc',id,'h')},${u('rc',id,'r')},${u('rc',id,'fm')},${u('rc',id,'cnt')},${u('rc',id,'bl')},${u('rc',id,'rot')},${u('rc',id,'scl')};\n`;
        s += `uniform vec3 ${u('rc',id,'c')};\n`;
        s += `uniform vec3 ${u('rc',id,'cols')}[6];\n`; break;
      case 'circle':
        s += `uniform float ${u('ci',id,'x')},${u('ci',id,'y')},${u('ci',id,'w')},${u('ci',id,'h')},${u('ci',id,'fm')},${u('ci',id,'cnt')},${u('ci',id,'bl')},${u('ci',id,'rot')},${u('ci',id,'scl')};\n`;
        s += `uniform vec3 ${u('ci',id,'c')};\n`;
        s += `uniform vec3 ${u('ci',id,'cols')}[6];\n`; break;
      case 'liquid':
        s += `uniform float ${u('lq',id,'seed')},${u('lq',id,'spd')},${u('lq',id,'sc')},${u('lq',id,'ta')},${u('lq',id,'tf')},${u('lq',id,'ti')},${u('lq',id,'wf')},${u('lq',id,'db')},${u('lq',id,'ex')},${u('lq',id,'co')},${u('lq',id,'sa')};\n`;
        s += `uniform vec3 ${u('lq',id,'c0')},${u('lq',id,'c1')},${u('lq',id,'c2')},${u('lq',id,'c3')},${u('lq',id,'c4')};\n`; break;
      case 'grain':
        s += `uniform float ${u('gn',id,'am')},${u('gn',id,'sz')},${u('gn',id,'an')},${u('gn',id,'st')},${u('gn',id,'sa')},${u('gn',id,'sl')};\n`; break;
      case 'chromatic-aberration':
        s += `uniform float ${u('ca',id,'sp')},${u('ca',id,'an')};\n`; break;
      case 'vignette':
        s += `uniform float ${u('vi',id,'s')},${u('vi',id,'f')};\n`; break;
      case 'color-grade':
        s += `uniform float ${u('cg',id,'c')},${u('cg',id,'s')},${u('cg',id,'b')},${u('cg',id,'h')};\n`; break;
      case 'posterize':
        s += `uniform float ${u('po',id,'b')},${u('po',id,'m')};\n`;
        s += `uniform vec3 ${u('po',id,'c1')},${u('po',id,'c2')},${u('po',id,'c3')},${u('po',id,'c4')};\n`; break;
      case 'scanlines':
        s += `uniform float ${u('sc',id,'n')},${u('sc',id,'d')},${u('sc',id,'f')},${u('sc',id,'sc')},${u('sc',id,'ss')};\n`; break;
      case 'duotone':
        s += `uniform vec3 ${u('dt',id,'sh')},${u('dt',id,'li')};\n`;
        s += `uniform float ${u('dt',id,'bl')};\n`; break;
      case 'bloom':
        s += `uniform float ${u('bl',id,'th')},${u('bl',id,'st')},${u('bl',id,'rd')};\n`; break;
      case 'ripple':
        s += `uniform float ${u('rp',id,'cx')},${u('rp',id,'cy')},${u('rp',id,'fq')},${u('rp',id,'am')},${u('rp',id,'sp')},${u('rp',id,'dc')};\n`; break;
    }
    if (l.type !== 'frame') s += `uniform float u_op_${id};\n`;
  });
  return s;
}

// ── GLSL: inline-content fill (wave / rectangle / circle) ──────
// Emits GLSL that declares `vec3 fillC;` and `float _mask;` in the current
// scope. The walk loop handles attached-effect scoping + blend composite.
// Emits the "prep" portion: declares pp, c, hs, lp (or ruv for wave).
// For rect/circle, the caller can optionally warp `lp` in shape-local space
// between prep and body (e.g. attached noise-warp) so effects feel native.
function glslShapeFillPrep(l) {
  const id = l.id;
  switch (l.type) {
    case 'wave': {
      const ang=u('wv',id,'ang');
      return `    vec2 ruv=rot2(wuv-0.5,${ang})+0.5;\n`;
    }
    case 'rectangle': {
      const xU=u('rc',id,'x'),yU=u('rc',id,'y'),wU=u('rc',id,'w'),hU=u('rc',id,'h'),rotU=u('rc',id,'rot'),sclU=u('rc',id,'scl');
      return `    vec2 pp=wuv*u_res;
    vec2 c=u_res*0.5+vec2(${xU},${yU});
    vec2 hs=vec2(${wU},${hU})*0.5*max(${sclU},0.01);
    vec2 lp=rot2(pp-c,-${rotU});
`;
    }
    case 'circle': {
      const xU=u('ci',id,'x'),yU=u('ci',id,'y'),wU=u('ci',id,'w'),hU=u('ci',id,'h'),rotU=u('ci',id,'rot'),sclU=u('ci',id,'scl');
      return `    vec2 pp=wuv*u_res;
    vec2 c=u_res*0.5+vec2(${xU},${yU});
    vec2 hs=vec2(${wU},${hU})*0.5*max(${sclU},0.01);
    vec2 lp=rot2(pp-c,-${rotU});
`;
    }
  }
  return '';
}

// Emits the "body" portion: SDF, _mask, fillC. Expects prep vars in scope.
function glslShapeFillBody(l) {
  const id = l.id;
  switch (l.type) {
    case 'wave': {
      const f=u('wv',id,'f'),a=u('wv',id,'a'),sp=u('wv',id,'s'),pos=u('wv',id,'p'),e=u('wv',id,'e'),c=u('wv',id,'c');
      return `    float wave=sin(ruv.x*${f}*6.2832+u_t*${sp})*${a};
    float _mask=smoothstep(${e},0.0,abs(ruv.y-(${pos}+wave))-${e}*0.3);
    vec3 fillC=${c};
`;
    }
    case 'rectangle': {
      const rU=u('rc',id,'r'),fmU=u('rc',id,'fm'),blU=u('rc',id,'bl'),cU=u('rc',id,'c'),cntU=u('rc',id,'cnt'),colsU=u('rc',id,'cols');
      return `    float r=clamp(${rU},0.0,min(hs.x,hs.y));
    vec2 d=abs(lp)-hs+vec2(r);
    float sdf=length(max(d,0.0))+min(max(d.x,d.y),0.0)-r;
    float bl=max(${blU},1.0);
    float _mask=1.0-smoothstep(-bl,bl,sdf);
    vec3 fillC=${cU};
    if(${fmU}>0.5){
      float ncnt=max(${cntU},2.0);
      float tg=clamp((lp.y+hs.y)/(2.0*hs.y),0.0,1.0);
      float ft=tg*(ncnt-1.0);
      float fi0=floor(ft);
      float fi1=min(fi0+1.0,ncnt-1.0);
      float mu=ft-fi0;
      vec3 ca=${colsU}[0],cb=${colsU}[0];
      for(int k=0;k<6;k++){ float fk=float(k); if(fk==fi0) ca=${colsU}[k]; if(fk==fi1) cb=${colsU}[k]; }
      fillC=mix(ca,cb,mu);
    }
`;
    }
    case 'circle': {
      const fmU=u('ci',id,'fm'),blU=u('ci',id,'bl'),cU=u('ci',id,'c'),cntU=u('ci',id,'cnt'),colsU=u('ci',id,'cols');
      return `    vec2 q=lp/max(hs,vec2(0.5));
    float r=max(min(hs.x,hs.y),0.5);
    float sdf=(length(q)-1.0)*r;
    float bl=max(${blU},1.0);
    float _mask=1.0-smoothstep(-bl,bl,sdf);
    vec3 fillC=${cU};
    if(${fmU}>0.5){
      float ncnt=max(${cntU},2.0);
      float tg=clamp((lp.y+hs.y)/(2.0*hs.y),0.0,1.0);
      float ft=tg*(ncnt-1.0);
      float fi0=floor(ft);
      float fi1=min(fi0+1.0,ncnt-1.0);
      float mu=ft-fi0;
      vec3 ca=${colsU}[0],cb=${colsU}[0];
      for(int k=0;k<6;k++){ float fk=float(k); if(fk==fi0) ca=${colsU}[k]; if(fk==fi1) cb=${colsU}[k]; }
      fillC=mix(ca,cb,mu);
    }
`;
    }
  }
  return '';
}

// Backwards-compat: emits prep + body together (still used via split in walk loop).
function glslShapeFill(l) {
  return glslShapeFillPrep(l) + glslShapeFillBody(l);
}

// ── GLSL: effect inline body ───────────────────────────────────
function glslEffectInline(l) {
  const id = l.id;
  switch(l.type) {
    case 'liquid': {
      return `  {\n    vec3 lq_orig=col;\n    vec2 puv=wuv;\n${glslLiquidBody('lq',id)}\n    col=mix(lq_orig,lq_result,u_op_${id});\n  }\n`;
    }
    case 'grain': {
      const am=u('gn',id,'am'),sz=u('gn',id,'sz'),an=u('gn',id,'an'),st=u('gn',id,'st'),sa=u('gn',id,'sa'),sl=u('gn',id,'sl');
      return `  {\n    vec2 gp=gl_FragCoord.xy/${sz};\n    vec2 go=vec2(0.0);if(${an}>0.5)go+=vec2(floor(u_t*24.0)*7.3,floor(u_t*24.0)*3.7);\n    if(${st}>0.5){vec2 sd=vec2(cos(${sa}*0.01745),sin(${sa}*0.01745));float soff=dot(gp,vec2(-sd.y,sd.x));gp=vec2(dot(gp,sd)+fract(soff)*${sl},soff);}\n    float n=hash2(gp+go);col+=vec3((n-0.5)*${am}*u_op_${id});col=clamp(col,0.0,1.0);\n  }\n`;
    }
    case 'vignette': {
      const s=u('vi',id,'s'),f=u('vi',id,'f');
      return `  {vec2 vc=rawuv*2.0-1.0;float vigM=smoothstep(1.0-${f},1.0+${f},length(vc)*${s});col=mix(col,col*(1.0-vigM),u_op_${id});}\n`;
    }
    case 'color-grade': {
      const c=u('cg',id,'c'),s=u('cg',id,'s'),b=u('cg',id,'b'),h=u('cg',id,'h');
      return `  {\n    vec3 cg_orig=col;\n    col=clamp(col+${b},0.0,1.0);\n    col=(col-0.5)*${c}+0.5;\n    float lum=dot(col,vec3(0.299,0.587,0.114));col=mix(vec3(lum),col,${s});\n    float ha=${h}*0.01745;vec3 k=vec3(0.57735);float c2=cos(ha);col=col*c2+cross(k,col)*sin(ha)+k*dot(k,col)*(1.0-c2);\n    col=clamp(col,0.0,1.0);col=mix(cg_orig,col,u_op_${id});\n  }\n`;
    }
    case 'posterize': {
      const b=u('po',id,'b'),m=u('po',id,'m'),c1=u('po',id,'c1'),c2=u('po',id,'c2'),c3=u('po',id,'c3'),c4=u('po',id,'c4');
      return `  {\n    float lum=dot(col,vec3(0.299,0.587,0.114));\n    float band=floor(lum*${b})/${b};\n    vec3 dark=mix(${c1},${c2},rawuv.y);\n    vec3 bright=mix(${c3},${c4},rawuv.y);\n    vec3 pcol=mix(dark,bright,band);\n    col=mix(col,pcol,${m}*u_op_${id});col=clamp(col,0.0,1.0);\n  }\n`;
    }
    case 'scanlines': {
      const n=u('sc',id,'n'),d=u('sc',id,'d'),f=u('sc',id,'f'),sc=u('sc',id,'sc'),ss=u('sc',id,'ss');
      return `  {float slY=rawuv.y;if(${sc}>0.5)slY=fract(rawuv.y+u_t*${ss});float sl=smoothstep(${f},1.0,abs(sin(slY*${n}*3.14159)));col*=1.0-sl*${d}*u_op_${id};}\n`;
    }
    case 'duotone': {
      const sh=u('dt',id,'sh'),li=u('dt',id,'li'),bl=u('dt',id,'bl');
      return `  {\n    float dtLum=dot(col,vec3(0.299,0.587,0.114));\n    vec3 dtRes=mix(${sh},${li},dtLum);\n    col=mix(col,dtRes,${bl}*u_op_${id});\n  }\n`;
    }
    case 'bloom': {
      const th=u('bl',id,'th'),st=u('bl',id,'st'),rd=u('bl',id,'rd');
      return `  {\n    float blLum=dot(col,vec3(0.299,0.587,0.114));\n    float blMask=smoothstep(${th}-0.05*${rd},${th}+0.15*${rd},blLum);\n    vec3 blGlow=col*blMask*${st}*${rd};\n    col=col+blGlow*u_op_${id};\n    col=clamp(col,0.0,1.0);\n  }\n`;
    }
    default: return '';
  }
}

// ── Build Fragment Shader ──────────────────────────────────────
// Stack-respecting compositing: every effect (UV-prep + CA + color-transform)
// only affects layers BELOW it in the stack. Single fragment shader; layers
// are walked bottom→top and each content/effect block computes its own local
// `wuv` by applying only the noise-warp/pixelate layers above it.
function buildFragFromLayers(layers, frameState) {
  const vis = (layers || []).filter(l => l.visible !== false && l.type !== 'frame');

  // Flatten attached effects so uniform decls / setters treat them as effect layers.
  const attachedEffects = [];
  vis.forEach(l => {
    if (isContent(l.type) && Array.isArray(l.effects)) {
      l.effects.forEach(ae => { if (ae.visible !== false) attachedEffects.push(ae); });
    }
  });

  const contentLayers = vis.filter(l => isContent(l.type));

  // For each content layer: CA layers above it in the stack (lower index).
  const caAboveByContent = {};
  vis.forEach((l, i) => {
    if (isContent(l.type)) {
      caAboveByContent[l.id] = vis.slice(0, i).filter(ll => ll.type === 'chromatic-aberration');
    }
  });

  const [bgR, bgG, bgB] = hexToRgb(frameState.bg);
  const hasImage = contentLayers.some(l => l.type === 'image');

  let s = 'precision mediump float;\n';
  s += 'uniform vec2 u_res;\nuniform float u_t;\n';
  if (hasImage) s += 'uniform sampler2D uImage;\nuniform float uHasImage;\nuniform float uImgAr;\n';

  s += glslUniformDecls([...vis, ...attachedEffects]);
  s += GLSL_HELPERS;

  contentLayers.forEach(l => {
    if      (l.type === 'solid')         s += glslSolidFn(l.id);
    else if (l.type === 'gradient')      s += glslGradientFn(l.id);
    else if (l.type === 'mesh-gradient') s += glslMeshGradientFn(l.id);
    else if (l.type === 'image')         s += glslImageFn(l.id);
    // 'wave', 'rectangle', 'circle' are handled inline in the walk below.
  });

  // Emit GLSL that declares `vec2 wuv` for the block at stack index `idx`,
  // applying pixelate + noise-warp from all layers ABOVE that index.
  function emitUvAbove(idx) {
    let out = '    vec2 wuv=uv;\n';
    const above = vis.slice(0, idx);
    above.forEach(l => {
      if (l.type === 'pixelate') {
        const sz = u('px', l.id, 's');
        out += `    wuv=floor(wuv*(u_res/${sz}))/(u_res/${sz});\n`;
      } else if (l.type === 'noise-warp') {
        const id=l.id, str=u('nw',id,'str'), sc=u('nw',id,'sc'), sp=u('nw',id,'sp'), oc=u('nw',id,'oc'), ang=u('nw',id,'ang');
        out += `    {\n      vec2 nwSrc=wuv;\n      vec2 nwDrift=vec2(cos(${ang}),sin(${ang}))*t*${sp};\n`;
        out += `      wuv+=${str}*vec2(fbm(nwSrc*${sc}+nwDrift,${oc})-0.5,fbm(nwSrc*${sc}+nwDrift+vec2(5.2,1.3),${oc})-0.5);\n    }\n`;
      } else if (l.type === 'ripple') {
        const id=l.id, cx=u('rp',id,'cx'), cy=u('rp',id,'cy'), fq=u('rp',id,'fq'), am=u('rp',id,'am'), sp=u('rp',id,'sp'), dc=u('rp',id,'dc');
        out += `    {\n      float ar=u_res.x/u_res.y;\n      vec2 rpC=vec2(${cx},${cy});\n      vec2 rpD=(wuv-rpC)*vec2(ar,1.0);\n      float rpLen=length(rpD);\n      float rpPhase=sin(rpLen*${fq} - u_t*${sp})*${am}*exp(-rpLen*${dc});\n      vec2 rpDir=rpLen>0.0001?rpD/rpLen:vec2(0.0);\n      wuv+=rpDir*vec2(1.0/ar,1.0)*rpPhase;\n    }\n`;
      }
    });
    return out;
  }

  s += 'void main(){\n';
  s += '  vec2 uv=gl_FragCoord.xy/u_res;\n  float t=u_t;\n  vec2 rawuv=uv;\n';

  // Per-CA direction vectors (depend only on CA uniforms; safe at main scope).
  vis.filter(l => l.type === 'chromatic-aberration').forEach(l => {
    s += `  vec2 ca_d_${l.id}=vec2(cos(${u('ca',l.id,'an')}),sin(${u('ca',l.id,'an')}))*${u('ca',l.id,'sp')};\n`;
  });

  s += `  vec3 col=vec3(${bgR.toFixed(4)},${bgG.toFixed(4)},${bgB.toFixed(4)});\n`;

  // Walk bottom→top. UV-prep/CA layers contribute via the "above" lookups only.
  [...vis].reverse().forEach(l => {
    if (l.type === 'noise-warp' || l.type === 'pixelate' || l.type === 'ripple' || l.type === 'chromatic-aberration') return;

    const idx = vis.indexOf(l);
    s += '  {\n';
    s += emitUvAbove(idx);

    const op = `u_op_${l.id}`;
    const mode = l.blendMode || 'normal';
    const aesAll = (isContent(l.type) && Array.isArray(l.effects))
      ? l.effects.filter(ae => ae.visible !== false) : [];
    const aesUv = aesAll.filter(ae => ae.type === 'noise-warp');
    const aes = aesAll.filter(ae => ae.type !== 'noise-warp');

    // Emit attached noise-warp as a wuv shift (canvas-UV space) — used for
    // content-fn layers and wave (both sample the content in wuv space).
    const emitWuvWarp = () => {
      aesUv.forEach(ae => {
        const id=ae.id, str=u('nw',id,'str'), sc=u('nw',id,'sc'), sp=u('nw',id,'sp'), oc=u('nw',id,'oc'), ang=u('nw',id,'ang');
        s += `    {\n      vec2 nwSrc=wuv;\n      vec2 nwDrift=vec2(cos(${ang}),sin(${ang}))*t*${sp};\n`;
        s += `      wuv+=${str}*vec2(fbm(nwSrc*${sc}+nwDrift,${oc})-0.5,fbm(nwSrc*${sc}+nwDrift+vec2(5.2,1.3),${oc})-0.5);\n    }\n`;
      });
    };
    // Emit attached noise-warp in shape-local space: samples noise in
    // normalized shape coords (so the pattern rotates/translates with the
    // shape) and displaces lp in shape-local px. Requires lp + hs in scope.
    const emitLocalWarp = () => {
      aesUv.forEach(ae => {
        const id=ae.id, str=u('nw',id,'str'), sc=u('nw',id,'sc'), sp=u('nw',id,'sp'), oc=u('nw',id,'oc'), ang=u('nw',id,'ang');
        s += `    {\n      vec2 nwLocal=lp/max(hs,vec2(1.0));\n      vec2 nwDrift=vec2(cos(${ang}),sin(${ang}))*t*${sp};\n`;
        s += `      vec2 nwW=${str}*vec2(fbm(nwLocal*${sc}+nwDrift,${oc})-0.5,fbm(nwLocal*${sc}+nwDrift+vec2(5.2,1.3),${oc})-0.5);\n`;
        s += `      lp+=nwW*max(hs,vec2(1.0));\n    }\n`;
      });
    };

    const emitAttached = (target) => {
      if (!aes.length) return '';
      let out = `    {\n      vec3 _cbak=col;\n      col=${target};\n`;
      aes.forEach(ae => { out += glslEffectInline(ae); });
      out += `      ${target}=col;\n      col=_cbak;\n    }\n`;
      return out;
    };

    if (isContentWithFn(l.type)) {
      emitWuvWarp();
      const cas = caAboveByContent[l.id] || [];
      if (cas.length > 0) {
        const sumX = cas.map(c => `ca_d_${c.id}.x`).join('+');
        const sumY = cas.map(c => `ca_d_${c.id}.y`).join('+');
        s += `    vec2 _cad=vec2(${sumX},${sumY});\n`;
        s += `    vec3 lR=contentFn_${l.id}(wuv+_cad),lG=contentFn_${l.id}(wuv),lB=contentFn_${l.id}(wuv-_cad);\n`;
        s += `    vec3 lc=vec3(lR.r,lG.g,lB.b);\n`;
      } else {
        s += `    vec3 lc=contentFn_${l.id}(wuv);\n`;
      }
      s += emitAttached('lc');
      s += `    col=mix(col,${glslBlend(mode, 'col', 'lc')},${op});\n`;
    } else if (l.type === 'rectangle' || l.type === 'circle') {
      s += '  {\n'; // extra scope so fillC/_mask don't collide across shapes
      s += glslShapeFillPrep(l);
      emitLocalWarp();              // native-to-shape: warps lp in local space
      s += glslShapeFillBody(l);
      s += emitAttached('fillC');
      s += `    col=mix(col,${glslBlend(mode, 'col', 'fillC')},_mask*${op});\n`;
      s += '  }\n';
    } else if (l.type === 'wave') {
      emitWuvWarp();                // wave uses wuv/ruv, keep canvas-space warp
      s += '  {\n';
      s += glslShapeFill(l);
      s += emitAttached('fillC');
      s += `    col=mix(col,${glslBlend(mode, 'col', 'fillC')},_mask*${op});\n`;
      s += '  }\n';
    } else {
      // Color-transform effect.
      s += glslEffectInline(l);
    }
    s += '  }\n';
  });

  s += '  gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);\n}\n';
  return s;
}

// ── Uniform Setter ─────────────────────────────────────────────
function setUniformsForLayers(glCtx, glProg, layerArr, frameState, t, nt, baseImgTex, hasImg, imgAr) {
  function ul(n) { return glCtx.getUniformLocation(glProg, n); }

  glCtx.uniform2f(ul('u_res'), frameState.w, frameState.h);
  glCtx.uniform1f(ul('u_t'), t);

  // Image texture
  glCtx.activeTexture(glCtx.TEXTURE0);
  if (baseImgTex) glCtx.bindTexture(glCtx.TEXTURE_2D, baseImgTex);
  const uImg = ul('uImage');
  if (uImg) glCtx.uniform1i(uImg, 0);
  const uHas = ul('uHasImage');
  if (uHas) glCtx.uniform1f(uHas, hasImg ? 1.0 : 0.0);
  const uAr = ul('uImgAr');
  if (uAr) glCtx.uniform1f(uAr, imgAr || 1.0);

  // Noise texture
  glCtx.activeTexture(glCtx.TEXTURE1);
  if (nt) glCtx.bindTexture(glCtx.TEXTURE_2D, nt);

  const vis = (layerArr || []).filter(l => l.visible !== false && l.type !== 'frame');

  // Flatten attached effects so they receive uniforms alongside top-level layers.
  const attachedEffects = [];
  vis.forEach(l => {
    if (isContent(l.type) && Array.isArray(l.effects)) {
      l.effects.forEach(ae => { if (ae.visible !== false) attachedEffects.push(ae); });
    }
  });

  [...vis, ...attachedEffects].forEach(l => {
    const id = l.id;
    const p = l.properties || {};
    const op = l.opacity !== undefined ? l.opacity : 1.0;

    const uop = ul(`u_op_${id}`);
    if (uop) glCtx.uniform1f(uop, op);

    switch(l.type) {
      case 'solid': {
        const [r,g,b] = hexToRgb(p.color || '#888888');
        glCtx.uniform3f(ul(u('sl',id,'c')), r, g, b); break;
      }
      case 'image': {
        const fw = Math.max(1, p.w != null ? p.w : frameState.w);
        const fh = Math.max(1, p.h != null ? p.h : frameState.h);
        glCtx.uniform1f(ul(u('im',id,'x')), p.x != null ? p.x : 0);
        glCtx.uniform1f(ul(u('im',id,'y')), p.y != null ? p.y : 0);
        glCtx.uniform1f(ul(u('im',id,'w')), fw);
        glCtx.uniform1f(ul(u('im',id,'h')), fh);
        const fit = (p.fit || 'cover');
        const fitV = fit === 'cover' ? 0 : fit === 'contain' ? 1 : 2;
        glCtx.uniform1f(ul(u('im',id,'fit')), fitV);
        break;
      }
      case 'gradient': {
        glCtx.uniform1f(ul(u('gr',id,'seed')), p.seed     != null ? p.seed      : 42);
        glCtx.uniform1f(ul(u('gr',id,'spd')),  p.speed    != null ? p.speed     : 1.0);
        glCtx.uniform1f(ul(u('gr',id,'fqx')),  p.freqX    != null ? p.freqX     : 0.9);
        glCtx.uniform1f(ul(u('gr',id,'fqy')),  p.freqY    != null ? p.freqY     : 6.0);
        glCtx.uniform1f(ul(u('gr',id,'ang')),  p.angle    != null ? p.angle     : 105);
        glCtx.uniform1f(ul(u('gr',id,'amp')),  p.amplitude!= null ? p.amplitude : 2.1);
        glCtx.uniform1f(ul(u('gr',id,'sft')),  p.softness != null ? p.softness  : 0.74);
        glCtx.uniform1f(ul(u('gr',id,'bld')),  p.blend    != null ? p.blend     : 0.54);
        glCtx.uniform1f(ul(u('gr',id,'scl')),  p.scale    != null ? p.scale     : 1.0);
        let stops = (Array.isArray(p.stops) && p.stops.length >= 2) ? p.stops
                  : [{position:0,color:'#FF0055'},{position:1,color:'#0088FF'}];
        const count = Math.min(6, stops.length);
        const colData = new Float32Array(6*3);
        const posData = new Float32Array(6);
        for (let i = 0; i < 6; i++) {
          const src = i < count ? stops[i] : stops[count-1];
          const [r,g,bb] = hexToRgb(src.color || '#000000');
          colData[i*3+0] = r; colData[i*3+1] = g; colData[i*3+2] = bb;
          posData[i] = i < count ? Math.max(0, Math.min(1, (src.position != null ? src.position : i/Math.max(1,count-1)))) : 1.0;
        }
        glCtx.uniform3fv(ul(u('gr',id,'col')), colData);
        glCtx.uniform1fv(ul(u('gr',id,'pos')), posData);
        glCtx.uniform1i (ul(u('gr',id,'cnt')), count);
        break;
      }
      case 'mesh-gradient': {
        glCtx.uniform1f(ul(u('mg',id,'seed')),p.seed||12);
        glCtx.uniform1f(ul(u('mg',id,'spd')), p.speed||0.3);
        glCtx.uniform1f(ul(u('mg',id,'sc')),  p.scale||0.42);
        glCtx.uniform1f(ul(u('mg',id,'ta')),  p.turbAmp||0.6);
        glCtx.uniform1f(ul(u('mg',id,'tf')),  p.turbFreq||0.1);
        glCtx.uniform1f(ul(u('mg',id,'ti')),  p.turbIter||7);
        glCtx.uniform1f(ul(u('mg',id,'wf')),  p.waveFreq||3.8);
        glCtx.uniform1f(ul(u('mg',id,'db')),  p.distBias||0.0);
        glCtx.uniform1f(ul(u('mg',id,'ex')),  p.exposure||1.1);
        glCtx.uniform1f(ul(u('mg',id,'co')),  p.contrast||1.1);
        glCtx.uniform1f(ul(u('mg',id,'sa')),  p.saturation||1.0);
        let mgCols = Array.isArray(p.colors) && p.colors.length >= 2 ? p.colors
                   : [p.color0||'#1a1a2e', p.color1||'#16213e', p.color2||'#0f3460', p.color3||'#533483', p.color4||'#e94560'];
        mgCols = mgCols.slice(0, 16);
        const cnt = mgCols.length;
        const arr = new Float32Array(16 * 3);
        for (let i = 0; i < 16; i++) {
          const hex = i < cnt ? mgCols[i] : mgCols[cnt - 1];
          const [r,g,b] = hexToRgb(hex || '#000000');
          arr[i*3]=r; arr[i*3+1]=g; arr[i*3+2]=b;
        }
        glCtx.uniform3fv(ul(u('mg',id,'cols')), arr);
        glCtx.uniform1i(ul(u('mg',id,'cnt')), cnt);
        break;
      }
      case 'noise-warp': {
        glCtx.uniform1f(ul(u('nw',id,'str')), p.str||0.5);
        glCtx.uniform1f(ul(u('nw',id,'sc')),  p.scale||2.0);
        glCtx.uniform1f(ul(u('nw',id,'sp')),  p.wspd||0.12);
        glCtx.uniform1f(ul(u('nw',id,'oc')),  p.oct||4);
        glCtx.uniform1f(ul(u('nw',id,'ang')), ((p.angle != null ? p.angle : 90)) * Math.PI / 180);
        break;
      }
      case 'pixelate': {
        glCtx.uniform1f(ul(u('px',id,'s')), Math.max(1, p.size||4)); break;
      }
      case 'wave': {
        const [r,g,b] = hexToRgb(p.color||'#6B7FE8');
        glCtx.uniform1f(ul(u('wv',id,'f')),   p.freq||4.0);
        glCtx.uniform1f(ul(u('wv',id,'a')),   p.amp||0.15);
        glCtx.uniform1f(ul(u('wv',id,'s')),   p.spd||0.6);
        glCtx.uniform1f(ul(u('wv',id,'p')),   p.pos||0.5);
        glCtx.uniform1f(ul(u('wv',id,'e')),   p.edge||0.06);
        glCtx.uniform1f(ul(u('wv',id,'ang')), (p.angle||0)*Math.PI/180);
        glCtx.uniform3f(ul(u('wv',id,'c')),   r, g, b);
        break;
      }
      case 'rectangle': {
        const [r,g,b] = hexToRgb(p.color || '#E8E8E8');
        glCtx.uniform1f(ul(u('rc',id,'x')), p.x != null ? p.x : 0);
        glCtx.uniform1f(ul(u('rc',id,'y')), p.y != null ? p.y : 0);
        glCtx.uniform1f(ul(u('rc',id,'w')), Math.max(1, p.w || 200));
        glCtx.uniform1f(ul(u('rc',id,'h')), Math.max(1, p.h || 200));
        glCtx.uniform1f(ul(u('rc',id,'r')), Math.max(0, p.radius || 0));
        glCtx.uniform1f(ul(u('rc',id,'fm')), (p.fillMode === 'gradient') ? 1.0 : 0.0);
        glCtx.uniform1f(ul(u('rc',id,'bl')), Math.max(0, p.blur || 0));
        glCtx.uniform1f(ul(u('rc',id,'rot')), ((p.rotation||0) * Math.PI / 180));
        glCtx.uniform1f(ul(u('rc',id,'scl')), p.scale != null ? p.scale : 1.0);
        glCtx.uniform3f(ul(u('rc',id,'c')), r, g, b);
        const stops = Array.isArray(p.stops) && p.stops.length >= 2 ? p.stops : [{color:'#FF0055'},{color:'#0088FF'}];
        const n = Math.min(6, stops.length);
        const colsArr = new Float32Array(6*3);
        for (let i = 0; i < 6; i++) {
          const src = i < n ? stops[i] : stops[n-1];
          const [rr, gg, bb] = hexToRgb(src.color || '#ffffff');
          colsArr[i*3] = rr; colsArr[i*3+1] = gg; colsArr[i*3+2] = bb;
        }
        glCtx.uniform3fv(ul(u('rc',id,'cols')), colsArr);
        glCtx.uniform1f(ul(u('rc',id,'cnt')), n);
        break;
      }
      case 'circle': {
        const [r,g,b] = hexToRgb(p.color || '#E8E8E8');
        glCtx.uniform1f(ul(u('ci',id,'x')), p.x != null ? p.x : 0);
        glCtx.uniform1f(ul(u('ci',id,'y')), p.y != null ? p.y : 0);
        glCtx.uniform1f(ul(u('ci',id,'w')), Math.max(1, p.w || 200));
        glCtx.uniform1f(ul(u('ci',id,'h')), Math.max(1, p.h || 200));
        glCtx.uniform1f(ul(u('ci',id,'fm')), (p.fillMode === 'gradient') ? 1.0 : 0.0);
        glCtx.uniform1f(ul(u('ci',id,'bl')), Math.max(0, p.blur || 0));
        glCtx.uniform1f(ul(u('ci',id,'rot')), ((p.rotation||0) * Math.PI / 180));
        glCtx.uniform1f(ul(u('ci',id,'scl')), p.scale != null ? p.scale : 1.0);
        glCtx.uniform3f(ul(u('ci',id,'c')), r, g, b);
        const stops = Array.isArray(p.stops) && p.stops.length >= 2 ? p.stops : [{color:'#FF0055'},{color:'#0088FF'}];
        const n = Math.min(6, stops.length);
        const colsArr = new Float32Array(6*3);
        for (let i = 0; i < 6; i++) {
          const src = i < n ? stops[i] : stops[n-1];
          const [rr, gg, bb] = hexToRgb(src.color || '#ffffff');
          colsArr[i*3] = rr; colsArr[i*3+1] = gg; colsArr[i*3+2] = bb;
        }
        glCtx.uniform3fv(ul(u('ci',id,'cols')), colsArr);
        glCtx.uniform1f(ul(u('ci',id,'cnt')), n);
        break;
      }
      case 'liquid': {
        glCtx.uniform1f(ul(u('lq',id,'seed')),p.seed||12);
        glCtx.uniform1f(ul(u('lq',id,'spd')), p.speed||0.3);
        glCtx.uniform1f(ul(u('lq',id,'sc')),  p.scale||0.42);
        glCtx.uniform1f(ul(u('lq',id,'ta')),  p.turbAmp||0.6);
        glCtx.uniform1f(ul(u('lq',id,'tf')),  p.turbFreq||0.1);
        glCtx.uniform1f(ul(u('lq',id,'ti')),  p.turbIter||7);
        glCtx.uniform1f(ul(u('lq',id,'wf')),  p.waveFreq||3.8);
        glCtx.uniform1f(ul(u('lq',id,'db')),  p.distBias||0.0);
        glCtx.uniform1f(ul(u('lq',id,'ex')),  p.exposure||1.1);
        glCtx.uniform1f(ul(u('lq',id,'co')),  p.contrast||1.1);
        glCtx.uniform1f(ul(u('lq',id,'sa')),  p.saturation||1.0);
        const c0=hexToRgb(p.color0||'#00001A'),c1=hexToRgb(p.color1||'#2962FF'),c2=hexToRgb(p.color2||'#40BCFF'),c3=hexToRgb(p.color3||'#FFB8B5'),c4=hexToRgb(p.color4||'#FFC14F');
        glCtx.uniform3f(ul(u('lq',id,'c0')),...c0);glCtx.uniform3f(ul(u('lq',id,'c1')),...c1);
        glCtx.uniform3f(ul(u('lq',id,'c2')),...c2);glCtx.uniform3f(ul(u('lq',id,'c3')),...c3);
        glCtx.uniform3f(ul(u('lq',id,'c4')),...c4);
        break;
      }
      case 'grain': {
        glCtx.uniform1f(ul(u('gn',id,'am')), p.amount||0.08);
        glCtx.uniform1f(ul(u('gn',id,'sz')), p.size||1.0);
        glCtx.uniform1f(ul(u('gn',id,'an')), p.animated||0);
        glCtx.uniform1f(ul(u('gn',id,'st')), p.streak||0);
        glCtx.uniform1f(ul(u('gn',id,'sa')), p.sangle||90);
        glCtx.uniform1f(ul(u('gn',id,'sl')), p.slen||6);
        break;
      }
      case 'chromatic-aberration': {
        const spread = p.spread != null ? p.spread : 0.006;
        const angle  = p.angle  != null ? p.angle  : 0;
        glCtx.uniform1f(ul(u('ca',id,'sp')), spread);
        glCtx.uniform1f(ul(u('ca',id,'an')), angle * Math.PI / 180);
        break;
      }
      case 'vignette': {
        glCtx.uniform1f(ul(u('vi',id,'s')), p.str||0.6);
        glCtx.uniform1f(ul(u('vi',id,'f')), p.soft||0.4);
        break;
      }
      case 'color-grade': {
        glCtx.uniform1f(ul(u('cg',id,'c')), p.contrast||1.0);
        glCtx.uniform1f(ul(u('cg',id,'s')), p.sat||1.0);
        glCtx.uniform1f(ul(u('cg',id,'b')), p.bright||0.0);
        glCtx.uniform1f(ul(u('cg',id,'h')), p.hue||0);
        break;
      }
      case 'posterize': {
        glCtx.uniform1f(ul(u('po',id,'b')), p.bands||5);
        glCtx.uniform1f(ul(u('po',id,'m')), p.mix||1.0);
        const c1=hexToRgb(p.c1||'#82C67C'),c2=hexToRgb(p.c2||'#336B51'),c3=hexToRgb(p.c3||'#257847'),c4=hexToRgb(p.c4||'#0F4140');
        glCtx.uniform3f(ul(u('po',id,'c1')),...c1);glCtx.uniform3f(ul(u('po',id,'c2')),...c2);
        glCtx.uniform3f(ul(u('po',id,'c3')),...c3);glCtx.uniform3f(ul(u('po',id,'c4')),...c4);
        break;
      }
      case 'scanlines': {
        glCtx.uniform1f(ul(u('sc',id,'n')),  p.count||120);
        glCtx.uniform1f(ul(u('sc',id,'d')),  p.dark||0.4);
        glCtx.uniform1f(ul(u('sc',id,'f')),  p.soft||0.3);
        glCtx.uniform1f(ul(u('sc',id,'sc')), p.scroll||0);
        glCtx.uniform1f(ul(u('sc',id,'ss')), p.scrollspd||0.3);
        break;
      }
      case 'duotone': {
        const sh = hexToRgb(p.shadow || '#000000');
        const li = hexToRgb(p.light  || '#ffffff');
        glCtx.uniform3f(ul(u('dt',id,'sh')), ...sh);
        glCtx.uniform3f(ul(u('dt',id,'li')), ...li);
        glCtx.uniform1f(ul(u('dt',id,'bl')), p.blend != null ? p.blend : 1.0);
        break;
      }
      case 'bloom': {
        glCtx.uniform1f(ul(u('bl',id,'th')), p.threshold != null ? p.threshold : 0.7);
        glCtx.uniform1f(ul(u('bl',id,'st')), p.strength  != null ? p.strength  : 0.5);
        glCtx.uniform1f(ul(u('bl',id,'rd')), p.radius    != null ? p.radius    : 1.0);
        break;
      }
      case 'ripple': {
        glCtx.uniform1f(ul(u('rp',id,'cx')), p.cx    != null ? p.cx    : 0.5);
        glCtx.uniform1f(ul(u('rp',id,'cy')), p.cy    != null ? p.cy    : 0.5);
        glCtx.uniform1f(ul(u('rp',id,'fq')), p.freq  != null ? p.freq  : 10.0);
        glCtx.uniform1f(ul(u('rp',id,'am')), p.amp   != null ? p.amp   : 0.03);
        glCtx.uniform1f(ul(u('rp',id,'sp')), p.spd   != null ? p.spd   : 1.0);
        glCtx.uniform1f(ul(u('rp',id,'dc')), p.decay != null ? p.decay : 2.0);
        break;
      }
    }
  });
}

// ── WebGL setup ────────────────────────────────────────────────
// Status DOM elements are optional — absent when the Live/error indicator has
// been removed from the statusbar.
const errEl  = document.getElementById('status-error');
const dotEl  = document.getElementById('status-dot');
const txtEl  = document.getElementById('status-text');
function setStatus(kind, msg) {
  if (errEl) errEl.textContent = (kind === 'error' || kind === 'link') ? (msg || '') : '';
  if (dotEl) dotEl.className = kind === 'error' || kind === 'link'
    ? 'statusbar-dot statusbar-dot--error'
    : 'statusbar-dot statusbar-dot--live';
  if (txtEl) txtEl.textContent = kind === 'error' ? 'Error' : 'Live';
}
const VERT   = `attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}`;
const vbuf   = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

function mkShader(glCtx, type, src) {
  const s = glCtx.createShader(type);
  glCtx.shaderSource(s, src); glCtx.compileShader(s);
  if (!glCtx.getShaderParameter(s, glCtx.COMPILE_STATUS)) {
    console.error('GLSL:', glCtx.getShaderInfoLog(s), '\n---\n', src);
    return null;
  }
  return s;
}

function compile() {
  const fsrc = buildFragFromLayers(layers, frameState);
  const vs = mkShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = mkShader(gl, gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) {
    setStatus('error', gl.getShaderInfoLog(fs || vs));
    return;
  }
  const p2 = gl.createProgram();
  gl.attachShader(p2, vs); gl.attachShader(p2, fs); gl.linkProgram(p2);
  if (!gl.getProgramParameter(p2, gl.LINK_STATUS)) {
    setStatus('link', 'Link: ' + gl.getProgramInfoLog(p2));
    return;
  }
  setStatus('live');
  if (prog) gl.deleteProgram(prog);
  prog = p2; gl.useProgram(prog);
  const pl = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
}

function setU(t) {
  setUniformsForLayers(gl, prog, layers, frameState, t, noiseTex, baseImageTex, hasBaseImage, imageAspectRatio);
}

// ── Render Loop ────────────────────────────────────────────────
function frame(now) {
  if (typeof layers === 'undefined') { requestAnimationFrame(frame); return; }

  const t = playing ? (now - timeOffset) / 1000 : (pausedAt - timeOffset) / 1000;
  frameCount++;
  if (now - lastFpsTime >= 500) {
    currentFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
    const fpsEl = document.getElementById('status-fps');
    if (fpsEl) fpsEl.textContent = currentFps + ' fps';
    frameCount = 0; lastFpsTime = now;
  }

  const totalSec = Math.max(0, t);
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1);
  const ttEl = document.getElementById('topbar-time');
  if (ttEl) ttEl.textContent = `${min}:${sec.padStart(4,'0')}`;

  if (needsRecompile) { needsRecompile = false; compile(); }
  if (prog) { setU(t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  if (typeof updateShapeOutline === 'function') updateShapeOutline();
  requestAnimationFrame(frame);
}

// ── Mini Renderers (Modal Gallery) ────────────────────────────
// Bespoke per-preset fragment shaders. Each stands alone, 2 uniforms only
// (u_t, u_res), so 8 concurrent WebGL contexts stay cheap and can't OOM.

const MINI_HEAD = `precision mediump float;
uniform float u_t;
uniform vec2 u_res;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){
  vec2 i=floor(p),f=fract(p);
  float a=h21(i),b=h21(i+vec2(1.0,0.0));
  float c=h21(i+vec2(0.0,1.0)),d=h21(i+vec2(1.0,1.0));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res.xy;
  vec2 p=uv*2.0-1.0;
  p.x*=u_res.x/u_res.y;
  float t=u_t;
`;
const MINI_TAIL = `  gl_FragColor=vec4(col,1.0);\n}`;

const MINI_PRESET_SHADERS = {
  // Aurora — flowing green/teal bands with purple highlights
  aurora: MINI_HEAD + `
  float y = uv.y;
  float b1 = sin(uv.x*3.0 + t*0.6 + sin(uv.x*7.0+t*0.3)*0.5)*0.5+0.5;
  float b2 = sin(uv.x*4.0 - t*0.4 + uv.y*2.0)*0.5+0.5;
  float band = smoothstep(0.35,0.55, b1*0.6+b2*0.4 - abs(y-0.55)*1.1);
  vec3 green = vec3(0.15, 0.85, 0.55);
  vec3 teal  = vec3(0.1, 0.5, 0.9);
  vec3 purp  = vec3(0.55, 0.25, 0.9);
  vec3 col = mix(vec3(0.02,0.04,0.08), teal, band*0.7);
  col = mix(col, green, band*(0.6+0.4*sin(t*0.5+uv.x*4.0)));
  col += purp * band * 0.35 * smoothstep(0.6, 0.9, b1);
` + MINI_TAIL,

  // Silk — diagonal gradient with sine-warped bands, warm purple/pink
  silk: MINI_HEAD + `
  float w = sin(uv.x*5.0 + uv.y*3.0 + t*0.4)*0.12;
  float g = uv.x*0.7 + uv.y*0.3 + w;
  vec3 a = vec3(0.25, 0.05, 0.35);
  vec3 b = vec3(0.95, 0.55, 0.75);
  vec3 c = vec3(0.15, 0.05, 0.2);
  vec3 col = mix(a, b, g);
  col = mix(col, c, smoothstep(0.7, 1.0, abs(sin(g*6.0+t*0.3))));
  col += 0.08*sin(uv.y*30.0 + t);
` + MINI_TAIL,

  // Plasma — classic 4-term sine sum, RGB phase-shifted cosine palette
  plasma: MINI_HEAD + `
  float v = sin(p.x*3.0 + t);
  v += sin((p.y*2.5 + t)*1.3);
  v += sin((p.x + p.y + t*0.7)*2.0);
  v += sin(length(p)*4.0 - t*0.8);
  v *= 0.25;
  vec3 col = 0.5 + 0.5*cos(6.2831*(v + vec3(0.0, 0.33, 0.66)) + t*0.3);
` + MINI_TAIL,

  // Ember — radial gradient orange→red→black with noise offset
  ember: MINI_HEAD + `
  float r = length(p*vec2(1.0,1.2)) + n2(p*3.0+t*0.4)*0.25;
  float heat = 1.0 - smoothstep(0.2, 1.1, r);
  vec3 col = vec3(0.02, 0.0, 0.0);
  col = mix(col, vec3(0.6, 0.08, 0.02), smoothstep(0.0, 0.5, heat));
  col = mix(col, vec3(1.0, 0.45, 0.1), smoothstep(0.4, 0.85, heat));
  col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.85, 1.0, heat));
  col += n2(p*8.0 + t*1.2)*0.06*heat;
` + MINI_TAIL,

  // Holo — rainbow diagonal shimmer
  holo: MINI_HEAD + `
  float s = fract(uv.x*0.8 + uv.y*0.3 + t*0.15);
  vec3 col = 0.5 + 0.5*cos(6.2831*(s + vec3(0.0, 0.33, 0.66)));
  float shimmer = sin((uv.x+uv.y)*25.0 + t*3.0)*0.5+0.5;
  col += shimmer*0.08;
  col *= 0.75 + 0.25*sin(uv.y*10.0 + t);
` + MINI_TAIL,

  // Cosmos — twinkling stars with horizontal nebula band
  cosmos: MINI_HEAD + `
  vec3 col = vec3(0.02, 0.02, 0.06);
  float neb = smoothstep(0.55, 0.0, abs(uv.y-0.5)) * (0.5+0.5*sin(uv.x*4.0+t*0.3));
  col += mix(vec3(0.15,0.05,0.35), vec3(0.05,0.1,0.4), uv.x) * neb * 0.55;
  vec2 g = floor(uv*vec2(40.0, 30.0));
  float star = h21(g);
  float on = step(0.97, star);
  float tw = 0.5 + 0.5*sin(t*3.0 + star*30.0);
  vec2 cell = fract(uv*vec2(40.0, 30.0)) - 0.5;
  float pt = smoothstep(0.35, 0.0, length(cell));
  col += vec3(1.0)*on*tw*pt*0.9;
` + MINI_TAIL,

  // Glitch — horizontal bands + occasional RGB channel offset
  glitch: MINI_HEAD + `
  float tf = floor(t*6.0);
  float band = floor(uv.y*18.0 + tf);
  float bh = h21(vec2(band, tf));
  float off = (h21(vec2(band*3.1, tf+1.0)) - 0.5) * step(0.7, bh) * 0.25;
  vec2 suv = vec2(uv.x + off, uv.y);
  float cyc = step(0.98, fract(sin(tf)*43758.5453));
  float r = h21(floor(suv*vec2(30.0, 18.0)) + tf*0.3);
  float g = h21(floor((suv+vec2(0.01*cyc,0.0))*vec2(30.0, 18.0)) + tf*0.3);
  float b = h21(floor((suv-vec2(0.01*cyc,0.0))*vec2(30.0, 18.0)) + tf*0.3);
  vec3 col = vec3(r,g,b);
  col = mix(vec3(dot(col, vec3(0.33))), col, 0.8);
  col *= 0.4 + 0.6*step(0.2, fract(uv.y*40.0+tf*0.1));
` + MINI_TAIL,
};

function createMiniRenderer(cvs, presetName) {
  const fsrc = MINI_PRESET_SHADERS[presetName];
  if (!fsrc) return null;

  const mgl = cvs.getContext('webgl', { antialias: true, preserveDrawingBuffer: false });
  if (!mgl) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cvs.clientWidth || 148, H = cvs.clientHeight || 110;
  cvs.width = Math.round(W * dpr);
  cvs.height = Math.round(H * dpr);

  const vs = mkShader(mgl, mgl.VERTEX_SHADER, VERT);
  const fs = mkShader(mgl, mgl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const mp = mgl.createProgram();
  mgl.attachShader(mp, vs); mgl.attachShader(mp, fs); mgl.linkProgram(mp);
  if (!mgl.getProgramParameter(mp, mgl.LINK_STATUS)) { mgl.deleteProgram(mp); return null; }
  mgl.useProgram(mp);

  const mvb = mgl.createBuffer();
  mgl.bindBuffer(mgl.ARRAY_BUFFER, mvb);
  mgl.bufferData(mgl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), mgl.STATIC_DRAW);
  const mpl = mgl.getAttribLocation(mp, 'p');
  mgl.enableVertexAttribArray(mpl);
  mgl.vertexAttribPointer(mpl, 2, mgl.FLOAT, false, 0, 0);
  mgl.viewport(0, 0, cvs.width, cvs.height);

  const uT = mgl.getUniformLocation(mp, 'u_t');
  const uR = mgl.getUniformLocation(mp, 'u_res');

  let running = true, lastF = 0, rafId = 0;
  const t0 = performance.now();

  function mframe(now) {
    if (!running) return;
    if (now - lastF >= 1000/24) {
      lastF = now;
      mgl.uniform1f(uT, (now - t0) / 1000);
      mgl.uniform2f(uR, cvs.width, cvs.height);
      mgl.drawArrays(mgl.TRIANGLE_STRIP, 0, 4);
    }
    rafId = requestAnimationFrame(mframe);
  }
  rafId = requestAnimationFrame(mframe);

  const entry = {
    stop: () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      try { mgl.deleteProgram(mp); } catch(e) {}
      try { mgl.deleteBuffer(mvb); } catch(e) {}
      try { mgl.deleteShader(vs); mgl.deleteShader(fs); } catch(e) {}
      const ext = mgl.getExtension('WEBGL_lose_context');
      if (ext) { try { ext.loseContext(); } catch(e) {} }
    }
  };
  miniRenderers.push(entry);
  return entry;
}

function stopAllMiniRenderers() {
  miniRenderers.forEach(r => r.stop());
  miniRenderers = [];
}

// ── Layer Insert Thumbnails (popover) ─────────────────────────
// Tiny 48×36 shaders, one per layer type. Lazily instantiated when the
// popover opens, destroyed on close. 20fps cap, 2 uniforms each.

const THUMB_HEAD = `precision mediump float;
uniform float u_t;
uniform vec2 u_res;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){
  vec2 i=floor(p),f=fract(p);
  float a=h21(i),b=h21(i+vec2(1.0,0.0));
  float c=h21(i+vec2(0.0,1.0)),d=h21(i+vec2(1.0,1.0));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res.xy;
  vec2 p=uv*2.0-1.0;
  p.x*=u_res.x/u_res.y;
  float t=u_t;
`;
const THUMB_TAIL = `  gl_FragColor=vec4(col,1.0);\n}`;

const THUMB_SHADERS = {
  // ── CONTENT ─────────────────────────────────────────────────
  solid: THUMB_HEAD + `
  vec3 col = vec3(0.55, 0.3, 0.85) * (0.85 + 0.15*sin(t*1.2));
` + THUMB_TAIL,

  gradient: THUMB_HEAD + `
  float a = t*0.4;
  float g = uv.x*cos(a) + uv.y*sin(a);
  vec3 col = mix(vec3(0.95,0.4,0.6), vec3(0.2,0.5,0.95), g);
` + THUMB_TAIL,

  'mesh-gradient': THUMB_HEAD + `
  vec2 c1 = vec2(0.3+0.15*sin(t*0.7), 0.3+0.1*cos(t*0.6));
  vec2 c2 = vec2(0.7+0.15*cos(t*0.8), 0.7+0.1*sin(t*0.5));
  float d1 = 1.0 - smoothstep(0.0, 0.6, length(uv-c1));
  float d2 = 1.0 - smoothstep(0.0, 0.6, length(uv-c2));
  vec3 col = vec3(0.1, 0.05, 0.3);
  col = mix(col, vec3(0.95, 0.4, 0.5), d1);
  col = mix(col, vec3(0.3, 0.7, 0.95), d2*0.75);
` + THUMB_TAIL,

  image: THUMB_HEAD + `
  // Mountain silhouette + sun, mimicking a picture
  vec3 sky = mix(vec3(0.95,0.75,0.45), vec3(0.3,0.35,0.65), uv.y);
  float sun = smoothstep(0.15, 0.12, length(uv - vec2(0.7+0.05*sin(t*0.5), 0.62)));
  float m1 = step(0.3 + 0.25*sin(uv.x*7.0+1.0), uv.y) * 0.0 + step(uv.y, 0.35 + 0.1*sin(uv.x*8.0));
  vec3 col = mix(vec3(0.1,0.08,0.15), sky, step(0.35+0.1*sin(uv.x*8.0), uv.y));
  col = mix(col, vec3(1.0,0.85,0.5), sun);
` + THUMB_TAIL,

  wave: THUMB_HEAD + `
  vec3 bg = vec3(0.08, 0.1, 0.16);
  float y = 0.5 + 0.18*sin(uv.x*8.0 + t*2.0);
  float line = smoothstep(0.04, 0.0, abs(uv.y - y));
  vec3 col = mix(bg, vec3(0.4, 0.85, 0.95), line);
` + THUMB_TAIL,

  rectangle: THUMB_HEAD + `
  vec3 bg = vec3(0.1);
  vec2 d = abs(uv - 0.5);
  float rect = step(max(d.x/0.28, d.y/0.22), 1.0);
  vec3 fill = vec3(0.85, 0.55, 0.3);
  vec3 col = mix(bg, fill * (0.9 + 0.1*sin(t)), rect);
` + THUMB_TAIL,

  circle: THUMB_HEAD + `
  vec3 bg = vec3(0.1);
  float d = length((uv-0.5)*vec2(u_res.x/u_res.y, 1.0));
  float c = smoothstep(0.22, 0.20, d);
  vec3 col = mix(bg, vec3(0.4, 0.85, 0.65) * (0.9+0.1*sin(t*1.5)), c);
` + THUMB_TAIL,

  // ── EFFECTS ─────────────────────────────────────────────────
  'noise-warp': THUMB_HEAD + `
  vec2 w = vec2(n2(uv*4.0+t*0.5), n2(uv*4.0-t*0.4)) - 0.5;
  vec2 suv = uv + w*0.25;
  vec3 col = mix(vec3(0.2,0.5,0.8), vec3(0.95,0.6,0.85), suv.x);
  col *= 0.7 + 0.3*sin(suv.y*10.0 + t);
` + THUMB_TAIL,

  liquid: THUMB_HEAD + `
  float s = sin(uv.y*10.0 + t*2.0)*0.1;
  float g = uv.x + s;
  vec3 col = mix(vec3(0.1,0.2,0.5), vec3(0.8,0.9,1.0), g);
  col += 0.1*sin(uv.y*20.0 + t*3.0);
` + THUMB_TAIL,

  ripple: THUMB_HEAD + `
  vec2 c = (uv-0.5)*vec2(u_res.x/u_res.y, 1.0);
  float d = length(c);
  float r = sin(d*30.0 - t*4.0)*0.5+0.5;
  r *= smoothstep(0.5, 0.0, d);
  vec3 col = mix(vec3(0.05,0.1,0.2), vec3(0.4,0.7,0.95), r);
` + THUMB_TAIL,

  grain: THUMB_HEAD + `
  vec3 base = mix(vec3(0.3,0.3,0.35), vec3(0.55,0.55,0.6), uv.y);
  float g = h21(floor(uv*vec2(u_res.x, u_res.y)) + floor(t*30.0));
  vec3 col = base + (g-0.5)*0.35;
` + THUMB_TAIL,

  'chromatic-aberration': THUMB_HEAD + `
  float off = 0.03 + 0.02*sin(t*1.5);
  float r = smoothstep(0.5, 0.0, length(uv - vec2(0.5+off, 0.5)));
  float g = smoothstep(0.5, 0.0, length(uv - 0.5));
  float b = smoothstep(0.5, 0.0, length(uv - vec2(0.5-off, 0.5)));
  vec3 col = vec3(r, g, b);
` + THUMB_TAIL,

  vignette: THUMB_HEAD + `
  vec3 base = mix(vec3(0.85,0.75,0.6), vec3(0.5,0.3,0.4), uv.y);
  float v = 1.0 - smoothstep(0.35, 0.8, length((uv-0.5)*vec2(u_res.x/u_res.y, 1.0)));
  vec3 col = base * (0.1 + 0.9*v);
` + THUMB_TAIL,

  'color-grade': THUMB_HEAD + `
  float g = uv.x;
  vec3 col = vec3(g);
  col = mix(col, col * vec3(1.2, 0.95, 0.7) + vec3(0.05, 0.02, -0.02), 0.7 + 0.3*sin(t));
` + THUMB_TAIL,

  duotone: THUMB_HEAD + `
  float lum = n2(uv*3.0 + t*0.3);
  vec3 a = vec3(0.1, 0.05, 0.35);
  vec3 b = vec3(1.0, 0.55, 0.7);
  vec3 col = mix(a, b, lum);
` + THUMB_TAIL,

  bloom: THUMB_HEAD + `
  vec2 c = (uv-0.5)*vec2(u_res.x/u_res.y, 1.0);
  float d = length(c);
  float core = smoothstep(0.15, 0.0, d);
  float glow = smoothstep(0.6, 0.0, d) * 0.6;
  vec3 col = vec3(0.05, 0.05, 0.1);
  col += vec3(0.95, 0.85, 0.5) * (core + glow*(0.7+0.3*sin(t*2.0)));
` + THUMB_TAIL,

  posterize: THUMB_HEAD + `
  float g = uv.x + 0.1*sin(t);
  g = floor(g*5.0)/5.0;
  vec3 col = mix(vec3(0.2,0.1,0.4), vec3(1.0,0.75,0.35), g);
` + THUMB_TAIL,

  pixelate: THUMB_HEAD + `
  vec2 puv = floor(uv*vec2(8.0, 6.0))/vec2(8.0, 6.0);
  vec3 col = 0.5 + 0.5*cos(6.2831*(puv.x+puv.y+t*0.3) + vec3(0.0, 2.0, 4.0));
` + THUMB_TAIL,

  scanlines: THUMB_HEAD + `
  vec3 base = mix(vec3(0.2,0.4,0.7), vec3(0.8,0.4,0.5), uv.x);
  float sc = 0.5 + 0.5*sin(uv.y*u_res.y*1.2 + t*3.0);
  vec3 col = base * (0.55 + 0.45*sc);
` + THUMB_TAIL,
};

// Single shared WebGL context for ALL thumbnails. Each item is a 2D canvas
// that receives a drawImage copy of the shared render target. This avoids
// exceeding Chrome's ~16 WebGL context limit when the popover has 19 items.

let _thumbGl = null;
let _thumbGlCanvas = null;
let _thumbQuadBuf = null;
const _thumbProgs = new Map();   // type -> { prog, uT, uR, pl } or null
let _thumbActiveItems = [];       // [{ ctx2d, type, w, h }]
let _thumbRafId = 0;
let _thumbT0 = 0;
let _thumbLastF = 0;
let thumbRenderers = [];          // retained for external status checks; mirrors item count

function _ensureThumbGl() {
  if (_thumbGl) return _thumbGl;
  _thumbGlCanvas = document.createElement('canvas');
  _thumbGlCanvas.width = 96;   // 48 * 2 for dpr
  _thumbGlCanvas.height = 72;  // 36 * 2 for dpr
  const gl = _thumbGlCanvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  _thumbGl = gl;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  _thumbQuadBuf = buf;
  return gl;
}

function _compileThumbProgram(type) {
  if (_thumbProgs.has(type)) return _thumbProgs.get(type);
  const gl = _thumbGl;
  const fsrc = THUMB_SHADERS[type];
  if (!fsrc) { _thumbProgs.set(type, null); return null; }
  const vs = mkShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = mkShader(gl, gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) { _thumbProgs.set(type, null); return null; }
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { _thumbProgs.set(type, null); return null; }
  const info = {
    prog: p,
    uT: gl.getUniformLocation(p, 'u_t'),
    uR: gl.getUniformLocation(p, 'u_res'),
    pl: gl.getAttribLocation(p, 'p'),
  };
  _thumbProgs.set(type, info);
  return info;
}

function _thumbFrame(now) {
  if (!_thumbActiveItems.length) { _thumbRafId = 0; return; }
  if (now - _thumbLastF >= 1000/20) {
    _thumbLastF = now;
    const gl = _thumbGl;
    const t = (now - _thumbT0) / 1000;
    gl.bindBuffer(gl.ARRAY_BUFFER, _thumbQuadBuf);
    gl.viewport(0, 0, _thumbGlCanvas.width, _thumbGlCanvas.height);
    for (const item of _thumbActiveItems) {
      const info = _compileThumbProgram(item.type);
      if (!info) continue;
      gl.useProgram(info.prog);
      gl.enableVertexAttribArray(info.pl);
      gl.vertexAttribPointer(info.pl, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(info.uT, t);
      gl.uniform2f(info.uR, _thumbGlCanvas.width, _thumbGlCanvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      try {
        item.ctx2d.clearRect(0, 0, item.w, item.h);
        item.ctx2d.drawImage(_thumbGlCanvas, 0, 0, item.w, item.h);
      } catch(e) {}
    }
  }
  _thumbRafId = requestAnimationFrame(_thumbFrame);
}

function startPopoverThumbs(popoverEl) {
  stopAllThumbRenderers();
  const gl = _ensureThumbGl();
  if (!gl) return;
  _thumbT0 = performance.now();
  _thumbLastF = 0;
  _thumbActiveItems = [];
  popoverEl.querySelectorAll('canvas.pop-thumb').forEach(cvs => {
    const type = cvs.dataset.thumb;
    if (!type || !THUMB_SHADERS[type]) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = 48 * dpr;
    cvs.height = 36 * dpr;
    cvs.style.width = '48px';
    cvs.style.height = '36px';
    const ctx2d = cvs.getContext('2d');
    if (!ctx2d) return;
    _thumbActiveItems.push({ ctx2d, type, w: cvs.width, h: cvs.height });
  });
  thumbRenderers = _thumbActiveItems.slice();
  if (_thumbActiveItems.length && !_thumbRafId) {
    _thumbRafId = requestAnimationFrame(_thumbFrame);
  }
}

function stopAllThumbRenderers() {
  if (_thumbRafId) { cancelAnimationFrame(_thumbRafId); _thumbRafId = 0; }
  _thumbActiveItems = [];
  thumbRenderers = [];
}

// ── PNG Capture (@2x, instant) ─────────────────────────────────
function captureCanvasPNG() {
  const W = frameState.w * 2, H = frameState.h * 2;
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ogl = off.getContext('webgl', { preserveDrawingBuffer: true });
  if (!ogl) { showToast('Capture failed: WebGL unavailable', true); return; }

  const oNoise = initNoiseTex(ogl);
  const fsrc = buildFragFromLayers(layers, frameState);
  const vs = mkShader(ogl, ogl.VERTEX_SHADER, VERT);
  const fs = mkShader(ogl, ogl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) { showToast('Capture failed: shader compile', true); return; }
  const op = ogl.createProgram();
  ogl.attachShader(op, vs); ogl.attachShader(op, fs); ogl.linkProgram(op);
  if (!ogl.getProgramParameter(op, ogl.LINK_STATUS)) { showToast('Capture failed: link', true); return; }
  ogl.useProgram(op);
  const ovb = ogl.createBuffer();
  ogl.bindBuffer(ogl.ARRAY_BUFFER, ovb);
  ogl.bufferData(ogl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), ogl.STATIC_DRAW);
  const opl = ogl.getAttribLocation(op, 'p');
  ogl.enableVertexAttribArray(opl); ogl.vertexAttribPointer(opl, 2, ogl.FLOAT, false, 0, 0);
  ogl.viewport(0, 0, W, H);

  let oImgTex = null;
  if (hasBaseImage && baseImageTex) {
    try {
      const img2d = document.createElement('canvas');
      img2d.width = 1; img2d.height = 1;
      // We can't copy a texture across contexts; re-upload from the source if available.
    } catch (_) {}
    // baseImageTex lives on main gl; re-upload via the stored HTMLImageElement if present
    if (typeof baseImageElement !== 'undefined' && baseImageElement) {
      oImgTex = ogl.createTexture();
      ogl.activeTexture(ogl.TEXTURE0);
      ogl.bindTexture(ogl.TEXTURE_2D, oImgTex);
      ogl.texImage2D(ogl.TEXTURE_2D, 0, ogl.RGBA, ogl.RGBA, ogl.UNSIGNED_BYTE, baseImageElement);
      ogl.texParameteri(ogl.TEXTURE_2D, ogl.TEXTURE_MIN_FILTER, ogl.LINEAR);
      ogl.texParameteri(ogl.TEXTURE_2D, ogl.TEXTURE_MAG_FILTER, ogl.LINEAR);
      ogl.texParameteri(ogl.TEXTURE_2D, ogl.TEXTURE_WRAP_S, ogl.CLAMP_TO_EDGE);
      ogl.texParameteri(ogl.TEXTURE_2D, ogl.TEXTURE_WRAP_T, ogl.CLAMP_TO_EDGE);
    }
  }

  const now = performance.now();
  const t = playing ? (now - timeOffset) / 1000 : (pausedAt - timeOffset) / 1000;
  const fs2 = { ...frameState, w: W, h: H };
  setUniformsForLayers(ogl, op, layers, fs2, t, oNoise, oImgTex, hasBaseImage && !!oImgTex, imageAspectRatio);
  ogl.drawArrays(ogl.TRIANGLE_STRIP, 0, 4);

  const raw = (typeof fileName !== 'undefined' && fileName.trim()) ? fileName.trim() : 'untitled';
  const slug = raw.replace(/\s+/g, '_');
  const outName = `frakt-image-capture-${slug}.png`;
  off.toBlob((blob) => {
    if (!blob) { showToast('Capture failed', true); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = outName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Captured ${outName}`);
  }, 'image/png');
}

// ── Export ────────────────────────────────────────────────────
async function copyCode() {
  const defaultName = (typeof fileName !== 'undefined' && fileName.trim()) ? fileName.trim() : 'shader';
  const chosen = await showNameDialog({
    title: 'Export GLSL',
    defaultName,
    ext: '.glsl',
    okLabel: 'Export'
  });
  if (!chosen) return;
  const src  = buildFragFromLayers(layers, frameState);
  const blob = new Blob([src], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = chosen + '.glsl'; a.click();
  URL.revokeObjectURL(url);
  const b = document.getElementById('btn-export');
  if (b) {
    const span = b.querySelector('span:first-child');
    if (span) {
      const orig = span.textContent; span.textContent = 'Saved!';
      setTimeout(() => { span.textContent = orig; }, 1500);
    }
  }
}
