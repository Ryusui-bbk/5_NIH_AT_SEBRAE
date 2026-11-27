import * as THREE from 'three';
import { TEACHERS, TEACHER_ORDER } from '../config/teachers';
import { GameSettings, GameSnapshot, TeacherId, ViewDirection } from '../types';
import {
  createCeilingTexture,
  createFloorTexture,
  createNoticeBoardTexture,
  createPlaqueTexture,
  createRainGlassTexture,
  createSchoolWallTexture,
  createWoodTexture,
  DynamicChalkboard,
  DynamicWallClock,
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
    this.renderer.toneMappingExposure = 1.22;
    container.prepend(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x04060b);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.068);

    this.camera.position.copy(this.baseCamPos);
    this.camera.rotation.order = 'YXZ';

    this.buildArchitecture();
    this.buildCorridor();
    this.buildCourtyardAndRain();
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

  private buildArchitecture(): void {
    const wallTex = createSchoolWallTexture();
    const floorTex = createFloorTexture();
    const ceilTex = createCeilingTexture();
    const woodTex = createWoodTexture();
    const glassTex = createRainGlassTexture();

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.92,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x2b241d,
      roughness: 0.7,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x606873,
      metalness: 0.45,
      roughness: 0.45,
    });

    // Piso da sala (10m x 8.4m: Z de -5.0 a +3.4)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8.4),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.48 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.8);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Teto da sala
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8.4),
      new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.5, -0.8);
    this.scene.add(ceiling);

    // Parede Frontal (Quadro-negro) Z = -5
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.5), wallMat);
    frontWall.position.set(0, 1.75, -5);
    frontWall.receiveShadow = true;
    this.scene.add(frontWall);

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

    // Batente de madeira da porta
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.44, 0.06), trimMat);
    jambL.position.set(-5.0, 1.22, -1.14);
    const jambR = jambL.clone();
    jambR.position.set(-5.0, 1.22, 0.34);
    const jambTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 1.56), trimMat);
    jambTop.position.set(-5.0, 2.43, -0.4);
    this.scene.add(jambL, jambR, jambTop);

    // Placa ETEC Sebrae + Trava magnética ao lado da porta
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.24),
      new THREE.MeshStandardMaterial({ map: createPlaqueTexture(), roughness: 0.5 })
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

    // Folha da porta articulada com visor de vidro superior!
    this.doorPivot.position.set(-4.96, 0, 0.32);
    const doorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.62 });
    const doorBottom = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.42, 1.44), doorMat);
    doorBottom.position.set(0, 0.71, -0.72);
    doorBottom.castShadow = true;
    const doorTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.42, 1.44), doorMat);
    doorTop.position.set(0, 2.19, -0.72);
    const doorLeftStile = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.46), doorMat);
    doorLeftStile.position.set(0, 1.7, -0.23);
    const doorRightStile = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.46), doorMat);
    doorRightStile.position.set(0, 1.7, -1.21);
    const doorVisionGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.56, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0x9bb5cc,
        transparent: true,
        opacity: 0.28,
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
      doorVisionGlass,
      handle
    );
    this.scene.add(this.doorPivot);
    this.registerHotspot(this.doorPivot, 'door');
    this.registerHotspot(lockBox, 'door');

    // Mural de Cortiça na parede esquerda com o PIN da catraca!
    this.noticeBoardMat = new THREE.MeshStandardMaterial({
      map: createNoticeBoardTexture('1904'),
      roughness: 0.85,
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

    // Peitoril de granito da janela
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.06, 2.72),
      new THREE.MeshStandardMaterial({ color: 0x52565c, roughness: 0.45 })
    );
    sill.position.set(4.96, 1.02, -0.35);
    this.scene.add(sill);

    // Caixilhos de vidro com gotas de chuva
    const paneGlassMat = new THREE.MeshStandardMaterial({
      map: glassTex,
      transparent: true,
      opacity: 0.34,
      roughness: 0.12,
    });

    const buildWindowLeaf = (pivotZ: number, offsetZ: number): THREE.Group => {
      const grp = new THREE.Group();
      grp.position.set(4.98, 1.74, pivotZ);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.38, 1.26), paneGlassMat);
      glass.position.set(0, 0, offsetZ);
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.045, 1.4, 1.28)),
        new THREE.LineBasicMaterial({ color: 0x9aa4b2 })
      );
      frame.position.copy(glass.position);
      grp.add(glass, frame);
      this.scene.add(grp);
      return grp;
    };
    this.windowLeftPane = buildWindowLeaf(-1.63, 0.64);
    this.windowRightPane = buildWindowLeaf(0.93, -0.64);

    // Persiana rolô escolar interativa (fecha para bloquear visão/luz do celular!)
    const blindHeadbox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 2.72), metalMat);
    blindHeadbox.position.set(4.86, 2.51, -0.35);
    this.scene.add(blindHeadbox);

    this.blindsGroup.position.set(4.87, 2.46, -0.35);
    const slatsMat = new THREE.MeshStandardMaterial({
      color: 0xc5c2b6,
      roughness: 0.78,
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

    // === QUADRO-NEGRO & RELÓGIO NA PAREDE FRONTAL ===
    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(4.36, 1.84, 0.06), trimMat);
    boardFrame.position.set(0, 1.92, -4.96);
    const boardSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(4.16, 1.66),
      new THREE.MeshStandardMaterial({ map: this.chalkboard.texture, roughness: 0.82 })
    );
    boardSurface.position.set(0, 1.92, -4.92);
    const chalkTray = new THREE.Mesh(new THREE.BoxGeometry(4.36, 0.05, 0.14), trimMat);
    chalkTray.position.set(0, 1.0, -4.9);
    this.scene.add(boardFrame, boardSurface, chalkTray);
    this.registerHotspot(boardSurface, 'board');

    // Apagador de feltro e gizes coloridos na calha da lousa
    const eraser = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.045, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x5c3c22, roughness: 0.8 })
    );
    eraser.position.set(0.65, 1.045, -4.88);
    this.scene.add(eraser);
    [0xf8fafc, 0xfde047, 0xf87171].forEach((cHex, i) => {
      const chalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.075, 8),
        new THREE.MeshStandardMaterial({ color: cHex })
      );
      chalk.rotation.z = Math.PI / 2;
      chalk.rotation.y = 0.2 * (i - 1);
      chalk.position.set(-0.4 + i * 0.12, 1.032, -4.88);
      this.scene.add(chalk);
    });

    const clockRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.05, 28),
      new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.5 })
    );
    clockRim.rotation.x = Math.PI / 2;
    clockRim.position.set(2.95, 2.78, -4.95);
    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.23, 28),
      new THREE.MeshBasicMaterial({ map: this.wallClock.texture })
    );
    clockFace.position.set(2.95, 2.78, -4.92);
    this.scene.add(clockRim, clockFace);
  }

  private buildCorridor(): void {
    const floorTex = createFloorTexture();
    const wallTex = createSchoolWallTexture();

    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 9.2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 })
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(-7.2, 0, -0.8);
    hallFloor.receiveShadow = true;
    this.scene.add(hallFloor);

    const hallCeil = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 9.2),
      new THREE.MeshStandardMaterial({ color: 0x3b3f42, roughness: 0.95 })
    );
    hallCeil.rotation.x = Math.PI / 2;
    hallCeil.position.set(-7.2, 3.5, -0.8);
    this.scene.add(hallCeil);

    const farWall = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 3.5),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 })
    );
    farWall.position.set(-9.3, 1.75, -0.8);
    farWall.rotation.y = Math.PI / 2;
    farWall.receiveShadow = true;
    this.scene.add(farWall);

    // Armários escolares de aço no corredor
    const lockerMat = new THREE.MeshStandardMaterial({
      color: 0x394654,
      metalness: 0.35,
      roughness: 0.65,
    });
    for (let i = 0; i < 4; i++) {
      const locker = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.95, 0.72), lockerMat);
      locker.position.set(-9.02, 0.98, -3.2 + i * 0.8);
      locker.castShadow = true;
      this.scene.add(locker);
    }

    // Placa luminosa "SAÍDA" verde ao fundo do corredor
    const exitSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.24, 0.58),
      new THREE.MeshBasicMaterial({ color: 0x19b35a })
    );
    exitSign.position.set(-7.2, 3.12, -4.8);
    this.scene.add(exitSign);
  }

  private buildCourtyardAndRain(): void {
    // Pátio molhado à direita da janela
    const yardGround = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x13171f, roughness: 0.25, metalness: 0.2 })
    );
    yardGround.rotation.x = -Math.PI / 2;
    yardGround.position.set(9.2, -0.05, -0.8);
    this.scene.add(yardGround);

    // Muro externo ao longe
    const outerWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 3.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x1d212b, roughness: 0.95 })
    );
    outerWall.position.set(12.2, 1.5, -0.8);
    this.scene.add(outerWall);

    // Poste de luz do pátio
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.1, 10), poleMat);
    pole.position.set(8.9, 2.0, -2.1);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb36b })
    );
    bulb.position.set(8.6, 3.85, -2.1);
    this.scene.add(pole, bulb);

    // Árvore seca no pátio projetando silhueta
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x171412, roughness: 0.95 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 2.8, 8), treeMat);
    trunk.position.set(9.4, 1.35, 1.0);
    trunk.rotation.z = 0.08;
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.6, 6), treeMat);
    b1.position.set(9.0, 2.6, 0.6);
    b1.rotation.z = 0.65;
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 1.4, 6), treeMat);
    b2.position.set(9.7, 2.5, 1.35);
    b2.rotation.z = -0.55;
    this.scene.add(trunk, b1, b2);

    // Partículas de chuva caindo lá fora
    const count = 220;
    this.rainPositions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const rx = 5.3 + Math.random() * 5.2;
      const ry = Math.random() * 4.2;
      const rz = -3.8 + Math.random() * 6.4;
      const idx = i * 6;
      this.rainPositions[idx] = rx;
      this.rainPositions[idx + 1] = ry;
      this.rainPositions[idx + 2] = rz;
      this.rainPositions[idx + 3] = rx - 0.04;
      this.rainPositions[idx + 4] = ry - 0.34;
      this.rainPositions[idx + 5] = rz;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainLines = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: 0x8fb4dc,
        transparent: true,
        opacity: 0.32,
      })
    );
    this.scene.add(this.rainLines);
  }

  private buildFurniture(): void {
    const woodTex = createWoodTexture();
    const deskWoodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.56 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x262a31, roughness: 0.6 });

    const addStudentDesk = (x: number, z: number, withChair = true) => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 0.56), deskWoodMat);
      top.position.set(x, 0.75, z);
      top.castShadow = true;
      top.receiveShadow = true;
      this.scene.add(top);

      [
        [-0.38, -0.23],
        [0.38, -0.23],
        [-0.38, 0.23],
        [0.38, 0.23],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.74, 8), steelMat);
        leg.position.set(x + lx, 0.37, z + lz);
        leg.castShadow = true;
        this.scene.add(leg);
      });

      if (withChair) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), deskWoodMat);
        seat.position.set(x, 0.45, z + 0.48);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.04), deskWoodMat);
        back.position.set(x, 0.72, z + 0.68);
        seat.castShadow = back.castShadow = true;
        this.scene.add(seat, back);
      }
    };

    // Fileiras de carteiras voltadas para o quadro
    [-2.2, 0, 2.2].forEach((cx) => {
      addStudentDesk(cx, -2.45, true);
      addStudentDesk(cx, -1.05, true);
    });
    addStudentDesk(-2.2, 0.45, true);
    addStudentDesk(2.2, 0.45, true);

    // === CARTEIRA DO PRÓPRIO JOGADOR (em primeiro plano z = 0.54) ===
    addStudentDesk(0, 0.54, false);

    // Caderno espiral sobre a mesa do jogador
    const notebook = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.015, 0.36),
      new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.85 })
    );
    notebook.position.set(-0.14, 0.778, 0.53);
    notebook.rotation.y = 0.14;
    this.scene.add(notebook);

    // Caneta esferográfica azul
    const pen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0x1d5bbf, roughness: 0.3 })
    );
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = -0.35;
    pen.position.set(-0.02, 0.782, 0.58);
    this.scene.add(pen);

    // Powerbank / Carregador de mesa com 4 barras de LED!
    const pbBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.026, 0.21),
      new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.4, metalness: 0.3 })
    );
    pbBody.position.set(0.24, 0.783, 0.52);
    pbBody.rotation.y = -0.18;
    this.scene.add(pbBody);
    this.registerHotspot(pbBody, 'desk');
    this.registerHotspot(notebook, 'desk');

    // Mochila esquecida e bolinhas de papel no chão para realismo escolar
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.42, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    bag.position.set(1.65, 0.21, -0.95);
    bag.rotation.y = -0.45;
    bag.castShadow = true;
    this.scene.add(bag);

    [
      [-1.1, -1.7],
      [0.85, -2.0],
      [-0.45, -0.4],
    ].forEach(([px, pz]) => {
      const paperBall = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.032, 0),
        new THREE.MeshStandardMaterial({ color: 0xdad7cd, roughness: 0.95 })
      );
      paperBall.position.set(px, 0.03, pz);
      this.scene.add(paperBall);
    });

    // Projetor multimídia pendurado no teto com LED vermelho em standby
    const projMount = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8), steelMat);
    projMount.position.set(0, 3.29, -2.25);
    const projBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.11, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xd8dce3, roughness: 0.5 })
    );
    projBody.position.set(0, 3.06, -2.25);
    const projLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a })
    );
    projLed.position.set(0.12, 3.02, -2.12);
    this.scene.add(projMount, projBody, projLed);

    this.powerbankBars = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x35e085 });
      this.powerbankBars.push(mat);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.012), mat);
      led.position.set(-0.03 + i * 0.02, 0.015, 0.06);
      pbBody.add(led);
    }

    // === MESA DO PROFESSOR & DIÁRIO DE CLASSE À FRENTE ===
    const profDesk = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.76, 0.7), deskWoodMat);
    profDesk.position.set(-1.9, 0.38, -3.95);
    profDesk.castShadow = true;
    profDesk.receiveShadow = true;
    this.scene.add(profDesk);

    const ledger = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.05, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x5c0e18,
        emissive: 0x2a0409,
        roughness: 0.55,
      })
    );
    ledger.position.set(-1.82, 0.785, -3.92);
    ledger.rotation.y = 0.25;
    this.scene.add(ledger);

    // Ventilador de teto giratório
    this.ceilingFan.position.set(0, 3.34, -1.25);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 16), steelMat);
    this.ceilingFan.add(hub);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i * Math.PI) / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.016, 0.18), steelMat);
      blade.position.x = 0.62;
      blade.castShadow = true;
      pivot.add(blade);
      this.ceilingFan.add(pivot);
    }
    this.scene.add(this.ceilingFan);

    // Luminárias fluorescentes no teto
    [-1.8, 1.8].forEach((fx) => {
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.05, 2.3),
        new THREE.MeshBasicMaterial({ color: 0xd9efe2 })
      );
      tube.position.set(fx, 3.47, -1.2);
      this.scene.add(tube);
    });
  }

  private buildLighting(): void {
    const ambient = new THREE.HemisphereLight(0x41506b, 0x191b22, 0.62);
    this.scene.add(ambient);

    // Lâmpada fluorescente principal da sala
    this.mainLamp = new THREE.PointLight(0xd4ecda, 1.15, 14, 1.4);
    this.mainLamp.position.set(0, 3.18, -1.1);
    this.mainLamp.castShadow = this.settings.highQualityShadows;
    this.mainLamp.shadow.mapSize.set(1024, 1024);
    this.mainLamp.shadow.bias = -0.002;
    this.scene.add(this.mainLamp);

    // Luz pálida do corredor esquerdo
    this.corridorLight = new THREE.PointLight(0x88b49e, 0.72, 9.5);
    this.corridorLight.position.set(-7.1, 3.1, -1.2);
    this.scene.add(this.corridorLight);

    // Luz alaranjada de vapor de sódio do poste externo no pátio direito
    this.streetLamp = new THREE.PointLight(0xe5944e, 1.35, 13);
    this.streetLamp.position.set(8.3, 3.5, -1.8);
    this.scene.add(this.streetLamp);

    // Clarão azulado de relâmpago lá fora na chuva
    this.lightningLight = new THREE.PointLight(0x9ec5ff, 0, 22);
    this.lightningLight.position.set(7.2, 3.6, -0.4);
    this.scene.add(this.lightningLight);

    // Aura rubra sutil emanando do Diário de Classe sobre a mesa do professor
    this.ledgerLight = new THREE.PointLight(0xd91e36, 0.35, 2.4);
    this.ledgerLight.position.set(-1.82, 0.96, -3.92);
    this.scene.add(this.ledgerLight);

    // Lanterna tática do jogador!
    this.flashlight = new THREE.SpotLight(0xfff5de, 0, 15, Math.PI / 5.5, 0.48, 1.2);
    this.flashlight.castShadow = this.settings.highQualityShadows;
    this.flashlight.position.copy(this.baseCamPos);
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Brilho azul da tela do celular iluminando a carteira
    this.phoneGlow = new THREE.PointLight(0x4f92ff, 0, 5.2);
    this.phoneGlow.position.set(0, 1.18, 0.75);
    this.scene.add(this.phoneGlow);

    // Luz dramática dedicada ao Jumpscare
    this.jumpscareLight = new THREE.PointLight(0xff2e44, 0, 4.5);
    this.jumpscareLight.position.set(0, 1.55, 0.92);
    this.scene.add(this.jumpscareLight);
  }

  private getTargetYaw(view: ViewDirection): number {
    switch (view) {
      case 'L':
        return Math.PI / 2 - 0.12; // Aponta direto para o vão da porta (z = -0.4)
      case 'R':
        return -Math.PI / 2 + 0.12; // Aponta direto para o centro da janela
      default:
        return 0;
    }
  }

  update(dt: number, snap: GameSnapshot | null): void {
    this.time += dt;

    // Animação da chuva lá fora
    const rArr = this.rainPositions;
    for (let i = 0; i < rArr.length; i += 6) {
      rArr[i + 1] -= dt * 7.8;
      rArr[i + 4] -= dt * 7.8;
      if (rArr[i + 1] < -0.2) {
        const ny = 4.1 + Math.random() * 0.5;
        rArr[i + 1] = ny;
        rArr[i + 4] = ny - 0.34;
      }
    }
    this.rainLines.geometry.attributes.position.needsUpdate = true;

    // Ventilador no teto
    this.ceilingFan.rotation.y += dt * 5.8;

    // Modo menu de fundo quando não há partida ativa
    if (!snap) {
      this.canInteract3D = false;
      this.camera.position.set(
        Math.sin(this.time * 0.35) * 0.25,
        1.52 + Math.sin(this.time * 0.7) * 0.03,
        1.15
      );
      this.camera.rotation.y = Math.sin(this.time * 0.25) * 0.42;
      this.camera.rotation.x = -0.04;
      const menuFlicker = Math.sin(this.time * 2.9) > 0.92;
      this.mainLamp.intensity = menuFlicker ? 0.32 : 0.98;
      this.ledgerLight.intensity = 0.35 + Math.sin(this.time * 2.4) * 0.15;
      this.lightningLight.intensity = 0;
      this.flashlight.intensity = 0;
      this.phoneGlow.intensity = 0;
      this.doorPivot.rotation.y = -0.42;

      // Vulto sinistro no corredor ou pátio durante a tela inicial!
      for (const id of TEACHER_ORDER) {
        if (id === 'marcos' && menuFlicker) {
          this.teacherRigs[id].setPose('doorPeek', 1, this.time, this.camera.position);
        } else if (id === 'helena' && !menuFlicker && Math.sin(this.time * 0.6) > 0.55) {
          this.teacherRigs[id].setPose('courtyardFar', 1, this.time, this.camera.position);
        } else {
          this.teacherRigs[id].setPose('hidden', 0, this.time, this.camera.position);
        }
      }

      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.canInteract3D = snap.running && !snap.paused && !this.jumpscareTeacher && snap.view !== 'P';

    // Se estiver em animação de Jumpscare!
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
        ? 2.2
        : 3.4 * (0.6 + Math.random() * 0.6);

      for (const id of TEACHER_ORDER) {
        if (id === this.jumpscareTeacher) {
          this.teacherRigs[id].setPose('jumpscare', 1, this.time, this.camera.position);
          const lunge = Math.min(1, this.jumpscareTime / 0.18);
          this.teacherRigs[id].root.position.z = -0.15 + lunge * 0.48;
        } else {
          this.teacherRigs[id].setPose('hidden', 0, this.time, this.camera.position);
        }
      }

      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Rotação suave da câmera do jogador + paralaxe opcional de mouse
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

    // Lanterna apontando para onde a câmera olha
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.flashlight.position.copy(this.camera.position);
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(forward, 6);
    this.flashlight.intensity = snap.flashlightOn && snap.view !== 'P' ? 3.4 : 0;

    // Brilho azul da tela do celular + relâmpago externo + aura do Diário
    this.phoneGlow.intensity = snap.view === 'P' && snap.phoneBattery > 0 ? 1.85 : 0;
    this.lightningLight.intensity = this.settings.reducedFlashes
      ? snap.lightningFlash * 1.6
      : snap.lightningFlash * 5.5;
    this.ledgerLight.intensity = 0.32 + snap.dangerLevel * 0.8 + Math.sin(this.time * 3) * 0.1;

    // Oscilação atmosférica da lâmpada do teto conforme perigo aumenta
    const flickerChance = 0.012 + snap.dangerLevel * 0.06;
    if (Math.random() < flickerChance && !this.settings.reducedFlashes) {
      this.mainLamp.intensity = 0.25 + Math.random() * 0.35;
    } else {
      this.mainLamp.intensity = 1.12 - snap.dangerLevel * 0.28;
    }

    // Atualização do quadro-negro e relógio analógico
    const pct =
      snap.totalTasks > 0 ? Math.round((snap.taskIndex / snap.totalTasks) * 100) : 100;
    this.chalkboard.render(
      snap.nightConfig.dayLabel,
      snap.dangerLevel,
      snap.valdirPopup,
      pct
    );
    this.wallClock.update(snap.currentHour);

    // Barras LED do Powerbank na mesa
    const pbRatio = snap.powerbankReserve / 100;
    this.powerbankBars.forEach((mat, idx) => {
      const lit = pbRatio > idx * 0.24;
      mat.color.setHex(lit ? (pbRatio < 0.3 ? 0xff5252 : 0x35e085) : 0x22262e);
    });

    // Porta esquerda: trancada = fechada (0), caso contrário entreabre conforme estágio de professores na esquerda!
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
      snap.doorClosed ? 0xff3344 : snap.doorLockCooldown > 0 ? 0xffaa22 : 0x2ce66b
    );

    // Janela direita + Persiana rolô
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

    // Posiciona cada professor no mundo 3D (prioriza o mais avançado em cada lado para não sobrepor!)
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
        // Célia só aparece fisicamente na porta se o sinal disparou (stage === 3)
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
