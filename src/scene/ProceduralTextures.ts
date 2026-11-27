import * as THREE from 'three';
import { TeacherConfig } from '../types';

export interface PBRTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

// ==================== FAST DETERMINISTIC NOISE ENGINE ====================
const PERM = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 19741011;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function hash2(ix: number, iy: number, seed = 0): number {
  return PERM[(ix & 255) + PERM[(iy + seed) & 255]] / 255;
}

/** Smooth tileable 2D value noise in [0, 1] */
function tileNoise(x: number, y: number, periodX: number, periodY: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const x0 = ((xi % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;
  const y0 = ((yi % periodY) + periodY) % periodY;
  const y1 = (y0 + 1) % periodY;

  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable multi-octave Fractal Brownian Motion in [0, 1] */
function fbmTile(
  u: number,
  v: number,
  baseFreqX: number,
  baseFreqY: number,
  octaves: number,
  seed = 0
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = baseFreqX;
  let fy = baseFreqY;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileNoise(u * fx, v * fy, fx, fy, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

let worleyOutId = 0;

/** Fast zero-allocation cellular Worley distance (returns f1; cellId stored in worleyOutId) */
function worleyTileFast(
  u: number,
  v: number,
  cellsX: number,
  cellsY: number,
  seed = 0
): number {
  const gx = u * cellsX;
  const gy = v * cellsY;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let minDistSq = 99;
  let bestId = 0;

  for (let dy = -1; dy <= 1; dy++) {
    const cy = (((iy + dy) % cellsY) + cellsY) % cellsY;
    for (let dx = -1; dx <= 1; dx++) {
      const cx = (((ix + dx) % cellsX) + cellsX) % cellsX;
      const jx = hash2(cx, cy, seed);
      const jy = hash2(cx, cy, seed + 79);
      const px = ix + dx + jx - gx;
      const py = iy + dy + jy - gy;
      const dSq = px * px + py * py;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        bestId = hash2(cx, cy, seed + 151);
      }
    }
  }
  worleyOutId = bestId;
  return Math.sqrt(minDistSq);
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Converts heightfield [0..1] into a tangent-space RGB DataTexture normal map */
export function heightToNormalTexture(
  heightField: Float32Array,
  w: number,
  h: number,
  strength: number,
  wrapS: THREE.Wrapping = THREE.RepeatWrapping,
  wrapT: THREE.Wrapping = THREE.RepeatWrapping
): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ym = (y - 1 + h) % h;
    const yp = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w;
      const xp = (x + 1) % w;

      const tl = heightField[ym * w + xm];
      const l = heightField[y * w + xm];
      const bl = heightField[yp * w + xm];
      const tr = heightField[ym * w + xp];
      const r = heightField[y * w + xp];
      const br = heightField[yp * w + xp];
      const t = heightField[ym * w + x];
      const b = heightField[yp * w + x];

      const dX = tr + 2 * r + br - (tl + 2 * l + bl);
      const dY = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dX * strength;
      let ny = dY * strength; // OpenGL +Y up
      let nz = 1.0;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1.0);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * w + x) * 4;
      data[idx] = clampByte((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function scalarToRoughnessTexture(
  roughField: Float32Array,
  w: number,
  h: number,
  wrapS: THREE.Wrapping = THREE.RepeatWrapping,
  wrapT: THREE.Wrapping = THREE.RepeatWrapping
): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const val = clampByte(roughField[i] * 255);
    const idx = i * 4;
    data[idx] = val;
    data[idx + 1] = val;
    data[idx + 2] = val;
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function applyAnisotropy(set: PBRTextureSet, maxAniso: number, repeatX = 1, repeatY = 1): PBRTextureSet {
  for (const t of [set.map, set.normalMap, set.roughnessMap]) {
    t.anisotropy = maxAniso;
    if (repeatX !== 1 || repeatY !== 1) {
      t.repeat.set(repeatX, repeatY);
    }
  }
  return set;
}

// ==================== ENVIRONMENT PBR GENERATORS ====================

/**
 * Parede degradada de escola noturna:
 * Reboco poroso com fissuras, barra institucional verde-escola descascando,
 * manchas escuras de infiltração do teto, marcas de carteira e rodapé encardido.
 */
export function createSchoolWallPBR(aniso = 4): PBRTextureSet {
  const w = 512;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const plasterMacro = fbmTile(u, v, 4, 4, 4, 11);
      const plasterFine = fbmTile(u, v, 32, 32, 3, 29);
      const warp = (plasterMacro - 0.5) * 0.08;

      // Vazamento/infiltração escorrendo de cima e umidade subindo do rodapé
      const streakNoise = fbmTile(u * 2.2, v * 0.35, 12, 2, 4, 53);
      const topLeak = Math.max(0, 1 - v * 2.4) * Math.pow(streakNoise, 2.2) * 1.45;
      const bottomDamp = Math.max(0, (v - 0.82) / 0.18) * (0.55 + 0.65 * fbmTile(u, v, 8, 4, 3, 71));

      // Trincas finas no reboco
      const crackField = Math.abs(fbmTile(u + warp, v - warp, 6, 6, 4, 97) - 0.5);
      const crack = crackField < 0.011 ? (0.011 - crackField) / 0.011 : 0;

      // Divisão barra impermeável institucional (v > 0.615) + descascados na tinta!
      const dadoLine = 0.615 + (plasterFine - 0.5) * 0.004;
      const isDado = v > dadoLine;
      const isStripe = Math.abs(v - dadoLine) < 0.009;

      // Descascado de tinta expondo o reboco cinza escuro por baixo
      const peelMask = fbmTile(u, v, 10, 10, 4, 131);
      const peeled = isDado && peelMask > 0.74 && v < 0.78;

      let r: number, g: number, b: number;
      let height = 0.52 + (plasterFine - 0.5) * 0.16 + (plasterMacro - 0.5) * 0.12;
      let rough = 0.9;

      if (isStripe) {
        r = 31;
        g = 40;
        b = 34;
        height += 0.12;
        rough = 0.62;
      } else if (isDado && !peeled) {
        // Tinta a óleo verde-escola envelhecida e manchada
        const mottling = (plasterMacro - 0.5) * 26 + (plasterFine - 0.5) * 14;
        r = 58 + mottling * 0.7;
        g = 78 + mottling;
        b = 65 + mottling * 0.8;
        height += 0.08; // Camada de tinta espessa
        rough = 0.58 + (plasterFine - 0.5) * 0.16;

        // Riscos horizontais de carteiras batendo na parede (v ~ 0.76)
        const scuffBand = Math.exp(-((v - 0.77) ** 2) / 0.0012);
        const scuffNoise = fbmTile(u, v, 24, 6, 3, 181);
        if (scuffBand * scuffNoise > 0.42) {
          r *= 0.58;
          g *= 0.58;
          b *= 0.58;
          rough = 0.88;
          height -= 0.04;
        }
      } else {
        // Reboco creme-acinzentado sujo (ou cimento cru onde descascou)
        if (peeled) {
          r = 92 + (plasterFine - 0.5) * 24;
          g = 94 + (plasterFine - 0.5) * 24;
          b = 89 + (plasterFine - 0.5) * 24;
          height -= 0.09;
          rough = 0.96;
        } else {
          const stain = (plasterMacro - 0.5) * 34 + (plasterFine - 0.5) * 18;
          r = 166 + stain;
          g = 168 + stain;
          b = 154 + stain * 0.9;
          rough = 0.88 + (plasterFine - 0.5) * 0.1;
        }
      }

      // Aplica infiltração escura e limo
      const grime = Math.min(0.78, topLeak * 0.75 + bottomDamp * 0.68);
      if (grime > 0.01) {
        r = r * (1 - grime) + 22 * grime;
        g = g * (1 - grime) + 27 * grime;
        b = b * (1 - grime) + 21 * grime;
        rough = Math.max(0.28, rough - grime * 0.42); // Parede úmida reflete a lanterna!
      }

      if (crack > 0) {
        r *= 1 - crack * 0.68;
        g *= 1 - crack * 0.68;
        b *= 1 - crack * 0.68;
        height -= crack * 0.32;
        rough = 0.98;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = Math.max(0, Math.min(1, height));
      rf[i] = Math.max(0.15, Math.min(1, rough));
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = heightToNormalTexture(hf, w, h, 2.6, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso);
}

/**
 * Piso Granilite Escolar Brasileiro:
 * Pedrinhas minerais em matriz cimentícia, juntas plásticas escuras em baixo-relevo,
 * encardido de sapatos e reflexo encerado irregular.
 */
export function createFloorPBR(aniso = 4): PBRTextureSet {
  const w = 512;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      // Placas 4x4 por textura
      const tileX = (x % 128);
      const tileY = (y % 128);
      const jointDist = Math.min(tileX, 128 - tileX, tileY, 128 - tileY);

      const dirtMacro = fbmTile(u, v, 4, 4, 3, 211);
      const waxPatch = fbmTile(u, v, 6, 6, 2, 241);
      const chipF1 = worleyTileFast(u, v, 48, 48, 17);
      const chipId = worleyOutId;
      const fineF1 = worleyTileFast(u, v, 96, 96, 43);
      const fineId = worleyOutId;

      let r = 54 + (dirtMacro - 0.5) * 20;
      let g = 56 + (dirtMacro - 0.5) * 20;
      let b = 59 + (dirtMacro - 0.5) * 18;
      let height = 0.58 + (dirtMacro - 0.5) * 0.05;
      let rough = 0.42 + (1 - waxPatch) * 0.34;

      // Pedrinhas minerais de granilite (quartzo claro, basalto escuro, ocre)
      if (chipF1 < 0.36) {
        if (chipId < 0.38) {
          r = 24;
          g = 26;
          b = 30;
          rough = 0.28;
        } else if (chipId < 0.78) {
          r = 128;
          g = 129;
          b = 122;
          rough = 0.24;
        } else {
          r = 96;
          g = 86;
          b = 74;
          rough = 0.32;
        }
        height += 0.035;
      } else if (fineF1 < 0.3) {
        const delta = fineId > 0.5 ? 28 : -18;
        r += delta;
        g += delta;
        b += delta;
      }

      // Manchas escuras de sola de tênis / sujeira úmida
      if (dirtMacro < 0.36) {
        const darken = (0.36 - dirtMacro) * 1.4;
        r *= 1 - darken * 0.55;
        g *= 1 - darken * 0.55;
        b *= 1 - darken * 0.55;
        rough = Math.min(0.88, rough + darken * 0.35);
      }

      // Juntas profundas de dilatação do granilite
      if (jointDist < 2.2) {
        const jf = 1 - jointDist / 2.2;
        r = r * (1 - jf * 0.8) + 12 * jf;
        g = g * (1 - jf * 0.8) + 13 * jf;
        b = b * (1 - jf * 0.8) + 15 * jf;
        height -= jf * 0.42;
        rough = 0.92;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = Math.max(0, Math.min(1, height));
      rf[i] = Math.max(0.14, Math.min(0.96, rough));
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = heightToNormalTexture(hf, w, h, 2.4);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso, 4, 4);
}

/**
 * Forro mineral acústico manchado com goteiras e perfis metálicos oxidados
 */
export function createCeilingPBR(aniso = 4): PBRTextureSet {
  const w = 256;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const tx = x % 128;
      const ty = y % 128;
      const border = Math.min(tx, 128 - tx, ty, 128 - ty);

      const stain = fbmTile(u, v, 3, 3, 4, 307);
      const pinholeF1 = worleyTileFast(u, v, 64, 64, 313);

      let r = 122 + (stain - 0.5) * 26;
      let g = 124 + (stain - 0.5) * 26;
      let b = 118 + (stain - 0.5) * 24;
      let height = 0.55;
      let rough = 0.94;

      // Furos acústicos escuros
      if (pinholeF1 < 0.19) {
        r *= 0.62;
        g *= 0.62;
        b *= 0.62;
        height -= 0.22;
      }

      // Halo amarelado/marrom de infiltração antiga no forro
      if (stain > 0.62) {
        const leak = (stain - 0.62) / 0.38;
        const ring = Math.sin(leak * Math.PI);
        r = r * (1 - leak * 0.55) + 68 * leak - ring * 18;
        g = g * (1 - leak * 0.62) + 54 * leak - ring * 20;
        b = b * (1 - leak * 0.72) + 36 * leak - ring * 22;
      }

      // Perfil T metálico enferrujado entre placas
      if (border < 3) {
        const rust = fbmTile(u, v, 16, 16, 2, 331);
        r = 58 + rust * 36;
        g = 56 + rust * 18;
        b = 54 + rust * 10;
        height += 0.25;
        rough = 0.52 + rust * 0.3;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = Math.max(0, Math.min(1, height));
      rf[i] = rough;
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.2);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso, 5, 5);
}

/**
 * Madeira escolar envernizada gasta, com veios orgânicos, nós e riscos de caneta/compasso
 */
export function createWoodPBR(darkVariant = false, aniso = 4): PBRTextureSet {
  const w = 512;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  const baseR = darkVariant ? 48 : 108;
  const baseG = darkVariant ? 31 : 72;
  const baseB = darkVariant ? 20 : 42;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const warp = fbmTile(u, v, 3, 6, 4, 401) * 0.18;
      const rings = Math.sin((v * 26 + warp * 18) * Math.PI * 2);
      const fiber = fbmTile(u, v, 48, 8, 3, 419);
      const wear = fbmTile(u, v, 5, 5, 3, 433);

      // Riscos finos entalhados na madeira
      const scratchField = Math.abs(fbmTile(u * 1.3 + v * 0.35, v * 1.1, 14, 14, 3, 449) - 0.5);
      const scratch = !darkVariant && scratchField < 0.006 ? (0.006 - scratchField) / 0.006 : 0;

      const grain = rings * 0.5 + 0.5;
      const tone = 0.72 + grain * 0.34 + (fiber - 0.5) * 0.22;

      let r = baseR * tone;
      let g = baseG * tone;
      let b = baseB * tone;
      let height = 0.5 + grain * 0.14 + fiber * 0.1;
      let rough = 0.44 + (1 - wear) * 0.28 + (1 - grain) * 0.1;

      // Manchas escuras de uso/mãos
      if (wear < 0.35) {
        const d = (0.35 - wear) * 1.2;
        r *= 1 - d * 0.45;
        g *= 1 - d * 0.45;
        b *= 1 - d * 0.45;
        rough += d * 0.22;
      }

      if (scratch > 0) {
        // Madeira crua mais clara no sulco riscado
        r = r * (1 - scratch * 0.6) + 158 * scratch * 0.6;
        g = g * (1 - scratch * 0.6) + 124 * scratch * 0.6;
        b = b * (1 - scratch * 0.6) + 84 * scratch * 0.6;
        height -= scratch * 0.35;
        rough = 0.92;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = Math.max(0, Math.min(1, height));
      rf[i] = Math.max(0.22, Math.min(0.95, rough));
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.1);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso);
}

/**
 * Chapa de aço escolar oxidada e arranhada (armários do corredor, caixas elétricas, travas)
 */
export function createLockerMetalPBR(aniso = 4): PBRTextureSet {
  const w = 256;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const grime = fbmTile(u, v, 6, 6, 4, 503);
      const rustMask = fbmTile(u, v, 10, 10, 4, 521);
      const brush = fbmTile(u, v, 4, 48, 2, 541);

      let r = 52 + (grime - 0.5) * 18 + (brush - 0.5) * 8;
      let g = 64 + (grime - 0.5) * 18 + (brush - 0.5) * 8;
      let b = 76 + (grime - 0.5) * 18 + (brush - 0.5) * 8;
      let height = 0.52 + (brush - 0.5) * 0.06;
      let rough = 0.46 + grime * 0.26;

      // Venezianas de ventilação estampadas na porta do armário
      const inLouvers = u > 0.22 && u < 0.78 && ((v > 0.12 && v < 0.24) || (v > 0.76 && v < 0.86));
      if (inLouvers) {
        const slot = (y % 12) / 12;
        if (slot < 0.45) {
          r *= 0.28;
          g *= 0.28;
          b *= 0.28;
          height -= 0.35;
          rough = 0.9;
        } else if (slot < 0.7) {
          r *= 1.18;
          g *= 1.18;
          b *= 1.18;
          height += 0.22;
        }
      }

      // Borda rebaixada da porta do armário
      const edge = Math.min(u, 1 - u, v, 1 - v);
      if (edge < 0.035) {
        r *= 0.55;
        g *= 0.55;
        b *= 0.55;
        height -= 0.25;
      }

      // Ferrugem nas bordas e base
      const rustChance = rustMask + (1 - edge * 6) * 0.22 + Math.max(0, v - 0.75) * 0.65;
      if (rustChance > 0.78) {
        const rfct = Math.min(1, (rustChance - 0.78) * 4.2);
        r = r * (1 - rfct) + 112 * rfct;
        g = g * (1 - rfct) + 52 * rfct;
        b = b * (1 - rfct) + 28 * rfct;
        rough = 0.88;
        height -= rfct * 0.12;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = Math.max(0, Math.min(1, height));
      rf[i] = Math.max(0.22, Math.min(0.95, rough));
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.8, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso);
}

/**
 * Asfalto molhado do pátio externo com poças espelhadas refletindo o poste de sódio e relâmpagos
 */
export function createWetAsphaltPBR(aniso = 4): PBRTextureSet {
  const w = 256;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const puddleMask = fbmTile(u, v, 3, 3, 4, 601);
      const gravel = fbmTile(u, v, 48, 48, 2, 617);
      const isPuddle = puddleMask > 0.56;

      let r = 20 + gravel * 18;
      let g = 23 + gravel * 18;
      let b = 29 + gravel * 20;
      let height = 0.4 + gravel * 0.32;
      let rough = 0.58 + gravel * 0.24;

      if (isPuddle) {
        // Água parada nivela o relevo e derruba a rugosidade (espelho de chuva!)
        const depth = Math.min(1, (puddleMask - 0.56) * 4.5);
        r *= 1 - depth * 0.35;
        g *= 1 - depth * 0.32;
        b *= 1 - depth * 0.25;
        height = height * (1 - depth) + 0.5 * depth;
        rough = rough * (1 - depth) + 0.06 * depth;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = height;
      rf[i] = rough;
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.2);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso, 4, 5);
}

/**
 * Muro externo de blocos de concreto úmidos com musgo escuro
 */
export function createExteriorWallPBR(aniso = 4): PBRTextureSet {
  const w = 256;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const row = Math.floor(y / 32);
    const by = y % 32;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;
      const bx = (x + (row % 2) * 32) % 64;

      const mortar = bx < 3 || by < 3;
      const damp = fbmTile(u, v, 5, 5, 4, 653);
      const grain = fbmTile(u, v, 32, 32, 2, 677);

      let r = 42 + grain * 22 - damp * 14;
      let g = 46 + grain * 22 - damp * 10;
      let b = 52 + grain * 22 - damp * 12;
      let height = 0.6 + grain * 0.18;
      let rough = 0.85 - damp * 0.25;

      // Musgo escuro na base do muro
      if (v > 0.65 && damp > 0.48) {
        const moss = ((v - 0.65) / 0.35) * damp;
        r = r * (1 - moss) + 20 * moss;
        g = g * (1 - moss) + 38 * moss;
        b = b * (1 - moss) + 22 * moss;
      }

      if (mortar) {
        r *= 0.55;
        g *= 0.55;
        b *= 0.55;
        height = 0.22;
        rough = 0.96;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = height;
      rf[i] = rough;
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.8);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso, 4, 2);
}

/**
 * Persiana escolar encardida com lâminas horizontais em relevo 3D
 */
export function createBlindsPBR(aniso = 4): PBRTextureSet {
  const w = 256;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const slatPhase = (y % 8) / 8;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const dust = fbmTile(u, v, 6, 6, 3, 701);
      const cord = Math.abs(u - 0.18) < 0.008 || Math.abs(u - 0.82) < 0.008;

      const shade = 0.72 + Math.sin(slatPhase * Math.PI) * 0.28;
      let r = (176 - dust * 32) * shade;
      let g = (172 - dust * 32) * shade;
      let b = (158 - dust * 34) * shade;
      let height = slatPhase < 0.14 ? 0.18 : 0.45 + slatPhase * 0.45;
      let rough = 0.68 + dust * 0.22;

      if (cord) {
        r = 120;
        g = 114;
        b = 102;
        height = 0.92;
        rough = 0.88;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;
      hf[i] = height;
      rf[i] = rough;
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 3.0);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso, 2, 3);
}

/**
 * Vidro embaçado de chuva noturna com filetes d'água escorrendo + mapa normal de refração
 */
export function createRainGlassPBR(): {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
} {
  const w = 256;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = 'rgba(105, 132, 152, 0.24)';
  ctx.fillRect(0, 0, w, h);

  // Embaçado nos cantos do vidro frio
  const vig = ctx.createRadialGradient(128, 128, 45, 128, 128, 175);
  vig.addColorStop(0, 'rgba(15, 22, 28, 0)');
  vig.addColorStop(1, 'rgba(165, 185, 198, 0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const hf = new Float32Array(w * h).fill(0.5);

  // Gotas e trilhas de chuva escorrendo
  let seed = 881;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 210; i++) {
    const rx = Math.floor(rand() * w);
    const ry = Math.floor(rand() * h);
    const len = Math.floor(10 + rand() * 38);
    ctx.strokeStyle = `rgba(215, 235, 250, ${0.14 + rand() * 0.28})`;
    ctx.lineWidth = 1 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 2, ry + len);
    ctx.stroke();

    for (let step = 0; step < len; step++) {
      const py = (ry + step) % h;
      const px = (rx - Math.floor((step * 2) / len) + w) % w;
      hf[py * w + px] = 0.88;
      if (px + 1 < w) hf[py * w + px + 1] = 0.72;
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.4);
  return { map, normalMap };
}

// ==================== CHARACTER SLASHER / 1974 GRITTY PBR GENERATORS ====================

/**
 * Tecido pesado de paletó surrado (lã/tweed escuro com trama têxtil, vincos profundos,
 * poeira de giz e respingos escuros de lama/chuva na barra — inspirado em TCM 1974)
 */
export function createWornSuitPBR(baseHex: number, seed = 1): PBRTextureSet {
  const w = 128;
  const h = 128;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  const [br, bg, bb] = hexToRgb(baseHex);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      // Trama cruzada de lã grossa
      const weave = ((x + y) % 3 === 0 ? 0.08 : -0.04) + ((x - y + 256) % 4 === 0 ? 0.06 : 0);
      // Vincos pesados diagonais de roupa amassada
      const foldWarp = fbmTile(u, v, 4, 4, 3, 900 + seed);
      const crease1 = Math.sin((u * 5 + v * 3 + foldWarp * 1.8) * Math.PI * 2);
      const crease2 = Math.sin((u * 3 - v * 6 + foldWarp * 1.4) * Math.PI * 2);
      const folds = crease1 * 0.55 + crease2 * 0.45;

      const grime = fbmTile(u, v, 8, 8, 4, 940 + seed);
      const sweat = fbmTile(u, v, 3, 3, 3, 970 + seed);

      const shade = 0.78 + folds * 0.18 + weave + (grime - 0.5) * 0.28;
      let r = br * shade;
      let g = bg * shade;
      let b = bb * shade;

      // Poeira esbranquiçada / giz / mofo seco nos ombros e mangas
      if (grime > 0.68) {
        const dust = (grime - 0.68) * 1.6;
        r += dust * 38;
        g += dust * 36;
        b += dust * 32;
      }

      // Manchas escuras oleosas / chuva na barra
      if (sweat < 0.34 || v > 0.8) {
        const wet = Math.max(0, 0.36 - sweat) * 1.4 + Math.max(0, v - 0.8) * 1.8;
        r *= 1 - Math.min(0.6, wet * 0.45);
        g *= 1 - Math.min(0.6, wet * 0.45);
        b *= 1 - Math.min(0.6, wet * 0.45);
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;

      hf[i] = Math.max(0, Math.min(1, 0.5 + folds * 0.24 + weave * 0.8));
      rf[i] = Math.max(0.45, Math.min(0.98, 0.88 - (sweat < 0.32 ? 0.25 : 0) + weave * 0.3));
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.8);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return { map, normalMap, roughnessMap };
}

/**
 * Camisa social encardida, amarrotada e manchada de suor/ferrugem
 * (Exatamente a estética visceral da camisa branca surrada da foto de referência!)
 */
export function createStainedShirtPBR(seed = 1): PBRTextureSet {
  const w = 256;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const warp = fbmTile(u, v, 5, 5, 4, 1010 + seed);
      // Dobras horizontais e diagonais de tensão na barriga/peito
      const tensionFold = Math.sin((v * 7 + (u - 0.5) * 3.5 + warp * 2.2) * Math.PI * 2);
      const fineWrinkle = fbmTile(u, v, 20, 14, 3, 1033 + seed);
      const stain = fbmTile(u, v, 6, 6, 4, 1061 + seed);

      const clothShade = 0.82 + tensionFold * 0.14 + (fineWrinkle - 0.5) * 0.16;
      // Base branco-osso acinzentado/amarelado de filme 16mm
      let r = 204 * clothShade;
      let g = 199 * clothShade;
      let b = 186 * clothShade;
      let rough = 0.82;

      // Manchas de suor amarelado/marrom escuro e respingos secos
      if (stain > 0.55) {
        const s = (stain - 0.55) / 0.45;
        r = r * (1 - s * 0.48) + 88 * s * 0.48;
        g = g * (1 - s * 0.56) + 68 * s * 0.56;
        b = b * (1 - s * 0.64) + 52 * s * 0.64;
        rough = 0.62;
      }

      // Carcela central e botões escuros da camisa
      if (Math.abs(u - 0.5) < 0.022) {
        r *= 0.88;
        g *= 0.88;
        b *= 0.88;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;

      hf[i] = Math.max(0, Math.min(1, 0.5 + tensionFold * 0.28 + (fineWrinkle - 0.5) * 0.2));
      rf[i] = rough;
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 3.1);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return { map, normalMap, roughnessMap };
}

/**
 * Pele pálida cadavérica / couro gasto para mãos, pescoço, crânio e sapatos
 */
export function createGrittySkinPBR(skinHex: number, seed = 1): PBRTextureSet {
  const w = 128;
  const h = 128;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hf = new Float32Array(w * h);
  const rf = new Float32Array(w * h);

  const [sr, sg, sb] = hexToRgb(skinHex);
  const gray = sr * 0.35 + sg * 0.45 + sb * 0.2;
  const baseR = sr * 0.35 + gray * 0.62;
  const baseG = sg * 0.33 + gray * 0.61;
  const baseB = sb * 0.3 + gray * 0.58;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;

      const blotch = fbmTile(u, v, 5, 5, 3, 1103 + seed);
      const poreF1 = worleyTileFast(u, v, 36, 36, 1129 + seed);
      const veins = Math.abs(fbmTile(u, v, 9, 9, 3, 1151 + seed) - 0.5);

      const tone = 0.76 + blotch * 0.38 - (poreF1 < 0.22 ? 0.06 : 0);
      let r = baseR * tone;
      let g = baseG * tone;
      let b = baseB * tone;

      if (veins < 0.014) {
        const vf = (0.014 - veins) / 0.014;
        r *= 1 - vf * 0.32;
        g *= 1 - vf * 0.36;
        b *= 1 - vf * 0.24;
      }

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = 255;

      hf[i] = Math.max(0, Math.min(1, 0.55 + (blotch - 0.5) * 0.2 - (poreF1 < 0.22 ? 0.14 : 0)));
      rf[i] = Math.max(0.28, Math.min(0.88, 0.56 - blotch * 0.22));
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormalTexture(hf, w, h, 2.4);
  const roughnessMap = scalarToRoughnessTexture(rf, w, h);

  return { map, normalMap, roughnessMap };
}

const defaultFaceCache = new Map<
  string,
  { canvas: HTMLCanvasElement; heightField: Float32Array; roughField: Float32Array }
>();

/**
 * Desenha o rosto visceral estilo Slasher 1974 / Máscara Pálida Perturbadora em um canvas 256x256,
 * retornando também o heightmap para gerar Normal Map e Roughness Map reais em 3D!
 */
export function renderSlasherFaceBuffers(
  config: TeacherConfig,
  customPhoto?: HTMLImageElement | null
): {
  canvas: HTMLCanvasElement;
  heightField: Float32Array;
  roughField: Float32Array;
} {
  if (!customPhoto) {
    const hit = defaultFaceCache.get(config.id);
    if (hit) return hit;
  }

  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const hf = new Float32Array(size * size).fill(0.5);
  const rf = new Float32Array(size * size).fill(0.58);

  const seedMap: Record<string, number> = {
    marcos: 13,
    helena: 37,
    ricardo: 73,
    valdir: 109,
    celia: 149,
  };
  const seed = seedMap[config.id] ?? 19;

  if (customPhoto) {
    // Se o jogador enviou foto customizada, aplica tratamento granulado 16mm sombrio + vinheta orgânica!
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size * 0.45, size * 0.48, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const iw = customPhoto.width;
    const ih = customPhoto.height;
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.filter = 'contrast(1.28) saturate(0.42) brightness(0.86)';
    ctx.drawImage(customPhoto, (size - dw) / 2, (size - dh) / 2, dw, dh);
    ctx.filter = 'none';

    const vig = ctx.createRadialGradient(size / 2, size * 0.46, size * 0.16, size / 2, size / 2, size * 0.49);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.75, 'rgba(12,9,8,0.38)');
    vig.addColorStop(1, 'rgba(6,4,4,0.94)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;
    for (let i = 0; i < size * size; i++) {
      const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
      hf[i] = lum * 0.65 + 0.2;
      rf[i] = 0.42 + (1 - lum) * 0.4;
    }
    return { canvas: c, heightField: hf, roughField: rf };
  }

  // === SÍNTESE PIXEL-A-PIXEL DE ROSTO/MÁSCARA SLASHER ANOS 70 (ESTILO LEATHERFACE / VHS) ===
  const img = ctx.createImageData(size, size);
  const px = img.data;

  const [sr, sg, sb] = hexToRgb(config.skinColor);
  // Pele pálida acinzentada de cera/gesso gasto (como na referência em 16mm)
  const gray = sr * 0.35 + sg * 0.45 + sb * 0.2;
  const pallorR = gray * 0.78 + sr * 0.22 + 12;
  const pallorG = gray * 0.77 + sg * 0.2 + 9;
  const pallorB = gray * 0.74 + sb * 0.18 + 4;

  // Assimetria sutil específica de cada personagem para aspecto perturbador ("uncanny")
  const eyeAsym = config.id === 'marcos' ? 0.016 : config.id === 'ricardo' ? -0.018 : 0.01;
  const mouthOpen =
    config.id === 'marcos'
      ? 0.058
      : config.id === 'helena'
        ? 0.044
        : config.id === 'ricardo'
          ? 0.05
          : 0.036;

  for (let y = 0; y < size; y++) {
    const v = y / size; // 0 topo .. 1 queixo
    const ny = (v - 0.5) * 2; // -1 .. +1
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const nx = (u - 0.5) * 2;
      const i = y * size + x;

      // Máscara elíptica com borda irregular (como couro/pele esticada ou sombra profunda do cabelo)
      const warpEdge = (fbmTile(u, v, 7, 7, 2, seed + 5) - 0.5) * 0.09;
      const rx0 = nx / 0.9;
      const ry0 = ny / 0.96;
      const rad = Math.sqrt(rx0 * rx0 + ry0 * ry0) + warpEdge;
      if (rad > 1.0) {
        px[i * 4 + 3] = 0;
        continue;
      }

      const macro = fbmTile(u, v, 5, 5, 3, seed + 17);
      const blotch = fbmTile(u, v, 11, 11, 3, seed + 41);
      const poreF1 = worleyTileFast(u, v, 48, 48, seed + 67);
      const grain16mm = (hash2(x, y, seed + 99) - 0.5) * 24;

      // Topografia anatômica 3D: maçãs do rosto fundas, arco superciliar pesado, cana do nariz torta
      const browRidge = Math.exp(-((v - 0.34) ** 2) / 0.0022) * (1 - nx * nx * 0.7);
      const noseBridge =
        Math.exp(-((u - 0.5 - (v - 0.45) * 0.03) ** 2) / 0.0028) *
        (v > 0.34 && v < 0.61 ? 1 : 0);
      const noseTip = Math.exp(-((u - 0.5) ** 2 + (v - 0.58) ** 2) / 0.0035);
      const nostL = Math.exp(-((u - 0.455) ** 2 + (v - 0.605) ** 2) / 0.00045);
      const nostR = Math.exp(-((u - 0.545) ** 2 + (v - 0.605) ** 2) / 0.00045);

      // Cavidades oculares fundas, escuras e assimétricas!
      const elx = (u - 0.345) / 0.095;
      const ely = (v - (0.415 - eyeAsym)) / 0.062;
      const erx = (u - 0.655) / 0.092;
      const ery = (v - (0.415 + eyeAsym)) / 0.066;
      const eyeSocketL = Math.max(0, 1 - Math.sqrt(elx * elx + ely * ely));
      const eyeSocketR = Math.max(0, 1 - Math.sqrt(erx * erx + ery * ery));
      const socket = Math.max(eyeSocketL, eyeSocketR);

      // Covas cadavéricas abaixo das maçãs do rosto (gaunt cheeks)
      const gauntL = Math.exp(-((u - 0.26) ** 2 / 0.007 + (v - 0.66) ** 2 / 0.014));
      const gauntR = Math.exp(-((u - 0.74) ** 2 / 0.007 + (v - 0.66) ** 2 / 0.014));
      const gaunt = Math.max(gauntL, gauntR);

      // Sulcos nasolabiais profundos + costuras/cicatrizes na pele!
      const foldL = Math.exp(-((u - (0.42 - (v - 0.56) * 0.38)) ** 2) / 0.00035) * (v > 0.55 && v < 0.8 ? 1 : 0);
      const foldR = Math.exp(-((u - (0.58 + (v - 0.56) * 0.38)) ** 2) / 0.00035) * (v > 0.55 && v < 0.8 ? 1 : 0);

      // Costura / fissura diagonal sinistra estilo máscara de couro cru
      const seamLine = Math.abs(u - (0.24 + v * 0.22 + (blotch - 0.5) * 0.03));
      const seam = seamLine < 0.006 && v > 0.22 && v < 0.78 ? (0.006 - seamLine) / 0.006 : 0;

      // Boca entreaberta distorcida e escura (igual à expressão da foto de referência!)
      const mouthCurve = 0.755 + Math.sin((u - 0.5) * 7) * 0.008;
      const mdx = (u - 0.5) / 0.145;
      const mdy = (v - mouthCurve) / mouthOpen;
      const mouthDist = Math.sqrt(mdx * mdx + mdy * mdy);
      const inMouth = mouthDist < 1.0;
      const lipRing = mouthDist >= 0.82 && mouthDist < 1.32;

      let height =
        0.52 +
        browRidge * 0.16 +
        noseBridge * 0.22 +
        noseTip * 0.18 -
        (nostL + nostR) * 0.28 -
        socket * 0.38 -
        gaunt * 0.16 -
        (foldL + foldR) * 0.14 -
        seam * 0.26 +
        (blotch - 0.5) * 0.1 -
        (poreF1 < 0.2 ? 0.06 : 0);

      // Iluminação chiaroscuro de filme de terror 16mm embutida no albedo
      const shade =
        0.72 +
        (macro - 0.5) * 0.34 +
        (blotch - 0.5) * 0.28 +
        browRidge * 0.14 +
        noseBridge * 0.16 -
        gaunt * 0.34 -
        (foldL + foldR) * 0.28;

      let r = pallorR * shade;
      let g = pallorG * shade;
      let b = pallorB * shade;
      let rough = 0.52 - browRidge * 0.16 - noseTip * 0.18 + gaunt * 0.22;

      // Manchas arroxeadas/terrosas de exaustão e sujeira
      if (blotch < 0.36) {
        const dirt = (0.36 - blotch) * 1.5;
        r *= 1 - dirt * 0.38;
        g *= 1 - dirt * 0.44;
        b *= 1 - dirt * 0.42;
      }

      if (seam > 0) {
        r = r * (1 - seam * 0.75) + 38 * seam;
        g = g * (1 - seam * 0.78) + 18 * seam;
        b = b * (1 - seam * 0.78) + 16 * seam;
        // Pontos transversais sutis de sutura/ruga
        if (Math.floor(v * 95) % 3 === 0) {
          r *= 0.65;
          g *= 0.65;
          b *= 0.65;
        }
      }

      // Narinas escuras
      const nost = Math.min(1, (nostL + nostR) * 1.2);
      if (nost > 0.1) {
        r *= 1 - nost * 0.85;
        g *= 1 - nost * 0.85;
        b *= 1 - nost * 0.85;
      }

      // Cavidades oculares negras profundas com minúsculo reflexo vítreo lá no fundo
      if (socket > 0.02) {
        const dark = Math.min(1, Math.pow(socket, 0.75) * 1.18);
        r = r * (1 - dark) + 10 * dark;
        g = g * (1 - dark) + 8 * dark;
        b = b * (1 - dark) + 9 * dark;
        rough = 0.92;

        // Pequena esclera suja / íris perdida no breu da órbita
        const plx = u - 0.35;
        const ply = v - (0.418 - eyeAsym);
        const prx = u - 0.65;
        const pry = v - (0.418 + eyeAsym);
        const pDist = Math.sqrt(Math.min(plx * plx + ply * ply, prx * prx + pry * pry));
        if (pDist < 0.028 && pDist > 0.013) {
          r += 58;
          g += 54;
          b += 46;
          rough = 0.18;
        } else if (pDist <= 0.013) {
          r = 6;
          g = 5;
          b = 5;
          rough = 0.08;
        }
      }

      // Bigode espesso sombrio do Coordenador Valdir
      if (config.id === 'valdir') {
        const must =
          Math.exp(-((u - 0.5) ** 2 / 0.018 + (v - 0.685) ** 2 / 0.0014)) *
          (0.75 + blotch * 0.5);
        if (must > 0.25) {
          const mf = Math.min(1, must);
          r = r * (1 - mf * 0.82) + 22 * mf;
          g = g * (1 - mf * 0.82) + 19 * mf;
          b = b * (1 - mf * 0.82) + 18 * mf;
          height += mf * 0.12;
          rough = 0.92;
        }
      }

      // Lábios ressecados/escuros (ou batom borrado escuro em Helena/Célia) + boca escura aberta
      if (lipRing) {
        const lipTone = config.isFemale ? [58, 22, 26] : [54, 36, 34];
        const lf = 0.65 + (poreF1 < 0.25 ? 0.25 : 0);
        r = r * (1 - lf) + lipTone[0] * lf;
        g = g * (1 - lf) + lipTone[1] * lf;
        b = b * (1 - lf) + lipTone[2] * lf;
        // Rachaduras verticais nos lábios
        if (Math.floor(u * 140) % 4 === 0) {
          r *= 0.68;
          g *= 0.68;
          b *= 0.68;
          height -= 0.08;
        }
      }

      if (inMouth) {
        const depth = 1 - mouthDist;
        r = 14;
        g = 8;
        b = 9;
        height = 0.06;
        rough = 0.35;
        // Dentes amarelados irregulares aparecendo na penumbra superior da boca!
        if (v < mouthCurve - 0.004 && depth > 0.28 && Math.abs(u - 0.5) < 0.095) {
          const toothSlot = Math.floor((u - 0.4) * 95);
          const gap = ((u - 0.4) * 95) % 1;
          if (gap > 0.18 && toothSlot !== 4) {
            r = 142 - depth * 35;
            g = 132 - depth * 35;
            b = 104 - depth * 35;
            height = 0.28;
          }
        }
      }

      // Vinheta escura na borda para fundir perfeitamente com o crânio e o cabelo desgrenhado
      const edgeFade = Math.max(0, (rad - 0.72) / 0.28);
      const alpha = rad > 0.88 ? 1 - (rad - 0.88) / 0.12 : 1;
      r = r * (1 - edgeFade * 0.72) + 14 * edgeFade + grain16mm;
      g = g * (1 - edgeFade * 0.72) + 12 * edgeFade + grain16mm;
      b = b * (1 - edgeFade * 0.72) + 11 * edgeFade + grain16mm;

      const idx = i * 4;
      px[idx] = clampByte(r);
      px[idx + 1] = clampByte(g);
      px[idx + 2] = clampByte(b);
      px[idx + 3] = clampByte(alpha * 255);
      hf[i] = Math.max(0, Math.min(1, height));
      rf[i] = Math.max(0.12, Math.min(0.96, rough));
    }
  }

  ctx.putImageData(img, 0, 0);
  const res = { canvas: c, heightField: hf, roughField: rf };
  if (!customPhoto) {
    defaultFaceCache.set(config.id, res);
  }
  return res;
}

// Cache de retratos 16mm para o Dossiê e Conselho de Classe
const mugshotCache = new Map<string, string>();

/**
 * Gera uma fotografia granulada estilo filme 16mm anos 70 (inspirada diretamente na referência!)
 * com silhueta de paletó escuro, camisa manchada, gravata torta, cabelo desgrenhado e rosto pálido,
 * usada nos retratos do Dossiê e do Conselho de Classe quando não há foto enviada pelo jogador.
 */
export function getSlasherPortraitDataUrl(config: TeacherConfig): string {
  const cached = mugshotCache.get(config.id);
  if (cached) return cached;

  const w = 192;
  const h = 192;
  const [c, x] = makeCanvas(w, h);

  // Fundo nublado estourado e granulado estilo filme 16mm (como o céu esbranquiçado de TCM 1974!)
  const skyGrad = x.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#cfcBC2');
  skyGrad.addColorStop(0.65, '#9d988e');
  skyGrad.addColorStop(1, '#3b3935');
  x.fillStyle = skyGrad;
  x.fillRect(0, 0, w, h);

  // Silhueta esfumaçada do prédio escolar / árvores ao fundo
  x.fillStyle = 'rgba(42, 40, 37, 0.32)';
  x.fillRect(14, 78, 56, 114);
  x.fillRect(132, 92, 48, 100);

  // Ombros largos e paletó escuro aberto
  x.fillStyle = '#141416';
  x.beginPath();
  x.moveTo(16, 192);
  x.lineTo(26, 126);
  x.quadraticCurveTo(54, 112, 96, 114);
  x.quadraticCurveTo(138, 112, 166, 126);
  x.lineTo(176, 192);
  x.closePath();
  x.fill();

  // Camisa social clara amarrotada e manchada aberta no peito
  x.fillStyle = '#cbc6ba';
  x.beginPath();
  x.moveTo(68, 120);
  x.lineTo(124, 120);
  x.lineTo(116, 192);
  x.lineTo(74, 192);
  x.closePath();
  x.fill();

  // Gravata escura torta esvoaçando para o lado!
  x.fillStyle = '#1e191a';
  x.beginPath();
  x.moveTo(92, 124);
  x.lineTo(103, 124);
  x.lineTo(72, 168);
  x.lineTo(56, 160);
  x.closePath();
  x.fill();

  // Cabelo escuro desgrenhado selvagem ao redor da cabeça (silhueta icônica!)
  x.fillStyle = '#131214';
  const spikes = 22;
  for (let i = 0; i < spikes; i++) {
    const ang = Math.PI * 0.85 + (i / spikes) * Math.PI * 1.3;
    const rOut = 48 + ((i * 19) % 17);
    x.beginPath();
    x.ellipse(
      96 + Math.cos(ang) * 28,
      66 + Math.sin(ang) * 26,
      rOut * 0.42,
      11,
      ang + 0.3,
      0,
      Math.PI * 2
    );
    x.fill();
  }

  // Desenha o rosto pálido perturbadíssimo sintetizado!
  const { canvas: faceCanvas } = renderSlasherFaceBuffers(config, null);
  x.drawImage(faceCanvas, 52, 26, 88, 96);

  // Grão fotográfico pesado 16mm + riscos verticais de película + vinheta
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let py = 0; py < h; py++) {
    for (let pxIdx = 0; pxIdx < w; pxIdx++) {
      const idx = (py * w + pxIdx) * 4;
      const gNoise = (hash2(pxIdx, py, 777) - 0.5) * 42;
      // Dessatura levemente para tom sépia-frio documental
      const lum = d[idx] * 0.32 + d[idx + 1] * 0.48 + d[idx + 2] * 0.2;
      const vx = (pxIdx - w / 2) / (w / 2);
      const vy = (py - h / 2) / (h / 2);
      const vig = Math.max(0.32, 1 - (vx * vx + vy * vy) * 0.38);

      d[idx] = clampByte((lum * 0.78 + d[idx] * 0.24 + gNoise) * vig);
      d[idx + 1] = clampByte((lum * 0.77 + d[idx + 1] * 0.23 + gNoise) * vig);
      d[idx + 2] = clampByte((lum * 0.72 + d[idx + 2] * 0.22 + gNoise) * vig);
    }
  }
  x.putImageData(img, 0, 0);

  const url = c.toDataURL('image/jpeg', 0.86);
  mugshotCache.set(config.id, url);
  return url;
}

// ==================== LEGACY COMPAT + PROPS & DYNAMIC BOARDS ====================

export function createWoodTexture(): THREE.CanvasTexture {
  return createWoodPBR(false).map;
}

export function createSchoolWallTexture(): THREE.CanvasTexture {
  return createSchoolWallPBR().map;
}

export function createFloorTexture(): THREE.CanvasTexture {
  return createFloorPBR().map;
}

export function createCeilingTexture(): THREE.CanvasTexture {
  return createCeilingPBR().map;
}

export function createRainGlassTexture(): THREE.CanvasTexture {
  return createRainGlassPBR().map;
}

export function createNoticeBoardTexture(pin: string): THREE.CanvasTexture {
  const [c, x] = makeCanvas(512, 360);

  // Cortiça granulada envelhecida
  const img = x.createImageData(512, 360);
  const d = img.data;
  for (let py = 0; py < 360; py++) {
    for (let px = 0; px < 512; px++) {
      const i = (py * 512 + px) * 4;
      worleyTileFast(px / 512, py / 360, 72, 52, 811);
      const cellId = worleyOutId;
      const dark = fbmTile(px / 512, py / 360, 6, 6, 3, 823);
      const shade = (0.68 + cellId * 0.42) * (0.78 + dark * 0.32);
      d[i] = clampByte(132 * shade);
      d[i + 1] = clampByte(92 * shade);
      d[i + 2] = clampByte(54 * shade);
      d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);

  // Moldura de madeira gasta
  x.strokeStyle = '#26180d';
  x.lineWidth = 16;
  x.strokeRect(8, 8, 496, 344);

  // Sombra da folha
  x.fillStyle = 'rgba(0,0,0,0.42)';
  x.fillRect(36, 37, 235, 285);

  // Folha 1: Edital de Recuperação amarelado e manchado
  x.fillStyle = '#ded5be';
  x.fillRect(30, 30, 235, 285);
  x.fillStyle = '#751414';
  x.font = 'bold 19px Georgia';
  x.fillText('REGIMENTO NOTURNO', 44, 62);
  x.fillStyle = '#25221d';
  x.font = '15px Georgia';
  x.fillText('Art. 14 — Proibido celular', 44, 96);
  x.fillText('durante o plantão escolar.', 44, 118);
  x.fillText('Sujeito a retenção imediata', 44, 146);
  x.fillText('com Menção I no NSA.', 44, 168);

  // Carimbo borrado vermelho na folha
  x.save();
  x.translate(145, 248);
  x.rotate(-0.14);
  x.strokeStyle = 'rgba(138, 20, 20, 0.72)';
  x.lineWidth = 3;
  x.strokeRect(-72, -20, 144, 40);
  x.fillStyle = 'rgba(138, 20, 20, 0.72)';
  x.font = 'bold 16px monospace';
  x.textAlign = 'center';
  x.fillText('VIGENTE // 23H59', 0, 6);
  x.restore();

  // Post-it sujo e torto com a Senha Diária da Catraca!
  x.save();
  x.translate(375, 178);
  x.rotate(-0.08);
  x.fillStyle = 'rgba(0,0,0,0.42)';
  x.fillRect(-88, -82, 186, 178);
  x.fillStyle = '#d9c052';
  x.fillRect(-92, -88, 184, 176);

  // Tachinha enferrujada
  x.fillStyle = '#6e1717';
  x.beginPath();
  x.arc(0, -72, 7.5, 0, Math.PI * 2);
  x.fill();

  x.fillStyle = '#1b1913';
  x.font = 'bold 16px monospace';
  x.textAlign = 'center';
  x.fillText('PIN DA PORTARIA', 0, -34);
  x.fillText('TURNO DE HOJE:', 0, -10);
  x.fillStyle = '#780e0e';
  x.font = 'bold 46px monospace';
  x.fillText(pin, 0, 46);
  x.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPlaqueTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(512, 140);
  x.fillStyle = '#14171c';
  x.fillRect(0, 0, 512, 140);

  // Sujeira e oxidação nos cantos da placa esmaltada
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(95, 65, 42, ${Math.random() * 0.14})`;
    x.fillRect(Math.random() * 512, Math.random() * 140, 4, 3);
  }

  x.strokeStyle = '#7d838c';
  x.lineWidth = 5;
  x.strokeRect(6, 6, 500, 128);
  x.fillStyle = '#9e1924';
  x.fillRect(18, 18, 14, 104);

  x.fillStyle = '#dfd9cc';
  x.font = 'bold 30px Georgia';
  x.fillText('ETEC SEBRAE', 48, 58);
  x.fillStyle = '#97948c';
  x.font = '19px monospace';
  x.fillText('BLOCO B · SALA 04 · RECUPERAÇÃO', 48, 102);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class DynamicChalkboard {
  readonly texture: THREE.CanvasTexture;
  readonly normalMap: THREE.DataTexture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private slateBase: ImageData;
  private lastSignature = '';

  constructor() {
    const w = 1024;
    const h = 420;
    const [c, ctx] = makeCanvas(w, h);
    this.canvas = c;
    this.ctx = ctx;

    // Pré-sintetiza ardósia gasta com nuvens de pó de giz apagado + normal map de lousa!
    this.slateBase = ctx.createImageData(w, h);
    const hf = new Float32Array(w * h);
    const d = this.slateBase.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const i = y * w + x;
        const slate = fbmTile(u, v, 16, 8, 3, 1201);
        const chalkCloud = fbmTile(u, v, 5, 4, 4, 1223);
        const wipeArc = Math.sin(u * 18 + Math.sin(v * 9) * 1.6) * 0.5 + 0.5;
        const dust = Math.max(0, chalkCloud - 0.35) * (0.55 + wipeArc * 0.45);

        const r = 17 + slate * 10 + dust * 58;
        const g = 33 + slate * 12 + dust * 64;
        const b = 25 + slate * 10 + dust * 58;

        const idx = i * 4;
        d[idx] = clampByte(r);
        d[idx + 1] = clampByte(g);
        d[idx + 2] = clampByte(b);
        d[idx + 3] = 255;
        hf[i] = 0.5 + slate * 0.22 + dust * 0.12;
      }
    }

    this.normalMap = heightToNormalTexture(hf, w, h, 1.8, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.render('NOITE 01', 0, false, 0);
  }

  render(nightLabel: string, dangerLevel: number, valdirActive: boolean, taskProgress: number): void {
    const bucket = Math.floor(dangerLevel * 4);
    const sig = `${nightLabel}|${bucket}|${valdirActive ? 1 : 0}|${taskProgress}`;
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    const x = this.ctx;
    x.putImageData(this.slateBase, 0, 0);

    // Rascunhos fantasma de aula antiga quase apagada no canto
    x.fillStyle = 'rgba(210, 220, 208, 0.14)';
    x.font = 'italic 20px Georgia';
    x.textAlign = 'left';
    x.fillText('Chamada encerrada às 22h50 — Ausentes: retidos.', 48, 368);

    x.fillStyle = 'rgba(222, 228, 216, 0.76)';
    x.font = '22px Georgia';
    x.fillText(`ETEC SEBRAE — ${nightLabel}`, 44, 52);
    x.fillText(`Recuperação Noturna · Diário Aberto`, 44, 84);

    x.textAlign = 'center';
    if (valdirActive) {
      x.fillStyle = '#e04848';
      x.font = 'bold 56px Georgia';
      x.fillText('COMPAREÇA À COORDENAÇÃO!', 512, 205);
      x.font = '30px Georgia';
      x.fillStyle = '#dfd0a8';
      x.fillText('Acenda a LANTERNA [F] nesta lousa para dissipar!', 512, 268);
    } else if (dangerLevel > 0.65) {
      x.fillStyle = '#d94141';
      x.font = 'bold 62px Georgia';
      x.fillText('NÃO OLHE PARA A TELA.', 512, 205);
      x.font = '29px Georgia';
      x.fillStyle = '#d5dcd2';
      x.fillText('Eles já estão na porta ou na janela.', 512, 266);
    } else {
      x.fillStyle = '#d8dfd4';
      x.font = 'bold 54px Georgia';
      x.fillText('CELULAR GUARDADO.', 512, 198);
      x.fillStyle = '#c96862';
      x.font = '29px Georgia';
      x.fillText('Quem for pego na madrugada repete o semestre.', 512, 258);
    }

    x.textAlign = 'right';
    x.fillStyle = 'rgba(210, 220, 208, 0.65)';
    x.font = '21px monospace';
    x.fillText(`Sinal 190: ${taskProgress}%`, 980, 382);

    this.texture.needsUpdate = true;
  }
}

export class DynamicWallClock {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private lastMinute = -1;

  constructor() {
    const [c, ctx] = makeCanvas(256, 256);
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.update(0);
  }

  update(hoursFloat: number): void {
    const totalMinutes = Math.floor(hoursFloat * 60);
    if (totalMinutes === this.lastMinute) return;
    this.lastMinute = totalMinutes;

    const x = this.ctx;
    x.clearRect(0, 0, 256, 256);

    const dialGrad = x.createRadialGradient(128, 128, 30, 128, 128, 122);
    dialGrad.addColorStop(0, '#dcd4be');
    dialGrad.addColorStop(0.82, '#bfb499');
    dialGrad.addColorStop(1, '#7a705b');
    x.fillStyle = dialGrad;
    x.beginPath();
    x.arc(128, 128, 120, 0, Math.PI * 2);
    x.fill();

    x.lineWidth = 10;
    x.strokeStyle = '#1b1918';
    x.stroke();

    for (let i = 0; i < 12; i++) {
      const ang = (i * Math.PI) / 6 - Math.PI / 2;
      x.strokeStyle = '#1c1915';
      x.lineWidth = i % 3 === 0 ? 5 : 2.5;
      x.beginPath();
      x.moveTo(128 + Math.cos(ang) * 90, 128 + Math.sin(ang) * 90);
      x.lineTo(128 + Math.cos(ang) * 108, 128 + Math.sin(ang) * 108);
      x.stroke();
    }

    x.fillStyle = '#363128';
    x.font = 'bold 15px Georgia';
    x.textAlign = 'center';
    x.fillText('SEBRAE', 128, 86);

    const hAngle = ((hoursFloat % 12) / 12) * Math.PI * 2 - Math.PI / 2;
    const mAngle = ((totalMinutes % 60) / 60) * Math.PI * 2 - Math.PI / 2;

    x.strokeStyle = '#141312';
    x.lineWidth = 7;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(128, 128);
    x.lineTo(128 + Math.cos(hAngle) * 60, 128 + Math.sin(hAngle) * 60);
    x.stroke();

    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(128, 128);
    x.lineTo(128 + Math.cos(mAngle) * 88, 128 + Math.sin(mAngle) * 88);
    x.stroke();

    x.fillStyle = '#9e1c1c';
    x.beginPath();
    x.arc(128, 226, 6, 0, Math.PI * 2);
    x.fill();

    x.fillStyle = '#111';
    x.beginPath();
    x.arc(128, 128, 7, 0, Math.PI * 2);
    x.fill();

    this.texture.needsUpdate = true;
  }
}

// ==================== OUTLAST 2 SCHOOL CORRIDOR & WET FLOOR GENERATORS ====================

export interface WetFloorPBRSet extends PBRTextureSet {
  alphaMap: THREE.DataTexture;
}

/**
 * Parede institucional bicolor estilo Outlast 2 (St. Sybil School):
 * Parte superior em bloco/reboco cinza-ciano gelado com escorridos de infiltração do forro,
 * friso divisório em relevo e barra inferior em esmalte azul-ardósia escuro descascado.
 */
export function createOutlastCorridorWallPBR(aniso = 4): PBRTextureSet {
  const w = 512;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 = topo junto ao forro, 1 = piso
    const leak = Math.pow(Math.max(0, 1 - v * 2.6), 1.8);
    const isRail = v > 0.545 && v < 0.572;
    const isLower = v >= 0.572;
    const isBaseboard = v > 0.945;

    for (let x = 0; x < w; x++) {
      const u = x / w;
      const idx = y * w + x;

      const macro = fbmTile(u, v, 4, 4, 4, 911);
      const pores = fbmTile(u, v, 32, 32, 3, 937);
      const drip = fbmTile(u * 2.5, v * 0.4, 8, 2, 3, 953);

      // Juntas sutis de blocos de alvenaria sob a tinta institucional
      const bx = (u * 8) % 1;
      const row = Math.floor(v * 16);
      const bxOff = ((u * 8 + (row % 2) * 0.5) % 1);
      const by = (v * 16) % 1;
      const mortar =
        !isBaseboard && (bxOff < 0.025 || bxOff > 0.975 || by < 0.045 || by > 0.955) ? 1 : 0;

      let r = 104;
      let g = 114;
      let b = 120;
      let hVal = 0.52 + (pores - 0.5) * 0.16 - mortar * 0.16;
      let rVal = 0.86;

      if (isBaseboard) {
        r = 18;
        g = 21;
        b = 25;
        hVal = 0.64 + (pores - 0.5) * 0.05;
        rVal = 0.52;
      } else if (isRail) {
        r = 44;
        g = 54;
        b = 64;
        hVal = 0.78;
        rVal = 0.46;
      } else if (isLower) {
        // Barra esmalte azul-ardósia escuro com lascas de desgaste
        const chip = macro * 0.6 + pores * 0.4 > 0.77;
        if (chip) {
          r = 76;
          g = 82;
          b = 86;
          hVal -= 0.14;
          rVal = 0.92;
        } else {
          r = 34 + (macro - 0.5) * 14;
          g = 45 + (macro - 0.5) * 16;
          b = 56 + (macro - 0.5) * 18;
          rVal = 0.56 + (pores - 0.5) * 0.18;
        }
      } else {
        // Parte superior cinza-fria manchada de umidade
        const stain = leak * (0.45 + drip * 0.75);
        r = (112 + (macro - 0.5) * 26) * (1 - stain * 0.48) - mortar * 12;
        g = (121 + (macro - 0.5) * 26) * (1 - stain * 0.45) - mortar * 12;
        b = (126 + (macro - 0.5) * 24) * (1 - stain * 0.40) - mortar * 10;
        rVal = 0.88 - stain * 0.22;
      }

      height[idx] = Math.max(0, Math.min(1, hVal));
      rough[idx] = Math.max(0.15, Math.min(1, rVal));

      const p = idx * 4;
      px[p] = clampByte(r);
      px[p + 1] = clampByte(g);
      px[p + 2] = clampByte(b);
      px[p + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = heightToNormalTexture(height, w, h, 2.4, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);
  const roughnessMap = scalarToRoughnessTexture(rough, w, h, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);

  return applyAnisotropy({ map, normalMap, roughnessMap }, aniso, 4, 1);
}

/**
 * Piso escolar escuro encerado/molhado estilo Outlast 2:
 * Ladrilhos vinílicos cinza-chumbo com poças de reflexo especular e alphaMap
 * para mesclar com o espelho planar (THREE.Reflector) abaixo do piso!
 */
export function createOutlastLinoleumFloorPBR(
  aniso = 4,
  repeatX = 6,
  repeatY = 6
): WetFloorPBRSet {
  const w = 512;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const alphaData = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const idx = y * w + x;

      // Ladrilhos 4x4 por tile
      const tx = Math.floor(u * 4);
      const ty = Math.floor(v * 4);
      const fu = (u * 4) % 1;
      const fv = (v * 4) % 1;
      const seam = fu < 0.022 || fu > 0.978 || fv < 0.022 || fv > 0.978;

      const checker = (tx + ty) % 2 === 0 ? 1.0 : 0.91;
      const streak = fbmTile(u * 0.8, v * 2.2, 4, 8, 4, 1201);
      const puddleNoise = fbmTile(u, v, 3, 3, 4, 1249);
      const micro = fbmTile(u, v, 28, 28, 2, 1289);

      // Áreas enceradas/úmidas deixam passar mais do espelho planar abaixo (alpha menor = mais reflexo!)
      const wetness = Math.max(0, Math.min(1, (puddleNoise - 0.34) * 1.85));

      let base = (36 + streak * 16 + (micro - 0.5) * 8) * checker;
      if (seam) base *= 0.52;

      const r = base * (0.90 - wetness * 0.16);
      const g = base * (0.97 - wetness * 0.12);
      const b = base * (1.04 - wetness * 0.08);

      height[idx] = seam ? 0.28 : 0.54 + (micro - 0.5) * 0.08 * (1 - wetness * 0.7);
      rough[idx] = seam ? 0.88 : Math.max(0.06, 0.44 - wetness * 0.35 + (streak - 0.5) * 0.12);

      // Opacidade entre 0.70 (poça espelhada) e 0.91 (vinil fosco gasto)
      const alphaVal = clampByte((0.90 - wetness * 0.22) * 255);
      const p = idx * 4;
      px[p] = clampByte(r);
      px[p + 1] = clampByte(g);
      px[p + 2] = clampByte(b);
      px[p + 3] = 255;

      alphaData[p] = alphaVal;
      alphaData[p + 1] = alphaVal;
      alphaData[p + 2] = alphaVal;
      alphaData[p + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = heightToNormalTexture(height, w, h, 1.5);
  const roughnessMap = scalarToRoughnessTexture(rough, w, h);

  const alphaMap = new THREE.DataTexture(alphaData, w, h, THREE.RGBAFormat);
  alphaMap.wrapS = alphaMap.wrapT = THREE.RepeatWrapping;
  alphaMap.colorSpace = THREE.NoColorSpace;
  alphaMap.magFilter = THREE.LinearFilter;
  alphaMap.minFilter = THREE.LinearMipmapLinearFilter;
  alphaMap.generateMipmaps = true;
  alphaMap.anisotropy = aniso;
  alphaMap.repeat.set(repeatX, repeatY);
  alphaMap.needsUpdate = true;

  const baseSet = applyAnisotropy({ map, normalMap, roughnessMap }, aniso, repeatX, repeatY);
  return { ...baseSet, alphaMap };
}

/**
 * Cartaz institucional escolar manchado de umidade para o corredor.
 */
export function createPeelingPosterTexture(variant = 0): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 340);
  ctx.fillStyle = '#c8c3b4';
  ctx.fillRect(0, 0, 256, 340);

  // Manchas escuras de mofo e infiltração
  for (let i = 0; i < 28; i++) {
    const rx = ((i * 73 + variant * 41) % 240) + 8;
    const ry = ((i * 59 + variant * 29) % 320) + 10;
    const rad = 18 + (i % 5) * 14;
    const g = ctx.createRadialGradient(rx, ry, 2, rx, ry, rad);
    g.addColorStop(0, 'rgba(32, 36, 34, 0.24)');
    g.addColorStop(1, 'rgba(32, 36, 34, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx - rad, ry - rad, rad * 2, rad * 2);
  }

  ctx.strokeStyle = '#22282c';
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, 228, 312);

  ctx.fillStyle = variant % 2 === 0 ? '#1d2b36' : '#58181c';
  ctx.fillRect(22, 22, 212, 54);

  ctx.fillStyle = '#d8d4c8';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(variant % 2 === 0 ? 'AVISO ESCOLAR' : 'ROTA DE FUGA', 128, 56);

  ctx.fillStyle = '#242729';
  ctx.font = 'bold 15px sans-serif';
  const lines =
    variant % 2 === 0
      ? ['SILÊNCIO ABSOLUTO', 'APÓS AS 23H00', '', 'PROIBIDO PERMANECER', 'NOS CORREDORES', 'SEM AUTORIZAÇÃO']
      : ['BLOCO B — SALA 04', 'PORTÕES MAGNÉTICOS', 'TRAVADOS ÀS 23H59', '', 'EM CASO DE PÂNICO', 'CONTATE A SECRETARIA'];

  lines.forEach((ln, idx) => {
    ctx.fillText(ln, 128, 118 + idx * 28);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

