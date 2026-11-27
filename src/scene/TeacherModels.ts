import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TeacherConfig } from '../types';
import {
  LoadedOutlastRigAssets,
  loadOutlastRigAssets,
  MocapClipName,
} from './GlbAssetLoader';
import {
  createExecutionerApronPBR,
  createGrittySkinPBR,
  createShreddedShroudPBR,
  ShreddedClothPBRSet,
} from './ProceduralTextures';

export type TeacherPose =
  | 'hidden'
  | 'corridorFar'
  | 'doorPeek'
  | 'doorBreach'
  | 'courtyardFar'
  | 'windowPeek'
  | 'windowBreach'
  | 'boardApparition'
  | 'jumpscare';

export interface PoseUpdateOptions {
  dt: number;
  pose: TeacherPose;
  enterAnim: number;
  time: number;
  cameraPos: THREE.Vector3;
  nightVisionOn?: boolean;
  blindedByFlashlight?: boolean;
  doorClosed?: boolean;
  blindsClosed?: boolean;
}

let sharedSkinNormal: THREE.DataTexture | null = null;
let sharedSkinRough: THREE.DataTexture | null = null;
let sharedBlackGauzePBR: ShreddedClothPBRSet | null = null;
const shroudPBRCache = new Map<string, ShreddedClothPBRSet>();

function ensureSharedSkinMaps(): { normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture } {
  if (!sharedSkinNormal || !sharedSkinRough) {
    const pbr = createGrittySkinPBR(0x9a8f84, 73);
    sharedSkinNormal = pbr.normalMap;
    sharedSkinRough = pbr.roughnessMap;
  }
  return { normalMap: sharedSkinNormal, roughnessMap: sharedSkinRough };
}

function getSharedBlackGauzePBR(): ShreddedClothPBRSet {
  if (!sharedBlackGauzePBR) {
    sharedBlackGauzePBR = createShreddedShroudPBR(0x0c090a, 901, 'tornGauze');
  }
  return sharedBlackGauzePBR;
}

function getTeacherShroudPBR(id: string, colorHex: number, seed: number): ShreddedClothPBRSet {
  let set = shroudPBRCache.get(id);
  if (!set) {
    set = createShreddedShroudPBR(colorHex, seed, 'baseShroud');
    shroudPBRCache.set(id, set);
  }
  return set;
}

/** Deforma malhas têxteis com dobras orgânicas irregulares para caimento realista de mortalha */
function sculptClothFolds(
  geo: THREE.BufferGeometry,
  ampRadial: number,
  ampVertical: number,
  seed: number,
  flareBottom = 0
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const radius = Math.hypot(x, z);

    // Quanto mais abaixo na peça, mais profundas as dobras e o esvoaçar
    const lowFactor = THREE.MathUtils.clamp(0.5 - y, 0, 1.2);
    const fold =
      Math.sin(angle * 7 + seed) * 0.55 +
      Math.cos(angle * 13 - y * 6 + seed * 1.7) * 0.45;

    if (radius > 0.001) {
      const nr = radius + fold * ampRadial * (0.35 + lowFactor) + lowFactor * flareBottom;
      x = Math.cos(angle) * nr;
      z = Math.sin(angle) * nr;
    }
    y += Math.sin(angle * 9 + seed * 2.3) * ampVertical * lowFactor;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

const _tmpVec = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();

export class TeacherRig {
  readonly root = new THREE.Group();

  private config: TeacherConfig;
  private displayName: string;
  private customPhotoImg: HTMLImageElement | null = null;

  private modelRoot: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<MocapClipName, THREE.AnimationAction>> = {};
  private activeActionName: MocapClipName | null = null;

  private bones: {
    hips?: THREE.Object3D;
    spine?: THREE.Object3D;
    spine1?: THREE.Object3D;
    spine2?: THREE.Object3D;
    neck?: THREE.Object3D;
    head?: THREE.Object3D;
    leftArm?: THREE.Object3D;
    leftForeArm?: THREE.Object3D;
    rightArm?: THREE.Object3D;
    rightForeArm?: THREE.Object3D;
    rightHand?: THREE.Object3D;
    leftUpLeg?: THREE.Object3D;
    leftLeg?: THREE.Object3D;
    rightUpLeg?: THREE.Object3D;
    rightLeg?: THREE.Object3D;
    leftEye?: THREE.Object3D;
    rightEye?: THREE.Object3D;
  } = {};

  // Pivôs dinâmicos de tecido esfarrapado para balanço físico secundário ao caminhar!
  private clothSwayPivots: THREE.Group[] = [];
  private sleeveTatters: THREE.Group[] = [];
  private clothSwingX = 0;
  private clothSwingZ = 0;

  private morphMeshes: THREE.Mesh[] = [];
  private eyeMats: THREE.MeshStandardMaterial[] = [];
  private tapetumMeshes: THREE.Mesh[] = [];
  private skinMat: THREE.MeshStandardMaterial | null = null;
  private baseSkinImage: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null = null;

  private badgeCanvas: HTMLCanvasElement;
  private badgeTexture: THREE.CanvasTexture;

  // Locomoção contínua com roteamento por portais (zero atravessar paredes!)
  private currentPose: TeacherPose = 'hidden';
  private lastActiveSide: 'L' | 'R' | 'C' = 'L';
  private isRetreating = false;
  private worldPos = new THREE.Vector3(-18.5, 0, -0.52);
  private finalTargetPos = new THREE.Vector3(-18.5, 0, -0.52);
  private steerTargetPos = new THREE.Vector3(-18.5, 0, -0.52);
  private currentYaw = Math.PI / 2;
  private peekWeight = 0;
  private flinchWeight = 0;
  private vaultWeight = 0;
  private mouthOpenVal = 0;
  private propLight: THREE.PointLight | null = null;

  constructor(config: TeacherConfig, displayName?: string, photoDataUrl?: string) {
    this.config = config;
    this.displayName = displayName || config.defaultName;

    this.badgeCanvas = document.createElement('canvas');
    this.badgeCanvas.width = 128;
    this.badgeCanvas.height = 160;
    this.badgeTexture = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderBadge();

    this.root.visible = false;

    if (photoDataUrl) {
      this.loadCustomPhoto(photoDataUrl);
    }

    loadOutlastRigAssets()
      .then((assets) => {
        this.setupSkinnedRig(assets);
      })
      .catch((err) => {
        console.error('Erro carregando rig 3D Outlast:', err);
      });
  }

  private setupSkinnedRig(assets: LoadedOutlastRigAssets): void {
    const cloned = SkeletonUtils.clone(assets.baseScene);
    this.modelRoot = cloned;

    if (this.config.id === 'marcos') {
      cloned.scale.set(1.09, 1.03, 1.08);
    } else if (this.config.id === 'valdir') {
      cloned.scale.set(0.97, 1.08, 0.97);
    } else if (this.config.id === 'helena') {
      cloned.scale.set(0.94, 1.02, 0.94);
    } else if (this.config.id === 'celia') {
      cloned.scale.set(0.96, 0.98, 0.96);
    } else {
      cloned.scale.set(0.98, 1.0, 0.98);
    }

    const { normalMap: skinNormal, roughnessMap: skinRough } = ensureSharedSkinMaps();
    const isFemale = Boolean(this.config.isFemale);

    // Escurece o traje interno para fundir perfeitamente sob as mortalhas rasgadas
    const underSuitTint = new THREE.Color(0x141518);
    const skinTintMap: Record<string, number> = {
      marcos: 0xbcb2a8,
      helena: 0xbab6b4,
      ricardo: 0xb0b8be,
      valdir: 0x9fa8ad,
      celia: 0xb6aea6,
    };
    const skinTint = new THREE.Color(skinTintMap[this.config.id] ?? 0xb5aea8);

    cloned.traverse((obj) => {
      if (obj.name === 'Hips') this.bones.hips = obj;
      else if (obj.name === 'Spine') this.bones.spine = obj;
      else if (obj.name === 'Spine1') this.bones.spine1 = obj;
      else if (obj.name === 'Spine2') this.bones.spine2 = obj;
      else if (obj.name === 'Neck') this.bones.neck = obj;
      else if (obj.name === 'Head') this.bones.head = obj;
      else if (obj.name === 'LeftArm') this.bones.leftArm = obj;
      else if (obj.name === 'LeftForeArm') this.bones.leftForeArm = obj;
      else if (obj.name === 'RightArm') this.bones.rightArm = obj;
      else if (obj.name === 'RightForeArm') this.bones.rightForeArm = obj;
      else if (obj.name === 'RightHand') this.bones.rightHand = obj;
      else if (obj.name === 'LeftUpLeg') this.bones.leftUpLeg = obj;
      else if (obj.name === 'LeftLeg') this.bones.leftLeg = obj;
      else if (obj.name === 'RightUpLeg') this.bones.rightUpLeg = obj;
      else if (obj.name === 'RightLeg') this.bones.rightLeg = obj;
      else if (obj.name === 'LeftEye') this.bones.leftEye = obj;
      else if (obj.name === 'RightEye') this.bones.rightEye = obj;

      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        this.morphMeshes.push(mesh);
      }

      if (mesh.name === 'Wolf3D_Beard') {
        mesh.visible = !isFemale && this.config.id !== 'valdir';
      }

      const oldMat = mesh.material as THREE.MeshStandardMaterial;
      if (!oldMat) return;
      const mat = oldMat.clone();

      if (oldMat.name === 'Wolf3D_Skin' || oldMat.name === 'Wolf3D_Body') {
        mat.color.copy(skinTint);
        mat.normalMap = skinNormal;
        mat.roughnessMap = skinRough;
        mat.normalScale = new THREE.Vector2(0.65, 0.65);
        mat.roughness = 0.64;
        mat.metalness = 0.02;
        if (oldMat.name === 'Wolf3D_Skin') {
          this.skinMat = mat;
          if (mat.map?.image) {
            this.baseSkinImage = mat.map.image as HTMLImageElement;
          }
        }
      } else if (oldMat.name === 'Wolf3D_Outfit_Top') {
        mat.color.copy(underSuitTint);
        mat.roughness = 0.92;
      } else if (oldMat.name === 'Wolf3D_Outfit_Bottom') {
        mat.color.setHex(0x16181c);
        mat.roughness = 0.94;
      } else if (oldMat.name === 'Wolf3D_Eye') {
        mat.roughness = 0.06;
        mat.metalness = 0.05;
        mat.emissive = new THREE.Color(0xa8ccb2);
        mat.emissiveIntensity = 0.28;
        this.eyeMats.push(mat);
      } else if (oldMat.name === 'Wolf3D_Teeth') {
        mat.roughness = 0.35;
      }

      mesh.material = mat;
    });

    // Veste cada professor com sua mortalha/roupa aterrorizante caracterizada (estilo image-4!)
    this.attachHorrorVestments();
    this.attachHeadDetails();
    this.attachBadgeToChest();
    this.attachSignatureProp();

    if (this.customPhotoImg) {
      this.applyCustomPhotoToFace();
    }

    this.root.add(cloned);

    this.mixer = new THREE.AnimationMixer(cloned);
    (Object.keys(assets.clips) as MocapClipName[]).forEach((clipKey) => {
      const action = this.mixer!.clipAction(assets.clips[clipKey]);
      action.enabled = true;
      this.actions[clipKey] = action;
    });

    this.fadeToAction('idle', 0.01);
  }

  /**
   * Constrói a vestimenta assustadora caracterizada de cada professor inspirada em image-4:
   * - Capuz fundo esculpido com sombra abissal interna ocultando parcialmente a face
   * - Poncho/manto em tiras pontiagudas rasgadas + sobrecamada de gaze preta esburacada (alphaTest)
   * - Mangas em tiras pendentes nos braços + saia/farrapos articulados nos quadris
   * - Acessórios macabros exclusivos da disciplina de cada docente!
   */
  private attachHorrorVestments(): void {
    const paletteMap: Record<
      string,
      { shroudHex: number; seed: number; tapetumHex: number }
    > = {
      // Valdir: Manto Carmesim Sangue + Gaze Preta Esfarrapada idêntico à referência image-4!
      valdir: { shroudHex: 0xa31924, seed: 101, tapetumHex: 0xff5a66 },
      // Marcos: Mortalha Carvão/Ferrugem + Avental de Couro de Carrasco manchado de giz e sangue!
      marcos: { shroudHex: 0x38231d, seed: 202, tapetumHex: 0xf5d796 },
      // Helena: Mortalha Vinho-Fúnebre + Véu de Renda Preta Rasgada de Noiva/Viúva na chuva!
      helena: { shroudHex: 0x59152f, seed: 303, tapetumHex: 0xe2c4ff },
      // Ricardo: Mortalha Azul-Abissal + Gaze Preta + Cabos de Rede Cortados Enrolados no Corpo!
      ricardo: { shroudHex: 0x1b3348, seed: 404, tapetumHex: 0x7ad4ff },
      // Célia: Mortalha Cinza-Oliva Decadente + Gaze Preta + Correntes e Chaves Enferrujadas!
      celia: { shroudHex: 0x353b28, seed: 505, tapetumHex: 0xd4f786 },
    };

    const pal = paletteMap[this.config.id] ?? paletteMap.valdir;
    const shroudPBR = getTeacherShroudPBR(this.config.id, pal.shroudHex, pal.seed);
    const gauzePBR = getSharedBlackGauzePBR();

    const shroudMat = new THREE.MeshStandardMaterial({
      map: shroudPBR.map,
      normalMap: shroudPBR.normalMap,
      roughnessMap: shroudPBR.roughnessMap,
      alphaMap: shroudPBR.alphaMap,
      alphaTest: 0.44,
      side: THREE.DoubleSide,
      roughness: 0.94,
      normalScale: new THREE.Vector2(1.6, 1.6),
    });

    // Material sólido da mesma cor/textura para o capuz superior (sem furos no topo do crânio)
    const hoodSolidMat = new THREE.MeshStandardMaterial({
      map: shroudPBR.map,
      normalMap: shroudPBR.normalMap,
      roughnessMap: shroudPBR.roughnessMap,
      side: THREE.DoubleSide,
      roughness: 0.94,
      normalScale: new THREE.Vector2(1.5, 1.5),
    });

    const blackGauzeMat = new THREE.MeshStandardMaterial({
      map: gauzePBR.map,
      normalMap: gauzePBR.normalMap,
      roughnessMap: gauzePBR.roughnessMap,
      alphaMap: gauzePBR.alphaMap,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.96,
      normalScale: new THREE.Vector2(1.8, 1.8),
    });

    const abyssShadowMat = new THREE.MeshBasicMaterial({
      color: 0x030305,
      side: THREE.BackSide,
    });

    const rustedIronMat = new THREE.MeshStandardMaterial({
      color: 0x3b3532,
      metalness: 0.72,
      roughness: 0.48,
    });

    // ==================== 1. CAPUZ FUNDO SOMBRIO NO OSSO HEAD (ESTILO IMAGE-4) ====================
    if (this.bones.head) {
      const hoodGrp = new THREE.Group();

      // Casco externo esculpido do capuz: envolve nuca/laterais e projeta bico sombrio sobre a testa
      const hoodGeo = new THREE.SphereGeometry(0.146, 20, 16);
      const hPos = hoodGeo.attributes.position;
      for (let i = 0; i < hPos.count; i++) {
        let x = hPos.getX(i);
        let y = hPos.getY(i);
        let z = hPos.getZ(i);

        // Alongamento vertical de capuz de ceifador/cultista
        y = y * 1.28 + 0.088;

        // Abre a face frontal (+Z) puxando as bordas laterais e projetando o bico superior!
        if (z > 0.02) {
          if (y > 0.14) {
            // Bico superior caindo pesado sobre os olhos
            z += 0.042 * ((y - 0.14) / 0.14);
            y -= 0.018;
          } else if (Math.abs(x) < 0.092 && y > -0.04) {
            // Recua vértices centrais para trás ou abre fenda facial sombria
            x *= 1.48;
            z *= 0.22;
          }
        }

        // Alarga a gola na base do pescoço
        if (y < 0.02) {
          const flare = (0.02 - y) * 1.35;
          x *= 1 + flare;
          z *= 1 + flare * 0.85;
        }

        // Dobras orgânicas de pano amassado no capuz
        const wrinkle = Math.sin(y * 28 + x * 19 + pal.seed) * 0.006;
        hPos.setXYZ(i, x + wrinkle, y, z + wrinkle);
      }
      hoodGeo.computeVertexNormals();

      const outerHood = new THREE.Mesh(hoodGeo, hoodSolidMat);
      outerHood.castShadow = true;
      hoodGrp.add(outerHood);

      // Forro abissal negro interno criando o "rosto em vazio escuro" da referência image-4!
      const innerVoid = new THREE.Mesh(hoodGeo.clone(), abyssShadowMat);
      innerVoid.scale.set(0.955, 0.955, 0.955);
      hoodGrp.add(innerVoid);

      // Sobrecamada de gaze preta rasgada sobre o capuz
      const hoodGauze = new THREE.Mesh(hoodGeo.clone(), blackGauzeMat);
      hoodGauze.scale.set(1.03, 1.02, 1.03);
      hoodGrp.add(hoodGauze);

      // Véu preto rasgado adicional caindo diante do rosto para a Profa. Helena!
      if (this.config.id === 'helena') {
        const veilGeo = new THREE.CylinderGeometry(0.125, 0.165, 0.26, 16, 4, true, -0.95, 1.9);
        const veil = new THREE.Mesh(veilGeo, blackGauzeMat);
        veil.position.set(0, 0.02, 0.02);
        hoodGrp.add(veil);
      }

      this.bones.head.add(hoodGrp);
    }

    // ==================== 2. PONCHO / MANTO SUPERIOR ESFARRAPADO EM SPINE2 ====================
    if (this.bones.spine2) {
      const torsoMantle = new THREE.Group();

      // Camada 1: Poncho principal rasgado cobrindo ombros, peito e costas (igual ao manto vermelho de image-4)
      const ponchoGeo = sculptClothFolds(
        new THREE.CylinderGeometry(0.155, 0.36, 0.78, 28, 12, true),
        0.024,
        0.035,
        pal.seed,
        0.06
      );
      const poncho = new THREE.Mesh(ponchoGeo, shroudMat);
      poncho.position.set(0, -0.16, 0.01);
      poncho.scale.set(1.18, 1.0, 0.86);
      poncho.castShadow = true;
      torsoMantle.add(poncho);

      // Faixa/estola central comprida caindo verticalmente no meio do peito (idêntico ao centro de image-4!)
      const frontStoleGeo = new THREE.PlaneGeometry(0.18, 0.86, 6, 12);
      const sPos = frontStoleGeo.attributes.position;
      for (let i = 0; i < sPos.count; i++) {
        const sy = sPos.getY(i);
        const sx = sPos.getX(i);
        sPos.setZ(i, Math.sin(sy * 11 + pal.seed) * 0.014 + Math.cos(sx * 18) * 0.008);
      }
      frontStoleGeo.computeVertexNormals();
      const frontStole = new THREE.Mesh(frontStoleGeo, shroudMat);
      frontStole.position.set(0, -0.22, 0.175);
      frontStole.rotation.x = -0.07;
      frontStole.castShadow = true;
      torsoMantle.add(frontStole);

      // Camada 2: Gaze preta grosseira esburacada por cima dos ombros e laterais!
      const gauzeOverGeo = sculptClothFolds(
        new THREE.CylinderGeometry(0.165, 0.39, 0.84, 28, 12, true),
        0.03,
        0.04,
        pal.seed + 55,
        0.08
      );
      const gauzeOver = new THREE.Mesh(gauzeOverGeo, blackGauzeMat);
      gauzeOver.position.set(0, -0.18, 0.012);
      gauzeOver.scale.set(1.22, 1.0, 0.9);
      gauzeOver.castShadow = true;
      torsoMantle.add(gauzeOver);

      // Gola franzida grossa unindo o capuz ao manto
      const cowlNeck = new THREE.Mesh(
        new THREE.TorusGeometry(0.125, 0.036, 8, 18),
        hoodSolidMat
      );
      cowlNeck.rotation.x = Math.PI / 2 + 0.15;
      cowlNeck.position.set(0, 0.165, 0.015);
      cowlNeck.scale.set(1.15, 0.95, 1.0);
      torsoMantle.add(cowlNeck);

      // -------- CARACTERIZAÇÃO EXCLUSIVA DE CADA PROFESSOR NO TRONCO --------
      if (this.config.id === 'marcos') {
        // Avental pesado de couro rachado de carrasco/geômetra + correntes cruzadas!
        const apronPBR = createExecutionerApronPBR(pal.seed);
        const apronMat = new THREE.MeshStandardMaterial({
          map: apronPBR.map,
          normalMap: apronPBR.normalMap,
          roughnessMap: apronPBR.roughnessMap,
          side: THREE.DoubleSide,
          roughness: 0.68,
        });
        const apronGeo = new THREE.CylinderGeometry(
          0.19,
          0.24,
          0.68,
          16,
          6,
          true,
          -0.85,
          1.7
        );
        const apron = new THREE.Mesh(apronGeo, apronMat);
        apron.position.set(0, -0.18, 0.035);
        apron.scale.set(1.05, 1.0, 0.82);
        torsoMantle.add(apron);

        // Correntes de ferro cruzadas no peito
        [-1, 1].forEach((dir) => {
          const strap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.011, 0.011, 0.48, 8),
            rustedIronMat
          );
          strap.position.set(0, -0.02, 0.185);
          strap.rotation.z = dir * 0.58;
          torsoMantle.add(strap);
        });
      } else if (this.config.id === 'ricardo') {
        // Bobinas de cabos de rede CAT6 / energia arrebentados enrolados nos ombros e pendurados!
        const cableDarkMat = new THREE.MeshStandardMaterial({
          color: 0x0c1014,
          roughness: 0.42,
        });
        const cableCyanMat = new THREE.MeshStandardMaterial({
          color: 0x1b4d6e,
          roughness: 0.38,
        });
        for (let c = 0; c < 4; c++) {
          const coil = new THREE.Mesh(
            new THREE.TorusGeometry(0.18 + c * 0.018, 0.0085, 6, 20),
            c % 2 === 0 ? cableDarkMat : cableCyanMat
          );
          coil.rotation.x = Math.PI / 2 + (c - 1.5) * 0.16;
          coil.rotation.y = (c % 2 === 0 ? 1 : -1) * 0.28;
          coil.position.set(0, 0.08 - c * 0.06, 0.01);
          coil.scale.set(1.15, 0.82, 1.0);
          torsoMantle.add(coil);
        }
      } else if (this.config.id === 'valdir') {
        // Folhas de boletim manchadas de sangue ("MENÇÃO I") pregadas na mortalha carmesim!
        const pageMat = new THREE.MeshStandardMaterial({
          color: 0xc2b6a2,
          roughness: 0.9,
          side: THREE.DoubleSide,
        });
        [
          [-0.09, -0.04, 0.185, 0.22],
          [0.10, -0.14, 0.182, -0.18],
        ].forEach(([px, py, pz, rz]) => {
          const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.098), pageMat);
          pg.position.set(px, py, pz);
          pg.rotation.set(-0.1, 0, rz);
          torsoMantle.add(pg);
        });
      } else if (this.config.id === 'celia') {
        // Corrente pesada de inspetora cruzando o manto
        const chainSash = new THREE.Mesh(
          new THREE.TorusGeometry(0.21, 0.011, 7, 22),
          rustedIronMat
        );
        chainSash.rotation.x = 1.15;
        chainSash.rotation.y = 0.48;
        chainSash.position.set(0, -0.04, 0.02);
        chainSash.scale.set(1.1, 0.82, 1.0);
        torsoMantle.add(chainSash);
      }

      this.bones.spine2.add(torsoMantle);
    }

    // ==================== 3. MANGAS MORCEGO RASGADAS PENDENTES NOS BRAÇOS ====================
    [this.bones.leftArm, this.bones.rightArm].forEach((armBone, idx) => {
      if (!armBone) return;
      const sleevePivot = new THREE.Group();
      sleevePivot.position.set(0, 0.12, 0);

      // Tiras longas pendentes sob os braços imitando o caimento largo de poncho da referência image-4!
      const tatterGeo = new THREE.PlaneGeometry(0.28, 0.62, 5, 8);
      const tatterShroud = new THREE.Mesh(tatterGeo, shroudMat);
      tatterShroud.position.set(0, -0.26, -0.02);
      tatterShroud.rotation.y = idx === 0 ? 0.35 : -0.35;

      const tatterGauze = new THREE.Mesh(tatterGeo, blackGauzeMat);
      tatterGauze.position.set(0, -0.28, 0.01);
      tatterGauze.rotation.y = idx === 0 ? -0.25 : 0.25;

      sleevePivot.add(tatterShroud, tatterGauze);
      armBone.add(sleevePivot);
      this.sleeveTatters.push(sleevePivot);
    });

    // ==================== 4. TIRAS INFERIORES LONGAS ESFARRAPADAS NOS QUADRIS ====================
    if (this.bones.hips) {
      const panelsCount = 8;
      for (let p = 0; p < panelsCount; p++) {
        const thetaStart = (p / panelsCount) * Math.PI * 2;
        const thetaLen = (Math.PI * 2) / panelsCount + 0.18;

        const pivot = new THREE.Group();
        pivot.position.set(0, 0.02, 0);

        const stripGeo = sculptClothFolds(
          new THREE.CylinderGeometry(0.19, 0.34, 0.82, 7, 9, true, thetaStart, thetaLen),
          0.022,
          0.03,
          pal.seed + p * 17,
          0.05
        );
        stripGeo.translate(0, -0.41, 0);

        const stripMesh = new THREE.Mesh(
          stripGeo,
          p % 2 === 0 ? shroudMat : blackGauzeMat
        );
        stripMesh.scale.set(1.12, 1.0, 0.92);
        stripMesh.castShadow = true;
        pivot.add(stripMesh);

        // Camada dupla alternada para riqueza visual idêntica à referência image-4
        const subMesh = new THREE.Mesh(
          stripGeo,
          p % 2 === 0 ? blackGauzeMat : shroudMat
        );
        subMesh.scale.set(1.16, 0.96, 0.96);
        subMesh.rotation.y = 0.12;
        pivot.add(subMesh);

        this.bones.hips.add(pivot);
        this.clothSwayPivots.push(pivot);
      }

      // Molho de chaves grandes enferrujadas pendurado na cintura da Inspetora Célia!
      if (this.config.id === 'celia') {
        const keyRingGrp = new THREE.Group();
        keyRingGrp.position.set(-0.21, -0.04, 0.08);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.042, 0.005, 6, 14),
          rustedIronMat
        );
        keyRingGrp.add(ring);
        for (let k = 0; k < 4; k++) {
          const keyShaft = new THREE.Mesh(
            new THREE.BoxGeometry(0.008, 0.095, 0.004),
            rustedIronMat
          );
          keyShaft.position.set((k - 1.5) * 0.014, -0.065, 0);
          keyShaft.rotation.z = (k - 1.5) * 0.12;
          keyRingGrp.add(keyShaft);
        }
        this.bones.hips.add(keyRingGrp);
        this.clothSwayPivots.push(keyRingGrp);
      }
    }
  }

  private attachHeadDetails(): void {
    const head = this.bones.head;
    if (!head) return;

    // Olhos retrorrefletivos brilhando dentro do capuz escuro!
    const tapetumGeo = new THREE.SphereGeometry(0.0095, 8, 8);
    const tapetumMat = new THREE.MeshBasicMaterial({
      color: 0xd8ffea,
      transparent: true,
      opacity: 0.52,
    });
    [-0.031, 0.031].forEach((ex) => {
      const orb = new THREE.Mesh(tapetumGeo, tapetumMat.clone());
      orb.position.set(ex, 0.089, 0.099);
      head.add(orb);
      this.tapetumMeshes.push(orb);
    });

    // Mechas escorridas escapando pela frente do capuz para a Profa. Helena
    if (this.config.id === 'helena') {
      const hairMat = new THREE.MeshStandardMaterial({
        color: 0x0b0a0d,
        roughness: 0.72,
      });
      [-0.075, 0.078].forEach((hx, i) => {
        const strand = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.24, 6), hairMat);
        strand.rotation.x = Math.PI;
        strand.rotation.z = i === 0 ? 0.1 : -0.1;
        strand.position.set(hx, -0.02, 0.072);
        head.add(strand);
      });
    }

    // Óculos metálicos tortos / lente rachada brilhando dentro do capuz
    if (this.config.hasGlasses) {
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x3a3630,
        metalness: 0.82,
        roughness: 0.28,
      });
      const lensMat = new THREE.MeshStandardMaterial({
        color: this.config.id === 'ricardo' ? 0x6ec6ff : 0x9ec0cc,
        emissive: this.config.id === 'ricardo' ? 0x164e78 : 0x000000,
        emissiveIntensity: this.config.id === 'ricardo' ? 0.65 : 0,
        transparent: true,
        opacity: 0.38,
        roughness: 0.08,
        metalness: 0.25,
      });
      const glassesGrp = new THREE.Group();
      glassesGrp.position.set(0, 0.088, 0.097);
      glassesGrp.rotation.z = this.config.id === 'marcos' ? -0.11 : 0.05;

      [-0.033, 0.033].forEach((gx) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0025, 6, 16), frameMat);
        rim.position.x = gx;
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 12), lensMat);
        lens.position.set(gx, 0, 0.001);
        glassesGrp.add(rim, lens);
      });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.003), frameMat);
      glassesGrp.add(bridge);
      head.add(glassesGrp);
    }
  }

  private attachBadgeToChest(): void {
    const chest = this.bones.spine2;
    if (!chest) return;

    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.068, 0.088),
      new THREE.MeshStandardMaterial({
        map: this.badgeTexture,
        roughness: 0.48,
        side: THREE.DoubleSide,
      })
    );
    badge.position.set(-0.085, 0.03, 0.195);
    badge.rotation.set(-0.08, -0.14, 0.11);
    chest.add(badge);
  }

  private attachSignatureProp(): void {
    const hand = this.bones.rightHand;
    if (!hand) return;

    const propGroup = new THREE.Group();
    propGroup.position.set(-0.02, 0.095, 0.025);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x422c1b, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x4e545b,
      metalness: 0.78,
      roughness: 0.34,
    });

    switch (this.config.propType) {
      case 'ruler': {
        // Régua-cutelo T-Square pesada com lâmina de compasso enferrujada (Prof. Marcos)
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.82, 0.016), woodMat);
        shaft.position.set(0, 0.28, 0);
        shaft.rotation.z = 0.16;
        const crossBlade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 0.012), metalMat);
        crossBlade.position.set(0.04, 0.64, 0);
        crossBlade.rotation.z = 0.16;
        shaft.castShadow = crossBlade.castShadow = true;
        propGroup.add(shaft, crossBlade);
        break;
      }
      case 'clipboard': {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.30, 0.012), woodMat);
        const paper = new THREE.Mesh(
          new THREE.PlaneGeometry(0.19, 0.25),
          new THREE.MeshStandardMaterial({ color: 0xc2b8a3, roughness: 0.92 })
        );
        paper.position.z = 0.008;
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.022), metalMat);
        clip.position.set(0, 0.14, 0.01);
        propGroup.add(board, paper, clip);
        break;
      }
      case 'tablet': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.25, 0.014), metalMat);
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.165, 0.22),
          new THREE.MeshBasicMaterial({ color: 0x6ec6ff })
        );
        screen.position.z = 0.009;
        this.propLight = new THREE.PointLight(0x52b0ff, 0.55, 2.6);
        this.propLight.position.set(0, 0.05, 0.12);
        propGroup.add(body, screen, this.propLight);
        break;
      }
      case 'ledger': {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.29, 0.045),
          new THREE.MeshStandardMaterial({
            color: 0x450810,
            emissive: 0x290206,
            roughness: 0.65,
          })
        );
        this.propLight = new THREE.PointLight(0xd41c2c, 0.72, 3.0);
        this.propLight.position.set(0, 0.05, 0.14);
        propGroup.add(book, this.propLight);
        break;
      }
      case 'bell': {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), woodMat);
        const cup = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.13, 14),
          new THREE.MeshStandardMaterial({
            color: 0x8d7234,
            metalness: 0.75,
            roughness: 0.36,
          })
        );
        cup.position.y = 0.11;
        propGroup.add(handle, cup);
        break;
      }
    }

    hand.add(propGroup);
  }

  private loadCustomPhoto(dataUrl: string): void {
    const img = new Image();
    img.onload = () => {
      this.customPhotoImg = img;
      this.renderBadge();
      this.applyCustomPhotoToFace();
    };
    img.src = dataUrl;
  }

  private applyCustomPhotoToFace(): void {
    if (!this.skinMat || !this.baseSkinImage || !this.customPhotoImg) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.baseSkinImage as CanvasImageSource, 0, 0, 512, 512);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(256, 198, 86, 98, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.72;
    ctx.filter = 'grayscale(72%) contrast(135%) brightness(82%)';
    ctx.drawImage(this.customPhotoImg, 168, 96, 176, 204);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.skinMat.map = tex;
    this.skinMat.needsUpdate = true;
  }

  private renderBadge(): void {
    const ctx = this.badgeCanvas.getContext('2d')!;
    ctx.fillStyle = '#c4beb0';
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = '#5e1116';
    ctx.fillRect(0, 0, 128, 28);
    ctx.fillStyle = '#e8e2d5';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ETEC SEBRAE', 64, 19);

    ctx.fillStyle = '#1b1d21';
    if (this.customPhotoImg) {
      ctx.drawImage(this.customPhotoImg, 28, 36, 72, 72);
    } else {
      ctx.fillRect(28, 36, 72, 72);
    }

    ctx.fillStyle = '#161616';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(this.displayName.slice(0, 13).toUpperCase(), 64, 128);
    ctx.fillStyle = '#581216';
    ctx.font = '9px monospace';
    ctx.fillText('DOCENTE NOTURNO', 64, 145);
    this.badgeTexture.needsUpdate = true;
  }

  refreshAppearance(displayName: string, photoDataUrl?: string): void {
    this.displayName = displayName || this.config.defaultName;
    if (photoDataUrl) {
      this.loadCustomPhoto(photoDataUrl);
    } else {
      this.customPhotoImg = null;
      this.renderBadge();
    }
  }

  private fadeToAction(name: MocapClipName, duration = 0.32, timeScale = 1.0): void {
    if (!this.mixer) return;
    const next = this.actions[name];
    if (!next) return;

    next.timeScale = timeScale;
    if (this.activeActionName === name) return;

    const prev = this.activeActionName ? this.actions[this.activeActionName] : null;
    next.reset().play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, duration, false);
    }
    this.activeActionName = name;
  }

  private setJawMorph(openAmount: number, smileAmount = 0): void {
    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary;
      const infl = mesh.morphTargetInfluences;
      if (!dict || !infl) continue;
      if (dict.mouthOpen !== undefined) {
        infl[dict.mouthOpen] = THREE.MathUtils.clamp(openAmount, 0, 1);
      }
      if (dict.mouthSmile !== undefined) {
        infl[dict.mouthSmile] = THREE.MathUtils.clamp(smileAmount, 0, 1);
      }
    }
  }

  /**
   * Roteamento de portais + Colisão rígida contra paredes/porta/janela:
   * Garante matematicamente que NENHUM personagem (nem sua capa/ombros) atravesse paredes!
   */
  private computePortalSteerTarget(
    doorClosed: boolean,
    blindsClosed: boolean
  ): { blockedAtBarrier: boolean } {
    const curX = this.worldPos.x;
    const curZ = this.worldPos.z;
    const dstX = this.finalTargetPos.x;
    const dstZ = this.finalTargetPos.z;

    // 1. Cruzamento da Parede Esquerda (X = -5.0) — Eixo livre da porta longe da dobradiça: Z = -0.62
    const crossingLeftWall =
      (curX < -5.0 && dstX > -5.0) || (curX > -5.0 && dstX < -5.0);

    if (crossingLeftWall) {
      const doorPortalZ = -0.62;
      if (doorClosed) {
        if (curX < -5.0) {
          this.steerTargetPos.set(-6.08, 0, doorPortalZ);
          return { blockedAtBarrier: true };
        }
        this.steerTargetPos.set(-3.92, 0, doorPortalZ);
        return { blockedAtBarrier: true };
      }

      if (Math.abs(curZ - doorPortalZ) > 0.12) {
        const preX = curX < -5.0 ? Math.min(curX, -6.04) : Math.max(curX, -3.96);
        this.steerTargetPos.set(preX, 0, doorPortalZ);
        return { blockedAtBarrier: false };
      }

      if (dstX > -5.0 && curX < -3.96) {
        this.steerTargetPos.set(-3.92, 0, doorPortalZ);
        return { blockedAtBarrier: false };
      }
      if (dstX < -5.0 && curX > -6.04) {
        this.steerTargetPos.set(-6.08, 0, doorPortalZ);
        return { blockedAtBarrier: false };
      }
    }

    // 2. Cruzamento da Parede Direita / Janela (X = +5.0) — Eixo central da janela: Z = -0.35
    const crossingRightWall =
      (curX > 5.0 && dstX < 5.0) || (curX < 5.0 && dstX > 5.0);

    if (crossingRightWall) {
      const winPortalZ = -0.35;
      if (blindsClosed) {
        if (curX > 5.0) {
          this.steerTargetPos.set(6.18, -0.05, winPortalZ);
          return { blockedAtBarrier: true };
        }
        this.steerTargetPos.set(3.88, 0, winPortalZ);
        return { blockedAtBarrier: true };
      }

      if (Math.abs(curZ - winPortalZ) > 0.14) {
        const preX = curX > 5.0 ? Math.max(curX, 6.14) : Math.min(curX, 3.88);
        this.steerTargetPos.set(preX, curX > 5.0 ? -0.05 : 0, winPortalZ);
        return { blockedAtBarrier: false };
      }

      if (dstX < 5.0 && curX > 3.88) {
        this.steerTargetPos.set(3.82, 0, winPortalZ);
        return { blockedAtBarrier: false };
      }
      if (dstX > 5.0 && curX < 6.14) {
        this.steerTargetPos.set(6.18, -0.05, winPortalZ);
        return { blockedAtBarrier: false };
      }
    }

    this.steerTargetPos.copy(this.finalTargetPos);
    return { blockedAtBarrier: false };
  }

  /**
   * Solver geométrico completo com margem real de braços estendidos + adereços (R = 0.98m)
   * e platô de escalada agachada pelo vão exato da janela (Y = 1.02m..2.46m)!
   */
  private resolveWallCollisions(
    prevX: number,
    doorClosed: boolean,
    blindsClosed: boolean
  ): void {
    const R = 0.98;

    // Limites Z do Corredor Esquerdo (longe dos armários Z = -1.72 e da parede sul Z = +1.45)
    if (this.worldPos.x < -5.0) {
      this.worldPos.z = THREE.MathUtils.clamp(this.worldPos.z, -1.16, 0.56);
      this.worldPos.x = Math.max(-20.0, this.worldPos.x);
    }

    // Limites Z internos da Sala 04 (longe das paredes Z = -5.0 e +3.4)
    if (this.worldPos.x >= -5.0 && this.worldPos.x <= 5.0) {
      this.worldPos.z = THREE.MathUtils.clamp(this.worldPos.z, -4.02, 2.38);

      // Desvia da mesa do professor (-1.9, -3.95)
      if (this.worldPos.x < -0.85 && this.worldPos.z < -3.15) {
        this.worldPos.x = -0.85;
      }
    }

    // Limites do Pátio Direito
    if (this.worldPos.x > 5.0) {
      this.worldPos.z = THREE.MathUtils.clamp(this.worldPos.z, -3.2, 2.0);
      this.worldPos.x = Math.min(13.1, this.worldPos.x);
    }

    // Barreira da Parede Esquerda (X = -5.0, espessura -5.08..-4.92)
    const inDoorChannel =
      !doorClosed && this.worldPos.z >= -0.82 && this.worldPos.z <= -0.4;
    if (!inDoorChannel && this.worldPos.x > -5.08 - R && this.worldPos.x < -4.92 + R) {
      if (prevX <= -5.0) {
        this.worldPos.x = -5.08 - R;
      } else {
        this.worldPos.x = -4.92 + R;
      }
    }

    // Barreira da Parede Direita / Janela (X = +5.0, espessura +4.92..+5.08)
    const inWindowChannel =
      !blindsClosed && this.worldPos.z >= -0.78 && this.worldPos.z <= 0.08;
    if (!inWindowChannel && this.worldPos.x > 4.92 - R && this.worldPos.x < 5.08 + R) {
      if (prevX >= 5.0) {
        this.worldPos.x = 5.08 + R;
      } else {
        this.worldPos.x = 4.92 - R;
      }
    }

    // Platô de travessia agachada da janela (Y = 1.08m constante em [4.22, 5.78] + rampas suaves):
    // Mantém pés e manto ACIMA da parede de alvenaria (1.02m) enquanto o tronco agacha ABAIXO da verga (2.46m)!
    if (inWindowChannel && this.worldPos.x > 3.82 && this.worldPos.x < 6.18) {
      let factor = 1.0;
      if (this.worldPos.x < 4.22) {
        const u = (this.worldPos.x - 3.82) / (4.22 - 3.82);
        factor = 0.5 - 0.5 * Math.cos(u * Math.PI);
      } else if (this.worldPos.x > 5.78) {
        const u = (6.18 - this.worldPos.x) / (6.18 - 5.78);
        factor = 0.5 - 0.5 * Math.cos(u * Math.PI);
      }
      this.worldPos.y = -0.05 * (1 - factor) + 1.08 * factor;
      this.vaultWeight = factor;
    } else {
      this.vaultWeight = 0;
      this.worldPos.y = this.worldPos.x >= 5.0 ? -0.05 : 0;
    }
  }

  updatePose(opts: PoseUpdateOptions): void {
    const {
      dt,
      pose,
      time,
      cameraPos,
      nightVisionOn = false,
      blindedByFlashlight = false,
      doorClosed = false,
      blindsClosed = false,
    } = opts;

    // 1. Brilho retrorrefletivo dos olhos sob o capuz escuro!
    const eyeEmissive = nightVisionOn ? 4.2 : 0.34;
    const tapetumOpacity = nightVisionOn ? 0.98 : 0.45;
    for (const mat of this.eyeMats) {
      mat.emissive.setHex(nightVisionOn ? 0x8effc2 : 0xb8d4be);
      mat.emissiveIntensity = eyeEmissive;
    }
    for (const orb of this.tapetumMeshes) {
      const bMat = orb.material as THREE.MeshBasicMaterial;
      bMat.color.setHex(nightVisionOn ? 0xdfffe9 : 0xd8e6da);
      bMat.opacity = tapetumOpacity;
      orb.scale.setScalar(nightVisionOn ? 1.4 : 0.92);
    }

    // 2. Jumpscare em close visceral!
    if (pose === 'jumpscare') {
      this.currentPose = 'jumpscare';
      this.isRetreating = false;
      this.root.visible = true;
      this.vaultWeight = 0;
      if (this.modelRoot) this.modelRoot.position.y = 0;
      this.worldPos.set(0, -0.14, 0.22);
      this.root.position.copy(this.worldPos);
      this.root.rotation.set(0, 0, 0);

      this.fadeToAction('sprint', 0.08, 1.45);
      this.mixer?.update(dt);
      this.setJawMorph(0.96, 0.25);

      if (this.bones.leftArm && this.bones.rightArm) {
        _tmpEuler.set(-0.85, 0.25, -0.2);
        this.bones.leftArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
        _tmpEuler.set(-0.85, -0.25, 0.2);
        this.bones.rightArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      }
      return;
    }

    // 3. Definição de alvos seguros de navegação (sempre afastados das paredes!)
    if (pose === 'hidden') {
      if (this.currentPose !== 'hidden' && !this.isRetreating) {
        if (this.lastActiveSide === 'L') {
          this.isRetreating = true;
          this.finalTargetPos.set(-18.2, 0, -0.52);
        } else if (this.lastActiveSide === 'R') {
          this.isRetreating = true;
          this.finalTargetPos.set(12.8, -0.05, -0.45);
        } else {
          this.root.visible = false;
          this.currentPose = 'hidden';
          return;
        }
      }

      if (!this.isRetreating) {
        this.root.visible = false;
        return;
      }
    } else {
      const wasCompletelyHidden = this.currentPose === 'hidden' && !this.isRetreating;
      this.isRetreating = false;
      this.root.visible = true;

      if (pose === 'corridorFar' || pose === 'doorPeek' || pose === 'doorBreach') {
        if (wasCompletelyHidden || this.lastActiveSide !== 'L') {
          this.worldPos.set(pose === 'corridorFar' ? -15.6 : -9.2, 0, -0.52);
          this.currentYaw = Math.PI / 2;
        }
        this.lastActiveSide = 'L';

        if (pose === 'corridorFar') {
          this.finalTargetPos.set(
            -12.4 + Math.sin(time * 0.55) * 0.65,
            0,
            -0.58 + Math.cos(time * 0.42) * 0.22
          );
        } else if (pose === 'doorPeek') {
          // 1.08m fora da parede/porta para que braços, capuz e adereços JAMAIS atravessem a porta!
          this.finalTargetPos.set(-6.08, 0, -0.62);
          if (doorClosed && this.worldPos.x > -6.06) {
            this.worldPos.x = -6.08;
          }
        } else {
          // Corredor interno livre entre a porta aberta e a fileira esquerda de carteiras
          this.finalTargetPos.set(-3.58, 0, -0.58);
        }
      } else if (pose === 'courtyardFar' || pose === 'windowPeek' || pose === 'windowBreach') {
        if (wasCompletelyHidden || this.lastActiveSide !== 'R') {
          this.worldPos.set(pose === 'courtyardFar' ? 12.4 : 8.8, -0.05, -0.35);
          this.currentYaw = -Math.PI / 2;
        }
        this.lastActiveSide = 'R';

        if (pose === 'courtyardFar') {
          this.finalTargetPos.set(
            8.95 + Math.sin(time * 0.48) * 0.42,
            -0.05,
            -0.45 + Math.cos(time * 0.37) * 0.3
          );
        } else if (pose === 'windowPeek') {
          // 1.18m fora da parede externa/persiana para zero clipping de adereços, mangas ou capuz!
          this.finalTargetPos.set(6.18, -0.05, -0.35);
          if (blindsClosed && this.worldPos.x < 6.14) {
            this.worldPos.x = 6.18;
            this.worldPos.y = -0.05;
          }
        } else {
          this.finalTargetPos.set(3.62, 0, -0.35);
        }
      } else if (pose === 'boardApparition') {
        this.lastActiveSide = 'C';
        if (wasCompletelyHidden) {
          this.worldPos.set(0.55, 0, -3.82);
          this.currentYaw = 0;
        }
        // Livre da parede frontal (Z = -5.0), da mesa do professor (X = -1.9) e das carteiras (Z = -2.45)
        this.finalTargetPos.set(0.55 + Math.sin(time * 0.65) * 0.2, 0, -3.82);
      }

      this.currentPose = pose;
    }

    // Se estava recuando pelo batente quando o jogador fechou a porta/persiana, ejeta para o lado externo limpo!
    if (this.isRetreating) {
      if (this.lastActiveSide === 'L' && doorClosed && this.worldPos.x > -6.06) {
        if (this.worldPos.x < -3.85) {
          this.worldPos.x = -6.08;
        } else {
          this.isRetreating = false;
          this.currentPose = 'hidden';
          this.root.visible = false;
          return;
        }
      } else if (this.lastActiveSide === 'R' && blindsClosed && this.worldPos.x < 6.14) {
        if (this.worldPos.x > 3.85) {
          this.worldPos.x = 6.18;
          this.worldPos.y = -0.05;
        } else {
          this.isRetreating = false;
          this.currentPose = 'hidden';
          this.root.visible = false;
          return;
        }
      }
    }

    // 4. Roteamento inteligente pelos vãos de porta/janela + Movimento + Solver de Colisão!
    const prevX = this.worldPos.x;
    const prevZ = this.worldPos.z;
    const { blockedAtBarrier } = this.computePortalSteerTarget(doorClosed, blindsClosed);

    _tmpVec.subVectors(this.steerTargetPos, this.worldPos);
    const flatDist = Math.hypot(_tmpVec.x, _tmpVec.z);

    const moveSpeed = this.isRetreating
      ? 2.75
      : pose === 'doorBreach' || pose === 'windowBreach'
        ? 2.8
        : pose === 'corridorFar' || pose === 'courtyardFar'
          ? 0.95
          : 2.35;

    if (flatDist > 0.03) {
      const step = Math.min(flatDist, moveSpeed * dt);
      this.worldPos.x += (_tmpVec.x / flatDist) * step;
      this.worldPos.z += (_tmpVec.z / flatDist) * step;
    } else {
      this.worldPos.x = this.steerTargetPos.x;
      this.worldPos.z = this.steerTargetPos.z;
    }

    // Aplica colisão rígida contra todas as paredes e arco sobre o peitoril da janela!
    this.resolveWallCollisions(prevX, doorClosed, blindsClosed);

    const actualDx = this.worldPos.x - prevX;
    const actualDz = this.worldPos.z - prevZ;
    const currentSpeed = Math.hypot(actualDx, actualDz) / Math.max(0.0001, dt);

    const distToFinal = Math.hypot(
      this.finalTargetPos.x - this.worldPos.x,
      this.finalTargetPos.z - this.worldPos.z
    );
    if (this.isRetreating && (distToFinal < 0.08 || blockedAtBarrier)) {
      this.isRetreating = false;
      this.currentPose = 'hidden';
      this.root.visible = false;
      return;
    }

    this.root.position.copy(this.worldPos);

    // Orientação corporal suave
    let desiredYaw: number;
    if (!this.isRetreating && currentSpeed > 0.45 && flatDist > 0.35) {
      desiredYaw = Math.atan2(_tmpVec.x, _tmpVec.z);
    } else {
      desiredYaw = Math.atan2(cameraPos.x - this.worldPos.x, cameraPos.z - this.worldPos.z);
    }

    let diffYaw = desiredYaw - this.currentYaw;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
    this.currentYaw += diffYaw * Math.min(1, dt * 7.5);
    this.root.rotation.set(0, this.currentYaw, 0);

    // 5. Crossfade fluido de captura de movimento
    const walkClip: MocapClipName = this.config.isFemale ? 'walkFem' : 'walk';
    const isVaultingWindow = this.worldPos.y > 0.12;

    if (isVaultingWindow) {
      this.fadeToAction('stalk', 0.18, 1.35);
    } else if (this.isRetreating) {
      this.fadeToAction('retreat', 0.25, 1.18);
    } else if (currentSpeed > 2.45) {
      this.fadeToAction(this.config.id === 'celia' ? walkClip : 'stalk', 0.24, 1.32);
    } else if (currentSpeed > 0.32) {
      const useStalk = this.config.id === 'marcos' || this.config.id === 'ricardo';
      this.fadeToAction(useStalk ? 'stalk' : walkClip, 0.32, Math.max(0.72, currentSpeed * 0.62));
    } else {
      this.fadeToAction('idle', 0.42, this.config.id === 'valdir' ? 0.78 : 0.92);
    }

    this.mixer?.update(dt);

    // 5b. Compressão corporal de escalada agachada pela janela (evita bater na parede baixa 1.02m E na verga superior 2.46m!)
    if (this.modelRoot) {
      this.modelRoot.position.y = -0.38 * this.vaultWeight;
    }
    if (this.vaultWeight > 0.005) {
      const vw = this.vaultWeight;
      if (this.bones.leftUpLeg && this.bones.leftLeg) {
        _tmpEuler.set(-1.38 * vw, 0, 0.08 * vw);
        this.bones.leftUpLeg.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
        _tmpEuler.set(1.95 * vw, 0, 0);
        this.bones.leftLeg.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      }
      if (this.bones.rightUpLeg && this.bones.rightLeg) {
        _tmpEuler.set(-1.38 * vw, 0, -0.08 * vw);
        this.bones.rightUpLeg.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
        _tmpEuler.set(1.95 * vw, 0, 0);
        this.bones.rightLeg.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      }
      if (this.bones.spine && this.bones.spine1) {
        _tmpEuler.set(0.38 * vw, 0, 0);
        this.bones.spine.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
        this.bones.spine1.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      }
    }

    // 6. Simulação física secundária das tiras esfarrapadas do manto (recolhe para trás ao escalar a janela!)
    const localForwardSpeed = this.isRetreating ? -currentSpeed : currentSpeed;
    const nearWallDamp =
      Math.abs(Math.abs(this.worldPos.x) - 5.0) < 1.25 && this.vaultWeight < 0.05 ? 0.25 : 1.0;
    const targetClothX =
      THREE.MathUtils.clamp(localForwardSpeed * 0.085, -0.22, 0.26) * nearWallDamp +
      this.vaultWeight * 1.05;
    const targetClothZ =
      Math.sin(time * 2.4 + this.worldPos.x) * (0.035 + currentSpeed * 0.02) * nearWallDamp;
    this.clothSwingX += (targetClothX - this.clothSwingX) * Math.min(1, dt * 7.5);
    this.clothSwingZ += (targetClothZ - this.clothSwingZ) * Math.min(1, dt * 7.5);

    this.clothSwayPivots.forEach((piv, idx) => {
      const flutter =
        Math.sin(time * 3.6 + idx * 1.15) * (0.024 + currentSpeed * 0.015) * nearWallDamp;
      piv.rotation.x = this.clothSwingX + flutter;
      piv.rotation.z = this.clothSwingZ + Math.cos(time * 2.9 + idx * 0.9) * 0.022;
    });

    this.sleeveTatters.forEach((slv, idx) => {
      slv.rotation.z =
        (idx === 0 ? 1 : -1) * (0.08 + Math.sin(time * 3.1 + idx) * 0.05) + this.clothSwingZ * 0.5;
      slv.rotation.x = this.clothSwingX * 0.65;
    });

    // 7. Camada IK Aditiva pós-mocap: espiar pela porta (apenas quando aberta!), olhar fixo e recuo à lanterna
    const isPeekingDoor =
      !this.isRetreating && !doorClosed && pose === 'doorPeek' && distToFinal < 0.35;
    const targetPeek = isPeekingDoor ? 1 : 0;
    this.peekWeight += (targetPeek - this.peekWeight) * Math.min(1, dt * 6.0);

    const targetFlinch = blindedByFlashlight ? 1 : 0;
    this.flinchWeight += (targetFlinch - this.flinchWeight) * Math.min(1, dt * 9.0);

    if (this.peekWeight > 0.01 && this.bones.spine1 && this.bones.spine2) {
      _tmpEuler.set(0.06 * this.peekWeight, 0.1 * this.peekWeight, -0.16 * this.peekWeight);
      _tmpQuat.setFromEuler(_tmpEuler);
      this.bones.spine1.quaternion.multiply(_tmpQuat);
      this.bones.spine2.quaternion.multiply(_tmpQuat);
    }

    if (this.bones.neck && this.bones.head) {
      const toCamYaw = Math.atan2(cameraPos.x - this.worldPos.x, cameraPos.z - this.worldPos.z);
      let relYaw = toCamYaw - this.currentYaw;
      while (relYaw > Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      relYaw = THREE.MathUtils.clamp(relYaw, -0.78, 0.78);

      const twitch =
        this.config.id === 'valdir' && Math.sin(time * 7.3) > 0.92
          ? (Math.random() - 0.5) * 0.26
          : Math.sin(time * 1.9 + 1.3) * 0.035;

      const flinchTurn = this.flinchWeight * 0.52;
      const flinchPitch = this.flinchWeight * 0.28;

      _tmpEuler.set(flinchPitch * 0.4, relYaw * 0.38 - flinchTurn * 0.4, twitch * 0.4);
      this.bones.neck.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));

      _tmpEuler.set(
        -0.06 + flinchPitch * 0.6,
        relYaw * 0.52 - flinchTurn * 0.6,
        0.08 * this.peekWeight + twitch
      );
      this.bones.head.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
    }

    if (this.flinchWeight > 0.01 && this.bones.leftArm && this.bones.leftForeArm) {
      _tmpEuler.set(-1.15 * this.flinchWeight, 0.35 * this.flinchWeight, 0.25 * this.flinchWeight);
      this.bones.leftArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      _tmpEuler.set(-1.05 * this.flinchWeight, 0, 0);
      this.bones.leftForeArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
    }

    const targetMouth =
      this.flinchWeight > 0.2
        ? 0.78
        : pose === 'doorBreach' || pose === 'windowBreach'
          ? 0.45 + Math.sin(time * 6.0) * 0.18
          : 0.12 + Math.max(0, Math.sin(time * 2.2)) * 0.14;
    this.mouthOpenVal += (targetMouth - this.mouthOpenVal) * Math.min(1, dt * 8.0);
    this.setJawMorph(this.mouthOpenVal, pose === 'doorPeek' ? 0.22 : 0.05);
  }

  setPose(
    pose: TeacherPose,
    enterAnim: number,
    time: number,
    cameraPos: THREE.Vector3
  ): void {
    this.updatePose({
      dt: 1 / 60,
      pose,
      enterAnim,
      time,
      cameraPos,
    });
  }
}
