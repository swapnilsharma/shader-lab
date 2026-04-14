// ================================================================
// SHADER LAB — GLSL Builder & WebGL Renderer — Phase 2
// ================================================================

// --- Noise texture (256×256 RGBA) ---
function initNoiseTex() {
  const sz = 256, data = new Uint8Array(sz * sz * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  noiseTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, noiseTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sz, sz, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
}
initNoiseTex();

// ================================================================
function buildFrag(forST) {
  const active = effects.filter(e => e.on && e.type !== '_baseimg');
  const waves = active.filter(e => e.type === 'wave');
  const warps = active.filter(e => e.type === 'warp');
  const grains = active.filter(e => e.type === 'grain');
  const chromas = active.filter(e => e.type === 'chroma');
  const scans = active.filter(e => e.type === 'scanlines');
  const barrels = active.filter(e => e.type === 'barrel');
  const vignettes = active.filter(e => e.type === 'vignette');
  const grades = active.filter(e => e.type === 'colorgrade');
  const pixels = active.filter(e => e.type === 'pixelate');
  const posts = active.filter(e => e.type === 'posterize');
  const dirgrads = active.filter(e => e.type === 'dirgradient');
  const shockwaves = active.filter(e => e.type === 'shockwave');
  const glowrings = active.filter(e => e.type === 'glowring');
  const buttonfxs = active.filter(e => e.type === 'buttonfx');
  const orbs = active.filter(e => e.type === 'orb');

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
      shockwave:{sw_speed:`sw_sp${e.id}`,sw_width:`sw_w${e.id}`,sw_str:`sw_st${e.id}`,sw_ca:`sw_ca${e.id}`},
      glowring:{gr_w:`grw${e.id}`,gr_h:`grh${e.id}`,gr_r:`grr${e.id}`,gr_falloff:`grf${e.id}`,gr_int:`gri${e.id}`,gr_spd:`grs${e.id}`,gr_freq:`grq${e.id}`},
      buttonfx:{bf_mode:`bfm${e.id}`,bf_raycount:`bfrc${e.id}`,bf_rotspd:`bfrs${e.id}`,bf_sharp:`bfsh${e.id}`,bf_inner:`bfin${e.id}`,bf_falloff:`bffo${e.id}`,bf_int:`bfit${e.id}`,bf_decay:`bfdc${e.id}`,bf_crackscale:`bfcs${e.id}`,bf_crackw:`bfcw${e.id}`,bf_crackspd:`bfcp${e.id}`},
      orb:{orb_rad:`or_r${e.id}`,orb_warp:`or_w${e.id}`},
    };
    return umap[e.type]?.[k] || parseFloat(e.data[k]).toFixed(6);
  }
  function fwavecol(e) {
    if (forST) return `vec3(${e.data.r.toFixed(4)},${e.data.g.toFixed(4)},${e.data.b.toFixed(4)})`;
    return `wc${e.id}`;
  }
  function fcol(e, k) {
    if (forST) return `vec3(${parseFloat(e.data[k+'r']).toFixed(4)},${parseFloat(e.data[k+'g']).toFixed(4)},${parseFloat(e.data[k+'b']).toFixed(4)})`;
    return `u_${k}${e.id}`;
  }

  const bgVec = forST ? `vec3(${bgR.toFixed(4)},${bgG.toFixed(4)},${bgB.toFixed(4)})` : 'u_bg';

  let u = 'precision mediump float;\n';
  if (!forST) {
    u += `uniform vec2 u_res;\nuniform float u_t;\nuniform vec3 u_bg;\n`;
    u += `uniform vec2 uMouse;\nuniform vec2 uClick;\nuniform float uClickTime;\nuniform float uStateTime;\n`;
    u += `uniform sampler2D uImage;\nuniform float uHasImage;\n`;
    u += `uniform sampler2D uNoise;\n`;
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
    shockwaves.forEach(e => { u += `uniform float sw_sp${e.id},sw_w${e.id},sw_st${e.id},sw_ca${e.id};\n`; });
    glowrings.forEach(e => { u += `uniform float grw${e.id},grh${e.id},grr${e.id},grf${e.id},gri${e.id},grs${e.id},grq${e.id};uniform vec3 grc${e.id};\n`; });
    buttonfxs.forEach(e => { u += `uniform float bfm${e.id},bfrc${e.id},bfrs${e.id},bfsh${e.id},bfin${e.id},bffo${e.id},bfit${e.id},bfdc${e.id},bfcs${e.id},bfcw${e.id},bfcp${e.id};uniform vec3 bfc${e.id};\n`; });
    orbs.forEach(e => { u += `uniform float or_r${e.id},or_w${e.id};uniform vec3 orc${e.id},orcl${e.id},orcm${e.id},orch${e.id};\n`; });
  }

  let s = u + `
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u2=f*f*(3.0-2.0*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),u2.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u2.x),u2.y);}
float fbm(vec2 p,float oct){float v=0.0,a=0.5;for(int i=0;i<6;i++){if(float(i)>=oct)break;v+=vnoise(p)*a;p*=2.0;a*=0.5;}return v;}
vec2 rot2(vec2 p,float a){float c=cos(a),s2=sin(a);return vec2(p.x*c-p.y*s2,p.x*s2+p.y*c);}
`;

  // Orb needs higher-quality fbm
  if (orbs.length) {
    s += `
float fbm4(vec2 x){float v=0.0,a=0.5;mat2 rm=mat2(cos(0.5),sin(0.5),-sin(0.5),cos(0.5));vec2 sh=vec2(100.0);for(int i=0;i<4;i++){v+=a*vnoise(x);x=rm*x*2.0+sh;a*=0.5;}return v;}
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
vec3 fade3(vec3 t){return t*t*t*(t*(t*6.0-15.0)+10.0);}
float cnoise(vec3 P){vec3 Pi0=floor(P),Pi1=Pi0+vec3(1.0);Pi0=mod(Pi0,289.0);Pi1=mod(Pi1,289.0);vec3 Pf0=fract(P),Pf1=Pf0-vec3(1.0);vec4 ix=vec4(Pi0.x,Pi1.x,Pi0.x,Pi1.x);vec4 iy=vec4(Pi0.yy,Pi1.yy);vec4 iz0=Pi0.zzzz,iz1=Pi1.zzzz;vec4 ixy=permute(permute(ix)+iy);vec4 ixy0=permute(ixy+iz0),ixy1=permute(ixy+iz1);vec4 gx0=ixy0/7.0,gy0=fract(floor(gx0)/7.0)-0.5;gx0=fract(gx0);vec4 gz0=vec4(0.5)-abs(gx0)-abs(gy0);vec4 sz0=step(gz0,vec4(0.0));gx0-=sz0*(step(0.0,gx0)-0.5);gy0-=sz0*(step(0.0,gy0)-0.5);vec4 gx1=ixy1/7.0,gy1=fract(floor(gx1)/7.0)-0.5;gx1=fract(gx1);vec4 gz1=vec4(0.5)-abs(gx1)-abs(gy1);vec4 sz1=step(gz1,vec4(0.0));gx1-=sz1*(step(0.0,gx1)-0.5);gy1-=sz1*(step(0.0,gy1)-0.5);vec3 g000=vec3(gx0.x,gy0.x,gz0.x),g100=vec3(gx0.y,gy0.y,gz0.y),g010=vec3(gx0.z,gy0.z,gz0.z),g110=vec3(gx0.w,gy0.w,gz0.w);vec3 g001=vec3(gx1.x,gy1.x,gz1.x),g101=vec3(gx1.y,gy1.y,gz1.y),g011=vec3(gx1.z,gy1.z,gz1.z),g111=vec3(gx1.w,gy1.w,gz1.w);vec4 norm0=taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));g000*=norm0.x;g010*=norm0.y;g100*=norm0.z;g110*=norm0.w;vec4 norm1=taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));g001*=norm1.x;g011*=norm1.y;g101*=norm1.z;g111*=norm1.w;float n000=dot(g000,Pf0),n100=dot(g100,vec3(Pf1.x,Pf0.yz)),n010=dot(g010,vec3(Pf0.x,Pf1.y,Pf0.z)),n110=dot(g110,vec3(Pf1.xy,Pf0.z));float n001=dot(g001,vec3(Pf0.xy,Pf1.z)),n101=dot(g101,vec3(Pf1.x,Pf0.y,Pf1.z)),n011=dot(g011,vec3(Pf0.x,Pf1.yz)),n111=dot(g111,Pf1);vec3 fade_xyz=fade3(Pf0);vec4 n_z=mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),fade_xyz.z);vec2 n_yz=mix(n_z.xy,n_z.zw,fade_xyz.y);float n_xyz=mix(n_yz.x,n_yz.y,fade_xyz.x);return 2.2*n_xyz;}
`;
  }

  // Voronoi helper for crack mode
  if (buttonfxs.some(e => e.data.bf_mode > 0.5)) {
    s += `
vec2 voronoi(vec2 uv2){vec2 ip=floor(uv2),fp=fract(uv2);float md=8.0;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 n=vec2(float(x),float(y));vec2 rnd=vec2(fract(sin(dot(ip+n,vec2(127.1,311.7)))*43758.5),fract(sin(dot(ip+n,vec2(269.5,183.3)))*43758.5));vec2 pt=n+0.5+0.5*sin(rnd*6.2831);float d=length(pt-fp);md=min(md,d);}return vec2(md);}
`;
  }

  s += forST ? `void mainImage(out vec4 fragColor,in vec2 fragCoord){\n` : `void main(){\n`;
  s += `  vec2 uv=${fc}/${uR};\n  float t=${uT};\n  vec2 rawuv=uv;\n`;

  // Check for base image
  const baseOn = effects.find(e => e.type === '_baseimg' && e.on);
  if (!forST && baseOn) {
    s += `  vec3 col=uHasImage>0.5?texture2D(uImage,uv).rgb:${bgVec};\n`;
  } else {
    // Barrel + pixelate pre-processing
    barrels.forEach(e => {
      s += `  {vec2 bc=uv*2.0-1.0;float r2=dot(bc,bc);bc*=1.0+${fv(e,'str')}*r2;uv=(bc*${fv(e,'zoom')})*0.5+0.5;}\n`;
    });
    pixels.forEach(e => {
      s += `  {vec2 res=${uR};uv=floor(uv*(res/${fv(e,'size')}))/(res/${fv(e,'size')});}\n`;
    });
    if (warps.length) {
      const w = warps[0];
      s += `  vec2 wuv=uv+${fv(w,'str')}*vec2(fbm(uv*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uv*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
    } else { s += `  vec2 wuv=uv;\n`; }
    s += `  vec3 col=${bgVec};\n`;
  }

  // If base image is on, still need wuv for wave effects
  if (baseOn) {
    barrels.forEach(e => {
      s += `  {vec2 bc=uv*2.0-1.0;float r2=dot(bc,bc);bc*=1.0+${fv(e,'str')}*r2;uv=(bc*${fv(e,'zoom')})*0.5+0.5;}\n`;
    });
    pixels.forEach(e => {
      s += `  {vec2 res=${uR};uv=floor(uv*(res/${fv(e,'size')}))/(res/${fv(e,'size')});}\n`;
    });
    if (warps.length) {
      const w = warps[0];
      s += `  vec2 wuv=uv+${fv(w,'str')}*vec2(fbm(uv*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uv*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
    } else { s += `  vec2 wuv=uv;\n`; }
  }

  const hasChroma = chromas.length > 0;
  if (hasChroma) {
    const ch = chromas[0];
    s += `  vec2 chD=vec2(cos(${fv(ch,'angle')}*0.01745),sin(${fv(ch,'angle')}*0.01745));\n`;
    s += `  vec2 uvR=uv+chD*${fv(ch,'spread')},uvB=uv-chD*${fv(ch,'spread')};\n`;
    if (warps.length) {
      const w = warps[0];
      s += `  vec2 wuvR=uvR+${fv(w,'str')}*vec2(fbm(uvR*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uvR*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
      s += `  vec2 wuvB=uvB+${fv(w,'str')}*vec2(fbm(uvB*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uvB*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
    } else { s += `  vec2 wuvR=uvR,wuvB=uvB;\n`; }
  }

  waves.forEach(w => {
    const freq=fv(w,'freq'),amp=fv(w,'amp'),spd=fv(w,'spd'),pos=fv(w,'pos'),edge=fv(w,'edge'),ang=fv(w,'angle');
    const col=fwavecol(w);
    s += `  {\n    vec2 ruv=rot2(wuv-0.5,${ang}*0.01745)+0.5;\n`;
    s += `    float wave=sin(ruv.x*${freq}*6.2832+t*${spd})*${amp};\n`;
    s += `    float m=smoothstep(${edge},0.0,abs(ruv.y-(${pos}+wave))-${edge}*0.3);\n`;
    if (hasChroma) {
      s += `    vec2 ruvR=rot2(wuvR-0.5,${ang}*0.01745)+0.5;\n    vec2 ruvB=rot2(wuvB-0.5,${ang}*0.01745)+0.5;\n`;
      s += `    float mR=smoothstep(${edge},0.0,abs(ruvR.y-(${pos}+sin(ruvR.x*${freq}*6.2832+t*${spd})*${amp}))-${edge}*0.3);\n`;
      s += `    float mB=smoothstep(${edge},0.0,abs(ruvB.y-(${pos}+sin(ruvB.x*${freq}*6.2832+t*${spd})*${amp}))-${edge}*0.3);\n`;
      s += `    col+=vec3(${col}.r*mR,${col}.g*m,${col}.b*mB);\n`;
    } else {
      if (w.blend === 'add') s += `    col=clamp(col+${col}*m,0.0,1.0);\n`;
      else s += `    col+=${col}*m;\n`;
    }
    s += `    col=clamp(col,0.0,1.0);\n  }\n`;
  });

  posts.forEach(e => {
    s += `  {\n    float lum=dot(col,vec3(0.299,0.587,0.114));\n    float band=floor(lum*${fv(e,'bands')})/${fv(e,'bands')};\n`;
    s += `    vec3 dark=mix(${fcol(e,'c1')},${fcol(e,'c2')},rawuv.y);\n    vec3 bright=mix(${fcol(e,'c3')},${fcol(e,'c4')},rawuv.y);\n`;
    s += `    vec3 pcol=mix(dark,bright,band);\n    col=mix(col,pcol,${fv(e,'mix')});col=clamp(col,0.0,1.0);\n  }\n`;
  });
  scans.forEach(e => {
    s += `  {float slY=rawuv.y;if(${fv(e,'scroll')}>0.5)slY=fract(rawuv.y+t*${fv(e,'scrollspd')});float sl=smoothstep(${fv(e,'soft')},1.0,abs(sin(slY*${fv(e,'count')}*3.14159)));col*=1.0-sl*${fv(e,'dark')};}\n`;
  });
  grains.forEach(e => {
    s += `  {vec2 gp=${fc}/${fv(e,'size')};\n   vec2 go=vec2(0.0);if(${fv(e,'anim')}>0.5)go+=vec2(floor(t*24.0)*7.3,floor(t*24.0)*3.7);\n`;
    s += `   if(${fv(e,'streak')}>0.5){vec2 sd=vec2(cos(${fv(e,'sangle')}*0.01745),sin(${fv(e,'sangle')}*0.01745));float soff=dot(gp,vec2(-sd.y,sd.x));gp=vec2(dot(gp,sd)+fract(soff)*${fv(e,'slen')},soff);}\n`;
    s += `   float n=hash2(gp+go);col+=vec3((n-0.5)*${fv(e,'amount')});col=clamp(col,0.0,1.0);}\n`;
  });
  dirgrads.forEach(e => {
    s += `  {float iy=1.0-rawuv.y;col-=${fv(e,'topstr')}*pow(rawuv.y,${fv(e,'power')});col+=pow(iy,${fv(e,'power')})*${fv(e,'botstr')}*0.3;col=clamp(col,0.0,1.0);}\n`;
  });

  // --- Interactive: Shockwave ---
  shockwaves.forEach(e => {
    const uCk = forST ? 'vec2(0.5)' : 'uClick';
    const uCt = forST ? '999.0' : 'uClickTime';
    s += `  {\n    float swt=${uCt};\n    if(swt<2.5){\n`;
    s += `      float asp=${uR}.x/${uR}.y;\n      vec2 sd=(uv-${uCk})*vec2(asp,1.0);\n      float sdist=length(sd);\n      vec2 sdir=normalize(sd+0.0001);\n`;
    s += `      float wf=sdist-swt*${fv(e,'sw_speed')};\n      float sw=exp(-(wf*wf)/(${fv(e,'sw_width')}*${fv(e,'sw_width')}));\n      sw*=exp(-swt*2.2);\n`;
    s += `      col+=vec3(1.0)*sw*0.4;\n      col.r*=1.0+sw*0.35;\n      col.b*=1.0+sw*0.25;\n      col=clamp(col,0.0,1.0);\n    }\n  }\n`;
  });

  // --- Interactive: Glow Ring ---
  glowrings.forEach(e => {
    const uCt = forST ? '999.0' : 'uClickTime';
    const colU = forST ? `vec3(${(e.data.colorr||0.27).toFixed(4)},${(e.data.colorg||0.53).toFixed(4)},${(e.data.colorb||1.0).toFixed(4)})` : `grc${e.id}`;
    s += `  {\n    float asp=${uR}.x/${uR}.y;\n    vec2 gp=(uv-0.5)*vec2(asp,1.0);\n`;
    s += `    vec2 gb=vec2(${fv(e,'gr_w')},${fv(e,'gr_h')});\n    float gr=${fv(e,'gr_r')};\n`;
    s += `    vec2 gq=abs(gp)-gb+gr;\n    float gsdf=length(max(gq,0.0))+min(max(gq.x,gq.y),0.0)-gr;\n`;
    s += `    float gglow=exp(-abs(gsdf)*${fv(e,'gr_falloff')});\n    col+=${colU}*gglow*${fv(e,'gr_int')};\n`;
    s += `    float grings=0.0;\n    for(int i=0;i<3;i++){float off=float(i)*0.4;float gw=sin((gsdf-t*${fv(e,'gr_spd')}+off)*${fv(e,'gr_freq')})*0.5+0.5;gw*=smoothstep(0.0,0.015,gsdf);gw*=exp(-gsdf*5.0);grings+=gw*0.25;}\n`;
    s += `    float gburst=0.0;float gbt=${uCt};\n    if(gbt<1.8){float gbw=sin((gsdf-gbt*${fv(e,'gr_spd')}*2.2)*${fv(e,'gr_freq')}*2.0)*0.5+0.5;gbw*=exp(-gsdf*3.0)*exp(-gbt*3.5);gburst=gbw*0.9;}\n`;
    s += `    col+=${colU}*(grings+gburst);\n    col=clamp(col,0.0,1.0);\n  }\n`;
  });

  // --- Interactive: Button FX ---
  buttonfxs.forEach(e => {
    const uCk = forST ? 'vec2(0.5)' : 'uClick';
    const uCt = forST ? '999.0' : 'uClickTime';
    const colU = forST ? `vec3(${(e.data.colorr||1.0).toFixed(4)},${(e.data.colorg||0.88).toFixed(4)},${(e.data.colorb||0.4).toFixed(4)})` : `bfc${e.id}`;
    if (e.data.bf_mode > 0.5) {
      // Crack mode
      s += `  {\n    float bft=${uCt};\n    if(bft<2.5){\n`;
      s += `      float asp=${uR}.x/${uR}.y;\n      vec2 bp=(uv-${uCk})*vec2(asp,1.0);\n      float bdist=length(bp);\n`;
      s += `      float rev=1.0-smoothstep(bft*${fv(e,'bf_crackspd')}-0.05,bft*${fv(e,'bf_crackspd')}+0.05,bdist);\n`;
      s += `      float fade=smoothstep(2.5,0.8,bft);\n`;
      s += `      vec2 bvor=voronoi(uv*${fv(e,'bf_crackscale')});\n`;
      s += `      float bedge=1.0-smoothstep(0.0,${fv(e,'bf_crackw')},bvor.x);\n      bedge*=rev*fade;\n`;
      s += `      col=mix(col,col*0.25,bedge*0.75)+${colU}*bedge*2.0;\n      col=clamp(col,0.0,1.0);\n    }\n  }\n`;
    } else {
      // Rays mode
      s += `  {\n    float bft=${uCt};\n    if(bft<1.5){\n`;
      s += `      float asp=${uR}.x/${uR}.y;\n      vec2 bp=(uv-${uCk})*vec2(asp,1.0);\n      float bdist=length(bp);\n      float bang=atan(bp.y,bp.x);\n`;
      s += `      float brays=pow(abs(sin(bang*${fv(e,'bf_raycount')}*0.5+t*${fv(e,'bf_rotspd')})),${fv(e,'bf_sharp')});\n`;
      s += `      brays*=smoothstep(${fv(e,'bf_inner')},${fv(e,'bf_inner')}+0.02,bdist);\n`;
      s += `      brays*=exp(-bdist*${fv(e,'bf_falloff')})*exp(-bft*${fv(e,'bf_decay')});\n`;
      s += `      col+=${colU}*brays*${fv(e,'bf_int')};\n      col=clamp(col,0.0,1.0);\n    }\n  }\n`;
    }
  });

  // --- Orb ---
  orbs.forEach(e => {
    const uSt = forST ? '999.0' : 'uStateTime';
    const mainC = forST ? `vec3(${(e.data.colorr||0.4).toFixed(4)},${(e.data.colorg||0.27).toFixed(4)},${(e.data.colorb||1.0).toFixed(4)})` : `orc${e.id}`;
    const lowC = forST ? `vec3(${(e.data.orb_clowr||0).toFixed(4)},${(e.data.orb_clowg||0.07).toFixed(4)},${(e.data.orb_clowb||0.2).toFixed(4)})` : `orcl${e.id}`;
    const midC = forST ? `vec3(${(e.data.orb_cmidr||0).toFixed(4)},${(e.data.orb_cmidg||0.33).toFixed(4)},${(e.data.orb_cmidb||0.73).toFixed(4)})` : `orcm${e.id}`;
    const hiC = forST ? `vec3(${(e.data.orb_chir||0.67).toFixed(4)},${(e.data.orb_chig||0.8).toFixed(4)},${(e.data.orb_chib||1.0).toFixed(4)})` : `orch${e.id}`;
    s += `  {\n    float asp=${uR}.x/${uR}.y;\n    vec2 ost=(uv-0.5)*vec2(asp,1.0);\n`;
    s += `    float spt=${uSt};\n    float spring=1.0+0.18*exp(-spt*5.5)*cos(110.0*spt);\n`;
    s += `    float orad=${fv(e,'orb_rad')}*spring;\n`;
    s += `    float owarp=${fv(e,'orb_warp')};\n`;
    s += `    vec2 wst=ost+vec2(fbm4(ost*2.2+vec2(t*0.11,t*0.07)),fbm4(ost*2.2+vec2(t*0.08,t*0.13)))*owarp;\n`;
    s += `    float osdf=length(wst)-orad;\n    float omask=1.0-smoothstep(-0.008,0.008,osdf);\n    float oglow=exp(-max(osdf,0.0)*9.0)*0.55;\n`;
    s += `    float on=cnoise(vec3(wst*2.6,t*0.13))*0.5+0.5;\n`;
    s += `    vec3 ocol=mix(${lowC},${midC},on);\n    ocol=mix(ocol,${hiC},pow(on,2.8));\n`;
    s += `    float ohi=cnoise(vec3(wst*4.2,t*0.19))*0.5+0.5;\n    ocol=mix(ocol,${mainC},ohi*omask*0.55);\n`;
    if (e.blend === 'add') {
      s += `    col=clamp(col+ocol*omask+${mainC}*oglow,0.0,1.0);\n`;
    } else {
      s += `    col=mix(col,ocol,omask)+${mainC}*oglow;\n    col=clamp(col,0.0,1.0);\n`;
    }
    s += `  }\n`;
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
    errEl.textContent = gl.getShaderInfoLog(s);
    statusDot.className = 'statusbar-dot statusbar-dot--error';
    document.getElementById('status-text').textContent = 'Error';
    console.error('GLSL compile error:', gl.getShaderInfoLog(s));
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

  // Phase 2 uniforms
  gl.uniform2f(ul('uMouse'), mouseX, mouseY);
  gl.uniform2f(ul('uClick'), clickX, clickY);
  const ct = (performance.now() - clickStartTime) / 1000.0;
  gl.uniform1f(ul('uClickTime'), ct);
  gl.uniform1f(ul('uStateTime'), ct);

  // Image texture
  gl.activeTexture(gl.TEXTURE0);
  if (baseImageTex) gl.bindTexture(gl.TEXTURE_2D, baseImageTex);
  gl.uniform1i(ul('uImage'), 0);
  gl.uniform1f(ul('uHasImage'), hasBaseImage ? 1.0 : 0.0);

  // Noise texture
  gl.activeTexture(gl.TEXTURE1);
  if (noiseTex) gl.bindTexture(gl.TEXTURE_2D, noiseTex);
  gl.uniform1i(ul('uNoise'), 1);

  effects.filter(e => e.on && e.type !== '_baseimg').forEach(e => {
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
    // Interactive
    if (e.type==='shockwave'){gl.uniform1f(ul(`sw_sp${e.id}`),d.sw_speed);gl.uniform1f(ul(`sw_w${e.id}`),d.sw_width);gl.uniform1f(ul(`sw_st${e.id}`),d.sw_str);gl.uniform1f(ul(`sw_ca${e.id}`),d.sw_ca);}
    if (e.type==='glowring'){
      gl.uniform1f(ul(`grw${e.id}`),d.gr_w);gl.uniform1f(ul(`grh${e.id}`),d.gr_h);gl.uniform1f(ul(`grr${e.id}`),d.gr_r);
      gl.uniform1f(ul(`grf${e.id}`),d.gr_falloff);gl.uniform1f(ul(`gri${e.id}`),d.gr_int);gl.uniform1f(ul(`grs${e.id}`),d.gr_spd);gl.uniform1f(ul(`grq${e.id}`),d.gr_freq);
      gl.uniform3f(ul(`grc${e.id}`),d.colorr||0.27,d.colorg||0.53,d.colorb||1.0);
    }
    if (e.type==='buttonfx'){
      gl.uniform1f(ul(`bfm${e.id}`),d.bf_mode);gl.uniform1f(ul(`bfrc${e.id}`),d.bf_raycount);gl.uniform1f(ul(`bfrs${e.id}`),d.bf_rotspd);
      gl.uniform1f(ul(`bfsh${e.id}`),d.bf_sharp);gl.uniform1f(ul(`bfin${e.id}`),d.bf_inner);gl.uniform1f(ul(`bffo${e.id}`),d.bf_falloff);
      gl.uniform1f(ul(`bfit${e.id}`),d.bf_int);gl.uniform1f(ul(`bfdc${e.id}`),d.bf_decay);
      gl.uniform1f(ul(`bfcs${e.id}`),d.bf_crackscale);gl.uniform1f(ul(`bfcw${e.id}`),d.bf_crackw);gl.uniform1f(ul(`bfcp${e.id}`),d.bf_crackspd);
      gl.uniform3f(ul(`bfc${e.id}`),d.colorr||1.0,d.colorg||0.88,d.colorb||0.4);
    }
    if (e.type==='orb'){
      gl.uniform1f(ul(`or_r${e.id}`),d.orb_rad);gl.uniform1f(ul(`or_w${e.id}`),d.orb_warp);
      gl.uniform3f(ul(`orc${e.id}`),d.colorr||0.4,d.colorg||0.27,d.colorb||1.0);
      gl.uniform3f(ul(`orcl${e.id}`),d.orb_clowr||0,d.orb_clowg||0.07,d.orb_clowb||0.2);
      gl.uniform3f(ul(`orcm${e.id}`),d.orb_cmidr||0,d.orb_cmidg||0.33,d.orb_cmidb||0.73);
      gl.uniform3f(ul(`orch${e.id}`),d.orb_chir||0.67,d.orb_chig||0.8,d.orb_chib||1.0);
    }
  });
}

// --- Init & render loop ---
timeOffset = performance.now();
applyFrame();

function frame() {
  const now = performance.now();
  const t = playing ? (now - timeOffset) / 1000 : (pausedAt - timeOffset) / 1000;
  frameCount++;
  if (now - lastFpsTime >= 500) {
    currentFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
    document.getElementById('status-fps').textContent = currentFps + ' fps';
    frameCount = 0; lastFpsTime = now;
  }
  const totalSec = Math.max(0, t);
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1);
  document.getElementById('time-display').textContent = `${min}:${sec.padStart(4,'0')}`;

  // Update hint visibility periodically
  updateCanvasCursor();

  if (needsRecompile) { needsRecompile = false; compile(); }
  if (prog) { setU(t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  requestAnimationFrame(frame);
}

// --- Boot ---
renderAddGrid();
renderPresets();
loadRandom();
frame();
