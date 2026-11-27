import { AchievementDef } from '../types';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'night_1',
    title: 'Presença Confirmada',
    description: 'Sobreviva ao primeiro plantão noturno na Sala 04.',
    icon: 'N-01',
  },
  {
    id: 'night_3',
    title: 'Sem Pendências no NSA',
    description: 'Supere a auditoria do Coordenador na Noite 3.',
    icon: 'NSA',
  },
  {
    id: 'night_5',
    title: 'Menção MB — Formado',
    description: 'Conclua todas as 5 noites do Plantão Noturno.',
    icon: 'MB',
  },
  {
    id: 'battery_saver',
    title: 'Carga Reserva',
    description: 'Vença uma noite terminando com mais de 45% de bateria no aparelho.',
    icon: '45%+',
  },
  {
    id: 'no_door_slam',
    title: 'Sangue Frio',
    description: 'Vença uma noite sem acionar a trava magnética da porta nenhuma vez.',
    icon: 'LUZ',
  },
  {
    id: 'custom_winner',
    title: 'Deferido pelo Conselho',
    description: 'Vença uma Noite Personalizada com soma de IA igual ou superior a 50.',
    icon: '50+',
  },
  {
    id: 'jubilado_20',
    title: 'Protocolo 5/20',
    description: 'Sobreviva ao Conselho de Classe com todos os 5 docentes no nível 20.',
    icon: '5/20',
  },
];
