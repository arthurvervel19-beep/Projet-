// Shaders : injections dans les matériaux physiques de Three.js
// (brouillard de guerre, ombres de nuages, vent, drapeaux, terrain, eau).
import * as THREE from 'three';

export const NOISE_GLSL = /* glsl */`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.07 + 13.1) * 0.3 + vnoise(p * 4.13 + 7.7) * 0.15; }
`;

// Uniformes partagés par tous les matériaux du monde
export function makeWorldUniforms(fogTex, w, h) {
  return {
    uFog: { value: fogTex },
    uMapSize: { value: new THREE.Vector2(w, h) },
    uTime: { value: 0 },
    // brume de distance : x = début, y = densité, z = intensité
    uHaze: { value: new THREE.Vector3(30, 0.012, 0.0) },
    uHazeColor: { value: new THREE.Color(0.62, 0.74, 0.9) },
  };
}

const FOG_FRAGMENT = /* glsl */`
  {
    // brume bleutée qui s'épaissit avec la distance (profondeur de la scène)
    float hzd = length(vTW - cameraPosition);
    float hz = (1.0 - exp(-max(0.0, hzd - uHaze.x) * uHaze.y)) * uHaze.z;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, hz);
    vec2 fuv = vTW.xz / uMapSize;
    float fv = texture2D(uFog, fuv).r;
    // ombres de nuages
    float cl = smoothstep(0.42, 0.78, fbm(vTW.xz * 0.028 + uTime * vec2(0.011, 0.006)));
    gl_FragColor.rgb *= mix(1.0, 0.8, cl);
    float vis = smoothstep(0.55, 0.95, fv);
    float exp = smoothstep(0.08, 0.42, fv);
    float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 memory = mix(vec3(lum), gl_FragColor.rgb, 0.35) * vec3(0.48, 0.5, 0.56);
    gl_FragColor.rgb = mix(memory, gl_FragColor.rgb, vis);
    gl_FragColor.rgb = mix(vec3(0.035, 0.04, 0.055), gl_FragColor.rgb, exp);
    if (fuv.x < 0.0 || fuv.y < 0.0 || fuv.x > 1.0 || fuv.y > 1.0) gl_FragColor.rgb = vec3(0.035, 0.04, 0.055);
  }
`;

/**
 * Injecte dans un matériau standard :
 *  - fog : brouillard de guerre + nuages (par défaut)
 *  - wind : amplitude de balancement (végétation)
 *  - banner : ondulation de drapeau
 *  - terrain / water : shaders spécialisés
 *  - ground : patine des bâtiments (assombrissement au pied, mousse, variations de teinte)
 *  - rim : liseré lumineux en contre-jour (unités, feuillages)
 *  - detail : micro-relief du sol
 */
export function patchWorld(mat, U, opts = {}) {
  const key = JSON.stringify(opts);
  const extra = opts.uniforms || {};
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, extra);
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>
      varying vec3 vTW;
      uniform float uTime;
      ${opts.terrain ? 'varying vec3 vTN;' : ''}
      ${opts.ground ? 'varying float vBaseY; varying float vUpN;' : ''}
    `);
    if (opts.wind) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(modelMatrix[3][0], 0.0, modelMatrix[3][2]);
          #endif
          float ph = ip.x * 0.37 + ip.z * 0.61;
          float hh = max(0.0, position.y);
          float s = sin(uTime * 1.6 + ph) * 0.65 + sin(uTime * 3.1 + ph * 1.9) * 0.35;
          transformed.x += s * ${opts.wind.toFixed(4)} * hh * hh;
          transformed.z += cos(uTime * 1.25 + ph) * ${(opts.wind * 0.6).toFixed(4)} * hh * hh;
        }`);
    }
    if (opts.flap) {
      // battement d'ailes (oiseaux) : les extrémités montent et descendent
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += abs(position.x) * sin(uTime * 12.0 + float(gl_InstanceID) * 1.7) * 0.6;`);
    }
    if (opts.banner) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float u = max(0.0, position.x);
          transformed.z += sin(u * 7.0 - uTime * 5.5 + modelMatrix[3][0]) * 0.07 * u + sin(u * 13.0 - uTime * 8.0) * 0.015 * u;
          transformed.y -= u * u * 0.04;
        }`);
    }
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vTW = (modelMatrix * wp4).xyz;
        ${opts.terrain ? 'vTN = normalize(mat3(modelMatrix) * objectNormal);' : ''}
        ${opts.ground ? 'vBaseY = modelMatrix[3][1]; vUpN = normalize(mat3(modelMatrix) * objectNormal).y;' : ''}
      }`);
    fs = fs.replace('#include <common>', `#include <common>
      varying vec3 vTW;
      uniform sampler2D uFog;
      uniform vec2 uMapSize;
      uniform float uTime;
      uniform vec3 uHaze;
      uniform vec3 uHazeColor;
      ${opts.ground ? 'varying float vBaseY; varying float vUpN;' : ''}
      ${NOISE_GLSL}
      ${opts.terrain ? TERRAIN_DECL : ''}
      ${opts.water ? WATER_DECL : ''}
    `);
    if (opts.terrain) fs = fs.replace('#include <map_fragment>', TERRAIN_FRAGMENT);
    if (opts.terrain && opts.detail) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${TERRAIN_NORMAL}`);
    if (opts.water) {
      fs = fs.replace('#include <map_fragment>', WATER_COLOR);
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${WATER_NORMAL}`);
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${WATER_SPARKLE}`);
    }
    if (opts.ground) fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
        ${GROUND_FRAGMENT}`);
    if (opts.rim) fs = fs.replace('#include <opaque_fragment>', `${RIM_FRAGMENT.replace('RIM_K', opts.rim.toFixed(3))}
        #include <opaque_fragment>`);
    if (opts.fog !== false) fs = fs.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      ${FOG_FRAGMENT}`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

// ------------------------------------------------------------------ bâtiments et unités
// Patine : les murs sont plus sombres au pied, la mousse gagne les bases humides,
// et la teinte varie légèrement d'une pierre ou d'une tuile à l'autre.
const GROUND_FRAGMENT = /* glsl */`
  {
    float gh = vTW.y - vBaseY;
    float wn = fbm(vTW.xz * 2.3 + vTW.y * 3.1);
    diffuseColor.rgb *= 0.9 + 0.2 * wn;
    float streak = vnoise(vec2(vTW.x * 5.0 + vTW.z * 5.0, vTW.y * 0.6));
    diffuseColor.rgb *= mix(1.0, 0.86, smoothstep(0.55, 0.9, streak) * smoothstep(0.2, 1.2, gh));
    // seuls les murs sont concernés : les sols, cours et champs gardent leur teinte
    float wall = 1.0 - smoothstep(0.45, 0.8, vUpN);
    float mossK = (1.0 - smoothstep(0.02, 0.5, gh)) * smoothstep(0.38, 0.7, fbm(vTW.xz * 3.3 + 17.0)) * 0.5 * wall;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.26, 0.1), mossK);
    diffuseColor.rgb *= mix(1.0, mix(0.62, 1.0, smoothstep(-0.05, 0.42, gh)), wall);
  }
`;

// Liseré lumineux : la lumière du soleil accroche le contour des formes en contre-jour.
const RIM_FRAGMENT = /* glsl */`
  {
    float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);
    #if NUM_DIR_LIGHTS > 0
      float sunF = clamp(dot(normal, directionalLights[0].direction) * 0.5 + 0.5, 0.0, 1.0);
    #else
      float sunF = 1.0;
    #endif
    outgoingLight += fr * (0.3 + 0.7 * sunF) * RIM_K * vec3(1.0, 0.92, 0.78) * (0.35 + diffuseColor.rgb);
  }
`;

// ------------------------------------------------------------------ terrain
const TERRAIN_DECL = /* glsl */`
  varying vec3 vTN;
  uniform sampler2D uSplat;
  uniform sampler2D uGrass;
  uniform sampler2D uForest;
  uniform sampler2D uDirt;
  uniform sampler2D uSand;
  vec3 tri(sampler2D t, vec2 p, float s) {
    // deux échelles mélangées pour casser la répétition
    vec3 a = texture2D(t, p * s).rgb;
    vec3 b = texture2D(t, p * s * 0.27 + 0.31).rgb;
    return mix(a, b, 0.35);
  }
`;

const TERRAIN_FRAGMENT = /* glsl */`
  {
    vec2 p = vTW.xz;
    float n1 = fbm(p * 0.9);
    vec2 warp = vec2(vnoise(p * 0.75 + 3.1), vnoise(p * 0.75 + 9.7)) - 0.5;
    vec4 sp = texture2D(uSplat, (p + warp * 0.9) / uMapSize);
    vec3 g = tri(uGrass, p, 0.42);
    float patchy = fbm(p * 0.06);
    g = mix(g, g * vec3(1.32, 1.12, 0.66), smoothstep(0.5, 0.8, patchy));   // plaques d'herbe sèche
    g = mix(g, g * vec3(0.78, 0.9, 0.74), smoothstep(0.42, 0.18, patchy));
    g *= mix(0.86, 1.08, vnoise(p * 0.21));
    vec3 c = g;
    c = mix(c, tri(uForest, p, 0.5), smoothstep(0.05, 0.55, sp.a) * 0.9);
    float dm = smoothstep(0.34, 0.6, sp.r + (n1 - 0.5) * 0.45);
    c = mix(c, tri(uDirt, p, 0.45), dm);
    float sm = smoothstep(0.3, 0.55, sp.g + sp.b * 1.5 + (n1 - 0.5) * 0.3);
    vec3 sand = tri(uSand, p, 0.4);
    sand *= mix(1.0, 0.62, smoothstep(0.35, 0.7, sp.b + (n1 - 0.5) * 0.2)); // sable mouillé
    c = mix(c, sand, sm);
    // pentes : terre visible
    float slope = 1.0 - clamp(vTN.y, 0.0, 1.0);
    c = mix(c, tri(uDirt, p, 0.45) * 0.85, smoothstep(0.12, 0.3, slope) * 0.6);
    diffuseColor.rgb = c;
  }
`;

// micro-relief du sol : mottes, touffes et cailloux accrochent la lumière
const TERRAIN_NORMAL = /* glsl */`
  {
    vec2 q = vTW.xz;
    float e = 0.06;
    float h0 = fbm(q * 2.4) + vnoise(q * 8.5) * 0.4;
    float hx = fbm((q + vec2(e, 0.0)) * 2.4) + vnoise((q + vec2(e, 0.0)) * 8.5) * 0.4;
    float hy = fbm((q + vec2(0.0, e)) * 2.4) + vnoise((q + vec2(0.0, e)) * 8.5) * 0.4;
    vec2 gr = vec2(hx - h0, hy - h0) / e * 0.1;
    normal = normalize(normal + (viewMatrix * vec4(-gr.x, 0.0, -gr.y, 0.0)).xyz);
  }
`;

// ------------------------------------------------------------------ eau
const WATER_DECL = /* glsl */`
  uniform sampler2D uDepth;
  float wdepth() { return texture2D(uDepth, vTW.xz / uMapSize).r; }
  vec2 wgrad(vec2 p) {
    float t = uTime;
    vec2 a = p * 1.6 + vec2(t * 0.35, t * 0.22);
    vec2 b = p * 3.7 - vec2(t * 0.5, -t * 0.31);
    float e = 0.05;
    float h0 = vnoise(a) + vnoise(b) * 0.5;
    float hx = vnoise(a + vec2(e, 0.0)) + vnoise(b + vec2(e, 0.0)) * 0.5;
    float hy = vnoise(a + vec2(0.0, e)) + vnoise(b + vec2(0.0, e)) * 0.5;
    return vec2(hx - h0, hy - h0) / e;
  }
`;

const WATER_COLOR = /* glsl */`
  {
    float d = wdepth();
    vec3 shallow = vec3(0.16, 0.6, 0.6);
    vec3 deep = vec3(0.02, 0.15, 0.3);
    vec3 c = mix(shallow, deep, smoothstep(0.0, 0.8, d));
    // reflets de lumière sur le fond, près du bord
    float caus = vnoise(vTW.xz * 3.1 + uTime * 0.6) * vnoise(vTW.xz * 4.3 - uTime * 0.45 + 9.0);
    c += vec3(0.5, 0.65, 0.5) * smoothstep(0.25, 0.6, caus) * smoothstep(0.55, 0.05, d) * 0.22;
    // écume de rivage animée
    float band = sin(d * 38.0 - uTime * 2.2 + vnoise(vTW.xz * 2.0) * 6.0);
    float foam = smoothstep(0.32, 0.0, d) * smoothstep(0.2, 0.9, band) * (0.5 + 0.5 * vnoise(vTW.xz * 6.0 + uTime));
    foam = max(foam, smoothstep(0.07, 0.0, d));
    c = mix(c, vec3(0.92, 0.96, 0.95), foam * 0.8);
    diffuseColor.rgb = c;
    diffuseColor.a = mix(0.55, 0.94, smoothstep(0.0, 0.5, d)) + foam * 0.3;
  }
`;

// scintillement du soleil sur les vagues
const WATER_SPARKLE = /* glsl */`
  {
    float sd = wdepth();
    float s1 = vnoise(vTW.xz * 15.0 + vec2(uTime * 1.1, uTime * 0.6));
    float s2 = vnoise(vTW.xz * 24.0 - vec2(uTime * 0.8, -uTime * 0.9) + 4.0);
    float band = vnoise(vTW.xz * 0.9 + uTime * 0.12);
    float sp = smoothstep(0.6, 0.7, s1 * s2) * smoothstep(0.35, 0.75, band) * smoothstep(0.03, 0.3, sd);
    totalEmissiveRadiance += vec3(1.0, 0.96, 0.86) * sp * 1.5;
  }
`;

const WATER_NORMAL = /* glsl */`
  {
    vec2 gr = wgrad(vTW.xz) * 0.22;
    vec3 pert = (viewMatrix * vec4(-gr.x, 0.0, -gr.y, 0.0)).xyz;
    normal = normalize(normal + pert);
  }
`;
