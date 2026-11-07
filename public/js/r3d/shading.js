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
  };
}

const FOG_FRAGMENT = /* glsl */`
  {
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
      }`);
    fs = fs.replace('#include <common>', `#include <common>
      varying vec3 vTW;
      uniform sampler2D uFog;
      uniform vec2 uMapSize;
      uniform float uTime;
      ${NOISE_GLSL}
      ${opts.terrain ? TERRAIN_DECL : ''}
      ${opts.water ? WATER_DECL : ''}
    `);
    if (opts.terrain) fs = fs.replace('#include <map_fragment>', TERRAIN_FRAGMENT);
    if (opts.water) {
      fs = fs.replace('#include <map_fragment>', WATER_COLOR);
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${WATER_NORMAL}`);
    }
    if (opts.fog !== false) fs = fs.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      ${FOG_FRAGMENT}`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

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
    vec3 shallow = vec3(0.18, 0.52, 0.55);
    vec3 deep = vec3(0.03, 0.17, 0.3);
    vec3 c = mix(shallow, deep, smoothstep(0.0, 0.8, d));
    // écume de rivage animée
    float band = sin(d * 38.0 - uTime * 2.2 + vnoise(vTW.xz * 2.0) * 6.0);
    float foam = smoothstep(0.32, 0.0, d) * smoothstep(0.2, 0.9, band) * (0.5 + 0.5 * vnoise(vTW.xz * 6.0 + uTime));
    foam = max(foam, smoothstep(0.07, 0.0, d));
    c = mix(c, vec3(0.92, 0.96, 0.95), foam * 0.8);
    diffuseColor.rgb = c;
    diffuseColor.a = mix(0.55, 0.94, smoothstep(0.0, 0.5, d)) + foam * 0.3;
  }
`;

const WATER_NORMAL = /* glsl */`
  {
    vec2 gr = wgrad(vTW.xz) * 0.22;
    vec3 pert = (viewMatrix * vec4(-gr.x, 0.0, -gr.y, 0.0)).xyz;
    normal = normalize(normal + pert);
  }
`;
