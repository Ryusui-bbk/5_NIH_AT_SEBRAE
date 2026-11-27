import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type MocapClipName = 'idle' | 'walk' | 'walkFem' | 'stalk' | 'retreat' | 'sprint';

export interface LoadedOutlastRigAssets {
  baseScene: THREE.Group;
  clips: Record<MocapClipName, THREE.AnimationClip>;
}

declare global {
  interface Window {
    __INLINE_GLBS__?: Record<string, string>;
  }
}

function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
  const binStr = atob(b64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes.buffer;
}

async function fetchGlbBuffer(fileName: string): Promise<ArrayBuffer> {
  const inline = window.__INLINE_GLBS__?.[fileName];
  if (inline) {
    return decodeBase64ToArrayBuffer(inline);
  }
  const resp = await fetch(`./models/${fileName}`);
  if (!resp.ok) {
    throw new Error(`Falha ao carregar modelo 3D ${fileName}: ${resp.status}`);
  }
  return resp.arrayBuffer();
}

/**
 * Remove deslocamento horizontal (root-motion Z/X) do osso Hips para que o loop de captura
 * de movimento rode perfeitamente no lugar (preservando o peso corporal Y e balanço lateral sutil),
 * enquanto o motor 3D move o personagem suavemente pelo cenário sem deslizar os pés.
 */
function makeClipInPlace(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const cloned = clip.clone();
  cloned.name = name;

  for (const track of cloned.tracks) {
    if (track.name.endsWith('Hips.position')) {
      const vals = track.values;
      if (vals.length >= 3) {
        const baseX = vals[0];
        const baseZ = vals[2];
        for (let i = 0; i < vals.length; i += 3) {
          // Mantém oscilação lateral sutil de peso (X - baseX) e altura real de passada (Y), zerando avanço Z
          vals[i] = (vals[i] - baseX) * 0.65;
          vals[i + 2] = (vals[i + 2] - baseZ) * 0.0;
        }
      }
    }
  }
  return cloned;
}

let cachedPromise: Promise<LoadedOutlastRigAssets> | null = null;

export function loadOutlastRigAssets(): Promise<LoadedOutlastRigAssets> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    const loader = new GLTFLoader();

    const parseFile = async (fileName: string) => {
      const buf = await fetchGlbBuffer(fileName);
      return loader.parseAsync(buf, '');
    };

    const [
      baseGltf,
      idleGltf,
      walkGltf,
      walkFemGltf,
      stalkGltf,
      retreatGltf,
      sprintGltf,
    ] = await Promise.all([
      parseFile('teacher-outlast.glb'),
      parseFile('anim-idle.glb'),
      parseFile('anim-walk.glb'),
      parseFile('anim-walk-fem.glb'),
      parseFile('anim-stalk.glb'),
      parseFile('anim-retreat.glb'),
      parseFile('anim-sprint.glb'),
    ]);

    return {
      baseScene: baseGltf.scene,
      clips: {
        idle: makeClipInPlace(idleGltf.animations[0], 'idle'),
        walk: makeClipInPlace(walkGltf.animations[0], 'walk'),
        walkFem: makeClipInPlace(walkFemGltf.animations[0], 'walkFem'),
        stalk: makeClipInPlace(stalkGltf.animations[0], 'stalk'),
        retreat: makeClipInPlace(retreatGltf.animations[0], 'retreat'),
        sprint: makeClipInPlace(sprintGltf.animations[0], 'sprint'),
      },
    };
  })();

  return cachedPromise;
}
