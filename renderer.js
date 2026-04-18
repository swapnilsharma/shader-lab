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
`;

// ── Hex helper ────────────────────────────────────────────────
function hexToRgb(h) {
  h = (h || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}

// ── Layer type classifiers ─────────────────────────────────────
const CONTENT_TYPES = new Set(['solid','gradient','mesh-gradient','image']);
const UV_PREP_TYPES = new Set(['noise-warp','pixelate']);

function isContent(t) { return CONTENT_TYPES.has(t); }
function isUVPrep(t)  { return UV_PREP_TYPES.has(t); }

// ── Uniform name helpers ───────────────────────────────────────
function u(prefix, id, k) { return `u_${prefix}_${id}_${k}`; }

// ── GLSL: gradient content function (waveGradient algorithm) ───
function glslGradientFn(id) {
  const p = k => u('gr',id,k);
  return `vec3 contentFn_${id}(vec2 puv){
  float wg_seed=${p('seed')};float wg_speed=${p('spd')};
  float wg_freqX=${p('fqx')};float wg_freqY=${p('fqy')};
  float wg_angle=${p('ang')};float wg_amplitude=${p('amp')};
  float wg_softness=${p('sft')};float wg_blend=${p('bld')};
  vec3 wg_c0=${p('c0')},wg_c1=${p('c1')},wg_c2=${p('c2')},wg_c3=${p('c3')};
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
  vec3 wg_l1=mix(wg_c0,wg_c2,smoothstep(-0.3,0.3,(mat2(wg_rc1,-wg_rs1,wg_rs1,wg_rc1)*wg_bUV).x));
  vec3 wg_l2=mix(wg_c3,wg_c1,smoothstep(-0.3,0.3,(mat2(wg_rc2,-wg_rs2,wg_rs2,wg_rc2)*wg_bUV).x));
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

function glslMeshGradientFn(id) {
  return `vec3 contentFn_${id}(vec2 puv){\n${glslLiquidBody('mg',id)}\n  return lq_result;\n}\n`;
}

function glslSolidFn(id) {
  return `vec3 contentFn_${id}(vec2 puv){ return ${u('sl',id,'c')}; }\n`;
}

function glslImageFn(id) {
  return `vec3 contentFn_${id}(vec2 puv){
  if(uHasImage>0.5){
    float ar=u_res.x/u_res.y;float iar=uImgAr;
    vec2 iuv=puv-0.5;
    if(ar>iar){iuv.y*=ar/iar;}else{iuv.x*=iar/ar;}
    iuv+=0.5;
    if(iuv.x>=0.0&&iuv.x<=1.0&&iuv.y>=0.0&&iuv.y<=1.0)
      return texture2D(uImage,iuv).rgb;
  }
  return vec3(0.0);
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
        s += `uniform float ${u('gr',id,'seed')},${u('gr',id,'spd')},${u('gr',id,'fqx')},${u('gr',id,'fqy')},${u('gr',id,'ang')},${u('gr',id,'amp')},${u('gr',id,'sft')},${u('gr',id,'bld')};\n`;
        s += `uniform vec3 ${u('gr',id,'c0')},${u('gr',id,'c1')},${u('gr',id,'c2')},${u('gr',id,'c3')};\n`; break;
      case 'mesh-gradient':
        s += `uniform float ${u('mg',id,'seed')},${u('mg',id,'spd')},${u('mg',id,'sc')},${u('mg',id,'ta')},${u('mg',id,'tf')},${u('mg',id,'ti')},${u('mg',id,'wf')},${u('mg',id,'db')},${u('mg',id,'ex')},${u('mg',id,'co')},${u('mg',id,'sa')};\n`;
        s += `uniform vec3 ${u('mg',id,'c0')},${u('mg',id,'c1')},${u('mg',id,'c2')},${u('mg',id,'c3')},${u('mg',id,'c4')};\n`; break;
      case 'image':
        break; // uses shared uImage, uHasImage, uImgAr
      case 'noise-warp':
        s += `uniform float ${u('nw',id,'str')},${u('nw',id,'sc')},${u('nw',id,'sp')},${u('nw',id,'oc')};\n`; break;
      case 'pixelate':
        s += `uniform float ${u('px',id,'s')};\n`; break;
      case 'wave':
        s += `uniform float ${u('wv',id,'f')},${u('wv',id,'a')},${u('wv',id,'s')},${u('wv',id,'p')},${u('wv',id,'e')},${u('wv',id,'ang')};\n`;
        s += `uniform vec3 ${u('wv',id,'c')};\n`; break;
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
    }
    if (l.type !== 'frame') s += `uniform float u_op_${id};\n`;
  });
  return s;
}

// ── GLSL: effect inline body ───────────────────────────────────
function glslEffectInline(l) {
  const id = l.id;
  switch(l.type) {
    case 'wave': {
      const f=u('wv',id,'f'),a=u('wv',id,'a'),s=u('wv',id,'s'),p=u('wv',id,'p'),e=u('wv',id,'e'),ang=u('wv',id,'ang'),c=u('wv',id,'c');
      return `  {\n    vec2 ruv=rot2(wuv-0.5,${ang})+0.5;\n    float wave=sin(ruv.x*${f}*6.2832+u_t*${s})*${a};\n    float wm=smoothstep(${e},0.0,abs(ruv.y-(${p}+wave))-${e}*0.3);\n    col=clamp(col+${c}*wm*u_op_${id},0.0,1.0);\n  }\n`;
    }
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
    default: return '';
  }
}

// ── Build Fragment Shader ──────────────────────────────────────
function buildFragFromLayers(layers, frameState) {
  const vis = (layers || []).filter(l => l.visible !== false && l.type !== 'frame');

  const contentLayers  = vis.filter(l => isContent(l.type));
  const nwLayers       = vis.filter(l => l.type === 'noise-warp');
  const pixelLayers    = vis.filter(l => l.type === 'pixelate');
  const caLayer        = vis.find(l => l.type === 'chromatic-aberration');
  const effectLayers   = vis.filter(l => !isContent(l.type) && !isUVPrep(l.type) && l.type !== 'chromatic-aberration');

  const [bgR, bgG, bgB] = hexToRgb(frameState.bg);
  const hasImage = contentLayers.some(l => l.type === 'image');

  let s = 'precision mediump float;\n';
  s += 'uniform vec2 u_res;\nuniform float u_t;\n';
  if (hasImage) s += 'uniform sampler2D uImage;\nuniform float uHasImage;\nuniform float uImgAr;\n';

  s += glslUniformDecls(vis);
  s += GLSL_HELPERS;

  // Content layer GLSL functions
  contentLayers.forEach(l => {
    if      (l.type === 'solid')         s += glslSolidFn(l.id);
    else if (l.type === 'gradient')      s += glslGradientFn(l.id);
    else if (l.type === 'mesh-gradient') s += glslMeshGradientFn(l.id);
    else if (l.type === 'image')         s += glslImageFn(l.id);
  });

  s += 'void main(){\n';
  s += '  vec2 uv=gl_FragCoord.xy/u_res;\n  float t=u_t;\n  vec2 rawuv=uv;\n';

  // Pixelate UV
  pixelLayers.forEach(l => {
    s += `  uv=floor(uv*(u_res/${u('px',l.id,'s')}))/(u_res/${u('px',l.id,'s')});\n`;
  });

  // Noise-warp UV
  if (nwLayers.length) {
    s += '  vec2 wuv=uv;\n';
    nwLayers.forEach(l => {
      const id=l.id, str=u('nw',id,'str'), sc=u('nw',id,'sc'), sp=u('nw',id,'sp'), oc=u('nw',id,'oc');
      s += `  wuv+=${str}*vec2(fbm(uv*${sc}+vec2(0.0,t*${sp}),${oc})-0.5,fbm(uv*${sc}+vec2(5.2,1.3+t*${sp}),${oc})-0.5);\n`;
    });
  } else {
    s += '  vec2 wuv=uv;\n';
  }

  // CA UV offsets
  if (caLayer) {
    const id=caLayer.id, sp=u('ca',id,'sp'), an=u('ca',id,'an');
    s += `  vec2 ca_d=vec2(cos(${an}),sin(${an}));\n`;
    s += `  vec2 wuvR=wuv+ca_d*${sp},wuvB=wuv-ca_d*${sp};\n`;
  }

  // Background
  s += `  vec3 col=vec3(${bgR.toFixed(4)},${bgG.toFixed(4)},${bgB.toFixed(4)});\n`;

  // Content layers (reversed: last in array = bottom = renders first)
  [...contentLayers].reverse().forEach(l => {
    const op = `u_op_${l.id}`;
    if (caLayer) {
      s += `  {\n    vec3 lR=contentFn_${l.id}(wuvR),lG=contentFn_${l.id}(wuv),lB=contentFn_${l.id}(wuvB);\n`;
      s += `    col=mix(col,vec3(lR.r,lG.g,lB.b),${op});\n  }\n`;
    } else {
      s += `  {\n    vec3 lc=contentFn_${l.id}(wuv);col=mix(col,lc,${op});\n  }\n`;
    }
  });

  // Effect layers (reversed: bottom of stack applies first)
  [...effectLayers].reverse().forEach(l => { s += glslEffectInline(l); });

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
  vis.forEach(l => {
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
      case 'gradient': {
        glCtx.uniform1f(ul(u('gr',id,'seed')),p.seed||42);
        glCtx.uniform1f(ul(u('gr',id,'spd')), p.speed||1.0);
        glCtx.uniform1f(ul(u('gr',id,'fqx')), p.freqX||0.9);
        glCtx.uniform1f(ul(u('gr',id,'fqy')), p.freqY||6.0);
        glCtx.uniform1f(ul(u('gr',id,'ang')), p.angle||105);
        glCtx.uniform1f(ul(u('gr',id,'amp')), p.amplitude||2.1);
        glCtx.uniform1f(ul(u('gr',id,'sft')), p.softness||0.74);
        glCtx.uniform1f(ul(u('gr',id,'bld')), p.blend||0.54);
        const c0=hexToRgb(p.color0||'#FF0055'),c1=hexToRgb(p.color1||'#0088FF'),c2=hexToRgb(p.color2||'#FFCC00'),c3=hexToRgb(p.color3||'#AA44FF');
        glCtx.uniform3f(ul(u('gr',id,'c0')),...c0);glCtx.uniform3f(ul(u('gr',id,'c1')),...c1);
        glCtx.uniform3f(ul(u('gr',id,'c2')),...c2);glCtx.uniform3f(ul(u('gr',id,'c3')),...c3);
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
        const c0=hexToRgb(p.color0||'#00001A'),c1=hexToRgb(p.color1||'#2962FF'),c2=hexToRgb(p.color2||'#40BCFF'),c3=hexToRgb(p.color3||'#FFB8B5'),c4=hexToRgb(p.color4||'#FFC14F');
        glCtx.uniform3f(ul(u('mg',id,'c0')),...c0);glCtx.uniform3f(ul(u('mg',id,'c1')),...c1);
        glCtx.uniform3f(ul(u('mg',id,'c2')),...c2);glCtx.uniform3f(ul(u('mg',id,'c3')),...c3);
        glCtx.uniform3f(ul(u('mg',id,'c4')),...c4);
        break;
      }
      case 'noise-warp': {
        glCtx.uniform1f(ul(u('nw',id,'str')), p.str||0.5);
        glCtx.uniform1f(ul(u('nw',id,'sc')),  p.scale||2.0);
        glCtx.uniform1f(ul(u('nw',id,'sp')),  p.wspd||0.12);
        glCtx.uniform1f(ul(u('nw',id,'oc')),  p.oct||4);
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
        glCtx.uniform1f(ul(u('ca',id,'sp')), p.spread||0.006);
        glCtx.uniform1f(ul(u('ca',id,'an')), (p.angle||0)*Math.PI/180);
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
    }
  });
}

// ── WebGL setup ────────────────────────────────────────────────
const errEl  = document.getElementById('status-error');
const dotEl  = document.getElementById('status-dot');
const txtEl  = document.getElementById('status-text');
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
    errEl.textContent = gl.getShaderInfoLog(fs || vs);
    dotEl.className = 'statusbar-dot statusbar-dot--error';
    txtEl.textContent = 'Error'; return;
  }
  const p2 = gl.createProgram();
  gl.attachShader(p2, vs); gl.attachShader(p2, fs); gl.linkProgram(p2);
  if (!gl.getProgramParameter(p2, gl.LINK_STATUS)) {
    errEl.textContent = 'Link: ' + gl.getProgramInfoLog(p2);
    dotEl.className = 'statusbar-dot statusbar-dot--error'; return;
  }
  errEl.textContent = '';
  dotEl.className = 'statusbar-dot statusbar-dot--live';
  txtEl.textContent = 'Live';
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
  requestAnimationFrame(frame);
}

// ── Mini Renderers (Modal Gallery) ────────────────────────────
function createMiniRenderer(cvs, presetName) {
  const preset = PRESETS[presetName]; if (!preset) return null;
  const mgl = cvs.getContext('webgl'); if (!mgl) return null;

  // Assign temporary IDs
  let mid = 200;
  const mlayers = preset.layers.map(l => ({
    ...l, id: ++mid,
    visible: true,
    opacity: l.opacity !== undefined ? l.opacity : 1.0,
    blendMode: l.blendMode || 'normal',
    properties: { ...(l.properties || {}) }
  }));
  const mfs = { bg: preset.bg, w: 160, h: 120 };

  const mNoise = initNoiseTex(mgl);
  const fsrc = buildFragFromLayers(mlayers, mfs);
  const vs = mkShader(mgl, mgl.VERTEX_SHADER, VERT);
  const fs = mkShader(mgl, mgl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const mp = mgl.createProgram();
  mgl.attachShader(mp, vs); mgl.attachShader(mp, fs); mgl.linkProgram(mp);
  if (!mgl.getProgramParameter(mp, mgl.LINK_STATUS)) return null;
  mgl.useProgram(mp);
  const mvb = mgl.createBuffer();
  mgl.bindBuffer(mgl.ARRAY_BUFFER, mvb);
  mgl.bufferData(mgl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), mgl.STATIC_DRAW);
  const mpl = mgl.getAttribLocation(mp, 'p');
  mgl.enableVertexAttribArray(mpl); mgl.vertexAttribPointer(mpl, 2, mgl.FLOAT, false, 0, 0);
  mgl.viewport(0, 0, 160, 120);

  let running = true, lastF = 0;
  const t0 = performance.now();
  function mframe(now) {
    if (!running) return;
    if (now - lastF >= 1000/24) {
      lastF = now;
      setUniformsForLayers(mgl, mp, mlayers, mfs, (now-t0)/1000, mNoise, null, false, 1.0);
      mgl.drawArrays(mgl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(mframe);
  }
  requestAnimationFrame(mframe);

  const entry = { stop: () => { running = false; } };
  miniRenderers.push(entry);
  return entry;
}

function stopAllMiniRenderers() {
  miniRenderers.forEach(r => r.stop());
  miniRenderers = [];
}

// ── Export (Shadertoy-style stub) ─────────────────────────────
function copyCode() {
  const src = buildFragFromLayers(layers, frameState);
  navigator.clipboard.writeText(src).then(() => {
    const b = document.getElementById('btn-export');
    if (!b) return;
    const orig = b.textContent; b.textContent = 'Copied!';
    setTimeout(() => { b.textContent = orig; }, 1500);
  });
}
