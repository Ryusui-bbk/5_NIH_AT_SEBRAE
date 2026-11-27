import { AchievementDef } from '../types';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'night_1',
    title: 'Presença Confirmada',
    description: 'Sobreviva à Noite 1 na ETEC Sebrae.',
    icon: '📋',
  },
  {
    id: 'night_3',
    title: 'Sem Pendências no NSA',
    description: 'Supere a auditoria do Coordenador na Noite 3.',
    icon: '💻',
  },
  {
    id: 'night_5',
    title: 'Menção MB — Formado!',
    description: 'Conclua todas as 5 Noites do Plantão Noturno.',
    icon: '🎓',
  },
  {
    id: 'battery_saver',
    title: 'Economia de Energia',
    description: 'Vença uma noite terminando com mais de 45% de bateria no celular.',
    icon: '🔋',
  },
  {
    id: 'no_door_slam',
    title: 'Sangue Frio',
    description: 'Vença uma noite sem trancar a porta nenhuma vez (apenas no olhar e lanterna).',
    icon: '🔦',
  },
  {
    id: 'custom_winner',
    title: 'Aprovado pelo Conselho',
    description: 'Vença uma Noite Personalizada com soma de IA igual ou superior a 50.',
    icon: '🏆',
  },
  {
    id: 'jubilado_20',
    title: 'Lenda do 5/20',
    description: 'Vença o Modo 20/20/20/20/20 no Conselho de Classe.',
    icon: '👑',
  },
];
