import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TeacherConfig } from '../types';
import {
  LoadedOutlastRigAssets,
  loadOutlastRigAssets,
  MocapClipName,
} from './GlbAssetLoader';
import { createGrittySkinPBR } from './ProceduralTextures';

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
}

let sharedSkinNormal: THREE.DataTexture | null = null;
let sharedSkinRough: THREE.DataTexture | null = null;

function ensureSharedSkinMaps(): { normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture } {
  if (!sharedSkinNormal || !sharedSkinRough) {
    const pbr = createGrittySkinPBR(0x9a8f84, 73);
    sharedSkinNormal = pbr.normalMap;
    sharedSkinRough = pbr.roughnessMap;
  }
  return { normalMap: sharedSkinNormal, roughnessMap: sharedSkinRough };
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

  // Ossos principais para IK aditivo (olhar, inclinação na fresta da porta, recuo à lanterna)
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
    leftEye?: THREE.Object3D;
    rightEye?: THREE.Object3D;
  } = {};

  private morphMeshes: THREE.Mesh[] = [];
  private eyeMats: THREE.MeshStandardMaterial[] = [];
  private tapetumMeshes: THREE.Mesh[] = [];
  private skinMat: THREE.MeshStandardMaterial | null = null;
  private baseSkinImage: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null = null;

  private badgeCanvas: HTMLCanvasElement;
  private badgeTexture: THREE.CanvasTexture;

  // Estado contínuo de locomoção no espaço 3D (zero teleporte!)
  private currentPose: TeacherPose = 'hidden';
  private lastActiveSide: 'L' | 'R' | 'C' = 'L';
  private isRetreating = false;
  private worldPos = new THREE.Vector3(-18.5, 0, -0.55);
  private targetPos = new THREE.Vector3(-18.5, 0, -0.55);
  private currentYaw = Math.PI / 2;
  private peekWeight = 0;
  private flinchWeight = 0;
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

    // Escala anatômica individual por docente
    if (this.config.id === 'marcos') {
      cloned.scale.set(1.09, 1.03, 1.08);
    } else if (this.config.id === 'valdir') {
      cloned.scale.set(0.95, 1.07, 0.95);
    } else if (this.config.id === 'helena') {
      cloned.scale.set(0.94, 1.01, 0.93);
    } else if (this.config.id === 'celia') {
      cloned.scale.set(0.96, 0.97, 0.96);
    } else {
      cloned.scale.set(0.98, 1.0, 0.97);
    }

    const { normalMap: skinNormal, roughnessMap: skinRough } = ensureSharedSkinMaps();
    const isFemale = Boolean(this.config.isFemale);

    // Tonalidade sombria individual de traje e pele estilo Outlast
    const suitTint = new THREE.Color(this.config.suitColor).lerp(new THREE.Color(0x1b2026), 0.45);
    suitTint.multiplyScalar(1.35);

    const skinTintMap: Record<string, number> = {
      marcos: 0xd8cfc6,
      helena: 0xd5d2ce,
      ricardo: 0xc9ced1,
      valdir: 0xb5bec2, // Palidez cadavérica acinzentada
      celia: 0xd0c8c0,
    };
    const skinTint = new THREE.Color(skinTintMap[this.config.id] ?? 0xd2cbc4);

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
      else if (obj.name === 'LeftEye') this.bones.leftEye = obj;
      else if (obj.name === 'RightEye') this.bones.rightEye = obj;

      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Evita frustum culling prematuro em SkinnedMesh durante animações agachadas
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
        mat.normalScale = new THREE.Vector2(0.55, 0.55);
        mat.roughness = 0.66; // Suor frio sutil na pele sob a lanterna
        mat.metalness = 0.02;
        if (oldMat.name === 'Wolf3D_Skin') {
          this.skinMat = mat;
          if (mat.map?.image) {
            this.baseSkinImage = mat.map.image as HTMLImageElement;
          }
        }
      } else if (oldMat.name === 'Wolf3D_Outfit_Top') {
        mat.color.copy(suitTint);
        mat.roughness = 0.88;
        mat.normalScale = new THREE.Vector2(1.35, 1.35);
      } else if (oldMat.name === 'Wolf3D_Outfit_Bottom') {
        mat.color.setHex(0x888d94);
        mat.roughness = 0.9;
      } else if (oldMat.name === 'Wolf3D_Eye') {
        mat.roughness = 0.08;
        mat.metalness = 0.05;
        mat.emissive = new THREE.Color(0x98b89e);
        mat.emissiveIntensity = 0.16;
        this.eyeMats.push(mat);
      } else if (oldMat.name === 'Wolf3D_Teeth') {
        mat.roughness = 0.35;
      }

      mesh.material = mat;
    });

    // Anexa detalhes de terror exclusivos diretamente nos ossos do esqueleto!
    this.attachHeadDetails();
    this.attachBadgeToChest();
    this.attachSignatureProp();

    if (this.customPhotoImg) {
      this.applyCustomPhotoToFace();
    }

    this.root.add(cloned);

    // Inicializa AnimationMixer com todos os clipes reais de captura de movimento
    this.mixer = new THREE.AnimationMixer(cloned);
    (Object.keys(assets.clips) as MocapClipName[]).forEach((clipKey) => {
      const action = this.mixer!.clipAction(assets.clips[clipKey]);
      action.enabled = true;
      this.actions[clipKey] = action;
    });

    this.fadeToAction('idle', 0.01);
  }

  private attachHeadDetails(): void {
    const head = this.bones.head;
    if (!head) return;

    // Reflexo ocular puntiforme estilo filmadora IR Outlast (Tapetum lucidum)
    const tapetumGeo = new THREE.SphereGeometry(0.0085, 8, 8);
    const tapetumMat = new THREE.MeshBasicMaterial({
      color: 0xd8ffea,
      transparent: true,
      opacity: 0.35,
    });
    [-0.031, 0.031].forEach((ex) => {
      const orb = new THREE.Mesh(tapetumGeo, tapetumMat.clone());
      orb.position.set(ex, 0.089, 0.098);
      head.add(orb);
      this.tapetumMeshes.push(orb);
    });

    // Cabelos desgrenhados / úmidos esculpidos sobre o crânio para diferenciar cada silhueta
    const hairColor = new THREE.Color(this.config.hairColor).multiplyScalar(0.5);
    const hairMat = new THREE.MeshStandardMaterial({
      color: hairColor,
      roughness: 0.78,
      metalness: 0.05,
    });

    const scalpCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.104, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    scalpCap.position.set(0, 0.105, -0.012);
    scalpCap.scale.set(0.98, 1.04, 1.08);
    head.add(scalpCap);

    if (this.config.id === 'helena') {
      // Mechas longas escorridas de chuva caindo sobre o rosto (estilo Marta / Outlast 2)
      for (let i = 0; i < 9; i++) {
        const angle = -1.25 + (i / 8) * 2.5;
        const isFrontLock = Math.abs(angle) > 0.88;
        const len = isFrontLock ? 0.24 : 0.29;
        const strand = new THREE.Mesh(
          new THREE.ConeGeometry(0.022, len, 6),
          hairMat
        );
        strand.rotation.x = Math.PI;
        strand.rotation.z = Math.sin(angle) * 0.14;
        strand.position.set(
          Math.sin(angle) * 0.095,
          0.04 - len * 0.32,
          -Math.cos(angle) * 0.088 + (isFrontLock ? 0.085 : 0)
        );
        head.add(strand);
      }
    } else if (this.config.id === 'celia') {
      // Coque severo grisalho desalinhado + mechas soltas
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), hairMat);
      bun.position.set(0, 0.125, -0.118);
      head.add(bun);
    } else if (this.config.id !== 'valdir') {
      // Mechas irregulares desgrenhadas na testa/têmporas
      for (let i = 0; i < 6; i++) {
        const strand = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.085, 5), hairMat);
        strand.rotation.x = Math.PI * 0.85;
        strand.position.set(-0.065 + i * 0.026, 0.145, 0.068 - Math.abs(i - 2.5) * 0.012);
        head.add(strand);
      }
    }

    // Óculos metálicos tortos / lente trincada
    if (this.config.hasGlasses) {
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x2a2824,
        metalness: 0.78,
        roughness: 0.32,
      });
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x9ec0cc,
        transparent: true,
        opacity: 0.32,
        roughness: 0.1,
        metalness: 0.2,
      });
      const glassesGrp = new THREE.Group();
      glassesGrp.position.set(0, 0.088, 0.096);
      // Levemente torto para visual perturbador estilo Outlast
      glassesGrp.rotation.z = this.config.id === 'marcos' ? -0.09 : 0.04;

      [-0.033, 0.033].forEach((gx) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0024, 6, 16), frameMat);
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
        roughness: 0.45,
        side: THREE.DoubleSide,
      })
    );
    badge.position.set(-0.075, 0.04, 0.145);
    badge.rotation.set(-0.08, -0.14, 0.06);
    chest.add(badge);
  }

  private attachSignatureProp(): void {
    const hand = this.bones.rightHand;
    if (!hand) return;

    const propGroup = new THREE.Group();
    // Na hierarquia Mixamo/RPM, +Y aponta ao longo dos dedos; posicionamos na palma fechada
    propGroup.position.set(-0.02, 0.095, 0.025);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4b3522, roughness: 0.78 });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x565c63,
      metalness: 0.75,
      roughness: 0.35,
    });

    switch (this.config.propType) {
      case 'ruler': {
        // Régua pesada de madeira manchada de giz e sangue seco (Prof. Marcos)
        const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.76, 0.012), woodMat);
        ruler.position.set(0, 0.26, 0);
        ruler.rotation.z = 0.18;
        ruler.castShadow = true;
        propGroup.add(ruler);
        break;
      }
      case 'clipboard': {
        // Prancheta de ferro oxidado com provas riscadas de vermelho (Profa. Helena)
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.30, 0.012), woodMat);
        const paper = new THREE.Mesh(
          new THREE.PlaneGeometry(0.19, 0.25),
          new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.92 })
        );
        paper.position.z = 0.008;
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.022), metalMat);
        clip.position.set(0, 0.14, 0.01);
        propGroup.add(board, paper, clip);
        break;
      }
      case 'tablet': {
        // Tablet CFTV trincado iluminando o corredor escuro de azul frio (Prof. Ricardo)
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
        // Diário de Classe encadernado em couro carmesim emanando aura rubra (Coord. Valdir)
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.29, 0.045),
          new THREE.MeshStandardMaterial({
            color: 0x3b080e,
            emissive: 0x240205,
            roughness: 0.65,
          })
        );
        this.propLight = new THREE.PointLight(0xd41c2c, 0.65, 2.8);
        this.propLight.position.set(0, 0.05, 0.14);
        propGroup.add(book, this.propLight);
        break;
      }
      case 'bell': {
        // Sino escolar pesado de latão oxidado (Inspetora Célia)
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), woodMat);
        const cup = new THREE.Mesh(
          new THREE.ConeGeometry(0.075, 0.12, 14),
          new THREE.MeshStandardMaterial({
            color: 0x8d7234,
            metalness: 0.72,
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

    // Mescla a foto customizada de forma orgânica e dessaturada na região facial do UV (0.50, 0.38)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(256, 198, 86, 98, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.72;
    ctx.filter = 'grayscale(72%) contrast(135%) brightness(82%)';
    ctx.drawImage(this.customPhotoImg, 168, 96, 176, 204);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; // glTF usa flipY = false!
    tex.colorSpace = THREE.SRGBColorSpace;
    this.skinMat.map = tex;
    this.skinMat.needsUpdate = true;
  }

  private renderBadge(): void {
    const ctx = this.badgeCanvas.getContext('2d')!;
    ctx.fillStyle = '#cfc9bc';
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = '#5e1116';
    ctx.fillRect(0, 0, 128, 28);
    ctx.fillStyle = '#e8e2d5';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ETEC SEBRAE', 64, 19);

    ctx.fillStyle = '#222428';
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
   * Atualiza locomoção contínua no espaço 3D, crossfade de captura de movimento (mocap)
   * e camada procedural aditiva nos ossos (olhar, espiar pela porta, recuo à lanterna).
   */
  updatePose(opts: PoseUpdateOptions): void {
    const {
      dt,
      pose,
      time,
      cameraPos,
      nightVisionOn = false,
      blindedByFlashlight = false,
    } = opts;

    // 1. Olhos retrorrefletivos IR estilo filmadora Outlast!
    const eyeEmissive = nightVisionOn ? 3.8 : 0.18;
    const tapetumOpacity = nightVisionOn ? 0.96 : 0.28;
    for (const mat of this.eyeMats) {
      mat.emissive.setHex(nightVisionOn ? 0x8effc2 : 0x98b09c);
      mat.emissiveIntensity = eyeEmissive;
    }
    for (const orb of this.tapetumMeshes) {
      const bMat = orb.material as THREE.MeshBasicMaterial;
      bMat.color.setHex(nightVisionOn ? 0xdfffe9 : 0xcbd8cc);
      bMat.opacity = tapetumOpacity;
      orb.scale.setScalar(nightVisionOn ? 1.35 : 0.85);
    }

    // 2. Jumpscare em close visceral!
    if (pose === 'jumpscare') {
      this.currentPose = 'jumpscare';
      this.isRetreating = false;
      this.root.visible = true;
      this.worldPos.set(0, -0.14, 0.24);
      this.root.position.copy(this.worldPos);
      this.root.rotation.set(0, 0, 0);

      this.fadeToAction('sprint', 0.08, 1.45);
      this.mixer?.update(dt);
      this.setJawMorph(0.95, 0.25);

      // Braços avançando contra a lente da filmadora
      if (this.bones.leftArm && this.bones.rightArm) {
        _tmpEuler.set(-0.85, 0.25, -0.2);
        this.bones.leftArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
        _tmpEuler.set(-0.85, -0.25, 0.2);
        this.bones.rightArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      }
      if (this.bones.head) {
        _tmpEuler.set(Math.sin(time * 38) * 0.08, Math.cos(time * 31) * 0.1, Math.sin(time * 27) * 0.12);
        this.bones.head.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      }
      return;
    }

    // 3. Determina transições contínuas de posição no mundo (sem teleporte!)
    if (pose === 'hidden') {
      if (this.currentPose !== 'hidden' && !this.isRetreating) {
        // Foi repelido! Em vez de sumir seco, recua agachado pelas sombras até desaparecer no nevoeiro!
        if (this.lastActiveSide === 'L') {
          this.isRetreating = true;
          this.targetPos.set(-18.2, 0, -0.55);
        } else if (this.lastActiveSide === 'R') {
          this.isRetreating = true;
          this.targetPos.set(13.2, -0.05, -0.5);
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
          // Surge vindo do fundo escuro do corredor (ou já na posição se menu)
          this.worldPos.set(pose === 'corridorFar' ? -15.6 : -8.8, 0, -0.58);
          this.currentYaw = Math.PI / 2;
        }
        this.lastActiveSide = 'L';

        if (pose === 'corridorFar') {
          // Ronda inquieta sob a luz fluorescente piscante ao fundo do corredor Outlast!
          this.targetPos.set(
            -12.4 + Math.sin(time * 0.55) * 0.85,
            0,
            -0.48 + Math.cos(time * 0.42) * 0.38
          );
        } else if (pose === 'doorPeek') {
          // Encosta na quina do batente da porta espiando para dentro da Sala 04
          this.targetPos.set(-5.32, 0, -0.88);
        } else {
          // Invadiu a sala de aula!
          this.targetPos.set(-2.95, 0, -0.28);
        }
      } else if (pose === 'courtyardFar' || pose === 'windowPeek' || pose === 'windowBreach') {
        if (wasCompletelyHidden || this.lastActiveSide !== 'R') {
          this.worldPos.set(pose === 'courtyardFar' ? 12.6 : 8.4, -0.05, -0.55);
          this.currentYaw = -Math.PI / 2;
        }
        this.lastActiveSide = 'R';

        if (pose === 'courtyardFar') {
          this.targetPos.set(
            8.75 + Math.sin(time * 0.48) * 0.45,
            -0.05,
            -0.95 + Math.cos(time * 0.37) * 0.45
          );
        } else if (pose === 'windowPeek') {
          this.targetPos.set(5.42, -0.05, -0.35);
        } else {
          this.targetPos.set(3.35, 0, -0.25);
        }
      } else if (pose === 'boardApparition') {
        this.lastActiveSide = 'C';
        if (wasCompletelyHidden) {
          this.worldPos.set(-0.45, 0, -4.15);
          this.currentYaw = 0;
        }
        this.targetPos.set(
          -0.25 + Math.sin(time * 0.7) * 0.18,
          0,
          -3.95
        );
      }

      this.currentPose = pose;
    }

    // 4. Move suavemente worldPos -> targetPos com velocidade realista casada ao mocap
    _tmpVec.subVectors(this.targetPos, this.worldPos);
    const flatDist = Math.hypot(_tmpVec.x, _tmpVec.z);

    const moveSpeed = this.isRetreating
      ? 2.65
      : pose === 'doorBreach' || pose === 'windowBreach'
        ? 2.85
        : pose === 'corridorFar' || pose === 'courtyardFar'
          ? 0.95
          : 2.35;

    let currentSpeed = 0;
    if (flatDist > 0.03) {
      const step = Math.min(flatDist, moveSpeed * dt);
      currentSpeed = step / Math.max(0.0001, dt);
      this.worldPos.x += (_tmpVec.x / flatDist) * step;
      this.worldPos.z += (_tmpVec.z / flatDist) * step;
      this.worldPos.y += (this.targetPos.y - this.worldPos.y) * Math.min(1, dt * 8);
    } else {
      this.worldPos.copy(this.targetPos);
      if (this.isRetreating) {
        this.isRetreating = false;
        this.currentPose = 'hidden';
        this.root.visible = false;
        return;
      }
    }

    this.root.position.copy(this.worldPos);

    // Orientação corporal suave: ao caminhar olha na direção do avanço; parado/recuando encara o jogador!
    let desiredYaw: number;
    if (!this.isRetreating && flatDist > 0.45) {
      desiredYaw = Math.atan2(_tmpVec.x, _tmpVec.z);
    } else {
      desiredYaw = Math.atan2(cameraPos.x - this.worldPos.x, cameraPos.z - this.worldPos.z);
    }

    // Interpolação angular curta sem salto em +-PI
    let diffYaw = desiredYaw - this.currentYaw;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
    this.currentYaw += diffYaw * Math.min(1, dt * 7.5);
    this.root.rotation.set(0, this.currentYaw, 0);

    // 5. Seleção fluida de clipe de captura de movimento (Idle / Walk / Stalk / Retreat / Sprint)
    const walkClip: MocapClipName = this.config.isFemale ? 'walkFem' : 'walk';
    if (this.isRetreating) {
      this.fadeToAction('retreat', 0.25, 1.18);
    } else if (currentSpeed > 2.45) {
      this.fadeToAction(this.config.id === 'celia' ? walkClip : 'stalk', 0.24, 1.32);
    } else if (currentSpeed > 0.35) {
      const useStalk = this.config.id === 'marcos' || this.config.id === 'ricardo';
      this.fadeToAction(useStalk ? 'stalk' : walkClip, 0.32, Math.max(0.72, currentSpeed * 0.62));
    } else {
      this.fadeToAction('idle', 0.42, this.config.id === 'valdir' ? 0.78 : 0.92);
    }

    this.mixer?.update(dt);

    // 6. Camada IK Aditiva pós-mocap: inclinação na fresta da porta, olho-no-olho e reação à lanterna!
    const isPeekingDoor = !this.isRetreating && pose === 'doorPeek' && flatDist < 0.38;
    const targetPeek = isPeekingDoor ? 1 : 0;
    this.peekWeight += (targetPeek - this.peekWeight) * Math.min(1, dt * 6.0);

    const targetFlinch = blindedByFlashlight ? 1 : 0;
    this.flinchWeight += (targetFlinch - this.flinchWeight) * Math.min(1, dt * 9.0);

    // Inclinação lateral sinistra pela fresta do batente da porta + mão segurando o portal
    if (this.peekWeight > 0.01) {
      if (this.bones.spine1 && this.bones.spine2) {
        _tmpEuler.set(0.08 * this.peekWeight, 0.12 * this.peekWeight, -0.22 * this.peekWeight);
        _tmpQuat.setFromEuler(_tmpEuler);
        this.bones.spine1.quaternion.multiply(_tmpQuat);
        this.bones.spine2.quaternion.multiply(_tmpQuat);
      }
      if (this.bones.leftArm && this.bones.leftForeArm) {
        _tmpEuler.set(-0.48 * this.peekWeight, 0.22 * this.peekWeight, 0.35 * this.peekWeight);
        this.bones.leftArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
        _tmpEuler.set(-0.55 * this.peekWeight, 0, 0);
        this.bones.leftForeArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      }
    }

    // Rastreamento ocular e cervical mirando diretamente o jogador + espasmos estilo Loutermilch (Outlast 2)
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
        0.09 * this.peekWeight + twitch
      );
      this.bones.head.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
    }

    // Reação visceral ao facho de halogênio da Lanterna [F]: protege o rosto com o antebraço e rosna!
    if (this.flinchWeight > 0.01 && this.bones.leftArm && this.bones.leftForeArm) {
      _tmpEuler.set(-1.15 * this.flinchWeight, 0.35 * this.flinchWeight, 0.25 * this.flinchWeight);
      this.bones.leftArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
      _tmpEuler.set(-1.05 * this.flinchWeight, 0, 0);
      this.bones.leftForeArm.quaternion.multiply(_tmpQuat.setFromEuler(_tmpEuler));
    }

    // Boca entreaberta respirando pesado no escuro ou escancarada ao ser ofuscado / atacar
    const targetMouth =
      this.flinchWeight > 0.2
        ? 0.78
        : pose === 'doorBreach' || pose === 'windowBreach'
          ? 0.45 + Math.sin(time * 6.0) * 0.18
          : 0.12 + Math.max(0, Math.sin(time * 2.2)) * 0.14;
    this.mouthOpenVal += (targetMouth - this.mouthOpenVal) * Math.min(1, dt * 8.0);
    this.setJawMorph(this.mouthOpenVal, pose === 'doorPeek' ? 0.22 : 0.05);
  }

  /** Compatibilidade legada simples caso algum trecho chame setPose */
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
