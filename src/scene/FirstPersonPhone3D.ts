import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GameSnapshot } from '../types';
import { loadOutlastRigAssets } from './GlbAssetLoader';
import { createGrittySkinPBR, createLockerMetalPBR } from './ProceduralTextures';

// Dimensões físicas reais do smartphone em metros (espaço local do phoneGroup)
const PHONE_W = 0.084;
const PHONE_H = 0.172;
const LCD_W = 0.0742;
const LCD_H = 0.139;
const LCD_CENTER_Y = 0.0005;
const FRONT_FACE_Z = 0.0056;

// Dimensões fixas em pixels CSS do painel DOM projetado via homografia matrix3d
export const PHONE_DOM_W = 300;
export const PHONE_DOM_H = 562;

/** Cria um Shape de retângulo com cantos arredondados centrado em (0, 0) */
function makeRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Filtra os triângulos de uma SkinnedMesh mantendo APENAS os vértices influenciados
 * pelos ossos permitidos do braço/antebraço/mão direita.
 */
function filterSkinnedGeometryByBones(
  skinnedMesh: THREE.SkinnedMesh,
  allowedPrefixes: string[]
): THREE.BufferGeometry {
  const allowedIndices = new Set<number>();
  skinnedMesh.skeleton.bones.forEach((bone, idx) => {
    if (allowedPrefixes.some((p) => bone.name.startsWith(p))) {
      allowedIndices.add(idx);
    }
  });

  const srcGeo = skinnedMesh.geometry;
  const skinIndex = srcGeo.attributes.skinIndex;
  const skinWeight = srcGeo.attributes.skinWeight;
  if (!skinIndex || !skinWeight) return srcGeo;

  const vertCount = srcGeo.attributes.position.count;
  const vertAllowed = new Uint8Array(vertCount);

  for (let v = 0; v < vertCount; v++) {
    let wSum = 0;
    if (allowedIndices.has(skinIndex.getX(v))) wSum += skinWeight.getX(v);
    if (allowedIndices.has(skinIndex.getY(v))) wSum += skinWeight.getY(v);
    if (allowedIndices.has(skinIndex.getZ(v))) wSum += skinWeight.getZ(v);
    if (allowedIndices.has(skinIndex.getW(v))) wSum += skinWeight.getW(v);
    if (wSum >= 0.45) vertAllowed[v] = 1;
  }

  const newGeo = srcGeo.clone();
  const srcIndex = newGeo.index;
  const kept: number[] = [];

  if (srcIndex) {
    const arr = srcIndex.array;
    for (let i = 0; i < arr.length; i += 3) {
      const a = arr[i];
      const b = arr[i + 1];
      const c = arr[i + 2];
      if (vertAllowed[a] && vertAllowed[b] && vertAllowed[c]) {
        kept.push(a, b, c);
      }
    }
  } else {
    for (let i = 0; i < vertCount; i += 3) {
      if (vertAllowed[i] && vertAllowed[i + 1] && vertAllowed[i + 2]) {
        kept.push(i, i + 1, i + 2);
      }
    }
  }

  newGeo.setIndex(kept);
  return newGeo;
}

/**
 * Resolve a homografia projetiva 2D -> CSS matrix3d mapeando (0..w, 0..h)
 * exatamente nos 4 cantos projetados em tela (TL, TR, BR, BL) do display 3D!
 */
function computeCssMatrix3d(
  w: number,
  h: number,
  tl: [number, number],
  tr: [number, number],
  br: [number, number],
  bl: [number, number]
): string {
  const src = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const dst = [tl, tr, br, bl];
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    const tmpRow = A[col];
    A[col] = A[pivot];
    A[pivot] = tmpRow;
    const tmpB = b[col];
    b[col] = b[pivot];
    b[pivot] = tmpB;

    const div = A[col][col];
    if (Math.abs(div) < 1e-11) return 'none';
    for (let j = col; j < 8; j++) A[col][j] /= div;
    b[col] /= div;

    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j < 8; j++) A[row][j] -= factor * A[col][j];
      b[row] -= factor * b[col];
    }
  }

  const [h00, h01, h02, h10, h11, h12, h20, h21] = b;
  const vals = [
    h00, h10, 0, h20,
    h01, h11, 0, h21,
    0,   0,   1, 0,
    h02, h12, 0, 1,
  ];
  return `matrix3d(${vals.map((n) => n.toFixed(7)).join(',')})`;
}

export interface PhoneRoomLightState {
  roomFlickerIntensity: number;
  lightningIntensity: number;
}

/**
 * Viewmodel 3D real em WebGL do Smartphone + Braço/Mão Direita Skinned com 20 ossos articulados!
 */
export class FirstPersonPhone3D {
  private canvas: HTMLCanvasElement;
  private phoneDomEl: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private pmremGenerator: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;

  private rigPivot = new THREE.Group();
  private phoneGroup = new THREE.Group();

  private ambientLight!: THREE.HemisphereLight;
  private overheadLight!: THREE.DirectionalLight;
  private screenBounceLight!: THREE.PointLight;
  private skinWarmKeyLight!: THREE.SpotLight;
  private lightningLight!: THREE.DirectionalLight;

  private glassSheenMat!: THREE.MeshBasicMaterial;
  private usbLedMat!: THREE.MeshBasicMaterial;

  private thumbBones: [THREE.Object3D?, THREE.Object3D?, THREE.Object3D?] = [];
  private thumbRestQuats: [THREE.Quaternion?, THREE.Quaternion?, THREE.Quaternion?] = [];
  private gripFingerBones: THREE.Object3D[] = [];
  private gripFingerRestQuats: THREE.Quaternion[] = [];

  private raiseProgress = 0;
  private smoothRotX = 0;
  private smoothRotY = 0;
  private smoothRotZ = 0;

  private tapImpulse = 0;
  private tapTargetU = 0.5;
  private tapTargetV = 0.5;
  private cursorU = 0.7;
  private cursorV = 0.55;

  private clock = 0;
  private vpWidth = window.innerWidth;
  private vpHeight = window.innerHeight;

  private readonly _cTL = new THREE.Vector3();
  private readonly _cTR = new THREE.Vector3();
  private readonly _cBR = new THREE.Vector3();
  private readonly _cBL = new THREE.Vector3();
  private readonly _qTmp = new THREE.Quaternion();
  private readonly _eTmp = new THREE.Euler();

  constructor(appContainer: HTMLElement, phoneDomEl: HTMLElement) {
    this.phoneDomEl = phoneDomEl;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'phone-3d-canvas';
    appContainer.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.vpWidth, this.vpHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    // Reflexos PBR fisicamente corretos (IBL) em titânio escovado e pele 3D!
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = this.pmremGenerator.fromScene(roomEnv, 0.04);
    roomEnv.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.34;

    this.camera = new THREE.PerspectiveCamera(34, this.vpWidth / this.vpHeight, 0.03, 2.5);
    this.camera.position.set(0, 0, 0.48);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(this.rigPivot);
    this.rigPivot.add(this.phoneGroup);

    this.buildLighting();
    this.build3DSmartphoneHardware();
    this.loadAndAttach3DSkinnedRightHand();
    this.bindDomTouchFeedback();

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    this.vpWidth = window.innerWidth;
    this.vpHeight = window.innerHeight;
    this.camera.aspect = this.vpWidth / this.vpHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.vpWidth, this.vpHeight);
  };

  private bindDomTouchFeedback(): void {
    this.phoneDomEl.addEventListener('pointermove', (e) => {
      const rect = this.phoneDomEl.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        this.cursorU = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
        this.cursorV = THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1);
      }
    });

    this.phoneDomEl.addEventListener('pointerdown', (e) => {
      const rect = this.phoneDomEl.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        this.tapTargetU = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
        this.tapTargetV = THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1);
      }
      this.tapImpulse = 1.0;
    });
  }

  private buildLighting(): void {
    // Luz ambiente equilibrada (sem azul excessivo para preservar o tom natural da pele e do metal grafite!)
    this.ambientLight = new THREE.HemisphereLight(0xa8b4c4, 0x2a1f1a, 0.65);
    this.scene.add(this.ambientLight);

    // Luz superior fria-neutra da Sala 04
    this.overheadLight = new THREE.DirectionalLight(0xeef4ff, 1.15);
    this.overheadLight.position.set(-0.22, 0.58, 0.42);
    this.scene.add(this.overheadLight);

    // Brilho emitido pela tela OLED incidindo sobre o polegar 3D e pontas dos dedos esquerdos!
    this.screenBounceLight = new THREE.PointLight(0x8ec5ff, 0.72, 0.28, 1.5);
    this.screenBounceLight.position.set(0.012, -0.005, 0.048);
    this.phoneGroup.add(this.screenBounceLight);

    // Luz lateral sutil destacando os nós dos dedos, tendões do polegar e dobras da manga 3D
    this.skinWarmKeyLight = new THREE.SpotLight(0xffdfc4, 1.25, 1.2, Math.PI / 3, 0.65, 1.1);
    this.skinWarmKeyLight.position.set(0.34, 0.08, 0.36);
    this.scene.add(this.skinWarmKeyLight);

    // Clarão de relâmpago vindo da janela direita!
    this.lightningLight = new THREE.DirectionalLight(0xdbeafe, 0);
    this.lightningLight.position.set(0.68, 0.28, 0.24);
    this.scene.add(this.lightningLight);
  }

  private build3DSmartphoneHardware(): void {
    const metalPBR = createLockerMetalPBR(4);

    // 1. Chassi unibody grafite/titânio escovado com espessura e chanfro 3D reais
    const bodyShape = makeRoundedRectShape(PHONE_W - 0.0026, PHONE_H - 0.0026, 0.0105);
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 0.0078,
      bevelEnabled: true,
      bevelThickness: 0.0014,
      bevelSize: 0.0013,
      bevelSegments: 5,
      curveSegments: 16,
    });
    bodyGeo.center();

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x484c54,
      normalMap: metalPBR.normalMap,
      roughnessMap: metalPBR.roughnessMap,
      normalScale: new THREE.Vector2(0.38, 0.38),
      metalness: 0.82,
      roughness: 0.3,
    });
    const chassisMesh = new THREE.Mesh(bodyGeo, chassisMat);
    chassisMesh.renderOrder = 1;
    this.phoneGroup.add(chassisMesh);

    // Aro metálico acetinado frontal cercando o vidro
    const rimShape = makeRoundedRectShape(PHONE_W - 0.0018, PHONE_H - 0.0018, 0.0108);
    const holeShape = makeRoundedRectShape(PHONE_W - 0.0052, PHONE_H - 0.0052, 0.0092);
    rimShape.holes.push(holeShape);
    const rimGeo = new THREE.ShapeGeometry(rimShape, 18);
    const rimMesh = new THREE.Mesh(
      rimGeo,
      new THREE.MeshStandardMaterial({
        color: 0x6c727c,
        metalness: 0.88,
        roughness: 0.22,
      })
    );
    rimMesh.position.z = FRONT_FACE_Z - 0.00025;
    rimMesh.renderOrder = 1;
    this.phoneGroup.add(rimMesh);

    // Painel frontal de vidro preto Gorilla Glass
    const frontGlassShape = makeRoundedRectShape(PHONE_W - 0.005, PHONE_H - 0.005, 0.0092);
    const frontGlassGeo = new THREE.ShapeGeometry(frontGlassShape, 18);
    const frontGlassMesh = new THREE.Mesh(
      frontGlassGeo,
      new THREE.MeshStandardMaterial({
        color: 0x0a0b0e,
        metalness: 0.18,
        roughness: 0.12,
      })
    );
    frontGlassMesh.position.z = FRONT_FACE_Z - 0.00015;
    frontGlassMesh.renderOrder = 1;
    this.phoneGroup.add(frontGlassMesh);

    // Botões laterais físicos em relevo 3D
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0x585e68,
      metalness: 0.86,
      roughness: 0.25,
    });
    const volUp = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.014, 0.0034), btnMat);
    volUp.position.set(-PHONE_W / 2 - 0.0006, 0.038, 0);
    const volDn = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.014, 0.0034), btnMat);
    volDn.position.set(-PHONE_W / 2 - 0.0006, 0.019, 0);
    const pwrBtn = new THREE.Mesh(
      new THREE.BoxGeometry(0.0022, 0.016, 0.0036),
      new THREE.MeshStandardMaterial({ color: 0x723036, metalness: 0.78, roughness: 0.28 })
    );
    pwrBtn.position.set(PHONE_W / 2 + 0.0006, 0.056, 0);
    volUp.renderOrder = volDn.renderOrder = pwrBtn.renderOrder = 1;
    this.phoneGroup.add(volUp, volDn, pwrBtn);

    // Alto-falante auricular + câmera frontal + sensor inferior
    const slotMat = new THREE.MeshStandardMaterial({
      color: 0x050608,
      roughness: 0.85,
      metalness: 0.2,
    });
    const earpiece = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.0022, 0.001), slotMat);
    earpiece.position.set(-0.001, 0.0765, FRONT_FACE_Z + 0.0001);

    const camHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0024, 0.0024, 0.0008, 16),
      new THREE.MeshStandardMaterial({ color: 0x0d192b, metalness: 0.75, roughness: 0.1 })
    );
    camHousing.rotation.x = Math.PI / 2;
    camHousing.position.set(0.0135, 0.0765, FRONT_FACE_Z + 0.0001);

    const camGlint = new THREE.Mesh(
      new THREE.SphereGeometry(0.00065, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x93c5fd })
    );
    camGlint.position.set(0.013, 0.077, FRONT_FACE_Z + 0.00055);

    const bottomPill = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.0026, 0.001), slotMat);
    bottomPill.position.set(0, -0.0765, FRONT_FACE_Z + 0.0001);

    earpiece.renderOrder = camHousing.renderOrder = camGlint.renderOrder = bottomPill.renderOrder = 1;
    this.phoneGroup.add(earpiece, camHousing, camGlint, bottomPill);

    // Conector USB-C 3D + cabo trançado curvo saindo da base rumo ao Powerbank da carteira
    const usbBoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.011, 0.011, 0.0062),
      new THREE.MeshStandardMaterial({ color: 0x171a21, metalness: 0.55, roughness: 0.42 })
    );
    usbBoot.position.set(0, -PHONE_H / 2 - 0.005, 0);

    this.usbLedMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    const usbLed = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 8, 8), this.usbLedMat);
    usbLed.position.set(0, -PHONE_H / 2 - 0.005, 0.0034);

    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -PHONE_H / 2 - 0.01, 0),
      new THREE.Vector3(-0.006, -PHONE_H / 2 - 0.048, -0.008),
      new THREE.Vector3(-0.028, -PHONE_H / 2 - 0.095, -0.024),
      new THREE.Vector3(-0.065, -PHONE_H / 2 - 0.16, -0.045),
    ]);
    const cordMesh = new THREE.Mesh(
      new THREE.TubeGeometry(cordCurve, 18, 0.0024, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x12151b, roughness: 0.68, metalness: 0.15 })
    );
    usbBoot.renderOrder = usbLed.renderOrder = cordMesh.renderOrder = 1;
    this.phoneGroup.add(usbBoot, usbLed, cordMesh);

    // 2. Recorte de Profundidade (Z-Buffer Punch-Through) da tela OLED
    const punchMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.ZeroFactor,
      depthWrite: true,
      depthTest: true,
    });
    const lcdCutoutQuad = new THREE.Mesh(new THREE.PlaneGeometry(LCD_W, LCD_H), punchMat);
    lcdCutoutQuad.position.set(0, LCD_CENTER_Y, FRONT_FACE_Z + 0.00015);
    lcdCutoutQuad.renderOrder = 2;
    this.phoneGroup.add(lcdCutoutQuad);

    // 3. Reflexo físico sutil sobre o vidro OLED (renderOrder = 3)
    this.glassSheenMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.028,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glassSheen = new THREE.Mesh(new THREE.PlaneGeometry(LCD_W, LCD_H), this.glassSheenMat);
    glassSheen.position.set(0, LCD_CENTER_Y, FRONT_FACE_Z + 0.0003);
    glassSheen.renderOrder = 3;
    this.phoneGroup.add(glassSheen);
  }

  private loadAndAttach3DSkinnedRightHand(): void {
    loadOutlastRigAssets()
      .then((assets) => {
        const cloned = SkeletonUtils.clone(assets.baseScene);
        const skinDetail = createGrittySkinPBR(0xb8866d, 108);

        cloned.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;

          const skinned = obj as THREE.SkinnedMesh;
          mesh.frustumCulled = false;

          if (mesh.name === 'Wolf3D_Body' && skinned.isSkinnedMesh) {
            mesh.geometry = filterSkinnedGeometryByBones(skinned, [
              'RightArm',
              'RightForeArm',
              'RightHand',
            ]);
            const origMat = (Array.isArray(mesh.material)
              ? mesh.material[0]
              : mesh.material) as THREE.MeshStandardMaterial;

            const clonedMap = origMat?.map ? origMat.map.clone() : null;
            if (clonedMap) clonedMap.needsUpdate = true;
            const clonedNormal = origMat?.normalMap ? origMat.normalMap.clone() : skinDetail.normalMap;
            if (clonedNormal) clonedNormal.needsUpdate = true;

            mesh.material = new THREE.MeshStandardMaterial({
              map: clonedMap,
              color: clonedMap ? 0xc8967c : 0x9c6e58,
              normalMap: clonedNormal,
              normalScale: new THREE.Vector2(1.15, 1.15),
              roughness: 0.56,
              metalness: 0.02,
            });
            mesh.renderOrder = 4;
          } else if (mesh.name === 'Wolf3D_Outfit_Top' && skinned.isSkinnedMesh) {
            mesh.geometry = filterSkinnedGeometryByBones(skinned, [
              'RightArm',
              'RightForeArm',
            ]);
            const origTopMat = (Array.isArray(mesh.material)
              ? mesh.material[0]
              : mesh.material) as THREE.MeshStandardMaterial;
            const topNormal = origTopMat?.normalMap
              ? origTopMat.normalMap.clone()
              : skinDetail.normalMap;
            if (topNormal) topNormal.needsUpdate = true;

            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x181d26,
              normalMap: topNormal,
              normalScale: new THREE.Vector2(0.85, 0.85),
              roughness: 0.86,
              metalness: 0.04,
            });
            mesh.renderOrder = 4;
          } else {
            mesh.visible = false;
          }
        });

        const forearm = cloned.getObjectByName('RightForeArm');
        const hand = cloned.getObjectByName('RightHand');
        if (!forearm || !hand || !forearm.parent) return;

        // Monta a pose em um grupo isolado na origem (0, 0, 0) usando ROTAÇÕES PURAS + translação na raiz!
        // Isso preserva 100% do comprimento anatômico dos ossos e posiciona a mão exatamente ao redor do phoneGroup!
        const handHolder = new THREE.Group();
        cloned.scale.setScalar(0.92);
        handHolder.add(cloned);
        handHolder.updateMatrixWorld(true);

        // 1. Orienta o antebraço vindo de baixo-direita (+Y subindo a ~25° para a esquerda)
        const faY = new THREE.Vector3(-0.42, 0.9, 0.06).normalize();
        const faZ = new THREE.Vector3(-0.12, -0.12, 0.985).normalize();
        const faX = new THREE.Vector3().crossVectors(faY, faZ).normalize();
        faZ.crossVectors(faX, faY).normalize();
        const desiredForearmQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(faX, faY, faZ)
        );

        const armParentWorldQuat = new THREE.Quaternion();
        forearm.parent.getWorldQuaternion(armParentWorldQuat);
        forearm.quaternion.copy(armParentWorldQuat.invert().multiply(desiredForearmQuat));
        handHolder.updateMatrixWorld(true);

        // 2. Orienta a palma da mão direita atrás do chassi (+Y para cima-esquerda, +Z para a frente)
        const handY = new THREE.Vector3(-0.82, 0.57, 0.04).normalize();
        const handZ = new THREE.Vector3(-0.18, -0.14, 0.973).normalize();
        const handX = new THREE.Vector3().crossVectors(handY, handZ).normalize();
        handZ.crossVectors(handX, handY).normalize();
        const desiredHandQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(handX, handY, handZ)
        );

        const faWorldQuat = new THREE.Quaternion();
        forearm.getWorldQuaternion(faWorldQuat);
        hand.quaternion.copy(faWorldQuat.invert().multiply(desiredHandQuat));
        handHolder.updateMatrixWorld(true);

        // 3. Translada a raiz para cravar o pulso direito exatamente em (+0.056, -0.076, -0.032) atrás do canto inferior direito!
        const currentWristPos = new THREE.Vector3();
        hand.getWorldPosition(currentWristPos);
        cloned.position.add(new THREE.Vector3(0.056, -0.076, -0.032).sub(currentWristPos));

        // 4. Articula os dedos em 3D: indicador apoiando a traseira; médio, anelar e mínimo segurando a lateral esquerda!
        const rotFinger = (
          prefix: string,
          r1: number,
          r2: number,
          r3: number,
          spreadZ = 0,
          twistY = 0,
          animateGrip = true
        ) => {
          const b1 = hand.getObjectByName(`${prefix}1`);
          const b2 = hand.getObjectByName(`${prefix}2`);
          const b3 = hand.getObjectByName(`${prefix}3`);
          if (b1) {
            b1.quaternion.multiply(
              new THREE.Quaternion().setFromEuler(new THREE.Euler(r1, twistY, spreadZ))
            );
          }
          if (b2) {
            b2.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r2, 0, 0)));
            if (animateGrip) {
              this.gripFingerBones.push(b2);
              this.gripFingerRestQuats.push(b2.quaternion.clone());
            }
          }
          if (b3) {
            b3.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r3, 0, 0)));
          }
        };

        rotFinger('RightHandIndex', -0.22, 0.05, 0.05, -0.18, 0.0, false);
        rotFinger('RightHandMiddle', 0.06, 0.62, 0.22, -0.02, 0.02, true);
        rotFinger('RightHandRing', 0.1, 0.68, 0.26, 0.04, 0.0, true);
        rotFinger('RightHandPinky', 0.18, 0.68, 0.28, 0.12, -0.04, true);

        // 5. Polegar direito 3D subindo ao longo da lateral direita e articulado para tocar a tela!
        const t1 = hand.getObjectByName('RightHandThumb1');
        const t2 = hand.getObjectByName('RightHandThumb2');
        const t3 = hand.getObjectByName('RightHandThumb3');
        if (t1) {
          t1.quaternion.multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0.18, -0.52))
          );
          this.thumbBones[0] = t1;
          this.thumbRestQuats[0] = t1.quaternion.clone();
        }
        if (t2) {
          t2.quaternion.multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.02, 0.0, 0.22))
          );
          this.thumbBones[1] = t2;
          this.thumbRestQuats[1] = t2.quaternion.clone();
        }
        if (t3) {
          t3.quaternion.multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.04, 0.0, 0.1))
          );
          this.thumbBones[2] = t3;
          this.thumbRestQuats[2] = t3.quaternion.clone();
        }

        handHolder.updateMatrixWorld(true);
        this.phoneGroup.add(handHolder);
      })
      .catch((err) => {
        console.error('Erro ao montar mão 3D do celular:', err);
      });
  }

  hideImmediately(): void {
    this.raiseProgress = 0;
    this.canvas.style.display = 'none';
    this.phoneDomEl.style.display = 'none';
  }

  update(
    dt: number,
    snap: GameSnapshot | null,
    mouseNDC: { x: number; y: number },
    roomLights?: PhoneRoomLightState
  ): void {
    if (!snap) {
      this.hideImmediately();
      return;
    }

    this.clock += dt;
    const targetRaise = snap.view === 'P' ? 1 : 0;
    const raiseSpeed = targetRaise > this.raiseProgress ? 6.8 : 7.8;
    this.raiseProgress += (targetRaise - this.raiseProgress) * Math.min(1, dt * raiseSpeed);
    if (targetRaise === 0 && this.raiseProgress < 0.008) {
      this.raiseProgress = 0;
    }

    if (this.raiseProgress <= 0.001) {
      this.canvas.style.display = 'none';
      this.phoneDomEl.style.display = 'none';
      return;
    }

    this.canvas.style.display = 'block';
    this.phoneDomEl.style.display = 'flex';
    this.phoneDomEl.style.pointerEvents =
      snap.view === 'P' && this.raiseProgress > 0.72 ? 'auto' : 'none';

    const ease = 1 - Math.pow(1 - this.raiseProgress, 3);
    const holsterDropY = (1 - ease) * -0.22;
    const holsterDropX = (1 - ease) * 0.07;
    const holsterPitch = (1 - ease) * -0.58;
    const holsterRoll = (1 - ease) * -0.28;

    const isNarrow = this.vpWidth < 820;
    const baseX = isNarrow ? 0.006 : 0.072;
    const baseY = isNarrow ? -0.004 : -0.01;
    const baseZ = isNarrow ? 0.052 : 0.088;

    const breathY = Math.cos(this.clock * 2.05) * 0.0022;
    const breathX = Math.sin(this.clock * 1.35) * 0.0014;
    const tremor =
      snap.dangerLevel > 0.08
        ? Math.sin(this.clock * 27.0) * 0.0022 * snap.dangerLevel
        : 0;

    this.tapImpulse = Math.max(0, this.tapImpulse - dt * 6.2);
    const tapPushZ = -Math.sin(this.tapImpulse * Math.PI) * 0.0032;
    const tapTiltX = Math.sin(this.tapImpulse * Math.PI) * 0.022;

    const desiredRotY = -0.11 - mouseNDC.x * 0.16 + Math.sin(this.clock * 1.1) * 0.012;
    const desiredRotX = 0.04 + mouseNDC.y * 0.11 + holsterPitch + tapTiltX;
    const desiredRotZ = -0.025 - mouseNDC.x * 0.035 + holsterRoll + tremor * 4.0;

    const rotLerp = Math.min(1, dt * 10.0);
    this.smoothRotX += (desiredRotX - this.smoothRotX) * rotLerp;
    this.smoothRotY += (desiredRotY - this.smoothRotY) * rotLerp;
    this.smoothRotZ += (desiredRotZ - this.smoothRotZ) * rotLerp;

    this.rigPivot.position.set(
      baseX + holsterDropX + breathX + tremor - mouseNDC.x * 0.008,
      baseY + holsterDropY + breathY + mouseNDC.y * 0.006,
      baseZ + tapPushZ
    );
    this.rigPivot.rotation.set(this.smoothRotX, this.smoothRotY, this.smoothRotZ);

    this.gripFingerBones.forEach((bone, idx) => {
      const rest = this.gripFingerRestQuats[idx];
      if (!rest) return;
      const microFlex = Math.sin(this.clock * 2.3 + idx * 0.8) * 0.032;
      this._eTmp.set(microFlex, 0, 0);
      bone.quaternion.copy(rest).multiply(this._qTmp.setFromEuler(this._eTmp));
    });

    if (this.thumbBones[0] && this.thumbRestQuats[0]) {
      const tapArc = Math.sin(this.tapImpulse * Math.PI);
      const reachLeft = (1 - this.tapTargetU) * 0.36 * tapArc + (1 - this.cursorU) * 0.05;
      const reachVert = (0.5 - this.tapTargetV) * 0.22 * tapArc + (0.5 - this.cursorV) * 0.04;
      const pressDown = tapArc * 0.28;

      this._eTmp.set(pressDown + reachVert, -reachLeft * 0.4, reachLeft);
      this.thumbBones[0].quaternion
        .copy(this.thumbRestQuats[0])
        .multiply(this._qTmp.setFromEuler(this._eTmp));

      if (this.thumbBones[1] && this.thumbRestQuats[1]) {
        this._eTmp.set(tapArc * 0.24, 0, reachLeft * 0.45);
        this.thumbBones[1].quaternion
          .copy(this.thumbRestQuats[1])
          .multiply(this._qTmp.setFromEuler(this._eTmp));
      }
    }

    if (snap.phoneBattery <= 0) {
      this.screenBounceLight.intensity = 0;
      this.usbLedMat.color.setHex(0xc8232c);
    } else if (snap.valdirPopup) {
      this.screenBounceLight.color.setHex(0xf87171);
      this.screenBounceLight.intensity = 0.8 + Math.sin(this.clock * 8.0) * 0.2;
      this.usbLedMat.color.setHex(0x4ade80);
    } else {
      this.screenBounceLight.color.setHex(0x8ec5ff);
      this.screenBounceLight.intensity = 0.68;
      this.usbLedMat.color.setHex(0x4ade80);
    }

    if (roomLights) {
      this.overheadLight.intensity = 0.65 + roomLights.roomFlickerIntensity * 0.4;
      this.lightningLight.intensity = roomLights.lightningIntensity * 0.65;
    }

    this.glassSheenMat.opacity =
      0.02 + Math.abs(Math.sin(this.smoothRotY * 3.2 + this.smoothRotX * 2.1)) * 0.04;

    this.scene.updateMatrixWorld(true);
    this.syncDomScreenProjection();

    this.renderer.render(this.scene, this.camera);
  }

  private syncDomScreenProjection(): void {
    const hw = LCD_W / 2 + 0.0011;
    const hh = LCD_H / 2 + 0.0011;
    const z = FRONT_FACE_Z + 0.00015;

    this._cTL.set(-hw, LCD_CENTER_Y + hh, z).applyMatrix4(this.phoneGroup.matrixWorld).project(this.camera);
    this._cTR.set(hw, LCD_CENTER_Y + hh, z).applyMatrix4(this.phoneGroup.matrixWorld).project(this.camera);
    this._cBR.set(hw, LCD_CENTER_Y - hh, z).applyMatrix4(this.phoneGroup.matrixWorld).project(this.camera);
    this._cBL.set(-hw, LCD_CENTER_Y - hh, z).applyMatrix4(this.phoneGroup.matrixWorld).project(this.camera);

    const toPx = (ndc: THREE.Vector3): [number, number] => [
      (ndc.x * 0.5 + 0.5) * this.vpWidth,
      (-ndc.y * 0.5 + 0.5) * this.vpHeight,
    ];

    const m3d = computeCssMatrix3d(
      PHONE_DOM_W,
      PHONE_DOM_H,
      toPx(this._cTL),
      toPx(this._cTR),
      toPx(this._cBR),
      toPx(this._cBL)
    );
    this.phoneDomEl.style.transform = m3d;
    this.phoneDomEl.style.opacity = `${Math.min(1, this.raiseProgress * 1.35).toFixed(3)}`;
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.envRT.dispose();
    this.pmremGenerator.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
