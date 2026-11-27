import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { TEACHERS, TEACHER_ORDER } from '../config/teachers';
import { GameSettings, GameSnapshot, TeacherId, ViewDirection } from '../types';
import { OutlastPostProcessing } from './OutlastPostProcessing';
import {
  createBlindsPBR,
  createCeilingPBR,
  createExteriorWallPBR,
  createLockerMetalPBR,
  createNoticeBoardTexture,
  createOutlastCorridorWallPBR,
  createOutlastLinoleumFloorPBR,
  createPeelingPosterTexture,
  createPlaqueTexture,
  createRainGlassPBR,
  createSchoolWallPBR,
  createWetAsphaltPBR,
  createWoodPBR,
  DynamicChalkboard,
  DynamicWallClock,
  PBRTextureSet,
} from './ProceduralTextures';
import { TeacherPose, TeacherRig } from './TeacherModels';

export type WorldHotspot = 'door' | 'window' | 'desk' | 'noticeboard' | 'board';

/** Gera textura suave radial para partículas de poeira em suspensão no ar */
function createDustSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(225, 238, 245, 0.95)');
  g.addColorStop(0.45, 'rgba(185, 208, 220, 0.38)');
  g.addColorStop(1, 'rgba(140, 165, 180, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ClassroomScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(66, 1, 0.08, 38);
  readonly renderer: THREE.WebGLRenderer;
  private postFX: OutlastPostProcessing;

  private chalkboard = new DynamicChalkboard();
  private wallClock = new DynamicWallClock();
  private noticeBoardMat!: THREE.MeshStandardMaterial;

  private wallPBR!: PBRTextureSet;
  private woodPBR!: PBRTextureSet;
  private darkWoodPBR!: PBRTextureSet;

  private doorPivot = new THREE.Group();
  private doorLockLed!: THREE.MeshBasicMaterial;
  private windowLeftPane = new THREE.Group();
  private windowRightPane = new THREE.Group();
  private blindsGroup = new THREE.Group();
  private ceilingFan = new THREE.Group();
  private hangingCables: THREE.Group[] = [];

  private floorReflector!: Reflector;

  private mainLamp!: THREE.PointLight;
  private roomTubeMat!: THREE.MeshBasicMaterial;
  private corridorLight!: THREE.PointLight;
  private corridorFarLight!: THREE.PointLight;
  private corridorTrofferMat!: THREE.MeshBasicMaterial;
  private streetLamp!: THREE.PointLight;
  private lightningLight!: THREE.PointLight;
  private ledgerLight!: THREE.PointLight;

  private flashlight!: THREE.SpotLight;
  private flashlightTarget = new THREE.Object3D();
  private flashlightBeamCone!: THREE.Mesh;

  private irLight!: THREE.SpotLight;
  private irLightTarget = new THREE.Object3D();

  private phoneGlow!: THREE.PointLight;
  private jumpscareLight!: THREE.PointLight;

  private powerbankBars: THREE.MeshBasicMaterial[] = [];
  private deskPhoneGroup = new THREE.Group();
  private deskPhoneScreenMat!: THREE.MeshBasicMaterial;
  private rainLines!: THREE.LineSegments;
  private rainPositions!: Float32Array;

  private dustPoints!: THREE.Points;
  private dustPositions!: Float32Array;

  private teacherRigs: Record<TeacherId, TeacherRig>;
  private jumpscareTeacher: TeacherId | null = null;
  private jumpscareTime = 0;

  private raycaster = new THREE.Raycaster();
  private interactiveObjects: THREE.Object3D[] = [];
  private onHotspotClick?: (hotspot: WorldHotspot) => void;
  private canInteract3D = false;

  private mouseNDC = { x: 0, y: 0 };
  private settings: GameSettings;
  private time = 0;

  // Física amortecida da filmadora na mão (inércia + inclinação lateral estilo Outlast)
  private camYawVel = 0;
  private camPitchVel = 0;
  private camRoll = 0;

  private readonly baseCamPos = new THREE.Vector3(0, 1.46, 1.15);

  constructor(
    container: HTMLElement,
    settings: GameSettings,
    onHotspotClick?: (hotspot: WorldHotspot) => void
  ) {
    this.settings = { ...settings };
    this.onHotspotClick = onHotspotClick;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // EffectComposer + HalfFloat MSAA cuida do anti-aliasing com performance máxima
      powerPreference: 'high-performance',
    });
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = settings.highQualityShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.prepend(this.renderer.domElement);

    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 4);

    // Mapa de ambiente escuro institucional para reflexos metálicos sutis (maçanetas, extintor, bebedouro, óculos)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x091118);
    const envStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x56788a, side: THREE.DoubleSide })
    );
    envStrip.position.set(0, 4, 0);
    envStrip.rotation.x = Math.PI / 2;
    envScene.add(envStrip);
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();

    this.wallPBR = createSchoolWallPBR(maxAniso);
    this.woodPBR = createWoodPBR(false, maxAniso);
    this.darkWoodPBR = createWoodPBR(true, maxAniso);

    // Neblina fria azul-abissal estilo Outlast 2 engolindo o fundo do corredor
    this.scene.background = new THREE.Color(0x020406);
    this.scene.fog = new THREE.FogExp2(0x04080c, 0.068);

    this.camera.position.copy(this.baseCamPos);
    this.camera.rotation.order = 'YXZ';

    this.buildPlanarWetFloor(maxAniso);
    this.buildArchitecture(maxAniso);
    this.buildOutlastCorridor(maxAniso);
    this.buildCourtyardAndRain(maxAniso);
    this.buildFurniture();
    this.buildAtmosphericDust();
    this.buildLighting();

    this.teacherRigs = {} as Record<TeacherId, TeacherRig>;
    for (const id of TEACHER_ORDER) {
      const rig = new TeacherRig(TEACHERS[id]);
      this.scene.add(rig.root);
      this.teacherRigs[id] = rig;
    }

    this.postFX = new OutlastPostProcessing(this.renderer, this.scene, this.camera);

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.addEventListener('click', this.handleCanvasClick);
  }

  private registerHotspot(obj: THREE.Object3D, hotspot: WorldHotspot): void {
    obj.traverse((child) => {
      child.userData.hotspot = hotspot;
    });
    this.interactiveObjects.push(obj);
  }

  private handleCanvasClick = (e: MouseEvent): void => {
    if (!this.canInteract3D || !this.onHotspotClick) return;
    const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    const ny = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveObjects, true);
    if (hits.length > 0) {
      const hs = hits[0].object.userData.hotspot as WorldHotspot | undefined;
      if (hs) this.onHotspotClick(hs);
    }
  };

  private handleResize = (): void => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postFX.setSize(w, h, pr);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    this.mouseNDC.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    this.mouseNDC.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;

    if (this.canInteract3D) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(this.mouseNDC.x, -this.mouseNDC.y),
        this.camera
      );
      const hits = this.raycaster.intersectObjects(this.interactiveObjects, true);
      this.renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    } else {
      this.renderer.domElement.style.cursor = 'default';
    }
  };

  updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.renderer.shadowMap.enabled = settings.highQualityShadows;
    this.mainLamp.castShadow = settings.highQualityShadows;
    this.corridorLight.castShadow = settings.highQualityShadows;
    this.flashlight.castShadow = settings.highQualityShadows;
  }

  refreshTeacherAppearance(id: TeacherId, name: string, photoDataUrl?: string): void {
    this.teacherRigs[id]?.refreshAppearance(name, photoDataUrl);
  }

  setDailyPin(pin: string): void {
    const tex = createNoticeBoardTexture(pin);
    if (this.noticeBoardMat.map) this.noticeBoardMat.map.dispose();
    this.noticeBoardMat.map = tex;
    this.noticeBoardMat.needsUpdate = true;
  }

  triggerJumpscare(id: TeacherId): void {
    this.jumpscareTeacher = id;
    this.jumpscareTime = 0;
  }

  clearJumpscare(): void {
    this.jumpscareTeacher = null;
    this.jumpscareLight.intensity = 0;
  }

  getMouseNDC(): { x: number; y: number } {
    return this.mouseNDC;
  }

  getPhoneRoomLightState(): { roomFlickerIntensity: number; lightningIntensity: number } {
    return {
      roomFlickerIntensity: this.mainLamp ? this.mainLamp.intensity : 1,
      lightningIntensity: this.lightningLight ? this.lightningLight.intensity : 0,
    };
  }

  /**
   * Piso espelhado úmido/encerado com THREE.Reflector sob camada PBR semitransparente de poças!
   * Recria fielmente o reflexo invertido das luminárias, extintor e silhuetas no chão do Outlast 2.
   */
  private buildPlanarWetFloor(maxAniso: number): void {
    const reflectorGeo = new THREE.PlaneGeometry(27, 9.2);
    this.floorReflector = new Reflector(reflectorGeo, {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: 0x3b4954,
    });
    this.floorReflector.rotation.x = -Math.PI / 2;
    this.floorReflector.position.set(-8.0, -0.004, -0.8);
    this.scene.add(this.floorReflector);

    // Piso da Sala 04 (10m x 8.4m) sobre o espelho planar
    const roomFloorSet = createOutlastLinoleumFloorPBR(maxAniso, 6, 5);
    const roomFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8.4),
      new THREE.MeshStandardMaterial({
        map: roomFloorSet.map,
        normalMap: roomFloorSet.normalMap,
        roughnessMap: roomFloorSet.roughnessMap,
        alphaMap: roomFloorSet.alphaMap,
        transparent: true,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 1.0,
        metalness: 0.08,
      })
    );
    roomFloor.rotation.x = -Math.PI / 2;
    roomFloor.position.set(0, 0.001, -0.8);
    roomFloor.receiveShadow = true;
    this.scene.add(roomFloor);

    // Piso longo do Corredor Outlast 2 (16.2m x 4.0m) sobre o espelho planar
    const hallFloorSet = createOutlastLinoleumFloorPBR(maxAniso, 10, 3);
    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(16.2, 4.0),
      new THREE.MeshStandardMaterial({
        map: hallFloorSet.map,
        normalMap: hallFloorSet.normalMap,
        roughnessMap: hallFloorSet.roughnessMap,
        alphaMap: hallFloorSet.alphaMap,
        transparent: true,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughness: 1.0,
        metalness: 0.1,
      })
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(-13.1, 0.001, -0.4);
    hallFloor.receiveShadow = true;
    this.scene.add(hallFloor);
  }

  private buildArchitecture(maxAniso: number): void {
    const ceilPBR = createCeilingPBR(maxAniso);
    const blindsPBR = createBlindsPBR(maxAniso);
    const rainGlass = createRainGlassPBR();

    const wallMat = new THREE.MeshStandardMaterial({
      map: this.wallPBR.map,
      normalMap: this.wallPBR.normalMap,
      roughnessMap: this.wallPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 1.0,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      map: this.darkWoodPBR.map,
      normalMap: this.darkWoodPBR.normalMap,
      roughnessMap: this.darkWoodPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.78,
    });

    const baseboardMat = new THREE.MeshStandardMaterial({
      color: 0x13161a,
      normalMap: this.wallPBR.normalMap,
      roughness: 0.58,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x58626b,
      normalMap: this.wallPBR.normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      metalness: 0.68,
      roughness: 0.38,
    });

    // Teto acústico modulado da Sala 04 + Grelha 3D de perfis metálicos T-Bar
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8.4),
      new THREE.MeshStandardMaterial({
        map: ceilPBR.map,
        normalMap: ceilPBR.normalMap,
        roughnessMap: ceilPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.2, 1.2),
        roughness: 1.0,
      })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.5, -0.8);
    this.scene.add(ceiling);

    const tBarMat = new THREE.MeshStandardMaterial({
      color: 0x7b838a,
      metalness: 0.65,
      roughness: 0.42,
    });
    for (let gx = -4; gx <= 4; gx += 2) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 8.4), tBarMat);
      rail.position.set(gx, 3.488, -0.8);
      this.scene.add(rail);
    }
    for (let gz = -4.2; gz <= 2.8; gz += 1.4) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(10, 0.022, 0.035), tBarMat);
      cross.position.set(0, 3.488, gz);
      this.scene.add(cross);
    }

    // Parede Frontal (Quadro-negro) Z = -5
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.5), wallMat);
    frontWall.position.set(0, 1.75, -5);
    frontWall.receiveShadow = true;
    this.scene.add(frontWall);

    const frontBaseboard = new THREE.Mesh(new THREE.BoxGeometry(10, 0.13, 0.04), baseboardMat);
    frontBaseboard.position.set(0, 0.065, -4.98);
    this.scene.add(frontBaseboard);

    // Parede Traseira Z = +3.4
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.5), wallMat);
    backWall.position.set(0, 1.75, 3.4);
    backWall.rotation.y = Math.PI;
    this.scene.add(backWall);

    // === PAREDE ESQUERDA (X = -5) COM VÃO REAL DA PORTA (Z = -1.15 até +0.35, Y = 0..2.42) ===
    // Dupla face / espessura real para funcionar também como parede leste do Corredor Outlast!
    const addLeftWallPiece = (zStart: number, zEnd: number, yStart: number, yEnd: number) => {
      const w = zEnd - zStart;
      const h = yEnd - yStart;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, w), wallMat);
      mesh.position.set(-5.0, yStart + h / 2, (zStart + zEnd) / 2);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.scene.add(mesh);
    };
    addLeftWallPiece(-5.0, -1.15, 0, 3.5);
    addLeftWallPiece(0.35, 3.4, 0, 3.5);
    addLeftWallPiece(-1.15, 0.35, 2.42, 3.5);

    const bbL1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 3.82), baseboardMat);
    bbL1.position.set(-4.91, 0.065, -3.08);
    const bbL2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 3.02), baseboardMat);
    bbL2.position.set(-4.91, 0.065, 1.88);
    this.scene.add(bbL1, bbL2);

    // Batente pesado de madeira escura da porta
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.44, 0.068), trimMat);
    jambL.position.set(-5.0, 1.22, -1.14);
    const jambR = jambL.clone();
    jambR.position.set(-5.0, 1.22, 0.34);
    const jambTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.075, 1.56), trimMat);
    jambTop.position.set(-5.0, 2.43, -0.4);
    this.scene.add(jambL, jambR, jambTop);

    // Eletroduto aparente + caixa de trava magnética
    const conduitVert = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 2.18, 8),
      metalMat
    );
    conduitVert.position.set(-4.91, 2.41, -1.32);
    const junctionBox = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.09), metalMat);
    junctionBox.position.set(-4.905, 1.05, -1.32);
    this.scene.add(conduitVert, junctionBox);

    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.24),
      new THREE.MeshStandardMaterial({
        map: createPlaqueTexture(),
        normalMap: this.wallPBR.normalMap,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughness: 0.48,
        metalness: 0.25,
      })
    );
    plaque.position.set(-4.91, 2.02, 0.95);
    plaque.rotation.y = Math.PI / 2;
    this.scene.add(plaque);

    const lockBox = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.12), metalMat);
    lockBox.position.set(-4.9, 1.32, -1.32);
    this.doorLockLed = new THREE.MeshBasicMaterial({ color: 0x2ce66b });
    const lockLed = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), this.doorLockLed);
    lockLed.position.set(-4.86, 1.35, -1.32);
    this.scene.add(lockBox, lockLed);

    // Folha da porta articulada com janela de vidro aramado institucional
    this.doorPivot.position.set(-4.96, 0, 0.32);
    const doorMat = new THREE.MeshStandardMaterial({
      map: this.woodPBR.map,
      normalMap: this.woodPBR.normalMap,
      roughnessMap: this.woodPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 1.0,
    });
    const doorBottom = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.42, 1.44), doorMat);
    doorBottom.position.set(0, 0.71, -0.72);
    doorBottom.castShadow = true;
    const doorTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.42, 1.44), doorMat);
    doorTop.position.set(0, 2.19, -0.72);
    const doorLeftStile = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.46), doorMat);
    doorLeftStile.position.set(0, 1.7, -0.23);
    const doorRightStile = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.46), doorMat);
    doorRightStile.position.set(0, 1.7, -1.21);

    const kickplate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.24, 1.38), metalMat);
    kickplate.position.set(0, 0.14, -0.72);

    const doorVisionGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.56, 0.52),
      new THREE.MeshStandardMaterial({
        map: rainGlass.map,
        normalMap: rainGlass.normalMap,
        color: 0x9ab0bc,
        transparent: true,
        opacity: 0.3,
        roughness: 0.15,
      })
    );
    doorVisionGlass.position.set(0, 1.7, -0.72);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.12), metalMat);
    handle.position.set(0.04, 1.08, -1.28);

    this.doorPivot.add(
      doorBottom,
      doorTop,
      doorLeftStile,
      doorRightStile,
      kickplate,
      doorVisionGlass,
      handle
    );
    this.scene.add(this.doorPivot);
    this.registerHotspot(this.doorPivot, 'door');
    this.registerHotspot(lockBox, 'door');

    // Mural de Cortiça na parede esquerda com o PIN da catraca
    this.noticeBoardMat = new THREE.MeshStandardMaterial({
      map: createNoticeBoardTexture('1904'),
      normalMap: this.wallPBR.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.88,
    });
    const noticeBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.02), this.noticeBoardMat);
    noticeBoard.position.set(-4.9, 1.68, -2.65);
    noticeBoard.rotation.y = Math.PI / 2;
    this.scene.add(noticeBoard);
    this.registerHotspot(noticeBoard, 'noticeboard');

    // === PAREDE DIREITA (X = +5) COM VÃO REAL DA JANELA ===
    const addRightWallPiece = (zStart: number, zEnd: number, yStart: number, yEnd: number) => {
      const w = zEnd - zStart;
      const h = yEnd - yStart;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, w), wallMat);
      mesh.position.set(5.0, yStart + h / 2, (zStart + zEnd) / 2);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.scene.add(mesh);
    };
    addRightWallPiece(-5.0, -1.65, 0, 3.5);
    addRightWallPiece(0.95, 3.4, 0, 3.5);
    addRightWallPiece(-1.65, 0.95, 0, 1.02);
    addRightWallPiece(-1.65, 0.95, 2.46, 3.5);

    const bbR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 8.4), baseboardMat);
    bbR.position.set(4.91, 0.065, -0.8);
    this.scene.add(bbR);

    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.065, 2.74),
      new THREE.MeshStandardMaterial({
        color: 0x3b4045,
        normalMap: this.wallPBR.normalMap,
        roughness: 0.24,
        metalness: 0.12,
      })
    );
    sill.position.set(4.96, 1.02, -0.35);
    this.scene.add(sill);

    const paneGlassMat = new THREE.MeshStandardMaterial({
      map: rainGlass.map,
      normalMap: rainGlass.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      transparent: true,
      opacity: 0.36,
      roughness: 0.08,
    });

    const buildWindowLeaf = (pivotZ: number, offsetZ: number): THREE.Group => {
      const grp = new THREE.Group();
      grp.position.set(4.98, 1.74, pivotZ);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.38, 1.26), paneGlassMat);
      glass.position.set(0, 0, offsetZ);

      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.045, 1.28), metalMat);
      topRail.position.set(0, 0.68, offsetZ);
      const botRail = topRail.clone();
      botRail.position.set(0, -0.68, offsetZ);
      const midMullion = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.028, 1.26), metalMat);
      midMullion.position.set(0, 0, offsetZ);

      grp.add(glass, topRail, botRail, midMullion);
      this.scene.add(grp);
      return grp;
    };
    this.windowLeftPane = buildWindowLeaf(-1.63, 0.64);
    this.windowRightPane = buildWindowLeaf(0.93, -0.64);

    const blindHeadbox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 2.74), metalMat);
    blindHeadbox.position.set(4.86, 2.51, -0.35);
    this.scene.add(blindHeadbox);

    this.blindsGroup.position.set(4.87, 2.46, -0.35);
    const slatsMat = new THREE.MeshStandardMaterial({
      map: blindsPBR.map,
      normalMap: blindsPBR.normalMap,
      roughnessMap: blindsPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.8, 1.8),
      roughness: 1.0,
    });
    const blindSheet = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.44, 2.62), slatsMat);
    blindSheet.position.set(0, -0.72, 0);
    blindSheet.castShadow = true;
    this.blindsGroup.add(blindSheet);
    this.blindsGroup.scale.y = 0.04;
    this.scene.add(this.blindsGroup);
    this.registerHotspot(this.windowLeftPane, 'window');
    this.registerHotspot(this.windowRightPane, 'window');
    this.registerHotspot(this.blindsGroup, 'window');
    this.registerHotspot(sill, 'window');

    // === QUADRO-NEGRO DE ARDÓSIA PBR & RELÓGIO ===
    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(4.38, 1.86, 0.065), trimMat);
    boardFrame.position.set(0, 1.92, -4.96);
    const boardSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(4.16, 1.66),
      new THREE.MeshStandardMaterial({
        map: this.chalkboard.texture,
        normalMap: this.chalkboard.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 0.82,
      })
    );
    boardSurface.position.set(0, 1.92, -4.92);
    const chalkTray = new THREE.Mesh(new THREE.BoxGeometry(4.38, 0.055, 0.15), trimMat);
    chalkTray.position.set(0, 1.0, -4.9);
    this.scene.add(boardFrame, boardSurface, chalkTray);
    this.registerHotspot(boardSurface, 'board');

    const eraser = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.06), trimMat);
    eraser.position.set(0.65, 1.045, -4.88);
    this.scene.add(eraser);
    [0xdfd9cc, 0xd4b85e, 0xc45858].forEach((cHex, i) => {
      const chalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.075, 8),
        new THREE.MeshStandardMaterial({ color: cHex, roughness: 0.95 })
      );
      chalk.rotation.z = Math.PI / 2;
      chalk.rotation.y = 0.2 * (i - 1);
      chalk.position.set(-0.4 + i * 0.12, 1.035, -4.88);
      this.scene.add(chalk);
    });

    const clockRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.055, 28),
      metalMat
    );
    clockRim.rotation.x = Math.PI / 2;
    clockRim.position.set(2.95, 2.78, -4.95);
    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.23, 28),
      new THREE.MeshStandardMaterial({
        map: this.wallClock.texture,
        roughness: 0.3,
      })
    );
    clockFace.position.set(2.95, 2.78, -4.918);
    this.scene.add(clockRim, clockFace);
  }

  /**
   * CORREDOR ESCOLAR PROFUNDO ESTILO OUTLAST 2 (16 METROS: X = -5.0 até X = -21.0)!
   * Forro modular T-Bar 3D, placa deslocada revelando vão escuro com cabos pendurados,
   * luminária fluorescente fria estourada, extintor vermelho 3D, bebedouro inox,
   * relógio torto, cartazes úmidos, armários enferrujados e porta dupla anti-pânico ao fundo.
   */
  private buildOutlastCorridor(maxAniso: number): void {
    const corrWallPBR = createOutlastCorridorWallPBR(maxAniso);
    const ceilPBR = createCeilingPBR(maxAniso);
    const lockerPBR = createLockerMetalPBR(maxAniso);

    const corrWallMat = new THREE.MeshStandardMaterial({
      map: corrWallPBR.map,
      normalMap: corrWallPBR.normalMap,
      roughnessMap: corrWallPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughness: 1.0,
    });

    // Parede Norte do corredor (Z = -2.25) e Parede Sul (Z = +1.45), estendendo de X = -5.0 até X = -21.0
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(16.0, 3.5), corrWallMat);
    northWall.position.set(-13.0, 1.75, -2.25);
    northWall.receiveShadow = true;
    this.scene.add(northWall);

    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(16.0, 3.5), corrWallMat);
    southWall.position.set(-13.0, 1.75, 1.45);
    southWall.rotation.y = Math.PI;
    southWall.receiveShadow = true;
    this.scene.add(southWall);

    // Parede do fundo do corredor (X = -21.0)
    const endWall = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.5), corrWallMat);
    endWall.position.set(-21.0, 1.75, -0.4);
    endWall.rotation.y = Math.PI / 2;
    this.scene.add(endWall);

    // === LAJE SUPERIOR ESCURA DO PLENUM (Y = 3.78) + FORRO MODULAR T-BAR 3D (Y = 3.22) ===
    const plenumRoof = new THREE.Mesh(
      new THREE.PlaneGeometry(16.2, 3.8),
      new THREE.MeshBasicMaterial({ color: 0x020305 })
    );
    plenumRoof.rotation.x = Math.PI / 2;
    plenumRoof.position.set(-13.0, 3.78, -0.4);
    this.scene.add(plenumRoof);

    const tileMat = new THREE.MeshStandardMaterial({
      map: ceilPBR.map,
      normalMap: ceilPBR.normalMap,
      roughnessMap: ceilPBR.roughnessMap,
      roughness: 0.96,
      side: THREE.DoubleSide,
    });
    const tBarMat = new THREE.MeshStandardMaterial({
      color: 0x7a848c,
      metalness: 0.72,
      roughness: 0.36,
    });

    // Placas individuais de forro (1.6m x 1.23m) — deixando UMA PLACA ARRANCADA/DESLOCADA em (-9.0, -1.02)!
    const zCenters = [-1.63, -0.4, 0.83];
    for (let xi = 0; xi < 10; xi++) {
      const cx = -5.8 - xi * 1.6;
      for (let zi = 0; zi < 3; zi++) {
        const cz = zCenters[zi];
        const isBrokenOpening = xi === 2 && zi === 0; // X = -9.0, Z = -1.63..centro visível da porta!
        const isTrofferSlot = zi === 1 && (xi === 1 || xi === 4 || xi === 8);

        if (isTrofferSlot) continue;

        if (isBrokenOpening) {
          // Placa deslocada e inclinada lá dentro do vão escuro + cabos elétricos pendurados!
          const dislodged = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.025, 1.16), tileMat);
          dislodged.position.set(cx - 0.35, 3.38, cz + 0.18);
          dislodged.rotation.set(0.32, 0.18, -0.26);
          this.scene.add(dislodged);

          // Tubulação industrial no interior do forro quebrado
          const plenumPipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 1.8, 10),
            tBarMat
          );
          plenumPipe.rotation.z = Math.PI / 2;
          plenumPipe.position.set(cx, 3.52, cz);
          this.scene.add(plenumPipe);

          // Cabos pretos pendurados balançando sutilmente (homenagem direta à imagem de referência Outlast 2!)
          const cableMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.55 });
          [-0.18, 0.08, 0.24].forEach((offX, cIdx) => {
            const cGrp = new THREE.Group();
            cGrp.position.set(cx + offX, 3.45, cz + (cIdx - 1) * 0.14);
            const len = 0.55 + cIdx * 0.16;
            const wire = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.008, len, 6),
              cableMat
            );
            wire.position.y = -len / 2;
            wire.rotation.z = (cIdx - 1) * 0.09;
            cGrp.add(wire);
            this.scene.add(cGrp);
            this.hangingCables.push(cGrp);
          });
          continue;
        }

        const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 1.2), tileMat);
        tile.rotation.x = Math.PI / 2;
        tile.position.set(cx, 3.22, cz);
        this.scene.add(tile);
      }
    }

    // Perfis metálicos T-Bar do corredor
    for (const rz of [-1.01, 0.21]) {
      const longRunner = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.03, 0.035), tBarMat);
      longRunner.position.set(-13.0, 3.21, rz);
      this.scene.add(longRunner);
    }
    for (let xi = 0; xi <= 10; xi++) {
      const rx = -5.0 - xi * 1.6;
      const crossTee = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 3.7), tBarMat);
      crossTee.position.set(rx, 3.21, -0.4);
      this.scene.add(crossTee);
    }

    // === LUMINÁRIAS FLUORESCENTES EMBUTIDAS NO FORRO DO CORREDOR ===
    this.corridorTrofferMat = new THREE.MeshBasicMaterial({ color: 0xd8f4ff });
    const deadTrofferMat = new THREE.MeshBasicMaterial({ color: 0x161c20 });
    const dimTrofferMat = new THREE.MeshBasicMaterial({ color: 0x4e6c78 });

    [
      { x: -7.4, mat: deadTrofferMat },        // Queimada perto da porta (chiaroscuro!)
      { x: -12.2, mat: this.corridorTrofferMat }, // Luz fria estourada principal estilo Outlast 2!
      { x: -18.6, mat: dimTrofferMat },        // Luz fraca lá no fundo perto da saída
    ].forEach(({ x, mat }) => {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.06, 0.62), tBarMat);
      housing.position.set(x, 3.24, -0.4);
      const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.52), mat);
      diffuser.rotation.x = Math.PI / 2;
      diffuser.position.set(x, 3.205, -0.4);
      this.scene.add(housing, diffuser);
    });

    // === EXTINTOR DE INCÊNDIO 3D VERMELHO NA PAREDE DO CORREDOR ===
    const extGroup = new THREE.Group();
    extGroup.position.set(-8.35, 1.32, -2.14);
    const redTankMat = new THREE.MeshStandardMaterial({
      color: 0x9e191d,
      metalness: 0.35,
      roughness: 0.24,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xa89248,
      metalness: 0.8,
      roughness: 0.3,
    });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.44, 14), redTankMat);
    tank.castShadow = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), redTankMat);
    dome.position.y = 0.22;
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.08, 10), brassMat);
    valve.position.y = 0.31;
    const hose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.34, 8),
      new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.7 })
    );
    hose.position.set(0.085, 0.08, 0.02);
    hose.rotation.z = -0.18;
    const labelSticker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.087, 0.087, 0.16, 12, 1, true, -0.9, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xd8d5cc, roughness: 0.6 })
    );
    extGroup.add(tank, dome, valve, hose, labelSticker);
    this.scene.add(extGroup);

    // === BEBEDOURO METÁLICO DE PAREDE (INOX) ===
    const fountainGrp = new THREE.Group();
    fountainGrp.position.set(-9.75, 0.88, 1.26);
    const inoxMat = new THREE.MeshStandardMaterial({
      color: 0x8d99a3,
      metalness: 0.82,
      roughness: 0.28,
    });
    const fBody = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.34), inoxMat);
    fBody.castShadow = true;
    const fBasin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.36), inoxMat);
    fBasin.position.y = 0.28;
    const fSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.07, 8), inoxMat);
    fSpout.position.set(-0.1, 0.34, 0.04);
    fountainGrp.add(fBody, fBasin, fSpout);
    this.scene.add(fountainGrp);

    // === RELÓGIO ESCOLAR TORTO & CARTAZES DESCASCANDO NO CORREDOR ===
    const corrClock = new THREE.Group();
    corrClock.position.set(-7.15, 2.42, -2.21);
    corrClock.rotation.z = 0.19; // Torto e pendurado por um fio!
    const ccRim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), tBarMat);
    ccRim.rotation.x = Math.PI / 2;
    const ccFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 20),
      new THREE.MeshStandardMaterial({ map: this.wallClock.texture, roughness: 0.4 })
    );
    ccFace.position.z = 0.022;
    corrClock.add(ccRim, ccFace);
    this.scene.add(corrClock);

    const poster1 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.68),
      new THREE.MeshStandardMaterial({ map: createPeelingPosterTexture(0), roughness: 0.88 })
    );
    poster1.position.set(-10.6, 1.72, -2.23);
    poster1.rotation.z = -0.05;
    const poster2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.68),
      new THREE.MeshStandardMaterial({ map: createPeelingPosterTexture(1), roughness: 0.88 })
    );
    poster2.position.set(-11.4, 1.68, 1.43);
    poster2.rotation.y = Math.PI;
    poster2.rotation.z = 0.07;
    this.scene.add(poster1, poster2);

    // === BATERIA DE ARMÁRIOS DE AÇO ENFERRUJADO AO LONGO DO CORREDOR ===
    const lockerMat = new THREE.MeshStandardMaterial({
      map: lockerPBR.map,
      normalMap: lockerPBR.normalMap,
      roughnessMap: lockerPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.6, 1.6),
      metalness: 0.52,
      roughness: 1.0,
    });
    for (let i = 0; i < 6; i++) {
      const lx = -13.6 - i * 0.66;
      const locker = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.98, 0.46), lockerMat);
      locker.position.set(lx, 0.99, -2.0);
      locker.castShadow = true;
      locker.receiveShadow = true;
      this.scene.add(locker);

      // Um armário arrombado / entreaberto!
      if (i === 2) {
        const openDoor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.88, 0.025), lockerMat);
        openDoor.position.set(lx + 0.18, 0.99, -1.62);
        openDoor.rotation.y = -0.72;
        openDoor.castShadow = true;
        this.scene.add(openDoor);
      }
    }

    // Cavalete amarelo de "CUIDADO PISO MOLHADO" no corredor espelhado
    const wetSignMat = new THREE.MeshStandardMaterial({ color: 0xb59122, roughness: 0.45 });
    const wetSignGrp = new THREE.Group();
    wetSignGrp.position.set(-10.5, 0, 0.52);
    wetSignGrp.rotation.y = 0.42;
    const signA = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, 0.025), wetSignMat);
    signA.position.set(0, 0.28, 0.11);
    signA.rotation.x = -0.22;
    const signB = signA.clone();
    signB.position.set(0, 0.28, -0.11);
    signB.rotation.x = 0.22;
    wetSignGrp.add(signA, signB);
    this.scene.add(wetSignGrp);

    // === PORTA DUPLA ANTI-PÂNICO AO FUNDO DO CORREDOR (X = -20.88) + PLACA SAÍDA ===
    const exitDoorMat = new THREE.MeshStandardMaterial({
      color: 0x26323b,
      metalness: 0.42,
      roughness: 0.52,
    });
    [-0.98, 0.18].forEach((dz) => {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.32, 1.08), exitDoorMat);
      leaf.position.set(-20.92, 1.16, dz);
      const pushBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.86), inoxMat);
      pushBar.position.set(-20.85, 1.05, dz);
      const wirePane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 0.62),
        new THREE.MeshStandardMaterial({
          color: 0x16242c,
          roughness: 0.2,
          metalness: 0.3,
        })
      );
      wirePane.rotation.y = Math.PI / 2;
      wirePane.position.set(-20.88, 1.68, dz);
      this.scene.add(leaf, pushBar, wirePane);
    });

    const exitSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.24, 0.62),
      new THREE.MeshBasicMaterial({ color: 0x3ce87a })
    );
    exitSign.position.set(-20.85, 2.68, -0.4);
    this.scene.add(exitSign);
  }

  private buildCourtyardAndRain(maxAniso: number): void {
    const asphaltPBR = createWetAsphaltPBR(maxAniso);
    const extWallPBR = createExteriorWallPBR(maxAniso);

    const yardGround = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 12.5),
      new THREE.MeshStandardMaterial({
        map: asphaltPBR.map,
        normalMap: asphaltPBR.normalMap,
        roughnessMap: asphaltPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.3, 1.3),
        roughness: 0.85,
        metalness: 0.18,
      })
    );
    yardGround.rotation.x = -Math.PI / 2;
    yardGround.position.set(9.6, -0.05, -0.8);
    this.scene.add(yardGround);

    const outerWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 3.4, 12.5),
      new THREE.MeshStandardMaterial({
        map: extWallPBR.map,
        normalMap: extWallPBR.normalMap,
        roughnessMap: extWallPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.6, 1.6),
        roughness: 1.0,
      })
    );
    outerWall.position.set(13.8, 1.6, -0.8);
    this.scene.add(outerWall);

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x202224,
      metalness: 0.6,
      roughness: 0.55,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 4.1, 10), poleMat);
    pole.position.set(9.1, 2.0, -2.1);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.05), poleMat);
    arm.position.set(8.9, 3.95, -2.1);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb870 })
    );
    bulb.position.set(8.7, 3.84, -2.1);
    this.scene.add(pole, arm, bulb);

    const treeMat = new THREE.MeshStandardMaterial({
      map: this.darkWoodPBR.map,
      normalMap: this.darkWoodPBR.normalMap,
      color: 0x1c1a18,
      roughness: 0.95,
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.21, 2.95, 9), treeMat);
    trunk.position.set(9.8, 1.4, 1.1);
    trunk.rotation.z = 0.09;
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.085, 1.75, 7), treeMat);
    b1.position.set(9.35, 2.65, 0.68);
    b1.rotation.z = 0.68;
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.075, 1.55, 7), treeMat);
    b2.position.set(10.15, 2.55, 1.45);
    b2.rotation.z = -0.58;
    this.scene.add(trunk, b1, b2);

    const count = 280;
    this.rainPositions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const rx = 5.25 + Math.random() * 6.5;
      const ry = Math.random() * 4.2;
      const rz = -4.0 + Math.random() * 6.8;
      const idx = i * 6;
      this.rainPositions[idx] = rx;
      this.rainPositions[idx + 1] = ry;
      this.rainPositions[idx + 2] = rz;
      this.rainPositions[idx + 3] = rx - 0.05;
      this.rainPositions[idx + 4] = ry - 0.38;
      this.rainPositions[idx + 5] = rz;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainLines = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: 0x9cbbe0,
        transparent: true,
        opacity: 0.38,
      })
    );
    this.scene.add(this.rainLines);
  }

  private buildFurniture(): void {
    const deskWoodMat = new THREE.MeshStandardMaterial({
      map: this.woodPBR.map,
      normalMap: this.woodPBR.normalMap,
      roughnessMap: this.woodPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 1.0,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x22262b,
      metalness: 0.58,
      roughness: 0.48,
    });

    const addStudentDesk = (x: number, z: number, withChair = true, yawJitter = 0) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.rotation.y = yawJitter;

      const top = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.038, 0.56), deskWoodMat);
      top.position.set(0, 0.75, 0);
      top.castShadow = true;
      top.receiveShadow = true;
      grp.add(top);

      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.015, 0.36), steelMat);
      basket.position.set(0, 0.62, 0.02);
      grp.add(basket);

      [
        [-0.38, -0.23],
        [0.38, -0.23],
        [-0.38, 0.23],
        [0.38, 0.23],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.74, 8), steelMat);
        leg.position.set(lx, 0.37, lz);
        leg.castShadow = true;
        grp.add(leg);
      });

      if (withChair) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.038, 0.42), deskWoodMat);
        seat.position.set(0, 0.45, 0.48);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.038), deskWoodMat);
        back.position.set(0, 0.72, 0.68);
        seat.castShadow = back.castShadow = true;
        grp.add(seat, back);
      }

      this.scene.add(grp);
    };

    addStudentDesk(-2.2, -2.45, true, 0.05);
    addStudentDesk(0, -2.45, true, -0.03);
    addStudentDesk(2.2, -2.45, false, 0.09); // Sem cadeira porque está tombada no canto!
    addStudentDesk(-2.2, -1.05, true, -0.04);
    addStudentDesk(0, -1.05, true, 0.02);
    addStudentDesk(2.2, -1.05, true, -0.03);
    addStudentDesk(-2.2, 0.45, true, 0.03);
    addStudentDesk(2.2, 0.45, true, -0.05);

    // Cadeira escolar tombada no chão espelhado (narrativa ambiental estilo Outlast 2!)
    const fallenChair = new THREE.Group();
    fallenChair.position.set(3.25, 0.22, -2.35);
    fallenChair.rotation.set(0.12, -0.55, Math.PI / 2);
    const fSeat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.038, 0.42), deskWoodMat);
    const fBack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.038), deskWoodMat);
    fBack.position.set(0, 0.26, 0.2);
    fallenChair.add(fSeat, fBack);
    this.scene.add(fallenChair);

    // Carteira do próprio jogador (z = 0.54)
    addStudentDesk(0, 0.54, false, 0);

    const notebook = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.016, 0.36),
      new THREE.MeshStandardMaterial({
        color: 0xd8d1be,
        normalMap: this.wallPBR.normalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughness: 0.9,
      })
    );
    notebook.position.set(-0.14, 0.778, 0.53);
    notebook.rotation.y = 0.14;
    this.scene.add(notebook);

    const pen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a3f7a, roughness: 0.32 })
    );
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = -0.35;
    pen.position.set(-0.02, 0.782, 0.58);
    this.scene.add(pen);

    const pbBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.026, 0.21),
      new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.38, metalness: 0.45 })
    );
    pbBody.position.set(0.24, 0.783, 0.52);
    pbBody.rotation.y = -0.18;
    this.scene.add(pbBody);
    this.registerHotspot(pbBody, 'desk');
    this.registerHotspot(notebook, 'desk');

    this.powerbankBars = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x59b377 });
      this.powerbankBars.push(mat);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.012), mat);
      led.position.set(-0.03 + i * 0.02, 0.015, 0.06);
      pbBody.add(led);
    }

    // Smartphone físico 3D repousando sobre a carteira conectado ao Powerbank (some da mesa quando o jogador o ergue na mão!)
    this.deskPhoneGroup.position.set(0.09, 0.777, 0.56);
    this.deskPhoneGroup.rotation.y = -0.09;
    const phoneChassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.009, 0.165),
      new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.78, roughness: 0.26 })
    );
    phoneChassis.castShadow = true;
    this.deskPhoneScreenMat = new THREE.MeshBasicMaterial({ color: 0x162436 });
    const phoneScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.073, 0.15),
      this.deskPhoneScreenMat
    );
    phoneScreen.rotation.x = -Math.PI / 2;
    phoneScreen.position.y = 0.0048;

    // Cabo USB-C curvado ligando o celular na mesa ao Powerbank
    const usbCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.001, 0.084),
      new THREE.Vector3(0.05, -0.002, 0.115),
      new THREE.Vector3(0.13, 0.002, 0.055),
      new THREE.Vector3(0.15, 0.005, -0.02),
    ]);
    const usbCable = new THREE.Mesh(
      new THREE.TubeGeometry(usbCurve, 14, 0.0026, 6, false),
      new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.55 })
    );
    this.deskPhoneGroup.add(phoneChassis, phoneScreen, usbCable);
    this.scene.add(this.deskPhoneGroup);
    this.registerHotspot(this.deskPhoneGroup, 'desk');

    // Folhas de prova espalhadas pelo chão úmido
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0xc9c4b6, roughness: 0.92 });
    [
      [-1.35, -3.15, 0.4],
      [-0.95, -2.85, -0.7],
      [2.85, -2.1, 1.1],
      [-6.8, -0.9, 0.65],
    ].forEach(([sx, sz, rot]) => {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), sheetMat);
      sheet.rotation.x = -Math.PI / 2;
      sheet.rotation.z = rot;
      sheet.position.set(sx, 0.004, sz);
      this.scene.add(sheet);
    });

    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.42, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0x181d26,
        normalMap: this.wallPBR.normalMap,
        roughness: 0.92,
      })
    );
    bag.position.set(1.65, 0.21, -0.95);
    bag.rotation.y = -0.45;
    bag.castShadow = true;
    this.scene.add(bag);

    const trashBin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.13, 0.38, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x282d33,
        metalness: 0.55,
        roughness: 0.55,
        side: THREE.DoubleSide,
      })
    );
    trashBin.position.set(3.85, 0.19, -4.45);
    this.scene.add(trashBin);

    const projMount = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8), steelMat);
    projMount.position.set(0, 3.29, -2.25);
    const projBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.11, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xb8bec2, roughness: 0.55 })
    );
    projBody.position.set(0, 3.06, -2.25);
    const projLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xe62229 })
    );
    projLed.position.set(0.12, 3.02, -2.12);
    this.scene.add(projMount, projBody, projLed);

    // Mesa do professor + Diário de Classe amaldiçoado
    const profDesk = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.76, 0.72), deskWoodMat);
    profDesk.position.set(-1.9, 0.38, -3.95);
    profDesk.castShadow = true;
    profDesk.receiveShadow = true;
    this.scene.add(profDesk);

    const ledger = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.055, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x420910,
        emissive: 0x260307,
        normalMap: this.wallPBR.normalMap,
        roughness: 0.62,
      })
    );
    ledger.position.set(-1.82, 0.788, -3.92);
    ledger.rotation.y = 0.25;
    this.scene.add(ledger);

    const examStack = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xcfc8b4, roughness: 0.92 })
    );
    examStack.position.set(-2.32, 0.79, -3.98);
    examStack.rotation.y = -0.16;
    const coffeeMug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.038, 0.095, 12),
      new THREE.MeshStandardMaterial({ color: 0x7e8286, roughness: 0.32 })
    );
    coffeeMug.position.set(-1.42, 0.808, -3.82);
    this.scene.add(examStack, coffeeMug);

    // Ventilador de teto girando devagar e projetando sombras no forro
    this.ceilingFan.position.set(0, 3.34, -1.25);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 16), steelMat);
    this.ceilingFan.add(hub);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i * Math.PI) / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.016, 0.18), deskWoodMat);
      blade.position.x = 0.62;
      blade.castShadow = true;
      pivot.add(blade);
      this.ceilingFan.add(pivot);
    }
    this.scene.add(this.ceilingFan);

    // Luminárias da Sala 04: esquerda queimada/apagada, direita fria ciano falhando!
    this.roomTubeMat = new THREE.MeshBasicMaterial({ color: 0xcbe8f5 });
    const deadTubeMat = new THREE.MeshBasicMaterial({ color: 0x1a2126 });

    [-1.8, 1.8].forEach((fx, idx) => {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 2.38), steelMat);
      housing.position.set(fx, 3.48, -1.2);
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.032, 2.28),
        idx === 0 ? deadTubeMat : this.roomTubeMat
      );
      tube.position.set(fx, 3.455, -1.2);
      this.scene.add(housing, tube);
    });
  }

  /** Poeira suspensa flutuando no ar da Sala 04 e do Corredor Outlast */
  private buildAtmosphericDust(): void {
    const count = 190;
    this.dustPositions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const inCorridor = i < 75;
      this.dustPositions[i * 3] = inCorridor
        ? -5.0 - Math.random() * 14.0
        : -4.6 + Math.random() * 9.2;
      this.dustPositions[i * 3 + 1] = 0.25 + Math.random() * 2.95;
      this.dustPositions[i * 3 + 2] = inCorridor
        ? -2.0 + Math.random() * 3.2
        : -4.6 + Math.random() * 7.4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));

    const mat = new THREE.PointsMaterial({
      map: createDustSpriteTexture(),
      size: 0.048,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
  }

  private buildLighting(): void {
    // Ambiente extremamente contido e frio para alto contraste estilo Outlast 2!
    const ambient = new THREE.HemisphereLight(0x223340, 0x080a0d, 0.34);
    this.scene.add(ambient);

    // Luz fluorescente fria da Sala 04 (deslocada para a calha acesa x = +1.4)
    this.mainLamp = new THREE.PointLight(0xb8e0f2, 1.05, 13.5, 1.55);
    this.mainLamp.position.set(1.2, 3.18, -1.2);
    this.mainLamp.castShadow = this.settings.highQualityShadows;
    this.mainLamp.shadow.mapSize.set(1024, 1024);
    this.mainLamp.shadow.bias = -0.002;
    this.scene.add(this.mainLamp);

    // Luz fluorescente fria intensa no meio do Corredor Outlast 2 (X = -12.2) — recria o contraluz dramático da referência!
    this.corridorLight = new THREE.PointLight(0xc4ebff, 2.35, 13.5, 1.45);
    this.corridorLight.position.set(-12.2, 3.05, -0.4);
    this.corridorLight.castShadow = this.settings.highQualityShadows;
    this.corridorLight.shadow.mapSize.set(512, 512);
    this.corridorLight.shadow.bias = -0.0025;
    this.scene.add(this.corridorLight);

    // Luz verde-fria fraca junto à porta dupla de emergência ao fundo do corredor (X = -19.8)
    this.corridorFarLight = new THREE.PointLight(0x4cb882, 0.65, 6.5, 1.6);
    this.corridorFarLight.position.set(-19.8, 2.55, -0.4);
    this.scene.add(this.corridorFarLight);

    // Luz âmbar de vapor de sódio do poste externo no pátio chuvoso
    this.streetLamp = new THREE.PointLight(0xe59044, 1.75, 14.5, 1.4);
    this.streetLamp.position.set(8.5, 3.5, -1.9);
    this.scene.add(this.streetLamp);

    this.lightningLight = new THREE.PointLight(0xb0d0f5, 0, 24);
    this.lightningLight.position.set(7.5, 3.8, -0.4);
    this.scene.add(this.lightningLight);

    this.ledgerLight = new THREE.PointLight(0xd41c2c, 0.42, 2.8);
    this.ledgerLight.position.set(-1.82, 0.96, -3.92);
    this.scene.add(this.ledgerLight);

    // Lanterna halógena quente potente [F] + Cone volumétrico de poeira!
    this.flashlight = new THREE.SpotLight(0xfff0cc, 0, 19.5, Math.PI / 5.2, 0.52, 1.15);
    this.flashlight.castShadow = this.settings.highQualityShadows;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.position.copy(this.baseCamPos);
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    const coneGeo = new THREE.ConeGeometry(1.45, 6.2, 24, 1, true);
    coneGeo.translate(0, -3.1, 0);
    coneGeo.rotateX(-Math.PI / 2);
    this.flashlightBeamCone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff3d6,
        transparent: true,
        opacity: 0.048,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.flashlightBeamCone.visible = false;
    this.scene.add(this.flashlightBeamCone);

    // Iluminador Infravermelho da Filmadora Outlast [N] — invisível no modo normal, alcança o fundo do corredor!
    this.irLight = new THREE.SpotLight(0x98ffd0, 0, 23.0, Math.PI / 3.1, 0.68, 1.05);
    this.irLight.position.copy(this.baseCamPos);
    this.scene.add(this.irLight);
    this.scene.add(this.irLightTarget);
    this.irLight.target = this.irLightTarget;

    this.phoneGlow = new THREE.PointLight(0x6b9ac4, 0, 4.8);
    this.phoneGlow.position.set(0, 1.18, 0.75);
    this.scene.add(this.phoneGlow);

    this.jumpscareLight = new THREE.PointLight(0xffe8da, 0, 5.2);
    this.jumpscareLight.position.set(0, 1.54, 0.92);
    this.scene.add(this.jumpscareLight);
  }

  private getTargetYaw(view: ViewDirection): number {
    switch (view) {
      case 'L':
        // Alinha diretamente com o eixo do corredor profundo Outlast 2 através do vão da porta!
        return Math.PI / 2 - 0.08;
      case 'R':
        return -Math.PI / 2 + 0.11;
      default:
        return 0;
    }
  }

  private updateEnvironmentAnimations(dt: number): void {
    // Chuva lá fora
    const rArr = this.rainPositions;
    for (let i = 0; i < rArr.length; i += 6) {
      rArr[i + 1] -= dt * 8.6;
      rArr[i + 4] -= dt * 8.6;
      if (rArr[i + 1] < -0.2) {
        const ny = 4.1 + Math.random() * 0.5;
        rArr[i + 1] = ny;
        rArr[i + 4] = ny - 0.38;
      }
    }
    this.rainLines.geometry.attributes.position.needsUpdate = true;

    // Poeira flutuando lentamente no ar
    const dArr = this.dustPositions;
    for (let i = 0; i < dArr.length; i += 3) {
      dArr[i + 1] += Math.sin(this.time * 0.7 + i) * dt * 0.025;
      dArr[i] += Math.cos(this.time * 0.45 + i * 0.5) * dt * 0.018;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;

    // Cabos elétricos balançando no buraco do teto do corredor
    this.hangingCables.forEach((cGrp, idx) => {
      cGrp.rotation.z = Math.sin(this.time * 1.4 + idx * 1.7) * 0.045;
      cGrp.rotation.x = Math.cos(this.time * 1.1 + idx) * 0.03;
    });

    // Ventilador de teto
    this.ceilingFan.rotation.y += dt * 4.2;
  }

  update(dt: number, snap: GameSnapshot | null): void {
    const safeDt = Math.min(dt, 0.05);
    this.time += safeDt;
    this.updateEnvironmentAnimations(safeDt);

    // ==================== MODO MENU INICIAL: PANORÂMICA ESTILO OUTLAST 2 ====================
    if (!snap) {
      this.canInteract3D = false;
      // Câmera passeia suavemente entre o quadro sombrio e o corredor profundo pela porta escancarada!
      const sweep = 0.5 + 0.5 * Math.sin(this.time * 0.28);
      this.camera.position.set(
        -0.35 * sweep + Math.sin(this.time * 0.55) * 0.12,
        1.48 + Math.sin(this.time * 0.9) * 0.022,
        0.95 - sweep * 0.55
      );
      this.camera.rotation.y = -0.12 + sweep * 1.48;
      this.camera.rotation.x = -0.02 + Math.sin(this.time * 0.4) * 0.025;
      this.camera.rotation.z = Math.sin(this.time * 0.35) * 0.018;

      const menuFlicker = Math.sin(this.time * 6.3) * Math.cos(this.time * 11.7) > 0.76;
      this.mainLamp.intensity = menuFlicker ? 0.18 : 0.78;
      this.corridorLight.intensity = menuFlicker ? 0.65 : 2.35;
      this.corridorTrofferMat.color.setHex(menuFlicker ? 0x45606e : 0xd8f4ff);
      this.ledgerLight.intensity = 0.45 + Math.sin(this.time * 2.4) * 0.15;
      this.lightningLight.intensity = 0;
      this.flashlight.intensity = 0;
      this.flashlightBeamCone.visible = false;
      this.irLight.intensity = 0;
      this.phoneGlow.intensity = 0;
      this.doorPivot.rotation.y = -1.22; // Porta aberta mostrando o corredor Outlast 2!

      const showValdir = Math.sin(this.time * 0.36) > 0.58;
      for (const id of TEACHER_ORDER) {
        if (id === 'marcos') {
          this.teacherRigs[id].updatePose({
            dt: safeDt,
            pose: 'corridorFar',
            enterAnim: 1,
            time: this.time,
            cameraPos: this.camera.position,
          });
        } else if (id === 'valdir' && showValdir) {
          this.teacherRigs[id].updatePose({
            dt: safeDt,
            pose: 'boardApparition',
            enterAnim: 1,
            time: this.time,
            cameraPos: this.camera.position,
          });
        } else if (id === 'helena' && Math.sin(this.time * 0.48) > 0.55) {
          this.teacherRigs[id].updatePose({
            dt: safeDt,
            pose: 'windowPeek',
            enterAnim: 1,
            time: this.time,
            cameraPos: this.camera.position,
          });
        } else {
          this.teacherRigs[id].updatePose({
            dt: safeDt,
            pose: 'hidden',
            enterAnim: 0,
            time: this.time,
            cameraPos: this.camera.position,
          });
        }
      }

      this.postFX.render(safeDt, this.time, {
        nightVisionOn: false,
        dangerLevel: 0.08,
        filmGrain: this.settings.filmGrain,
      });
      return;
    }

    const nvActive = Boolean(snap.nightVisionOn && snap.view !== 'P' && snap.phoneBattery > 0);
    this.canInteract3D =
      snap.running && !snap.paused && !this.jumpscareTeacher && snap.view !== 'P';

    // ==================== JUMPSCARE VISCERAL EM MOCAP 3D ====================
    if (this.jumpscareTeacher) {
      this.jumpscareTime += safeDt;
      const shakeAmp = this.settings.reducedFlashes ? 0.03 : 0.095;
      this.camera.position.set(
        (Math.random() - 0.5) * shakeAmp,
        1.46 + (Math.random() - 0.5) * shakeAmp,
        1.15
      );
      this.camera.rotation.set(
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.11
      );
      this.flashlight.intensity = 0;
      this.flashlightBeamCone.visible = false;
      this.irLight.intensity = nvActive ? 2.4 : 0;
      this.phoneGlow.intensity = 0;
      this.jumpscareLight.intensity = this.settings.reducedFlashes
        ? 2.1
        : 3.5 * (0.65 + Math.random() * 0.55);

      for (const id of TEACHER_ORDER) {
        if (id === this.jumpscareTeacher) {
          this.teacherRigs[id].updatePose({
            dt: safeDt,
            pose: 'jumpscare',
            enterAnim: 1,
            time: this.time,
            cameraPos: this.camera.position,
            nightVisionOn: nvActive,
          });
          const lunge = Math.min(1, this.jumpscareTime / 0.18);
          this.teacherRigs[id].root.position.z = 0.12 + lunge * 0.46;
        } else {
          this.teacherRigs[id].updatePose({
            dt: safeDt,
            pose: 'hidden',
            enterAnim: 0,
            time: this.time,
            cameraPos: this.camera.position,
            nightVisionOn: nvActive,
          });
        }
      }

      this.postFX.render(safeDt, this.time, {
        nightVisionOn: nvActive,
        dangerLevel: 1.0,
        filmGrain: this.settings.filmGrain,
      });
      return;
    }

    // ==================== CÂMERA HANDHELD COM INÉRCIA E DUTCH-ROLL (OUTLAST) ====================
    const parallaxX =
      this.settings.mouseParallax && snap.view !== 'P' ? -this.mouseNDC.x * 0.11 : 0;
    const parallaxY =
      this.settings.mouseParallax && snap.view !== 'P' ? -this.mouseNDC.y * 0.068 : 0;

    const targetYaw = this.getTargetYaw(snap.view) + parallaxX;
    const targetPitch = (snap.view === 'P' ? -0.15 : -0.015) + parallaxY;

    // Mola criticamente amortecida para peso orgânico de pescoço/filmadora
    const stiffness = 68.0;
    const damping = 13.5;
    const yawForce = (targetYaw - this.camera.rotation.y) * stiffness - this.camYawVel * damping;
    const pitchForce =
      (targetPitch - this.camera.rotation.x) * stiffness - this.camPitchVel * damping;

    this.camYawVel += yawForce * safeDt;
    this.camPitchVel += pitchForce * safeDt;
    this.camera.rotation.y += this.camYawVel * safeDt;
    this.camera.rotation.x += this.camPitchVel * safeDt;

    // Inclinação sutil de câmera na mão (Dutch roll) ao virar rápido + tremor de adrenalina
    const panicTremor =
      snap.dangerLevel > 0.05
        ? Math.sin(this.time * 19.0) * 0.008 * snap.dangerLevel
        : 0;
    const desiredRoll =
      THREE.MathUtils.clamp(-this.camYawVel * 0.022, -0.055, 0.055) +
      Math.sin(this.time * 1.15) * 0.004 +
      panicTremor;
    this.camRoll += (desiredRoll - this.camRoll) * Math.min(1, safeDt * 10.0);
    this.camera.rotation.z = this.camRoll;

    // Quando olha para a esquerda (L), o jogador se inclina levemente na direção da porta para enxergar o corredor!
    const leanX = snap.view === 'L' ? -0.22 : snap.view === 'R' ? 0.16 : 0;
    const targetCamX = this.baseCamPos.x + leanX + Math.sin(this.time * 1.1) * 0.012;
    const targetCamY = this.baseCamPos.y + Math.sin(this.time * 2.15) * 0.011;
    this.camera.position.x += (targetCamX - this.camera.position.x) * Math.min(1, safeDt * 7.0);
    this.camera.position.y += (targetCamY - this.camera.position.y) * Math.min(1, safeDt * 7.0);
    this.camera.position.z = this.baseCamPos.z;

    // ==================== LANTERNA HALÓGENA [F] & VISÃO NOTURNA IR [N] ====================
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const flashActive = snap.flashlightOn && snap.view !== 'P' && snap.phoneBattery > 0;

    this.flashlight.position.copy(this.camera.position);
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(forward, 8);
    this.flashlight.intensity = flashActive ? 4.4 : 0;

    this.flashlightBeamCone.visible = flashActive;
    if (flashActive) {
      this.flashlightBeamCone.position.copy(this.camera.position);
      this.flashlightBeamCone.quaternion.copy(this.camera.quaternion);
    }

    this.irLight.position.copy(this.camera.position);
    this.irLightTarget.position.copy(this.camera.position).addScaledVector(forward, 12);
    this.irLight.intensity = nvActive ? 2.65 : 0;

    this.phoneGlow.position.set(0.28, 1.18, 0.82);
    this.phoneGlow.intensity = snap.view === 'P' && snap.phoneBattery > 0 ? 1.85 : 0;
    this.lightningLight.intensity = this.settings.reducedFlashes
      ? snap.lightningFlash * 1.6
      : snap.lightningFlash * 6.2;
    this.ledgerLight.intensity = 0.36 + snap.dangerLevel * 0.85 + Math.sin(this.time * 3) * 0.1;

    // Cintilação elétrica realista nas luminárias da sala e do corredor
    const flickerChance = 0.014 + snap.dangerLevel * 0.065;
    if (Math.random() < flickerChance && !this.settings.reducedFlashes) {
      this.mainLamp.intensity = 0.16 + Math.random() * 0.28;
      this.roomTubeMat.color.setHex(0x465c66);
    } else {
      this.mainLamp.intensity = Math.max(0.28, 0.92 - snap.dangerLevel * 0.35);
      this.roomTubeMat.color.setHex(0xcbe8f5);
    }

    const corrFlicker = Math.sin(this.time * 13.7) * Math.sin(this.time * 4.3) > 0.84;
    this.corridorLight.intensity = corrFlicker && !this.settings.reducedFlashes ? 0.55 : 2.35;
    this.corridorTrofferMat.color.setHex(
      corrFlicker && !this.settings.reducedFlashes ? 0x4b6875 : 0xd8f4ff
    );

    const pct =
      snap.totalTasks > 0 ? Math.round((snap.taskIndex / snap.totalTasks) * 100) : 100;
    this.chalkboard.render(
      snap.nightConfig.dayLabel,
      snap.dangerLevel,
      snap.valdirPopup,
      pct
    );
    this.wallClock.update(snap.currentHour);

    const pbRatio = snap.powerbankReserve / 100;
    this.powerbankBars.forEach((mat, idx) => {
      const lit = pbRatio > idx * 0.24;
      mat.color.setHex(lit ? (pbRatio < 0.3 ? 0xc8232c : 0x59b377) : 0x22252a);
    });

    // Quando o celular está guardado (view !== 'P'), ele aparece fisicamente sobre a mesa!
    this.deskPhoneGroup.visible = snap.view !== 'P';
    if (this.deskPhoneGroup.visible) {
      const hasAlert = snap.bellAlert || snap.valdirPopup || snap.unreadMessages > 0;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5.2);
      this.deskPhoneScreenMat.color.setHex(
        snap.phoneBattery <= 0
          ? 0x050608
          : hasAlert
            ? pulse > 0.5
              ? 0x386ea8
              : 0x1b334d
            : 0x101c2b
      );
    }

    // Porta articulada — quando destrancada, fica entreaberta mostrando o corredor escuro do Outlast 2!
    const leftMaxStage = Math.max(
      0,
      ...TEACHER_ORDER.filter((id) => snap.teachers[id].side === 'L').map(
        (id) => snap.teachers[id].stage
      )
    );
    const targetDoorAngle = snap.doorClosed
      ? 0
      : leftMaxStage >= 2
        ? -1.52
        : -0.82;
    this.doorPivot.rotation.y +=
      (targetDoorAngle - this.doorPivot.rotation.y) * Math.min(1, safeDt * 7);
    this.doorLockLed.color.setHex(
      snap.doorClosed ? 0xc8232c : snap.doorLockCooldown > 0 ? 0xd49b42 : 0x59b377
    );

    const rightMaxStage = Math.max(
      0,
      ...TEACHER_ORDER.filter((id) => snap.teachers[id].side === 'R').map(
        (id) => snap.teachers[id].stage
      )
    );
    // Folhas da janela abrem PARA FORA (pátio) para jamais atravessarem o personagem ou a persiana!
    const paneSwing = rightMaxStage >= 3 ? 1.48 : rightMaxStage === 2 ? 0.78 : 0.12;
    this.windowLeftPane.rotation.y +=
      (paneSwing - this.windowLeftPane.rotation.y) * Math.min(1, safeDt * 6);
    this.windowRightPane.rotation.y +=
      (-paneSwing - this.windowRightPane.rotation.y) * Math.min(1, safeDt * 6);

    const targetBlindScale = snap.blindsClosed ? 1.0 : 0.05;
    this.blindsGroup.scale.y +=
      (targetBlindScale - this.blindsGroup.scale.y) * Math.min(1, safeDt * 9);

    // ==================== ATUALIZAÇÃO DOS DOCENTES EM CAPTURA DE MOVIMENTO ====================
    let leftOccupant: TeacherId | null = null;
    let rightOccupant: TeacherId | null = null;
    let leftBest = 0;
    let rightBest = 0;

    for (const id of ['marcos', 'helena', 'ricardo'] as TeacherId[]) {
      const st = snap.teachers[id];
      if (st.stage <= 0) continue;
      const score = st.stage * 10 + st.attackProgress;
      if (st.side === 'L' && score > leftBest) {
        leftBest = score;
        leftOccupant = id;
      } else if (st.side === 'R' && score > rightBest) {
        rightBest = score;
        rightOccupant = id;
      }
    }

    for (const id of TEACHER_ORDER) {
      const st = snap.teachers[id];
      const rig = this.teacherRigs[id];

      if (id === 'valdir') {
        const pose: TeacherPose = st.popupActive || st.stage >= 2 ? 'boardApparition' : 'hidden';
        const blinded = flashActive && snap.view === 'C' && pose !== 'hidden';
        rig.updatePose({
          dt: safeDt,
          pose,
          enterAnim: st.enterAnim,
          time: this.time,
          cameraPos: this.camera.position,
          nightVisionOn: nvActive,
          blindedByFlashlight: blinded,
          doorClosed: snap.doorClosed,
          blindsClosed: snap.blindsClosed,
        });
        continue;
      }

      if (id === 'celia') {
        const pose: TeacherPose =
          st.stage >= 3 ? (snap.doorClosed ? 'doorPeek' : 'doorBreach') : 'hidden';
        rig.updatePose({
          dt: safeDt,
          pose,
          enterAnim: st.enterAnim,
          time: this.time,
          cameraPos: this.camera.position,
          nightVisionOn: nvActive,
          blindedByFlashlight: flashActive && snap.view === 'L' && pose !== 'hidden',
          doorClosed: snap.doorClosed,
          blindsClosed: snap.blindsClosed,
        });
        continue;
      }

      const isActiveOccupant =
        (st.side === 'L' && leftOccupant === id) || (st.side === 'R' && rightOccupant === id);

      if (!isActiveOccupant || st.stage === 0) {
        rig.updatePose({
          dt: safeDt,
          pose: 'hidden',
          enterAnim: 0,
          time: this.time,
          cameraPos: this.camera.position,
          nightVisionOn: nvActive,
          doorClosed: snap.doorClosed,
          blindsClosed: snap.blindsClosed,
        });
        continue;
      }

      if (st.side === 'L') {
        const pose: TeacherPose =
          st.stage === 1
            ? 'corridorFar'
            : st.stage === 2
              ? 'doorPeek'
              : snap.doorClosed
                ? 'doorPeek'
                : 'doorBreach';
        const blinded = flashActive && snap.view === 'L' && !snap.doorClosed;
        rig.updatePose({
          dt: safeDt,
          pose,
          enterAnim: st.enterAnim,
          time: this.time,
          cameraPos: this.camera.position,
          nightVisionOn: nvActive,
          blindedByFlashlight: blinded,
          doorClosed: snap.doorClosed,
          blindsClosed: snap.blindsClosed,
        });
      } else {
        const pose: TeacherPose =
          st.stage === 1
            ? 'courtyardFar'
            : st.stage === 2
              ? 'windowPeek'
              : snap.blindsClosed
                ? 'windowPeek'
                : 'windowBreach';
        const blinded = flashActive && snap.view === 'R' && !snap.blindsClosed;
        rig.updatePose({
          dt: safeDt,
          pose,
          enterAnim: st.enterAnim,
          time: this.time,
          cameraPos: this.camera.position,
          nightVisionOn: nvActive,
          blindedByFlashlight: blinded,
          doorClosed: snap.doorClosed,
          blindsClosed: snap.blindsClosed,
        });
      }
    }

    this.postFX.render(safeDt, this.time, {
      nightVisionOn: nvActive,
      dangerLevel: snap.dangerLevel,
      filmGrain: this.settings.filmGrain,
    });
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('click', this.handleCanvasClick);
    this.postFX.dispose();
    this.floorReflector.dispose();
    this.renderer.dispose();
  }
}
