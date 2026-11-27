import { TeacherConfig, TeacherId } from '../types';

export const TEACHER_ORDER: TeacherId[] = ['marcos', 'helena', 'ricardo', 'valdir', 'celia'];

export const TEACHERS: Record<TeacherId, TeacherConfig> = {
  marcos: {
    id: 'marcos',
    defaultName: 'Prof. Marcos',
    subject: 'Cálculo & Lógica',
    role: 'Docente do Bloco A',
    accentColor: '#5ea2ff',
    suitColor: 0x22334f,
    secondaryColor: 0x8b1e2b,
    hairColor: 0x241710,
    skinColor: 0xc59e84,
    hasGlasses: true,
    propType: 'ruler',
    originLabel: 'Porta do Corredor (Esquerda)',
    mechanicSummary:
      'Avança pelo corredor escuro apenas quando você NÃO está olhando para a porta.',
    counterplayTip:
      'Olhe para a Porta (A) e ligue a Lanterna (F) no corredor ou tranque a porta por alguns segundos quando ele estiver na brecha.',
    bio: 'Famoso por aplicar listas de 40 exercícios faltando cinco minutos para o sinal. Desde que o Diário de Classe trancou o prédio, ele mede cada passo no corredor com sua régua de madeira.',
    quotes: {
      stalk: [
        'Ouvi passos fora do horário no Bloco A...',
        'Quem ficou na sala depois da chamada?',
        'A lista de presença ainda não foi assinada.',
      ],
      near: [
        'Seu nome não consta na autorização de saída.',
        'Estou vendo reflexo de tela acesa daqui do corredor.',
        'Guarde o material. A avaliação vai começar.',
      ],
      attack: [
        'Celular guardado. AGORA.',
        'Prova surpresa. Individual e sem consulta.',
        'Contando até três para entregar o aparelho...',
      ],
      retreat: [
        'Hmph. Na próxima ronda eu confiro sua carteira.',
        'Anotado no canhoto do Diário.',
        'Continue olhando para frente, aluno.',
      ],
      jumpscare: 'MENÇÃO I! Celular confiscado até o fim do semestre!',
    },
  },

  helena: {
    id: 'helena',
    defaultName: 'Profa. Helena',
    subject: 'Comunicação & Redação',
    role: 'Docente do Pátio Leste',
    accentColor: '#ff70a6',
    suitColor: 0x562337,
    secondaryColor: 0xd8c3a5,
    hairColor: 0x5c5b63,
    skinColor: 0xcba68e,
    isFemale: true,
    propType: 'clipboard',
    originLabel: 'Janela do Pátio (Direita)',
    mechanicSummary:
      'É atraída pelo brilho e pelos sons do celular ligado. Quanto mais tempo com o celular aberto sem fechar a persiana, mais rápido ela chega.',
    counterplayTip:
      'Feche a Persiana (E na janela) antes de mexer muito no celular. Se ela parar na janela, guarde o celular e ilumine/feche a persiana até ela sair.',
    bio: 'Corrige dissertações à meia-noite com caneta vermelha. Dizem que ela consegue ouvir a vibração de uma notificação a três salas de distância sob a chuva.',
    quotes: {
      stalk: [
        'Alguém desbloqueou um aparelho na Sala 04?',
        'Psiu... o pátio inteiro escuta esse clique.',
        'A norma culta e o regimento proíbem telas em aula.',
      ],
      near: [
        'A Coordenação não esquece nenhum RA.',
        'Abra só mais uma aba. Eu desafio você.',
        'Estou vendo essa luz azul pela vidraça...',
      ],
      attack: [
        'Quem autorizou o uso de celular em sala?!',
        'Vou convocar seus responsáveis agora mesmo!',
        'Entregue o aparelho sobre a minha mesa!',
      ],
      retreat: [
        'Vou registrar em ata e continuar a ronda.',
        'Que seja a última vez nesta madrugada.',
        'Fique de olhos no quadro, não no bolso.',
      ],
      jumpscare: 'OCORRÊNCIA ASSINADA! Zerou por desrespeito ao regimento!',
    },
  },

  ricardo: {
    id: 'ricardo',
    defaultName: 'Prof. Ricardo',
    subject: 'Redes & Cibersegurança',
    role: 'Administrador dos Laboratórios',
    accentColor: '#8ce96a',
    suitColor: 0x2d3e28,
    secondaryColor: 0x1a1f1c,
    hairColor: 0x111214,
    skinColor: 0xba957d,
    hasGlasses: true,
    propType: 'tablet',
    originLabel: 'Alterna entre Porta (Esq.) e Janela (Dir.)',
    mechanicSummary:
      'Silencioso e imprevisível: toda vez que recua, pode trocar entre o Corredor e o Pátio. Detesta barreiras físicas fechadas no último instante.',
    counterplayTip:
      'Use o CFTV ou escute o chiado estático no fone esquerdo/direito. Feche a Porta ou a Persiana do lado dele (ou encare sem o celular) para forçá-lo a mudar de rota.',
    bio: 'Criou o firewall interno da ETEC Sebrae e conhece cada ponto cego das câmeras. Quando ele se aproxima, até o sinal 4G sofre interferência.',
    quotes: {
      stalk: [
        '...pacote interceptado na Sala 04.',
        'Shhh... rastreando MAC address.',
        '...',
      ],
      near: [
        'Você achou mesmo que o proxy deixaria discar?',
        'Silêncio no laboratório.',
        'Troquei de porta lógica. Adivinhe onde estou.',
      ],
      attack: [
        'Conexão encerrada.',
        'Não adianta minimizar a tela.',
        'Olhe para mim. Fim da sessão.',
      ],
      retreat: [
        '...recalculando rota.',
        'Estarei na outra entrada em breve.',
        'Ping perdido... por enquanto.',
      ],
      jumpscare: 'ACESSO NEGADO! Seu RA foi bloqueado permanentemente no NSA!',
    },
  },

  valdir: {
    id: 'valdir',
    defaultName: 'Coord. Valdir',
    subject: 'Gestão & Regimento Escolar',
    role: 'Coordenador do Turno Noturno',
    accentColor: '#ffbe55',
    suitColor: 0x2c2930,
    secondaryColor: 0x9c6b19,
    hairColor: 0x3b3735,
    skinColor: 0xbe9478,
    propType: 'ledger',
    originLabel: 'Rede Wi-Fi & Quadro-Negro (Frente)',
    mechanicSummary:
      'Trava seu celular com um Termo de Advertência se você errar tarefas ou ficar tempo demais na tela, materializando-se diante da lousa.',
    counterplayTip:
      'Assine/feche o pop-up de Advertência no celular imediatamente e jogue o foco da Lanterna (F) no Quadro à frente (W) para dissipar a projeção dele.',
    bio: 'Guardião do Diário de Classe original encadernado em couro. Para Valdir, nenhum aluno jamais se forma sem quitar todas as pendências da secretaria.',
    quotes: {
      stalk: [
        'Atenção, turmas do noturno: inspeção em andamento.',
        'O Diário acusou uma pendência na Sala 04.',
      ],
      near: [
        'Compareça à coordenação imediatamente.',
        'Seu celular acaba de receber uma convocação oficial.',
      ],
      attack: [
        'Assine o livro de ocorrências ou será retido!',
        'Ninguém sai antes do Conselho de Classe!',
      ],
      retreat: [
        'Protocolo arquivado... até o próximo horário.',
        'Estarei de olho no sistema acadêmico.',
      ],
      jumpscare: 'RETIDO PELO CONSELHO! Seu nome foi gravado no Diário de Classe!',
    },
  },

  celia: {
    id: 'celia',
    defaultName: 'Inspetora Célia',
    subject: 'Inspeção & Disciplina',
    role: 'Vigia do Sinal Escolar',
    accentColor: '#ff5c5c',
    suitColor: 0x3f2424,
    secondaryColor: 0xc29b38,
    hairColor: 0x332018,
    skinColor: 0xa6785e,
    isFemale: true,
    propType: 'bell',
    originLabel: 'Guarita / Campainha Escolar (CAM 03)',
    mechanicSummary:
      'Vigia o temporizador do Sinal Escolar na Secretaria. Se o contador zerar, a campainha dispara e ela corre direto para a Sala 04.',
    counterplayTip:
      'Abra o app CFTV no celular → CAM 03 (Secretaria) e segure/clique em "Adiar Sinal" periodicamente antes que a carga chegue a 0%.',
    bio: 'Há trinta anos controla o botão da sirene de troca de aula. Na madrugada, se o sinal tocar fora de hora, ela varre todas as salas em segundos.',
    quotes: {
      stalk: [
        'Falta pouco para o sinal bater...',
        'Corredor limpo, conferindo relógio central.',
      ],
      near: [
        'O temporizador da secretaria está quase no fim!',
        'Quem mexeu no painel do sinal?!',
      ],
      attack: [
        'O SINAL JÁ BATEU! TODO MUNDO PRA FORA!',
        'Achei quem estava escondido na Sala 04!',
      ],
      retreat: [
        'Hmm... o relógio foi adiado outra vez.',
        'Voltando para o posto da secretaria.',
      ],
      jumpscare: 'FIM DO INTERVALO! A sirene tocou e ninguém escapa da inspeção!',
    },
  },
};
