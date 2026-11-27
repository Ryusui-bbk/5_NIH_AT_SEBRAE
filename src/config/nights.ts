import { NightConfig, TeacherId } from '../types';

export const CAMPAIGN_NIGHTS: NightConfig[] = [
  {
    nightNumber: 1,
    title: 'Noite 1 — Trancado na Recuperação',
    subtitle: 'Sexta-feira · Sala 04 · Bloco B',
    dayLabel: 'NOITE 01',
    aiLevels: {
      marcos: 5,
      helena: 5,
      ricardo: 0,
      valdir: 0,
      celia: 0,
    },
    tasks: ['shortener', 'captcha', 'memory', 'dial190'],
    graceSeconds: 18,
    hourDurationSeconds: 48,
    batteryDrainMultiplier: 0.85,
    mode: 'protocol',
    briefingTip:
      'Prof. Marcos vem pela Porta (Esquerda) quando você não olha. Profa. Helena vem pela Janela (Direita) quando ouve/vê seu celular. Feche a Persiana (E) antes de usar o celular por muito tempo!',
    veteranoMessages: [
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '23:58',
        text: 'Mano, vc ficou preso na Sala 04?! O portão magnético travou e o Diário de Classe acordou a ronda...',
      },
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '23:59',
        text: 'Escuta: o sinal da operadora tá bloqueado pelo roteador da escola. Abre o app RESGATE 190 e passa pelos 4 bloqueios antes das 06h!',
      },
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:00',
        text: 'Se ouvir passos na ESQUERDA, olha pra Porta (A) e liga a Lanterna (F). Se usar muito o celular, fecha a Persiana da Janela (D -> E) pra Helena não ver o brilho!',
      },
    ],
  },
  {
    nightNumber: 2,
    title: 'Noite 2 — Firewall do Laboratório',
    subtitle: 'Sábado · Laboratório & Corredor Lateral',
    dayLabel: 'NOITE 02',
    aiLevels: {
      marcos: 7,
      helena: 7,
      ricardo: 6,
      valdir: 0,
      celia: 0,
    },
    tasks: ['shortener', 'wifi', 'pin', 'memory', 'dial190'],
    graceSeconds: 14,
    hourDurationSeconds: 46,
    batteryDrainMultiplier: 0.95,
    mode: 'protocol',
    briefingTip:
      'Prof. Ricardo entrou na ronda e muda de lado (Porta ↔ Janela) cada vez que recua! Descubra a Senha Diária de 4 dígitos olhando o Quadro de Avisos à esquerda ou a CAM 04 no CFTV.',
    veteranoMessages: [
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:00',
        text: 'A viatura ontem deu de cara com o portão trancado por fora e foi embora achando que era trote! Vc vai precisar destravar a Catraca primeiro.',
      },
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:01',
        text: 'Cuidado com o Prof. Ricardo: ele alterna entre Porta e Janela. Ouça de que lado vem o chiado estático ou confira as câmeras no app CFTV!',
      },
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:01',
        text: 'Dica de ouro: o PIN de 4 dígitos da catraca está anotado na CAM 04 (Sala dos Professores) e também colado no mural perto da porta.',
      },
    ],
  },
  {
    nightNumber: 3,
    title: 'Noite 3 — Convocação da Coordenação',
    subtitle: 'Domingo · Auditoria do Sistema NSA',
    dayLabel: 'NOITE 03',
    aiLevels: {
      marcos: 9,
      helena: 9,
      ricardo: 8,
      valdir: 8,
      celia: 0,
    },
    tasks: ['captcha', 'wifi', 'shortener', 'pin', 'dial190'],
    graceSeconds: 12,
    hourDurationSeconds: 45,
    batteryDrainMultiplier: 1.0,
    mode: 'protocol',
    briefingTip:
      'Coord. Valdir agora monitora a rede! Se um pop-up de Advertência travar seu celular, assine/dispense rápido e ilumine o Quadro-Negro à frente (W + F) para dissipar o vulto dele.',
    veteranoMessages: [
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:00',
        text: 'Péssima notícia: o Coord. Valdir abriu o Diário de Classe original. Se vc errar captcha/link ou ficar tempo demais seguido no celular, ele manda Advertência Digital.',
      },
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:01',
        text: 'Quando isso rolar, dispensa o pop-up no celular e joga a Lanterna (F) direto no Quadro-Negro (W) até a sombra dele sumir!',
      },
    ],
  },
  {
    nightNumber: 4,
    title: 'Noite 4 — O Sinal da Meia-Noite',
    subtitle: 'Segunda-feira · Ronda da Inspeção',
    dayLabel: 'NOITE 04',
    aiLevels: {
      marcos: 11,
      helena: 11,
      ricardo: 10,
      valdir: 10,
      celia: 11,
    },
    tasks: ['shortener', 'memory', 'wifi', 'captcha', 'pin', 'dial190'],
    graceSeconds: 10,
    hourDurationSeconds: 45,
    batteryDrainMultiplier: 1.08,
    mode: 'protocol',
    briefingTip:
      'Inspetora Célia ativou o Relógio do Sinal na Secretaria! Abra o app CFTV → CAM 03 periodicamente e clique em "Adiar Sinal" antes que a barra chegue a 0%.',
    veteranoMessages: [
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:00',
        text: 'A Inspetora Célia ligou o painel automático da sirene na Secretaria! Se aquele relógio zerar, o sinal toca e ela invade a sala na hora.',
      },
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:01',
        text: 'Fica de olho no ícone de alerta do CFTV: entra na CAM 03 e clica em "ADIAR SINAL" sempre que estiver caindo. E não esquece de deixar o celular carregar na mesa quando baixar!',
      },
    ],
  },
  {
    nightNumber: 5,
    title: 'Noite 5 — Banca Final às Escuras',
    subtitle: 'Sexta-feira · Fechamento Definitivo do Diário',
    dayLabel: 'NOITE 05',
    aiLevels: {
      marcos: 14,
      helena: 14,
      ricardo: 13,
      valdir: 13,
      celia: 14,
    },
    tasks: ['shortener', 'wifi', 'captcha', 'memory', 'pin', 'dial190'],
    graceSeconds: 8,
    hourDurationSeconds: 44,
    batteryDrainMultiplier: 1.15,
    mode: 'protocol',
    briefingTip:
      'Toda a equipe pedagógica está ativa! Gerencie a bateria no Powerbank da mesa, mantenha o Sinal da CAM 03 adiado, não tranque Porta e Persiana juntas por muito tempo (abafamento) e conclua a ligação para o 190!',
    veteranoMessages: [
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:00',
        text: 'É hoje! Consegui falar com o batalhão da PM — eles estão esperando o sinal de localização exato do seu aparelho junto com o destravamento da catraca!',
      },
      {
        sender: 'Lucas (Veterano 3º ADM)',
        time: '00:01',
        text: 'Todos os 5 estão nos corredores hoje. Respira fundo, usa o som estéreo, controla a bateria e sai vivo da ETEC Sebrae!',
      },
    ],
  },
];

export interface CustomNightPreset {
  id: string;
  name: string;
  description: string;
  aiLevels: Record<TeacherId, number>;
  mode: 'protocol' | 'survive6am';
}

export const CUSTOM_NIGHT_PRESETS: CustomNightPreset[] = [
  {
    id: 'recuperacao',
    name: 'Recuperação Paralela',
    description: 'Desafio equilibrado com toda a equipe em nível moderado (IA 10).',
    aiLevels: { marcos: 10, helena: 10, ricardo: 10, valdir: 10, celia: 10 },
    mode: 'protocol',
  },
  {
    id: 'silencio_total',
    name: 'Proibido Celular',
    description: 'Helena, Valdir e Célia implacáveis contra qualquer descuido na tela.',
    aiLevels: { marcos: 6, helena: 18, ricardo: 12, valdir: 18, celia: 16 },
    mode: 'protocol',
  },
  {
    id: 'corredor_fantasma',
    name: 'Vultos no Corredor',
    description: 'Marcos e Ricardo em velocidade máxima nos acessos laterais (Sobreviva até 6h).',
    aiLevels: { marcos: 20, helena: 12, ricardo: 20, valdir: 8, celia: 12 },
    mode: 'survive6am',
  },
  {
    id: 'conselho_maximo',
    name: 'Modo 5/20 — Jubilado',
    description: 'Todos os 5 professores no nível máximo (20/20/20/20/20). Apenas lendas da ETEC.',
    aiLevels: { marcos: 20, helena: 20, ricardo: 20, valdir: 20, celia: 20 },
    mode: 'protocol',
  },
];

export function buildCustomNightConfig(
  aiLevels: Record<TeacherId, number>,
  mode: 'protocol' | 'survive6am'
): NightConfig {
  const sum = Object.values(aiLevels).reduce((a, b) => a + b, 0);
  return {
    nightNumber: 6,
    title: 'Conselho de Classe — Noite Personalizada',
    subtitle:
      mode === 'survive6am'
        ? `Sobrevivência Clássica até 06:00 · Pontuação Base ${sum * 100}`
        : `Protocolo Completo (6 Etapas) · Pontuação Base ${sum * 120}`,
    dayLabel: 'CUSTOM',
    aiLevels: { ...aiLevels },
    tasks: ['shortener', 'wifi', 'captcha', 'memory', 'pin', 'dial190'],
    graceSeconds: 6,
    hourDurationSeconds: mode === 'survive6am' ? 35 : 44,
    batteryDrainMultiplier: 1.1,
    mode,
    briefingTip:
      mode === 'survive6am'
        ? 'Modo Sobrevivência 6AM: resista na Sala 04 da meia-noite até as 06:00 da manhã!'
        : 'Modo Protocolo: conclua todas as 6 etapas no celular antes que o Diário feche às 06:00!',
    veteranoMessages: [
      {
        sender: 'Sistema NSA · Conselho',
        time: '00:00',
        text: `Sessão extraordinária iniciada. Soma de dificuldade configurada: ${sum}/100. Boa sorte, estudante.`,
      },
    ],
  };
}
