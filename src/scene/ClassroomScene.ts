import * as THREE from 'three';
import { TEACHERS, TEACHER_ORDER } from '../config/teachers';
import { GameSettings, GameSnapshot, TeacherId, ViewDirection } from '../types';
import {
  createBlindsPBR,
  createCeilingPBR,
  createExteriorWallPBR,
  createFloorPBR,
  createLockerMetalPBR,
  createNoticeBoardTexture,
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

export class ClassroomScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.08, 36);
  readonly renderer: THREE.WebGLRenderer;

  private chalkboard = new DynamicChalkboard();
  private wallClock = new DynamicWallClock();
  private noticeBoardMat!: THREE.MeshStandardMaterial;

  private wallPBR!: PBRTextureSet;
  private floorPBR!: PBRTextureSet;
  private woodPBR!: PBRTextureSet;
  private darkWoodPBR!: PBRTextureSet;

  private doorPivot = new THREE.Group();
  private doorLockLed!: THREE.MeshBasicMaterial;
  private windowLeftPane = new THREE.Group();
  private windowRightPane = new THREE.Group();
  private blindsGroup = new THREE.Group();
  private ceilingFan = new THREE.Group();

  private mainLamp!: THREE.PointLight;
  private corridorLight!: THREE.PointLight;
  private streetLamp!: THREE.PointLight;
  private lightningLight!: THREE.PointLight;
  private ledgerLight!: THREE.PointLight;
  private flashlight!: THREE.SpotLight;
  private flashlightTarget = new THREE.Object3D();
  private phoneGlow!: THREE.PointLight;
  private jumpscareLight!: THREE.PointLight;

  private powerbankBars: THREE.MeshBasicMaterial[] = [];
  private rainLines!: THREE.LineSegments;
  private rainPositions!: Float32Array;

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

  private readonly baseCamPos = new THREE.Vector3(0, 1.46, 1.15);

  constructor(
    container: HTMLElement,
    settings: GameSettings,
    onHotspotClick?: (hotspot: WorldHotspot) => void
  ) {
    this.settings = { ...settings };
    this.onHotspotClick = onHotspotClick;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = settings.highQualityShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    container.prepend(this.renderer.domElement);

    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 4);

    // Gera conjuntos PBR compartilhados com anisotropia alta
    this.wallPBR = createSchoolWallPBR(maxAniso);
    this.floorPBR = createFloorPBR(maxAniso);
    this.woodPBR = createWoodPBR(false, maxAniso);
    this.darkWoodPBR = createWoodPBR(true, maxAniso);

    this.scene.background = new THREE.Color(0x040507);
    this.scene.fog = new THREE.FogExp2(0x060709, 0.072);

    this.camera.position.copy(this.baseCamPos);
    this.camera.rotation.order = 'YXZ';

    this.buildArchitecture(maxAniso);
    this.buildCorridor(maxAniso);
    this.buildCourtyardAndRain(maxAniso);
    this.buildFurniture();
    this.buildLighting();

    this.teacherRigs = {} as Record<TeacherId, TeacherRig>;
    for (const id of TEACHER_ORDER) {
      const rig = new TeacherRig(TEACHERS[id]);
      this.scene.add(rig.root);
      this.teacherRigs[id] = rig;
    }

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
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
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
      color: 0x171615,
      normalMap: this.wallPBR.normalMap,
      roughness: 0.65,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x565b61,
      normalMap: this.wallPBR.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0.62,
      roughness: 0.46,
    });

    // Piso Granilite PBR da sala (10m x 8.4m)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8.4),
      new THREE.MeshStandardMaterial({
        map: this.floorPBR.map,
        normalMap: this.floorPBR.normalMap,
        roughnessMap: this.floorPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughness: 1.0,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.8);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Teto acústico manchado PBR
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

    // Parede Frontal (Quadro-negro) Z = -5
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.5), wallMat);
    frontWall.position.set(0, 1.75, -5);
    frontWall.receiveShadow = true;
    this.scene.add(frontWall);

    // Rodapé frontal e traseiro
    const frontBaseboard = new THREE.Mesh(new THREE.BoxGeometry(10, 0.13, 0.04), baseboardMat);
    frontBaseboard.position.set(0, 0.065, -4.98);
    this.scene.add(frontBaseboard);

    // Parede Traseira Z = +3.4
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.5), wallMat);
    backWall.position.set(0, 1.75, 3.4);
    backWall.rotation.y = Math.PI;
    this.scene.add(backWall);

    // === PAREDE ESQUERDA (X = -5) COM VÃO REAL DA PORTA (Z = -1.15 até +0.35, Y = 0..2.42) ===
    const addLeftWallPiece = (zStart: number, zEnd: number, yStart: number, yEnd: number) => {
      const w = zEnd - zStart;
      const h = yEnd - yStart;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, w), wallMat);
      mesh.position.set(-5.0, yStart + h / 2, (zStart + zEnd) / 2);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.scene.add(mesh);
    };
    addLeftWallPiece(-5.0, -1.15, 0, 3.5);
    addLeftWallPiece(0.35, 3.4, 0, 3.5);
    addLeftWallPiece(-1.15, 0.35, 2.42, 3.5);

    // Rodapés da parede esquerda
    const bbL1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 3.82), baseboardMat);
    bbL1.position.set(-4.92, 0.065, -3.08);
    const bbL2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 3.02), baseboardMat);
    bbL2.position.set(-4.92, 0.065, 1.88);
    this.scene.add(bbL1, bbL2);

    // Batente de madeira escura gasta da porta
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.44, 0.065), trimMat);
    jambL.position.set(-5.0, 1.22, -1.14);
    const jambR = jambL.clone();
    jambR.position.set(-5.0, 1.22, 0.34);
    const jambTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.075, 1.56), trimMat);
    jambTop.position.set(-5.0, 2.43, -0.4);
    this.scene.add(jambL, jambR, jambTop);

    // Eletroduto aparente de aço galvanizado + caixa de passagem até a trava magnética!
    const conduitVert = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 2.18, 8),
      metalMat
    );
    conduitVert.position.set(-4.92, 2.41, -1.32);
    const junctionBox = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.09), metalMat);
    junctionBox.position.set(-4.915, 1.05, -1.32);
    this.scene.add(conduitVert, junctionBox);

    // Placa ETEC Sebrae oxidada + Trava magnética ao lado da porta
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
    plaque.position.set(-4.92, 2.02, 0.95);
    plaque.rotation.y = Math.PI / 2;
    this.scene.add(plaque);

    const lockBox = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.12), metalMat);
    lockBox.position.set(-4.91, 1.32, -1.32);
    this.doorLockLed = new THREE.MeshBasicMaterial({ color: 0x2ce66b });
    const lockLed = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), this.doorLockLed);
    lockLed.position.set(-4.87, 1.35, -1.32);
    this.scene.add(lockBox, lockLed);

    // Folha da porta articulada com madeira PBR, chapa metálica inferior e vidro aramado!
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

    // Chapa metálica inferior contra chutes ("kickplate")
    const kickplate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.24, 1.38), metalMat);
    kickplate.position.set(0, 0.14, -0.72);

    const doorVisionGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.56, 0.52),
      new THREE.MeshStandardMaterial({
        map: rainGlass.map,
        normalMap: rainGlass.normalMap,
        color: 0x9ab0bc,
        transparent: true,
        opacity: 0.32,
        roughness: 0.18,
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

    // Mural de Cortiça na parede esquerda com o PIN da catraca!
    this.noticeBoardMat = new THREE.MeshStandardMaterial({
      map: createNoticeBoardTexture('1904'),
      normalMap: this.wallPBR.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.88,
    });
    const noticeBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.02), this.noticeBoardMat);
    noticeBoard.position.set(-4.91, 1.68, -2.65);
    noticeBoard.rotation.y = Math.PI / 2;
    this.scene.add(noticeBoard);
    this.registerHotspot(noticeBoard, 'noticeboard');

    // === PAREDE DIREITA (X = +5) COM VÃO REAL DA JANELA (Z = -1.65 até +0.95, Y = 1.02..2.46) ===
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

    // Peitoril de granito úmido da janela
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.065, 2.74),
      new THREE.MeshStandardMaterial({
        map: this.floorPBR.map,
        normalMap: this.floorPBR.normalMap,
        roughness: 0.28,
        metalness: 0.1,
      })
    );
    sill.position.set(4.96, 1.02, -0.35);
    this.scene.add(sill);

    // Caixilhos de ferro escuro e vidro molhado de chuva com normalMap!
    const paneGlassMat = new THREE.MeshStandardMaterial({
      map: rainGlass.map,
      normalMap: rainGlass.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      transparent: true,
      opacity: 0.38,
      roughness: 0.09,
    });

    const buildWindowLeaf = (pivotZ: number, offsetZ: number): THREE.Group => {
      const grp = new THREE.Group();
      grp.position.set(4.98, 1.74, pivotZ);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.38, 1.26), paneGlassMat);
      glass.position.set(0, 0, offsetZ);

      // Esquadria metálica oxidada
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

    // Persiana escolar com lâminas horizontais em relevo PBR!
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

    // === QUADRO-NEGRO DE ARDÓSIA PBR & RELÓGIO NA PAREDE FRONTAL ===
    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(4.38, 1.86, 0.065), trimMat);
    boardFrame.position.set(0, 1.92, -4.96);
    const boardSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(4.16, 1.66),
      new THREE.MeshStandardMaterial({
        map: this.chalkboard.texture,
        normalMap: this.chalkboard.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 0.84,
      })
    );
    boardSurface.position.set(0, 1.92, -4.92);
    const chalkTray = new THREE.Mesh(new THREE.BoxGeometry(4.38, 0.055, 0.15), trimMat);
    chalkTray.position.set(0, 1.0, -4.9);
    this.scene.add(boardFrame, boardSurface, chalkTray);
    this.registerHotspot(boardSurface, 'board');

    // Apagador gasto e tocos de giz na calha
    const eraser = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.045, 0.06),
      trimMat
    );
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
        roughness: 0.32,
      })
    );
    clockFace.position.set(2.95, 2.78, -4.918);
    this.scene.add(clockRim, clockFace);
  }

  private buildCorridor(maxAniso: number): void {
    const lockerPBR = createLockerMetalPBR(maxAniso);

    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 9.2),
      new THREE.MeshStandardMaterial({
        map: this.floorPBR.map,
        normalMap: this.floorPBR.normalMap,
        roughnessMap: this.floorPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.2, 1.2),
        roughness: 1.0,
      })
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(-7.2, 0, -0.8);
    hallFloor.receiveShadow = true;
    this.scene.add(hallFloor);

    const hallCeil = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 9.2),
      new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.95 })
    );
    hallCeil.rotation.x = Math.PI / 2;
    hallCeil.position.set(-7.2, 3.5, -0.8);
    this.scene.add(hallCeil);

    const farWall = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 3.5),
      new THREE.MeshStandardMaterial({
        map: this.wallPBR.map,
        normalMap: this.wallPBR.normalMap,
        roughnessMap: this.wallPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.4, 1.4),
        roughness: 1.0,
      })
    );
    farWall.position.set(-9.3, 1.75, -0.8);
    farWall.rotation.y = Math.PI / 2;
    farWall.receiveShadow = true;
    this.scene.add(farWall);

    // Armários escolares de aço enferrujado e venezianado em PBR!
    const lockerMat = new THREE.MeshStandardMaterial({
      map: lockerPBR.map,
      normalMap: lockerPBR.normalMap,
      roughnessMap: lockerPBR.roughnessMap,
      normalScale: new THREE.Vector2(1.6, 1.6),
      metalness: 0.48,
      roughness: 1.0,
    });
    for (let i = 0; i < 4; i++) {
      const locker = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.96, 0.74), lockerMat);
      locker.position.set(-9.02, 0.98, -3.2 + i * 0.8);
      locker.castShadow = true;
      this.scene.add(locker);
    }

    // Cavalete amarelo de "PISO MOLHADO" tombado no corredor sombrio
    const wetSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.04, 0.56),
      new THREE.MeshStandardMaterial({ color: 0xb89628, roughness: 0.65 })
    );
    wetSign.position.set(-7.85, 0.03, -2.55);
    wetSign.rotation.y = 0.48;
    this.scene.add(wetSign);

    // Placa luminosa "SAÍDA" verde suja ao fundo do corredor
    const exitSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.24, 0.58),
      new THREE.MeshBasicMaterial({ color: 0x3a9c5c })
    );
    exitSign.position.set(-7.2, 3.12, -4.8);
    this.scene.add(exitSign);
  }

  private buildCourtyardAndRain(maxAniso: number): void {
    const asphaltPBR = createWetAsphaltPBR(maxAniso);
    const extWallPBR = createExteriorWallPBR(maxAniso);

    // Pátio externo de asfalto encharcado com poças espelhadas PBR!
    const yardGround = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 12),
      new THREE.MeshStandardMaterial({
        map: asphaltPBR.map,
        normalMap: asphaltPBR.normalMap,
        roughnessMap: asphaltPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.3, 1.3),
        roughness: 1.0,
        metalness: 0.14,
      })
    );
    yardGround.rotation.x = -Math.PI / 2;
    yardGround.position.set(9.2, -0.05, -0.8);
    this.scene.add(yardGround);

    // Muro externo de blocos de concreto úmido com limo
    const outerWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 3.2, 12),
      new THREE.MeshStandardMaterial({
        map: extWallPBR.map,
        normalMap: extWallPBR.normalMap,
        roughnessMap: extWallPBR.roughnessMap,
        normalScale: new THREE.Vector2(1.6, 1.6),
        roughness: 1.0,
      })
    );
    outerWall.position.set(12.2, 1.5, -0.8);
    this.scene.add(outerWall);

    // Poste de luz antigo oxidado do pátio
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x242220,
      metalness: 0.55,
      roughness: 0.65,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 4.1, 10), poleMat);
    pole.position.set(8.9, 2.0, -2.1);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.05), poleMat);
    arm.position.set(8.72, 3.95, -2.1);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb36b })
    );
    bulb.position.set(8.55, 3.84, -2.1);
    this.scene.add(pole, arm, bulb);

    // Árvore seca retorcida no pátio projetando silhueta gótica na chuva
    const treeMat = new THREE.MeshStandardMaterial({
      map: this.darkWoodPBR.map,
      normalMap: this.darkWoodPBR.normalMap,
      color: 0x221d19,
      roughness: 0.95,
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.21, 2.85, 9), treeMat);
    trunk.position.set(9.4, 1.35, 1.0);
    trunk.rotation.z = 0.09;
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.085, 1.75, 7), treeMat);
    b1.position.set(8.95, 2.62, 0.58);
    b1.rotation.z = 0.68;
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.075, 1.55, 7), treeMat);
    b2.position.set(9.72, 2.52, 1.38);
    b2.rotation.z = -0.58;
    const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 1.15, 6), treeMat);
    b3.position.set(8.75, 2.95, 1.15);
    b3.rotation.set(0.45, 0, 0.52);
    this.scene.add(trunk, b1, b2, b3);

    // Partículas densas de chuva noturna
    const count = 260;
    this.rainPositions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const rx = 5.25 + Math.random() * 5.5;
      const ry = Math.random() * 4.2;
      const rz = -3.9 + Math.random() * 6.6;
      const idx = i * 6;
      this.rainPositions[idx] = rx;
      this.rainPositions[idx + 1] = ry;
      this.rainPositions[idx + 2] = rz;
      this.rainPositions[idx + 3] = rx - 0.045;
      this.rainPositions[idx + 4] = ry - 0.36;
      this.rainPositions[idx + 5] = rz;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainLines = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: 0x9ab3c8,
        transparent: true,
        opacity: 0.34,
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
      color: 0x222428,
      metalness: 0.52,
      roughness: 0.56,
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

      // Grade porta-livros sob o tampo
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

    // Fileiras de carteiras com leve desalinhamento realista de fim de aula
    addStudentDesk(-2.2, -2.45, true, 0.03);
    addStudentDesk(0, -2.45, true, -0.02);
    addStudentDesk(2.2, -2.45, true, 0.04);
    addStudentDesk(-2.2, -1.05, true, -0.035);
    addStudentDesk(0, -1.05, true, 0.015);
    addStudentDesk(2.2, -1.05, true, -0.025);
    addStudentDesk(-2.2, 0.45, true, 0.02);
    addStudentDesk(2.2, 0.45, true, -0.04);

    // === CARTEIRA DO PRÓPRIO JOGADOR (em primeiro plano z = 0.54) ===
    addStudentDesk(0, 0.54, false, 0);

    // Caderno espiral gasto sobre a mesa do jogador
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

    // Powerbank / Carregador portátil com carcaça de alumínio escovado
    const pbBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.026, 0.21),
      new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.38, metalness: 0.45 })
    );
    pbBody.position.set(0.24, 0.783, 0.52);
    pbBody.rotation.y = -0.18;
    this.scene.add(pbBody);
    this.registerHotspot(pbBody, 'desk');
    this.registerHotspot(notebook, 'desk');

    // Mochila esquecida, cesto de lixo metálico e bolinhas de papel amassadas
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.42, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0x1b2029,
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
        color: 0x2c2f33,
        metalness: 0.5,
        roughness: 0.6,
        side: THREE.DoubleSide,
      })
    );
    trashBin.position.set(3.85, 0.19, -4.45);
    this.scene.add(trashBin);

    [
      [-1.1, -1.7],
      [0.85, -2.0],
      [-0.45, -0.4],
      [3.65, -4.3],
    ].forEach(([px, pz]) => {
      const paperBall = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.032, 0),
        new THREE.MeshStandardMaterial({ color: 0xcfc9ba, roughness: 0.95 })
      );
      paperBall.position.set(px, 0.03, pz);
      this.scene.add(paperBall);
    });

    // Projetor multimídia pendurado no teto com LED vermelho em standby
    const projMount = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8), steelMat);
    projMount.position.set(0, 3.29, -2.25);
    const projBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.11, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xc8c7c0, roughness: 0.55 })
    );
    projBody.position.set(0, 3.06, -2.25);
    const projLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xd92626 })
    );
    projLed.position.set(0.12, 3.02, -2.12);
    this.scene.add(projMount, projBody, projLed);

    this.powerbankBars = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x59b377 });
      this.powerbankBars.push(mat);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.012), mat);
      led.position.set(-0.03 + i * 0.02, 0.015, 0.06);
      pbBody.add(led);
    }

    // === MESA DO PROFESSOR, PILHA DE PROVAS, CANECA E DIÁRIO DE CLASSE ===
    const profDesk = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.76, 0.72), deskWoodMat);
    profDesk.position.set(-1.9, 0.38, -3.95);
    profDesk.castShadow = true;
    profDesk.receiveShadow = true;
    this.scene.add(profDesk);

    const ledger = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.055, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x420910,
        emissive: 0x210306,
        normalMap: this.wallPBR.normalMap,
        roughness: 0.62,
      })
    );
    ledger.position.set(-1.82, 0.788, -3.92);
    ledger.rotation.y = 0.25;
    this.scene.add(ledger);

    const examStack = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xd4ccb8, roughness: 0.92 })
    );
    examStack.position.set(-2.32, 0.79, -3.98);
    examStack.rotation.y = -0.16;
    const coffeeMug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.038, 0.095, 12),
      new THREE.MeshStandardMaterial({ color: 0x8f887d, roughness: 0.35 })
    );
    coffeeMug.position.set(-1.42, 0.808, -3.82);
    this.scene.add(examStack, coffeeMug);

    // Ventilador de teto giratório
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

    // Calhas fluorescentes envelhecidas no teto
    [-1.8, 1.8].forEach((fx) => {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 2.38), steelMat);
      housing.position.set(fx, 3.48, -1.2);
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.035, 2.28),
        new THREE.MeshBasicMaterial({ color: 0xd5e3d8 })
      );
      tube.position.set(fx, 3.455, -1.2);
      this.scene.add(housing, tube);
    });
  }

  private buildLighting(): void {
    // Luz ambiente mais contrastada para valorizar os mapas normais e rugosidades!
    const ambient = new THREE.HemisphereLight(0x3a4347, 0x141312, 0.48);
    this.scene.add(ambient);

    // Lâmpada fluorescente esverdeada fria da sala
    this.mainLamp = new THREE.PointLight(0xcfe0d2, 1.22, 14, 1.45);
    this.mainLamp.position.set(0, 3.18, -1.1);
    this.mainLamp.castShadow = this.settings.highQualityShadows;
    this.mainLamp.shadow.mapSize.set(1024, 1024);
    this.mainLamp.shadow.bias = -0.002;
    this.scene.add(this.mainLamp);

    // Luz pálida do corredor esquerdo
    this.corridorLight = new THREE.PointLight(0x8aa896, 0.78, 9.8);
    this.corridorLight.position.set(-7.1, 3.1, -1.2);
    this.scene.add(this.corridorLight);

    // Luz âmbar de vapor de sódio do poste externo refletindo nas poças!
    this.streetLamp = new THREE.PointLight(0xe59044, 1.55, 13.5);
    this.streetLamp.position.set(8.3, 3.5, -1.8);
    this.scene.add(this.streetLamp);

    // Clarão de relâmpago lá fora na chuva
    this.lightningLight = new THREE.PointLight(0xa8c4e8, 0, 22);
    this.lightningLight.position.set(7.2, 3.6, -0.4);
    this.scene.add(this.lightningLight);

    // Aura rubra emanando do Diário de Classe
    this.ledgerLight = new THREE.PointLight(0xc81e2c, 0.35, 2.5);
    this.ledgerLight.position.set(-1.82, 0.96, -3.92);
    this.scene.add(this.ledgerLight);

    // Lanterna halógena quente do jogador — destaca fortemente o relevo PBR!
    this.flashlight = new THREE.SpotLight(0xfff1d0, 0, 15.5, Math.PI / 5.4, 0.46, 1.15);
    this.flashlight.castShadow = this.settings.highQualityShadows;
    this.flashlight.position.copy(this.baseCamPos);
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Brilho frio da tela do celular iluminando a carteira
    this.phoneGlow = new THREE.PointLight(0x6b94b8, 0, 5.0);
    this.phoneGlow.position.set(0, 1.18, 0.75);
    this.scene.add(this.phoneGlow);

    // Luz dramática crua dedicada ao Jumpscare (estilo flash de câmera 16mm!)
    this.jumpscareLight = new THREE.PointLight(0xffe6d8, 0, 4.8);
    this.jumpscareLight.position.set(0, 1.56, 0.92);
    this.scene.add(this.jumpscareLight);
  }

  private getTargetYaw(view: ViewDirection): number {
    switch (view) {
      case 'L':
        return Math.PI / 2 - 0.12;
      case 'R':
        return -Math.PI / 2 + 0.12;
      default:
        return 0;
    }
  }

  update(dt: number, snap: GameSnapshot | null): void {
    this.time += dt;

    // Animação da chuva lá fora
    const rArr = this.rainPositions;
    for (let i = 0; i < rArr.length; i += 6) {
      rArr[i + 1] -= dt * 8.2;
      rArr[i + 4] -= dt * 8.2;
      if (rArr[i + 1] < -0.2) {
        const ny = 4.1 + Math.random() * 0.5;
        rArr[i + 1] = ny;
        rArr[i + 4] = ny - 0.36;
      }
    }
    this.rainLines.geometry.attributes.position.needsUpdate = true;

    // Ventilador no teto
    this.ceilingFan.rotation.y += dt * 5.6;

    // Modo menu inicial de fundo
    if (!snap) {
      this.canInteract3D = false;
      this.camera.position.set(
        Math.sin(this.time * 0.32) * 0.24,
        1.51 + Math.sin(this.time * 0.7) * 0.025,
        1.15
      );
      this.camera.rotation.y = -0.18 + Math.sin(this.time * 0.24) * 0.46;
      this.camera.rotation.x = -0.03;
      const menuFlicker = Math.sin(this.time * 3.1) > 0.88;
      this.mainLamp.intensity = menuFlicker ? 0.28 : 1.05;
      this.ledgerLight.intensity = 0.38 + Math.sin(this.time * 2.4) * 0.15;
      this.lightningLight.intensity = 0;
      this.flashlight.intensity = 0;
      this.phoneGlow.intensity = 0;
      this.doorPivot.rotation.y = -0.52;

      // Aparições sinistras na Sala 04 durante o menu inicial
      const showValdir = Math.sin(this.time * 0.42) > 0.62;
      for (const id of TEACHER_ORDER) {
        if (id === 'marcos' && (menuFlicker || Math.sin(this.time * 0.55) > 0.35)) {
          this.teacherRigs[id].setPose('doorPeek', 1, this.time, this.camera.position);
        } else if (id === 'valdir' && showValdir && menuFlicker) {
          this.teacherRigs[id].setPose('boardApparition', 1, this.time, this.camera.position);
        } else if (id === 'helena' && !menuFlicker && Math.sin(this.time * 0.6) > 0.52) {
          this.teacherRigs[id].setPose('windowPeek', 1, this.time, this.camera.position);
        } else {
          this.teacherRigs[id].setPose('hidden', 0, this.time, this.camera.position);
        }
      }

      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.canInteract3D = snap.running && !snap.paused && !this.jumpscareTeacher && snap.view !== 'P';

    // Jumpscare em close visceral!
    if (this.jumpscareTeacher) {
      this.jumpscareTime += dt;
      const shakeAmp = this.settings.reducedFlashes ? 0.03 : 0.095;
      this.camera.position.set(
        (Math.random() - 0.5) * shakeAmp,
        1.46 + (Math.random() - 0.5) * shakeAmp,
        1.15
      );
      this.camera.rotation.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, 0);
      this.flashlight.intensity = 0;
      this.phoneGlow.intensity = 0;
      this.jumpscareLight.intensity = this.settings.reducedFlashes
        ? 2.1
        : 3.3 * (0.65 + Math.random() * 0.55);

      for (const id of TEACHER_ORDER) {
        if (id === this.jumpscareTeacher) {
          this.teacherRigs[id].setPose('jumpscare', 1, this.time, this.camera.position);
          const lunge = Math.min(1, this.jumpscareTime / 0.18);
          this.teacherRigs[id].root.position.z = -0.14 + lunge * 0.48;
        } else {
          this.teacherRigs[id].setPose('hidden', 0, this.time, this.camera.position);
        }
      }

      this.renderer.render(this.scene, this.camera);
      return;
    }

    const parallaxX = this.settings.mouseParallax && snap.view !== 'P' ? -this.mouseNDC.x * 0.09 : 0;
    const parallaxY = this.settings.mouseParallax && snap.view !== 'P' ? -this.mouseNDC.y * 0.06 : 0;

    const targetYaw = this.getTargetYaw(snap.view) + parallaxX;
    const targetPitch = (snap.view === 'P' ? -0.34 : -0.02) + parallaxY;

    this.camera.rotation.y += (targetYaw - this.camera.rotation.y) * Math.min(1, dt * 8.5);
    this.camera.rotation.x += (targetPitch - this.camera.rotation.x) * Math.min(1, dt * 8.5);
    this.camera.position.set(
      this.baseCamPos.x + Math.sin(this.time * 1.1) * 0.012,
      this.baseCamPos.y + Math.sin(this.time * 2.1) * 0.01,
      this.baseCamPos.z
    );

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.flashlight.position.copy(this.camera.position);
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(forward, 6);
    this.flashlight.intensity = snap.flashlightOn && snap.view !== 'P' ? 3.8 : 0;

    this.phoneGlow.intensity = snap.view === 'P' && snap.phoneBattery > 0 ? 1.85 : 0;
    this.lightningLight.intensity = this.settings.reducedFlashes
      ? snap.lightningFlash * 1.6
      : snap.lightningFlash * 5.8;
    this.ledgerLight.intensity = 0.32 + snap.dangerLevel * 0.8 + Math.sin(this.time * 3) * 0.1;

    const flickerChance = 0.012 + snap.dangerLevel * 0.06;
    if (Math.random() < flickerChance && !this.settings.reducedFlashes) {
      this.mainLamp.intensity = 0.24 + Math.random() * 0.35;
    } else {
      this.mainLamp.intensity = 1.18 - snap.dangerLevel * 0.3;
    }

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

    const leftMaxStage = Math.max(
      0,
      ...TEACHER_ORDER.filter((id) => snap.teachers[id].side === 'L').map(
        (id) => snap.teachers[id].stage
      )
    );
    const targetDoorAngle = snap.doorClosed
      ? 0
      : leftMaxStage >= 3
        ? -1.28
        : leftMaxStage === 2
          ? -0.45
          : leftMaxStage === 1
            ? -0.15
            : -0.03;
    this.doorPivot.rotation.y += (targetDoorAngle - this.doorPivot.rotation.y) * Math.min(1, dt * 6);
    this.doorLockLed.color.setHex(
      snap.doorClosed ? 0xc8232c : snap.doorLockCooldown > 0 ? 0xd49b42 : 0x59b377
    );

    const rightMaxStage = Math.max(
      0,
      ...TEACHER_ORDER.filter((id) => snap.teachers[id].side === 'R').map(
        (id) => snap.teachers[id].stage
      )
    );
    const paneSwing = rightMaxStage >= 3 ? 1.05 : rightMaxStage === 2 ? 0.36 : 0.08;
    this.windowLeftPane.rotation.y += (-paneSwing - this.windowLeftPane.rotation.y) * Math.min(1, dt * 5);
    this.windowRightPane.rotation.y += (paneSwing - this.windowRightPane.rotation.y) * Math.min(1, dt * 5);

    const targetBlindScale = snap.blindsClosed ? 1.0 : 0.05;
    this.blindsGroup.scale.y +=
      (targetBlindScale - this.blindsGroup.scale.y) * Math.min(1, dt * 9);

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
        rig.setPose(pose, st.enterAnim, this.time, this.camera.position);
        continue;
      }

      if (id === 'celia') {
        if (st.stage >= 3) {
          rig.setPose('doorBreach', st.enterAnim, this.time, this.camera.position);
        } else {
          rig.setPose('hidden', 0, this.time, this.camera.position);
        }
        continue;
      }

      const isActiveOccupant =
        (st.side === 'L' && leftOccupant === id) || (st.side === 'R' && rightOccupant === id);

      if (!isActiveOccupant || st.stage === 0) {
        rig.setPose('hidden', 0, this.time, this.camera.position);
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
        rig.setPose(pose, st.enterAnim, this.time, this.camera.position);
      } else {
        const pose: TeacherPose =
          st.stage === 1
            ? 'courtyardFar'
            : st.stage === 2
              ? 'windowPeek'
              : snap.blindsClosed
                ? 'windowPeek'
                : 'windowBreach';
        rig.setPose(pose, st.enterAnim, this.time, this.camera.position);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('click', this.handleCanvasClick);
    this.renderer.dispose();
  }
}
