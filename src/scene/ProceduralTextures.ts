import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function createWoodTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(512, 256);
  x.fillStyle = '#6f4b2d';
  x.fillRect(0, 0, 512, 256);

  for (let i = 0; i < 120; i++) {
    const y = Math.random() * 256;
    const dark = Math.random() < 0.62;
    x.strokeStyle = dark
      ? `rgba(34,17,7,${0.08 + Math.random() * 0.24})`
      : `rgba(170,124,78,${0.06 + Math.random() * 0.18})`;
    x.lineWidth = 1 + Math.random() * 2.5;
    x.beginPath();
    x.moveTo(0, y);
    x.bezierCurveTo(
      170,
      y + (Math.random() - 0.5) * 14,
      340,
      y + (Math.random() - 0.5) * 14,
      512,
      y + (Math.random() - 0.5) * 8
    );
    x.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSchoolWallTexture(): THREE.CanvasTexture {
  // Parede clássica de escola técnica: barra inferior verde-institucional, topo creme envelhecido
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = '#b8beb2';
  x.fillRect(0, 0, 512, 315);

  x.fillStyle = '#4e6456';
  x.fillRect(0, 315, 512, 197);

  // Faixa divisória escura
  x.fillStyle = '#2d3b32';
  x.fillRect(0, 311, 512, 8);

  // Granulado de alvenaria e manchas sutis de umidade
  for (let i = 0; i < 9000; i++) {
    const px = Math.random() * 512;
    const py = Math.random() * 512;
    x.fillStyle =
      Math.random() < 0.5
        ? `rgba(0,0,0,${Math.random() * 0.09})`
        : `rgba(255,255,255,${Math.random() * 0.06})`;
    x.fillRect(px, py, 2, 2);
  }
  for (let i = 0; i < 16; i++) {
    const gx = Math.random() * 512;
    const grad = x.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, 'rgba(15,22,18,0.14)');
    grad.addColorStop(0.5, 'rgba(15,22,18,0.02)');
    grad.addColorStop(1, 'rgba(10,16,12,0.18)');
    x.fillStyle = grad;
    x.fillRect(gx, 0, 8 + Math.random() * 24, 512);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFloorTexture(): THREE.CanvasTexture {
  // Piso granilite cinza escuro escolar com juntas
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = '#383a3f';
  x.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 11000; i++) {
    const tone = Math.random();
    x.fillStyle =
      tone < 0.45
        ? 'rgba(15,16,20,0.28)'
        : tone < 0.82
          ? 'rgba(185,188,182,0.16)'
          : 'rgba(110,120,115,0.2)';
    x.fillRect(Math.random() * 512, Math.random() * 512, 2.2, 2.2);
  }

  x.strokeStyle = 'rgba(12,13,16,0.75)';
  x.lineWidth = 3;
  for (let k = 0; k <= 512; k += 128) {
    x.beginPath();
    x.moveTo(k, 0);
    x.lineTo(k, 512);
    x.stroke();
    x.beginPath();
    x.moveTo(0, k);
    x.lineTo(512, k);
    x.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCeilingTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#7e827f';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    x.fillStyle = `rgba(20,22,20,${Math.random() * 0.14})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  x.strokeStyle = 'rgba(30,32,30,0.45)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, 128, 128);
  x.strokeRect(128, 0, 128, 128);
  x.strokeRect(0, 128, 128, 128);
  x.strokeRect(128, 128, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRainGlassTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = 'rgba(130, 165, 195, 0.18)';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const len = 6 + Math.random() * 22;
    x.strokeStyle = `rgba(210, 232, 255, ${0.12 + Math.random() * 0.25})`;
    x.lineWidth = 1 + Math.random() * 1.4;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px - 1.5, py + len);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNoticeBoardTexture(pin: string): THREE.CanvasTexture {
  const [c, x] = makeCanvas(512, 360);
  // Cortiça
  x.fillStyle = '#8b633b';
  x.fillRect(0, 0, 512, 360);
  for (let i = 0; i < 4500; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(45,25,10,0.22)' : 'rgba(195,148,96,0.16)';
    x.fillRect(Math.random() * 512, Math.random() * 360, 3, 3);
  }
  x.strokeStyle = '#3d2814';
  x.lineWidth = 14;
  x.strokeRect(7, 7, 498, 346);

  // Folha 1: Edital de Recuperação
  x.fillStyle = '#e7e1cf';
  x.fillRect(32, 32, 235, 285);
  x.fillStyle = '#8b1a1a';
  x.font = 'bold 20px Georgia';
  x.fillText('REGIMENTO NOTURNO', 46, 64);
  x.fillStyle = '#2d2b26';
  x.font = '15px sans-serif';
  x.fillText('Art. 14 — Proibido celular', 46, 98);
  x.fillText('durante o plantão escolar.', 46, 120);
  x.fillText('Sujeito a retenção imediata', 46, 148);
  x.fillText('com Menção I no NSA.', 46, 170);
  for (let i = 0; i < 5; i++) {
    x.fillStyle = 'rgba(60,55,48,0.45)';
    x.fillRect(46, 200 + i * 16, 180 - (i % 2) * 35, 6);
  }

  // Post-it amarelo com a Senha Diária da Catraca!
  x.save();
  x.translate(375, 175);
  x.rotate(-0.07);
  x.fillStyle = '#ebd45e';
  x.fillRect(-92, -88, 184, 176);
  x.fillStyle = '#b02525';
  x.beginPath();
  x.arc(0, -72, 7, 0, Math.PI * 2);
  x.fill();

  x.fillStyle = '#1f1d16';
  x.font = 'bold 17px monospace';
  x.textAlign = 'center';
  x.fillText('SENHA CATRACA', 0, -34);
  x.fillText('PLANTÃO HOJE:', 0, -10);
  x.fillStyle = '#8f1111';
  x.font = 'bold 44px monospace';
  x.fillText(pin, 0, 44);
  x.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPlaqueTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(512, 140);
  x.fillStyle = '#1b222c';
  x.fillRect(0, 0, 512, 140);
  x.strokeStyle = '#9aa5b4';
  x.lineWidth = 6;
  x.strokeRect(6, 6, 500, 128);
  x.fillStyle = '#e0243a';
  x.fillRect(18, 18, 14, 104);

  x.fillStyle = '#f0f2f5';
  x.font = 'bold 30px sans-serif';
  x.fillText('ETEC SEBRAE', 48, 60);
  x.fillStyle = '#b4becb';
  x.font = '20px monospace';
  x.fillText('BLOCO B · SALA 04 · RECUPERAÇÃO', 48, 102);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class DynamicChalkboard {
  readonly texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastSignature = '';

  constructor() {
    const [c, ctx] = makeCanvas(1024, 420);
    this.canvas = c;
    this.ctx = ctx;
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
    x.fillStyle = '#14281f';
    x.fillRect(0, 0, 1024, 420);

    // Manchas de apagador de giz
    for (let i = 0; i < 38; i++) {
      x.fillStyle = `rgba(215, 228, 218, ${0.015 + Math.random() * 0.03})`;
      x.beginPath();
      x.ellipse(
        Math.random() * 1024,
        Math.random() * 420,
        40 + Math.random() * 90,
        15 + Math.random() * 30,
        Math.random() * Math.PI,
        0,
        Math.PI * 2
      );
      x.fill();
    }

    x.fillStyle = 'rgba(222, 232, 222, 0.78)';
    x.font = '22px Georgia';
    x.textAlign = 'left';
    x.fillText(`ETEC SEBRAE — ${nightLabel}`, 44, 52);
    x.fillText(`Recuperação Final · Proibido sair sem assinar`, 44, 84);

    x.textAlign = 'center';
    if (valdirActive) {
      x.fillStyle = '#ff5252';
      x.font = 'bold 58px Georgia';
      x.fillText('COMPAREÇA À COORDENAÇÃO!', 512, 205);
      x.font = '32px Georgia';
      x.fillStyle = '#f2d399';
      x.fillText('Jogue a LANTERNA (F) aqui para dissipar a convocação!', 512, 270);
    } else if (dangerLevel > 0.65) {
      x.fillStyle = '#e84848';
      x.font = 'bold 64px Georgia';
      x.fillText('ELES ESTÃO NA SALA.', 512, 205);
      x.font = '30px Georgia';
      x.fillStyle = '#d7dfd7';
      x.fillText('Guarde o celular e olhe para quem se aproximou!', 512, 268);
    } else {
      x.fillStyle = '#dce6dc';
      x.font = 'bold 56px Georgia';
      x.fillText('CELULAR GUARDADO!', 512, 198);
      x.fillStyle = '#d86666';
      x.font = '30px Georgia';
      x.fillText('Quem usa na madrugada repete de módulo. Para sempre.', 512, 258);
    }

    x.textAlign = 'right';
    x.fillStyle = 'rgba(210, 224, 210, 0.65)';
    x.font = '22px monospace';
    x.fillText(`Protocolo: ${taskProgress}%`, 980, 382);

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

    x.fillStyle = '#e5e1d4';
    x.beginPath();
    x.arc(128, 128, 120, 0, Math.PI * 2);
    x.fill();

    x.lineWidth = 10;
    x.strokeStyle = '#1f2329';
    x.stroke();

    // Marcações de horas
    for (let i = 0; i < 12; i++) {
      const ang = (i * Math.PI) / 6 - Math.PI / 2;
      x.strokeStyle = '#181a1d';
      x.lineWidth = i % 3 === 0 ? 5 : 2.5;
      x.beginPath();
      x.moveTo(128 + Math.cos(ang) * 92, 128 + Math.sin(ang) * 92);
      x.lineTo(128 + Math.cos(ang) * 108, 128 + Math.sin(ang) * 108);
      x.stroke();
    }

    x.fillStyle = '#333';
    x.font = 'bold 16px monospace';
    x.textAlign = 'center';
    x.fillText('SEBRAE', 128, 86);

    // Ponteiro das horas (00:00 = 12 no topo -> 06:00 = 6 embaixo)
    const hAngle = ((hoursFloat % 12) / 12) * Math.PI * 2 - Math.PI / 2;
    const mAngle = ((totalMinutes % 60) / 60) * Math.PI * 2 - Math.PI / 2;

    x.strokeStyle = '#141619';
    x.lineWidth = 7;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(128, 128);
    x.lineTo(128 + Math.cos(hAngle) * 62, 128 + Math.sin(hAngle) * 62);
    x.stroke();

    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(128, 128);
    x.lineTo(128 + Math.cos(mAngle) * 88, 128 + Math.sin(mAngle) * 88);
    x.stroke();

    // Marca vermelha nas 6 horas (prazo final!)
    x.fillStyle = '#c92a2a';
    x.beginPath();
    x.arc(128, 228, 6, 0, Math.PI * 2);
    x.fill();

    x.fillStyle = '#111';
    x.beginPath();
    x.arc(128, 128, 7, 0, Math.PI * 2);
    x.fill();

    this.texture.needsUpdate = true;
  }
}
