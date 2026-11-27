import * as THREE from 'three';
import { TeacherConfig } from '../types';
import {
  createGrittySkinPBR,
  createStainedShirtPBR,
  createWornSuitPBR,
  heightToNormalTexture,
  PBRTextureSet,
  renderSlasherFaceBuffers,
  scalarToRoughnessTexture,
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

// Cache compartilhado para tecidos base comuns entre rigs
let sharedShirtPBR: PBRTextureSet | null = null;
let sharedPantsPBR: PBRTextureSet | null = null;

function getSharedShirtPBR(): PBRTextureSet {
  if (!sharedShirtPBR) sharedShirtPBR = createStainedShirtPBR(17);
  return sharedShirtPBR;
}

function getSharedPantsPBR(): PBRTextureSet {
  if (!sharedPantsPBR) sharedPantsPBR = createWornSuitPBR(0x141519, 88);
  return sharedPantsPBR;
}

/**
 * Deforma vértices de uma malha com dobras orgânicas de tecido amassado / assimetria corporal
 * para eliminar qualquer aparência de "cilindro liso de boneco".
 */
function crumpleGeometry(
  geo: THREE.BufferGeometry,
  ampX: number,
  ampY: number,
  ampZ: number,
  freq: number,
  seed: number
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n1 = Math.sin(y * freq + x * (freq * 0.7) + seed) * Math.cos(z * freq - seed * 0.5);
    const n2 = Math.sin(y * (freq * 2.1) - z * (freq * 1.4) + seed * 1.7) * 0.5;
    const w = n1 + n2;
    pos.setXYZ(i, x + w * ampX, y + n1 * ampY, z + w * ampZ);
  }
  geo.computeVertexNormals();
  return geo;
}

export class TeacherRig {
  readonly root = new THREE.Group();
  readonly headGroup = new THREE.Group();
  readonly leftArm = new THREE.Group();
  readonly rightArm = new THREE.Group();
  readonly tiePivot = new THREE.Group();
  readonly eyeGlowLeft: THREE.Mesh;
  readonly eyeGlowRight: THREE.Mesh;

  private faceTexture: THREE.CanvasTexture;
  private faceMat: THREE.MeshStandardMaterial;
  private badgeCanvas: HTMLCanvasElement;
  private badgeTexture: THREE.CanvasTexture;
  private config: TeacherConfig;
  private customPhotoImg: HTMLImageElement | null = null;
  private displayName: string;

  constructor(config: TeacherConfig, displayName?: string, photoDataUrl?: string) {
    this.config = config;
    this.displayName = displayName || config.defaultName;

    const seedMap: Record<string, number> = {
      marcos: 1,
      helena: 2,
      ricardo: 3,
      valdir: 4,
      celia: 5,
    };
    const seed = seedMap[config.id] ?? 1;

    // Inicializa texturas faciais PBR (Albedo + Normal + Roughness)
    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = 256;
    dummyCanvas.height = 256;
    this.faceTexture = new THREE.CanvasTexture(dummyCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;

    this.faceMat = new THREE.MeshStandardMaterial({
      map: this.faceTexture,
      roughness: 0.75,
      metalness: 0.02,
      transparent: true,
      normalScale: new THREE.Vector2(1.45, 1.45),
    });

    this.badgeCanvas = document.createElement('canvas');
    this.badgeCanvas.width = 128;
    this.badgeCanvas.height = 160;
    this.badgeTexture = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTexture.colorSpace = THREE.SRGBColorSpace;

    // Materiais PBR surrados estilo filme 16mm / Slasher 1974
    const skinPBR = createGrittySkinPBR(config.skinColor, seed * 13);
    const suitDarkHex = new THREE.Color(config.suitColor).multiplyScalar(0.62).getHex();
    const suitPBR = createWornSuitPBR(suitDarkHex, seed * 29);
    const shirtPBR = getSharedShirtPBR();
    const pantsPBR = getSharedPantsPBR();

    const skinMat = new THREE.MeshStandardMaterial({
      map: skinPBR.map,
      normalMap: skinPBR.normalMap,
      roughnessMap: skinPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.72,
    });

    const suitMat = new THREE.MeshStandardMaterial({
      map: suitPBR.map,
      normalMap: suitPBR.normalMap,
      roughnessMap: suitPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughness: 0.92,
    });

    const shirtMat = new THREE.MeshStandardMaterial({
      map: shirtPBR.map,
      normalMap: shirtPBR.normalMap,
      roughnessMap: shirtPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.88,
    });

    const pantsMat = new THREE.MeshStandardMaterial({
      map: pantsPBR.map,
      normalMap: pantsPBR.normalMap,
      roughnessMap: pantsPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.9,
    });

    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x12100f,
      normalMap: pantsPBR.normalMap,
      roughness: 0.42,
      metalness: 0.08,
    });

    const tieColor = new THREE.Color(config.secondaryColor).multiplyScalar(0.45).getHex();
    const tieMat = new THREE.MeshStandardMaterial({
      color: tieColor,
      normalMap: suitPBR.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.84,
    });

    const hairColorDark = new THREE.Color(config.hairColor).multiplyScalar(0.55).getHex();
    const hairMat = new THREE.MeshStandardMaterial({
      color: hairColorDark,
      normalMap: suitPBR.normalMap,
      roughness: 0.94,
    });

    // Proporção física: Marcos e Valdir mais largos/corpulentos (estilo silhueta Leatherface!)
    const bulkX = config.id === 'marcos' ? 1.14 : config.id === 'valdir' ? 1.09 : 1.0;
    const bulkZ = config.id === 'marcos' ? 1.12 : 1.02;

    // ==================== PERNAS AMASSADAS E SAPATOS SURRADOS ====================
    [-1, 1].forEach((side) => {
      const legGeo = crumpleGeometry(
        new THREE.CylinderGeometry(0.086 * bulkX, 0.068, 0.86, 14, 8),
        0.008,
        0.003,
        0.01,
        14,
        seed + side
      );
      const leg = new THREE.Mesh(legGeo, pantsMat);
      leg.position.set(0.112 * side * bulkX, 0.44, 0);
      leg.castShadow = true;
      this.root.add(leg);

      const shoeGeo = crumpleGeometry(
        new THREE.BoxGeometry(0.13, 0.085, 0.26, 4, 3, 5),
        0.004,
        0.003,
        0.005,
        18,
        seed * 3 + side
      );
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(0.112 * side * bulkX, 0.042, 0.05);
      shoe.castShadow = true;
      this.root.add(shoe);
    });

    // ==================== TRONCO INTERNO: CAMISA SOCIAL BRANCA ENCARDIDA E AMARROTADA ====================
    const innerTorsoGeo = crumpleGeometry(
      new THREE.CylinderGeometry(0.205 * bulkX, 0.185 * bulkX, 0.64, 20, 10),
      0.012,
      0.006,
      0.014,
      16,
      seed + 11
    );
    const innerTorso = new THREE.Mesh(innerTorsoGeo, shirtMat);
    innerTorso.position.set(0, 1.15, 0.01);
    innerTorso.scale.set(1.04, 1, 0.72 * bulkZ);
    innerTorso.castShadow = true;
    this.root.add(innerTorso);

    // Gola da camisa aberta e torta (igual à referência!)
    [-1, 1].forEach((side) => {
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.065, 0.02), shirtMat);
      collar.position.set(side * 0.062, 1.455, 0.115 * bulkZ);
      collar.rotation.set(0.28, side * -0.35, side * -0.48);
      this.root.add(collar);
    });

    // Botões escuros desalinhados na camisa
    for (let b = 0; b < 4; b++) {
      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.008, 8),
        shoeMat
      );
      btn.rotation.x = Math.PI / 2;
      btn.position.set((b % 2 === 0 ? 1 : -1) * 0.003, 1.34 - b * 0.09, 0.146 * bulkZ);
      this.root.add(btn);
    }

    // ==================== PALETÓ ESCURO SURRADO ABERTO NAS FRENTES ====================
    // Costas e laterais do paletó pesado
    const coatBackGeo = crumpleGeometry(
      new THREE.CylinderGeometry(
        0.228 * bulkX,
        0.215 * bulkX,
        0.69,
        20,
        8,
        false,
        Math.PI * 0.22,
        Math.PI * 1.56
      ),
      0.014,
      0.008,
      0.014,
      13,
      seed + 23
    );
    const coatBack = new THREE.Mesh(coatBackGeo, suitMat);
    coatBack.position.set(0, 1.14, 0);
    coatBack.scale.set(1.06, 1, 0.78 * bulkZ);
    coatBack.castShadow = true;
    this.root.add(coatBack);

    // Duas abas frontais abertas do paletó + lapelas tortas enquadrando a camisa manchada!
    [-1, 1].forEach((side) => {
      const panelGeo = crumpleGeometry(
        new THREE.BoxGeometry(0.125 * bulkX, 0.67, 0.045, 4, 8, 2),
        0.008,
        0.006,
        0.01,
        15,
        seed + side * 7
      );
      const panel = new THREE.Mesh(panelGeo, suitMat);
      panel.position.set(side * 0.145 * bulkX, 1.135, 0.128 * bulkZ);
      panel.rotation.y = side * -0.24;
      panel.rotation.z = side * 0.04;
      panel.castShadow = true;
      this.root.add(panel);

      // Lapela chanfrada
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.26, 0.018), suitMat);
      lapel.position.set(side * 0.095 * bulkX, 1.31, 0.154 * bulkZ);
      lapel.rotation.z = side * 0.26;
      lapel.rotation.y = side * -0.18;
      this.root.add(lapel);
    });

    // Ombros largos levemente curvados/corcundas ("hunched slasher shoulders")
    const shoulderGeo = crumpleGeometry(
      new THREE.BoxGeometry(0.51 * bulkX, 0.125, 0.25 * bulkZ, 6, 3, 4),
      0.009,
      0.008,
      0.009,
      12,
      seed + 41
    );
    const shoulders = new THREE.Mesh(shoulderGeo, suitMat);
    shoulders.position.set(0, 1.43, -0.01);
    shoulders.rotation.x = 0.08;
    shoulders.castShadow = true;
    this.root.add(shoulders);

    // ==================== GRAVATA TORTA ESVOAÇANTE (ASSINATURA VISUAL DA REFERÊNCIA!) ====================
    this.tiePivot.position.set(0, 1.41, 0.148 * bulkZ);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.04, 0.025), tieMat);
    const tieUpper = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.17, 0.014), tieMat);
    tieUpper.position.set(-0.022, -0.09, 0.006);
    tieUpper.rotation.z = -0.24;
    const tieLower = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.19, 0.012), tieMat);
    tieLower.position.set(-0.072, -0.24, 0.018);
    tieLower.rotation.z = -0.42;
    tieLower.rotation.x = -0.12;
    this.tiePivot.add(knot, tieUpper, tieLower);
    this.root.add(this.tiePivot);

    // Crachá ETEC gasto e torto preso no bolso/lapela do paletó
    const badgeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.072, 0.092),
      new THREE.MeshStandardMaterial({ map: this.badgeTexture, roughness: 0.65 })
    );
    badgeMesh.position.set(0.135 * bulkX, 1.24, 0.164 * bulkZ);
    badgeMesh.rotation.z = -0.11;
    badgeMesh.rotation.y = -0.18;
    this.root.add(badgeMesh);

    // ==================== BRAÇOS ENRUGADOS + MÃOS ESCULPIDAS COM DEDOS ====================
    this.leftArm.position.set(-0.27 * bulkX, 1.41, 0);
    this.buildArm(this.leftArm, suitMat, shirtMat, skinMat, -1, seed);
    this.root.add(this.leftArm);

    this.rightArm.position.set(0.27 * bulkX, 1.41, 0);
    const rHand = this.buildArm(this.rightArm, suitMat, shirtMat, skinMat, 1, seed);
    this.attachProp(rHand);
    this.root.add(this.rightArm);

    // ==================== PESCOÇO, CABEÇA ESCULPIDA, ROSTO 3D & CABELO SELVAGEM ====================
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.13, 12), skinMat);
    neck.position.set(0, 1.515, 0.01);
    neck.rotation.x = 0.08;
    this.root.add(neck);

    this.headGroup.position.set(0, 1.665, 0.02);

    // Crânio deformado organicamente
    const craniumGeo = crumpleGeometry(
      new THREE.SphereGeometry(0.126, 26, 22),
      0.005,
      0.005,
      0.005,
      18,
      seed + 59
    );
    const cranium = new THREE.Mesh(craniumGeo, skinMat);
    cranium.scale.set(0.93, 1.15, 0.99);
    cranium.castShadow = true;
    this.headGroup.add(cranium);

    // Malha facial 3D de alta subdivisão com relevo anatômico real (arco superciliar, nariz, órbitas fundas e boca)
    const faceGeo = new THREE.PlaneGeometry(0.188, 0.214, 24, 24);
    const posAttr = faceGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const nx = px / 0.094; // -1 .. 1
      const ny = py / 0.107; // -1 (queixo) .. +1 (testa)

      // Curvatura base envolvendo o crânio
      let z = -0.034 * nx * nx - 0.018 * ny * ny;
      // Arco superciliar saltado
      z += Math.exp(-((ny - 0.32) ** 2) / 0.04) * (1 - nx * nx * 0.6) * 0.011;
      // Cana e ponta do nariz 3D real!
      if (ny > -0.25 && ny < 0.36) {
        z += Math.exp(-(nx * nx) / 0.045) * 0.019 * (1 - Math.abs(ny - 0.02));
      }
      // Cavidades oculares fundas!
      const eyeL = Math.exp(-(((nx + 0.34) / 0.22) ** 2 + ((ny - 0.17) / 0.16) ** 2));
      const eyeR = Math.exp(-(((nx - 0.34) / 0.22) ** 2 + ((ny - 0.17) / 0.16) ** 2));
      z -= (eyeL + eyeR) * 0.014;
      // Cavidade escura da boca entreaberta
      const mouthHollow = Math.exp(-((nx / 0.32) ** 2 + ((ny + 0.51) / 0.14) ** 2));
      z -= mouthHollow * 0.012;

      posAttr.setZ(i, z);
    }
    faceGeo.computeVertexNormals();

    const faceMesh = new THREE.Mesh(faceGeo, this.faceMat);
    faceMesh.position.set(0, -0.006, 0.124);
    this.headGroup.add(faceMesh);

    // Orelhas pálidas esculpidas
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), skinMat);
      ear.scale.set(0.42, 1.35, 0.82);
      ear.position.set(0.114 * side, -0.004, -0.005);
      this.headGroup.add(ear);
    });

    // CABELO DESGRENHADO E SELVAGEM (Mechas irregulares saltando em silhueta — inspirado na foto!)
    this.buildWildSlasherHair(hairMat, seed);

    // Óculos tortos e trincados (Prof. Ricardo / Coord. Valdir)
    if (config.hasGlasses) {
      const glassesGroup = new THREE.Group();
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x181716,
        metalness: 0.6,
        roughness: 0.38,
      });
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0xc9d4cc,
        transparent: true,
        opacity: 0.24,
        roughness: 0.12,
      });
      [-1, 1].forEach((side) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0035, 8, 20), frameMat);
        rim.position.set(0.042 * side, 0.015, 0.129);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.029, 16), lensMat);
        lens.position.set(0.042 * side, 0.015, 0.13);
        glassesGroup.add(rim, lens);
      });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.004, 0.005), frameMat);
      bridge.position.set(0, 0.018, 0.129);
      glassesGroup.add(bridge);
      // Entorta levemente os óculos para aspecto perturbador!
      glassesGroup.rotation.z = config.id === 'ricardo' ? -0.09 : 0.04;
      this.headGroup.add(glassesGroup);
    }

    // Reflexo ocular minúsculo e frio lá no fundo das órbitas escuras (sem parecer "olho neon de robô")
    const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0xd8cbb8 });
    this.eyeGlowLeft = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 6), eyeGlowMat);
    this.eyeGlowRight = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 6), eyeGlowMat);
    this.eyeGlowLeft.position.set(-0.035, 0.013, 0.123);
    this.eyeGlowRight.position.set(0.035, 0.013, 0.123);
    this.headGroup.add(this.eyeGlowLeft, this.eyeGlowRight);

    this.root.add(this.headGroup);
    this.root.visible = false;

    this.refreshAppearance(this.displayName, photoDataUrl);
  }

  private buildArm(
    armGroup: THREE.Group,
    suitMat: THREE.Material,
    shirtMat: THREE.Material,
    skinMat: THREE.Material,
    side: number,
    seed: number
  ): THREE.Group {
    const sleeveGeo = crumpleGeometry(
      new THREE.CylinderGeometry(0.064, 0.05, 0.54, 14, 7),
      0.007,
      0.004,
      0.008,
      18,
      seed + side * 19
    );
    const sleeve = new THREE.Mesh(sleeveGeo, suitMat);
    sleeve.position.set(0, -0.26, 0);
    sleeve.castShadow = true;

    // Punho branco sujo da camisa saindo da manga do paletó
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.046, 0.045, 12), shirtMat);
    cuff.position.set(0, -0.535, 0);

    // Mão ossuda articulada com palma + dedos curvados
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.58, 0.01);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.068, 0.03), skinMat);
    handGroup.add(palm);

    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.005, 0.052, 6), skinMat);
      finger.position.set(-0.018 + f * 0.012, -0.048, 0.008);
      finger.rotation.x = -0.35;
      handGroup.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.006, 0.042, 6), skinMat);
    thumb.position.set(-side * 0.028, -0.018, 0.014);
    thumb.rotation.z = side * 0.55;
    thumb.rotation.x = -0.25;
    handGroup.add(thumb);

    armGroup.add(sleeve, cuff, handGroup);
    return handGroup;
  }

  private buildWildSlasherHair(hairMat: THREE.Material, seed: number): void {
    // Base volumosa irregular
    const capGeo = crumpleGeometry(
      new THREE.SphereGeometry(0.134, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.66),
      0.012,
      0.01,
      0.012,
      14,
      seed + 77
    );
    const hairCap = new THREE.Mesh(capGeo, hairMat);
    hairCap.scale.set(1.02, 1.16, 1.06);
    hairCap.rotation.x = -0.26;
    hairCap.position.set(0, 0.014, -0.012);
    this.headGroup.add(hairCap);

    // Tufos e mechas desgrenhadas saltando para fora (recriando a cabeleira bagunçada da foto!)
    const tuftCount = this.config.isFemale ? 26 : 22;
    for (let i = 0; i < tuftCount; i++) {
      const t = i / tuftCount;
      // Evita cobrir o centro dos olhos, concentrando nas têmporas, topo e nuca
      const azimuth = Math.PI * 0.24 + t * Math.PI * 1.52;
      const elev = -0.15 + ((i * 37 + seed * 11) % 10) * 0.095;

      const tuftLen = this.config.isFemale ? 0.13 + (i % 3) * 0.035 : 0.085 + (i % 4) * 0.022;
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.026 + (i % 3) * 0.006, tuftLen, 6),
        hairMat
      );

      const rx = Math.sin(azimuth) * 0.118;
      const rz = Math.cos(azimuth) * 0.118 - 0.012;
      const ry = 0.02 + Math.sin(elev) * 0.095;

      tuft.position.set(rx, ry, rz);
      tuft.rotation.set(
        (Math.cos(azimuth) - 0.2) * 0.85,
        azimuth * 0.3,
        -Math.sin(azimuth) * (this.config.isFemale ? 1.15 : 1.35)
      );
      this.headGroup.add(tuft);
    }

    if (this.config.isFemale) {
      // Coque desmanchado na nuca com mechas soltas escorridas de chuva
      const messyBun = new THREE.Mesh(
        crumpleGeometry(new THREE.SphereGeometry(0.072, 12, 10), 0.01, 0.01, 0.01, 16, seed),
        hairMat
      );
      messyBun.position.set(0.012, 0.018, -0.148);
      this.headGroup.add(messyBun);
    }
  }

  private attachProp(hand: THREE.Object3D): void {
    switch (this.config.propType) {
      case 'ruler': {
        // Régua pesada de oficina/lousa em madeira lascada com cantoneira metálica enferrujada!
        const grp = new THREE.Group();
        const woodBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.048, 0.78, 0.016),
          new THREE.MeshStandardMaterial({ color: 0x6e4e2a, roughness: 0.82 })
        );
        const steelEdge = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.78, 0.018),
          new THREE.MeshStandardMaterial({ color: 0x6a6e73, metalness: 0.78, roughness: 0.36 })
        );
        steelEdge.position.x = 0.024;
        const crossHead = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.045, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x4d351b, roughness: 0.85 })
        );
        crossHead.position.y = -0.37;
        grp.add(woodBar, steelEdge, crossHead);
        grp.position.set(-0.04, -0.24, 0.16);
        grp.rotation.set(0.78, 0.15, 0.32);
        hand.add(grp);
        break;
      }
      case 'clipboard': {
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(0.23, 0.32, 0.016),
          new THREE.MeshStandardMaterial({ color: 0x3d2718, roughness: 0.85 })
        );
        const clip = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.035, 0.026),
          new THREE.MeshStandardMaterial({ color: 0x5c534a, metalness: 0.7, roughness: 0.45 })
        );
        clip.position.set(0, 0.145, 0.01);
        const paper = new THREE.Mesh(
          new THREE.PlaneGeometry(0.19, 0.25),
          new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.92 })
        );
        paper.position.z = 0.01;
        board.add(clip, paper);
        board.position.set(-0.04, -0.05, 0.12);
        board.rotation.x = -0.5;
        hand.add(board);
        break;
      }
      case 'tablet': {
        const tab = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.27, 0.016),
          new THREE.MeshStandardMaterial({
            color: 0x111417,
            emissive: 0x1d4729,
            emissiveIntensity: 0.65,
            roughness: 0.28,
          })
        );
        tab.position.set(-0.03, -0.04, 0.11);
        tab.rotation.x = -0.45;
        hand.add(tab);
        break;
      }
      case 'ledger': {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.34, 0.055),
          new THREE.MeshStandardMaterial({
            color: 0x36090e,
            emissive: 0x1c0205,
            roughness: 0.68,
          })
        );
        const pages = new THREE.Mesh(
          new THREE.BoxGeometry(0.235, 0.32, 0.044),
          new THREE.MeshStandardMaterial({ color: 0xbdb297, roughness: 0.92 })
        );
        pages.position.x = 0.008;
        book.add(pages);
        book.position.set(-0.05, -0.04, 0.12);
        book.rotation.x = -0.4;
        hand.add(book);
        break;
      }
      case 'bell': {
        const bellGroup = new THREE.Group();
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.018, 0.11, 8),
          new THREE.MeshStandardMaterial({ color: 0x2b1b10, roughness: 0.8 })
        );
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.072, 0.13, 16),
          new THREE.MeshStandardMaterial({ color: 0x8c6d2c, metalness: 0.72, roughness: 0.44 })
        );
        cone.position.y = -0.09;
        bellGroup.add(handle, cone);
        bellGroup.position.set(0, -0.04, 0.06);
        bellGroup.rotation.x = 0.4;
        hand.add(bellGroup);
        break;
      }
    }
  }

  refreshAppearance(displayName: string, photoDataUrl?: string): void {
    this.displayName = displayName;
    this.drawBadge();
    if (photoDataUrl) {
      const img = new Image();
      img.onload = () => {
        this.customPhotoImg = img;
        this.rebuildFacePBR();
      };
      img.onerror = () => {
        this.customPhotoImg = null;
        this.rebuildFacePBR();
      };
      img.src = photoDataUrl;
    } else {
      this.customPhotoImg = null;
      this.rebuildFacePBR();
    }
  }

  private drawBadge(): void {
    const x = this.badgeCanvas.getContext('2d')!;
    x.fillStyle = '#d8d3c5';
    x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#7d141d';
    x.fillRect(0, 0, 128, 34);
    x.fillStyle = '#e8e2d5';
    x.font = 'bold 15px Georgia';
    x.textAlign = 'center';
    x.fillText('ETEC SEBRAE', 64, 23);

    x.fillStyle = '#1b1b1d';
    x.fillRect(28, 46, 72, 64);
    x.fillStyle = '#1f1c19';
    x.font = 'bold 13px monospace';
    x.fillText(this.displayName.slice(0, 14), 64, 134);
    this.badgeTexture.needsUpdate = true;
  }

  private rebuildFacePBR(): void {
    const { canvas, heightField, roughField } = renderSlasherFaceBuffers(
      this.config,
      this.customPhotoImg
    );

    const size = canvas.width;
    const faceNormal = heightToNormalTexture(
      heightField,
      size,
      size,
      2.8,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping
    );
    const faceRough = scalarToRoughnessTexture(
      roughField,
      size,
      size,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping
    );

    if (this.faceMat.normalMap) this.faceMat.normalMap.dispose();
    if (this.faceMat.roughnessMap) this.faceMat.roughnessMap.dispose();

    this.faceTexture.image = canvas;
    this.faceTexture.needsUpdate = true;
    this.faceMat.normalMap = faceNormal;
    this.faceMat.roughnessMap = faceRough;
    this.faceMat.needsUpdate = true;

    // Atualiza miniatura granulada no crachá
    const bx = this.badgeCanvas.getContext('2d')!;
    bx.drawImage(canvas, 28, 46, 72, 64);
    this.badgeTexture.needsUpdate = true;
  }

  setPose(pose: TeacherPose, anim01: number, time: number, cameraPos: THREE.Vector3): void {
    if (pose === 'hidden') {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    this.root.scale.setScalar(1);
    this.leftArm.rotation.set(-0.18, 0, 0.08);
    this.rightArm.rotation.set(-0.48, -0.14, -0.08);
    // Cabeça levemente inclinada e pesada como em slashers clássicos
    this.headGroup.rotation.set(
      0.06 + Math.sin(time * 1.4) * 0.025,
      0,
      -0.09 + Math.sin(time * 1.7) * 0.045
    );
    // Gravata torta balançando sutilmente
    this.tiePivot.rotation.z = Math.sin(time * 2.3) * 0.06;
    this.eyeGlowLeft.visible = !this.customPhotoImg;
    this.eyeGlowRight.visible = !this.customPhotoImg;

    const breathe = Math.sin(time * 2.2) * 0.014;

    switch (pose) {
      case 'corridorFar': {
        this.root.position.set(-7.35, breathe, -1.55);
        this.root.lookAt(-2, 0, 0.4);
        this.headGroup.rotation.z = -0.16;
        break;
      }
      case 'doorPeek': {
        this.root.position.set(-5.38, breathe, -0.45);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.root.rotation.z = -0.09;
        this.headGroup.rotation.z = -0.18;
        break;
      }
      case 'doorBreach': {
        // Avanço pesado inclinadaço para frente estilo corrida do Leatherface!
        const e = anim01 * anim01 * (3 - 2 * anim01);
        const stride = Math.sin(time * 7.5) * 0.028;
        this.root.position.set(-5.2 + 1.95 * e, breathe + Math.abs(stride), -0.35 + 0.25 * e);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.root.rotation.x += 0.08 * e;
        this.leftArm.rotation.set(-0.55, 0.22, 0.14);
        this.rightArm.rotation.set(-0.88 - Math.sin(time * 3.6) * 0.1, -0.22, -0.12);
        this.tiePivot.rotation.z = -0.22 + Math.sin(time * 6) * 0.12;
        break;
      }
      case 'courtyardFar': {
        this.root.position.set(7.65, breathe, -1.2);
        this.root.lookAt(0, 0, 0.5);
        break;
      }
      case 'windowPeek': {
        this.root.position.set(5.48, breathe, -0.35);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.headGroup.rotation.z = 0.14;
        break;
      }
      case 'windowBreach': {
        const e = anim01 * anim01 * (3 - 2 * anim01);
        this.root.position.set(5.45 - 0.82 * e, breathe, -0.32);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.leftArm.rotation.x = -0.95 * e;
        this.rightArm.rotation.x = -1.02 * e;
        this.tiePivot.rotation.z = -0.18;
        break;
      }
      case 'boardApparition': {
        this.root.position.set(-1.15, breathe, -3.65);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.rightArm.rotation.x = -0.85;
        break;
      }
      case 'jumpscare': {
        this.root.position.set(0, 1.46 - 1.64, 0.22);
        this.root.rotation.set(0.08, 0, Math.sin(time * 42) * 0.09);
        this.leftArm.rotation.set(-1.38, 0.28, 0.35);
        this.rightArm.rotation.set(-1.42, -0.28, -0.35);
        this.tiePivot.rotation.z = -0.45 + Math.sin(time * 48) * 0.25;
        this.headGroup.rotation.set(
          Math.sin(time * 36) * 0.1,
          Math.cos(time * 28) * 0.09,
          Math.sin(time * 50) * 0.15
        );
        break;
      }
    }
  }
}
