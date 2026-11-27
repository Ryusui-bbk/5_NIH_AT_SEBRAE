import * as THREE from 'three';
import { TeacherConfig } from '../types';

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

export class TeacherRig {
  readonly root = new THREE.Group();
  readonly headGroup = new THREE.Group();
  readonly leftArm = new THREE.Group();
  readonly rightArm = new THREE.Group();
  readonly eyeGlowLeft: THREE.Mesh;
  readonly eyeGlowRight: THREE.Mesh;

  private faceCanvas: HTMLCanvasElement;
  private faceTexture: THREE.CanvasTexture;
  private badgeCanvas: HTMLCanvasElement;
  private badgeTexture: THREE.CanvasTexture;
  private config: TeacherConfig;
  private customPhotoImg: HTMLImageElement | null = null;
  private displayName: string;

  constructor(config: TeacherConfig, displayName?: string, photoDataUrl?: string) {
    this.config = config;
    this.displayName = displayName || config.defaultName;

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 256;
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;

    this.badgeCanvas = document.createElement('canvas');
    this.badgeCanvas.width = 128;
    this.badgeCanvas.height = 160;
    this.badgeTexture = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTexture.colorSpace = THREE.SRGBColorSpace;

    const skinMat = new THREE.MeshStandardMaterial({
      color: config.skinColor,
      roughness: 0.62,
    });
    const suitMat = new THREE.MeshStandardMaterial({
      color: config.suitColor,
      roughness: 0.85,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x16181f,
      roughness: 0.88,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x0b0c0e,
      roughness: 0.35,
    });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0xe3e4e8,
      roughness: 0.75,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: config.secondaryColor,
      roughness: 0.65,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: config.hairColor,
      roughness: 0.85,
    });

    // Pernas e sapatos
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, 0.84, 14), pantsMat);
      leg.position.set(0.105 * side, 0.44, 0);
      leg.castShadow = true;
      this.root.add(leg);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), shoeMat);
      shoe.position.set(0.105 * side, 0.04, 0.045);
      shoe.castShadow = true;
      this.root.add(shoe);
    });

    // Tronco / paletó
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.165, 0.62, 18), suitMat);
    torso.position.set(0, 1.16, 0);
    torso.scale.set(1.06, 1, 0.68);
    torso.castShadow = true;
    this.root.add(torso);

    // Ombros estruturados
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.11, 0.23), suitMat);
    shoulders.position.set(0, 1.42, 0);
    shoulders.castShadow = true;
    this.root.add(shoulders);

    // Camisa + gravata / colar
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.02), shirtMat);
    shirt.position.set(0, 1.31, 0.135);
    this.root.add(shirt);

    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(config.isFemale ? 0.09 : 0.038, config.isFemale ? 0.09 : 0.3, 0.022),
      accentMat
    );
    tie.position.set(0, config.isFemale ? 1.38 : 1.27, 0.146);
    this.root.add(tie);

    // Crachá institucional ETEC pendurado no peito
    const lanyard = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.006, 6, 18, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xb91c2c })
    );
    lanyard.position.set(0, 1.43, 0.145);
    lanyard.rotation.z = Math.PI;
    this.root.add(lanyard);

    const badgeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.075, 0.095),
      new THREE.MeshStandardMaterial({ map: this.badgeTexture, roughness: 0.4 })
    );
    badgeMesh.position.set(0.07, 1.24, 0.152);
    this.root.add(badgeMesh);

    // Braço Esquerdo
    this.leftArm.position.set(-0.255, 1.41, 0);
    const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.046, 0.56, 12), suitMat);
    lSleeve.position.set(0, -0.27, 0);
    lSleeve.castShadow = true;
    const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), skinMat);
    lHand.position.set(0, -0.57, 0);
    this.leftArm.add(lSleeve, lHand);
    this.root.add(this.leftArm);

    // Braço Direito + Objeto característico do professor
    this.rightArm.position.set(0.255, 1.41, 0);
    const rSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.046, 0.56, 12), suitMat);
    rSleeve.position.set(0, -0.27, 0);
    rSleeve.castShadow = true;
    const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), skinMat);
    rHand.position.set(0, -0.57, 0);
    this.rightArm.add(rSleeve, rHand);
    this.attachProp(rHand);
    this.root.add(this.rightArm);

    // Pescoço e Cabeça
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 12), skinMat);
    neck.position.set(0, 1.52, 0);
    this.root.add(neck);

    this.headGroup.position.set(0, 1.67, 0);
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.122, 26, 22), skinMat);
    cranium.scale.set(0.92, 1.14, 0.98);
    cranium.castShadow = true;
    this.headGroup.add(cranium);

    // Rosto curvo frontal com textura nítida (ou foto customizada!)
    const facePatch = new THREE.Mesh(
      new THREE.PlaneGeometry(0.175, 0.195, 8, 8),
      new THREE.MeshStandardMaterial({
        map: this.faceTexture,
        roughness: 0.55,
        transparent: true,
      })
    );
    // Curva levemente o plano facial para acompanhar o crânio sem distorção bizarra
    const posAttr = facePatch.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const bend = -0.028 * (px / 0.09) ** 2 - 0.015 * (py / 0.1) ** 2;
      posAttr.setZ(i, bend);
    }
    facePatch.geometry.computeVertexNormals();
    facePatch.position.set(0, -0.005, 0.121);
    this.headGroup.add(facePatch);

    // Orelhas
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), skinMat);
      ear.scale.set(0.45, 1.3, 0.8);
      ear.position.set(0.112 * side, 0, -0.005);
      this.headGroup.add(ear);
    });

    // Cabelo estilizado
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairCap.scale.set(0.95, 1.15, 1.03);
    hairCap.rotation.x = -0.22;
    hairCap.position.set(0, 0.012, -0.008);
    this.headGroup.add(hairCap);

    if (config.isFemale) {
      // Coque rigoroso na nuca
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), hairMat);
      bun.position.set(0, 0.03, -0.145);
      this.headGroup.add(bun);
    }

    // Óculos 3D opcionais
    if (config.hasGlasses) {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.3 });
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x8fb8ff,
        transparent: true,
        opacity: 0.25,
        roughness: 0.1,
      });
      [-1, 1].forEach((side) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 20), frameMat);
        rim.position.set(0.042 * side, 0.015, 0.124);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), lensMat);
        lens.position.set(0.042 * side, 0.015, 0.125);
        this.headGroup.add(rim, lens);
      });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.005, 0.005), frameMat);
      bridge.position.set(0, 0.018, 0.124);
      this.headGroup.add(bridge);
    }

    // Brilho sutil nos olhos para silhueta sinistra no escuro
    const eyeGlowMat = new THREE.MeshBasicMaterial({ color: config.accentColor });
    this.eyeGlowLeft = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), eyeGlowMat);
    this.eyeGlowRight = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), eyeGlowMat);
    this.eyeGlowLeft.position.set(-0.04, 0.014, 0.126);
    this.eyeGlowRight.position.set(0.04, 0.014, 0.126);
    this.headGroup.add(this.eyeGlowLeft, this.eyeGlowRight);

    this.root.add(this.headGroup);
    this.root.visible = false;

    this.refreshAppearance(this.displayName, photoDataUrl);
  }

  private attachProp(hand: THREE.Object3D): void {
    switch (this.config.propType) {
      case 'ruler': {
        const ruler = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.65, 0.008),
          new THREE.MeshStandardMaterial({ color: 0xb68646, roughness: 0.6 })
        );
        ruler.position.set(0, -0.22, 0.14);
        ruler.rotation.x = 0.65;
        hand.add(ruler);
        break;
      }
      case 'clipboard': {
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.3, 0.015),
          new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.7 })
        );
        const paper = new THREE.Mesh(
          new THREE.PlaneGeometry(0.18, 0.24),
          new THREE.MeshStandardMaterial({ color: 0xebe6d8 })
        );
        paper.position.z = 0.01;
        board.add(paper);
        board.position.set(-0.04, -0.05, 0.12);
        board.rotation.x = -0.5;
        hand.add(board);
        break;
      }
      case 'tablet': {
        const tab = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.26, 0.016),
          new THREE.MeshStandardMaterial({
            color: 0x151a1e,
            emissive: 0x1e4d2b,
            emissiveIntensity: 0.8,
          })
        );
        tab.position.set(-0.03, -0.04, 0.11);
        tab.rotation.x = -0.45;
        hand.add(tab);
        break;
      }
      case 'ledger': {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.32, 0.05),
          new THREE.MeshStandardMaterial({
            color: 0x4f0e16,
            emissive: 0x290408,
            roughness: 0.5,
          })
        );
        book.position.set(-0.05, -0.04, 0.12);
        book.rotation.x = -0.4;
        hand.add(book);
        break;
      }
      case 'bell': {
        const bell = new THREE.Mesh(
          new THREE.ConeGeometry(0.065, 0.12, 14),
          new THREE.MeshStandardMaterial({ color: 0xc89d32, metalness: 0.6, roughness: 0.3 })
        );
        bell.position.set(0, -0.08, 0.06);
        hand.add(bell);
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
        this.drawFace();
      };
      img.onerror = () => {
        this.customPhotoImg = null;
        this.drawFace();
      };
      img.src = photoDataUrl;
    } else {
      this.customPhotoImg = null;
      this.drawFace();
    }
  }

  private drawBadge(): void {
    const x = this.badgeCanvas.getContext('2d')!;
    x.fillStyle = '#f2f4f7';
    x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#c81e32';
    x.fillRect(0, 0, 128, 34);
    x.fillStyle = '#fff';
    x.font = 'bold 16px sans-serif';
    x.textAlign = 'center';
    x.fillText('ETEC SEBRAE', 64, 23);

    x.fillStyle = '#222834';
    x.fillRect(28, 46, 72, 64);
    x.fillStyle = '#14171d';
    x.font = 'bold 14px sans-serif';
    x.fillText(this.displayName.slice(0, 14), 64, 134);
    this.badgeTexture.needsUpdate = true;
  }

  private drawFace(): void {
    const x = this.faceCanvas.getContext('2d')!;
    x.clearRect(0, 0, 256, 256);

    if (this.customPhotoImg) {
      // Recorte oval suave da foto enviada pelo jogador!
      x.save();
      x.beginPath();
      x.ellipse(128, 128, 114, 122, 0, 0, Math.PI * 2);
      x.closePath();
      x.clip();

      const iw = this.customPhotoImg.width;
      const ih = this.customPhotoImg.height;
      const scale = Math.max(256 / iw, 256 / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      x.drawImage(this.customPhotoImg, (256 - dw) / 2, (256 - dh) / 2, dw, dh);

      // Vinheta sombria nas bordas para integrar ao modelo 3D
      const grad = x.createRadialGradient(128, 128, 65, 128, 128, 124);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(15,8,8,0.55)');
      x.fillStyle = grad;
      x.fillRect(0, 0, 256, 256);
      x.restore();

      // Atualiza miniatura no crachá também
      const bx = this.badgeCanvas.getContext('2d')!;
      bx.drawImage(this.customPhotoImg, 28, 46, 72, 64);
      this.badgeTexture.needsUpdate = true;
      this.faceTexture.needsUpdate = true;
      return;
    }

    // Rosto estilizado sombrio procedural de alta definição
    const baseHex = '#' + this.config.skinColor.toString(16).padStart(6, '0');
    const grad = x.createRadialGradient(128, 118, 22, 128, 128, 130);
    grad.addColorStop(0, baseHex);
    grad.addColorStop(1, 'rgba(58, 38, 30, 0.95)');
    x.fillStyle = grad;
    x.beginPath();
    x.ellipse(128, 128, 118, 124, 0, 0, Math.PI * 2);
    x.fill();

    // Olheiras profundas de plantão noturno
    x.fillStyle = 'rgba(26, 12, 16, 0.58)';
    [82, 174].forEach((ex) => {
      x.beginPath();
      x.ellipse(ex, 112, 28, 17, 0, 0, Math.PI * 2);
      x.fill();
    });

    // Esclera e pupilas intensas
    x.fillStyle = '#e7e2d8';
    [82, 174].forEach((ex) => {
      x.beginPath();
      x.ellipse(ex, 112, 19, 10, 0, 0, Math.PI * 2);
      x.fill();
    });
    x.fillStyle = '#120808';
    [82, 174].forEach((ex) => {
      x.beginPath();
      x.arc(ex, 112, 7.5, 0, Math.PI * 2);
      x.fill();
    });

    // Sobrancelhas franzidas severas
    x.strokeStyle = '#1d130e';
    x.lineWidth = 7;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(52, 86);
    x.lineTo(106, 97);
    x.moveTo(204, 86);
    x.lineTo(150, 97);
    x.stroke();

    // Nariz sombreado
    x.strokeStyle = 'rgba(52, 28, 22, 0.65)';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(128, 112);
    x.lineTo(120, 156);
    x.lineTo(137, 158);
    x.stroke();

    // Bigode para Valdir ou expressão severa
    if (this.config.id === 'valdir') {
      x.fillStyle = '#2c2725';
      x.beginPath();
      x.ellipse(128, 178, 34, 9, 0, 0, Math.PI);
      x.fill();
    }

    // Boca séria
    x.strokeStyle = this.config.isFemale ? '#5e1f2d' : '#3a1a1a';
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(92, 194);
    x.quadraticCurveTo(128, 184, 164, 194);
    x.stroke();

    this.faceTexture.needsUpdate = true;
  }

  setPose(pose: TeacherPose, anim01: number, time: number, cameraPos: THREE.Vector3): void {
    if (pose === 'hidden') {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    this.root.scale.setScalar(1);
    this.leftArm.rotation.set(0, 0, 0.06);
    this.rightArm.rotation.set(-0.35, 0, -0.06);
    this.headGroup.rotation.set(0, 0, Math.sin(time * 1.7) * 0.05);
    this.eyeGlowLeft.visible = !this.customPhotoImg;
    this.eyeGlowRight.visible = !this.customPhotoImg;

    const breathe = Math.sin(time * 2.1) * 0.012;

    switch (pose) {
      case 'corridorFar': {
        this.root.position.set(-7.35, breathe, -1.55);
        this.root.lookAt(-2, 0, 0.4);
        break;
      }
      case 'doorPeek': {
        this.root.position.set(-5.38, breathe, -0.45);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.root.rotation.z = -0.08;
        this.headGroup.rotation.z = -0.14;
        break;
      }
      case 'doorBreach': {
        const e = anim01 * anim01 * (3 - 2 * anim01);
        this.root.position.set(-5.2 + 1.95 * e, breathe, -0.35 + 0.25 * e);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.rightArm.rotation.x = -0.75 - Math.sin(time * 3) * 0.08;
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
        this.headGroup.rotation.z = 0.1;
        break;
      }
      case 'windowBreach': {
        const e = anim01 * anim01 * (3 - 2 * anim01);
        this.root.position.set(5.45 - 0.82 * e, breathe, -0.32);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.leftArm.rotation.x = -0.9 * e;
        this.rightArm.rotation.x = -0.95 * e;
        break;
      }
      case 'boardApparition': {
        this.root.position.set(-1.15, breathe, -3.65);
        this.root.lookAt(cameraPos.x, 0, cameraPos.z);
        this.rightArm.rotation.x = -0.85;
        break;
      }
      case 'jumpscare': {
        // Posiciona bem diante da câmera olhando direto nos olhos do jogador!
        this.root.position.set(0, 1.46 - 1.64, 0.22);
        this.root.rotation.set(0, 0, Math.sin(time * 42) * 0.08);
        this.leftArm.rotation.set(-1.35, 0.25, 0.35);
        this.rightArm.rotation.set(-1.35, -0.25, -0.35);
        this.headGroup.rotation.set(
          Math.sin(time * 36) * 0.09,
          Math.cos(time * 28) * 0.08,
          Math.sin(time * 50) * 0.12
        );
        break;
      }
    }
  }
}
