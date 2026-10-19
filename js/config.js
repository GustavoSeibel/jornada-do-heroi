/* Dados puros da Jornada: metas, recompensas, textos e cosmeticos.
   Nenhuma regra executavel mora aqui — apenas a configuracao que o engine le. */
window.Jornada = window.Jornada || {};

(function (Jornada) {
  'use strict';

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (key) {
        deepFreeze(value[key]);
      });
    }
    return value;
  }

  var ACTS = [
    {
      number: 1,
      roman: 'Ato I',
      title: 'O Camponês Desperto',
      dayStart: 1,
      dayEnd: 7,
      intro: 'Você vivia no automático. Agora, a jornada o chama. Prove seu valor com pequenas ações.',
      objective: 'Apenas se acostumar a abrir o app e marcar as tarefas. As metas são extremamente baixas.',
      boss: 'O Monstro da Preguiça'
    },
    {
      number: 2,
      roman: 'Ato II',
      title: 'O Aprendiz da Guilda',
      dayStart: 8,
      dayEnd: 14,
      intro: 'A Guilda notou sua presença. Escolha sua Classe e mantenha a consistência — a constância é a arma dos veteranos.',
      objective: 'Manter a consistência. Aumentar a dificuldade do treino e a quantidade de água.',
      boss: 'O Espectro da Desistência'
    },
    {
      number: 3,
      roman: 'Ato III',
      title: 'O Guerreiro Consolidado',
      dayStart: 15,
      dayEnd: 21,
      intro: 'Suas mãos e seu sono já contam outra história. Registre a prova da sua transformação.',
      objective: 'Os resultados ficam visíveis e os horários de sono se estabilizam.',
      boss: 'O Tirano dos Velhos Hábitos'
    },
    {
      number: 4,
      roman: 'Ato IV',
      title: 'A Lenda Viva',
      dayStart: 22,
      dayEnd: Infinity,
      intro: 'A rotina virou lenda. Agora a jornada não tem mais fim — apenas novos horizontes.',
      objective: 'Sustentar tudo o que foi conquistado.',
      boss: 'O Eco do Antigo Eu'
    }
  ];

  /* Cada missao declara como suas metas mudam por Ato. O engine escolhe a fase
     pela funcao phaseForAct, que recebe o numero do Ato atual. */
  var MISSIONS = [
    {
      id: 'water',
      name: 'A Poção de Vitalidade',
      subtitle: 'Hidratação',
      color: 'water',
      phases: [
        { minAct: 1, goalGlasses: 6, liters: 1.5, xp: 10 },
        { minAct: 2, goalGlasses: 10, liters: 2.5, xp: 15 }
      ]
    },
    {
      id: 'sleep',
      name: 'O Descanso na Taverna',
      subtitle: 'Higiene do sono',
      color: 'sleep',
      unlockStreak: 7,
      unlockItem: 'travesseiro_fenix',
      phases: [
        { minAct: 1, minHours: 6.5, bedEarlierMin: 15, bedToleranceMin: null, xp: 15 },
        { minAct: 2, minHours: 7.5, bedEarlierMin: 15, bedToleranceMin: 30, xp: 20 }
      ]
    },
    {
      id: 'wake',
      name: 'Saudação ao Sol',
      subtitle: 'Despertar precoce',
      color: 'wake',
      phases: [
        { minAct: 1, windowStartOffset: -15, windowEndOffset: 0, xp: 20 },
        { minAct: 2, windowStartOffset: -60, windowEndOffset: -30, xp: 30 }
      ]
    },
    {
      id: 'calisthenics',
      name: 'O Treino da Guarda',
      subtitle: 'Calistenia iniciante',
      color: 'training',
      phases: [
        {
          minAct: 1,
          xp: 25,
          unlockItem: 'espada_madeira',
          exercises: [
            { label: '10 Flexões na Parede', seconds: 0 },
            { label: '15 Agachamentos livres (cadeira como base)', seconds: 0 },
            { label: 'Prancha de 20 segundos', seconds: 20 }
          ]
        },
        {
          minAct: 3,
          xp: 35,
          unlockItem: 'escudo_bronze',
          exercises: [
            { label: '10 Flexões inclinadas (sofá ou bancada)', seconds: 0 },
            { label: '20 Agachamentos livres', seconds: 0 },
            { label: 'Prancha de 40 segundos', seconds: 40 }
          ]
        }
      ]
    },
    {
      id: 'nails',
      name: 'A Vontade de Ferro',
      subtitle: 'Controle de impulsos',
      color: 'will',
      bonusEvery: 7,
      bonusXp: 50,
      unlockItem: 'manoplas_ferro',
      phases: [{ minAct: 1, xp: 10 }]
    }
  ];

  var CLASSES = [
    { id: 'mago_agua', name: 'Mago da Água', mission: 'water', description: 'Canaliza as marés: +10% de XP na hidratação.' },
    { id: 'guerreiro', name: 'Guerreiro', mission: 'calisthenics', description: 'Forja o corpo na repetição: +10% de XP no treino.' },
    { id: 'monge_crepusculo', name: 'Monge do Crepúsculo', mission: 'sleep', description: 'Domina a noite: +10% de XP no descanso.' },
    { id: 'paladino_aurora', name: 'Paladino da Aurora', mission: 'wake', description: 'Nasce com o sol: +10% de XP ao despertar.' },
    { id: 'ermitao_ferro', name: 'Ermitão de Ferro', mission: 'nails', description: 'Vontade inabalável: +10% de XP no controle de impulsos.' }
  ];

  /* Itens conquistados por merito — nunca comprados. */
  var RELICS = [
    { id: 'espada_madeira', name: 'Espada de Madeira', icon: '🗡️', hint: 'Primeiro treino da Guarda concluído.' },
    { id: 'escudo_bronze', name: 'Escudo de Bronze', icon: '🛡️', hint: 'Treino avançado da Guarda concluído.' },
    { id: 'travesseiro_fenix', name: 'Travesseiro de Penas de Fênix', icon: '🪶', hint: '7 noites seguidas de descanso digno.' },
    { id: 'manoplas_ferro', name: 'Manoplas de Ferro', icon: '🧤', hint: '7 dias seguidos sem sofrer dano nas unhas.' },
    { id: 'elmo_disciplina', name: 'Elmo da Disciplina', icon: '⛑️', hint: 'Alcançou o Ato III da jornada.' }
  ];

  /* Cosmeticos da loja: cada um aplica uma classe CSS no body ou troca o avatar. */
  var SHOP = [
    { id: 'tema_sombrio', name: 'Manto da Noite', description: 'Tema escuro profundo.', price: 15, slot: 'theme', value: 'sombrio', icon: '🌑' },
    { id: 'tema_aurora', name: 'Véu da Aurora', description: 'Tema claro e dourado.', price: 20, slot: 'theme', value: 'aurora', icon: '🌅' },
    { id: 'avatar_mago', name: 'Avatar: Mago', description: 'Para quem domina as poções.', price: 10, slot: 'avatar', value: '🧙', icon: '🧙' },
    { id: 'avatar_guerreiro', name: 'Avatar: Guerreiro', description: 'Para quem treina na Guarda.', price: 10, slot: 'avatar', value: '⚔️', icon: '⚔️' },
    { id: 'avatar_dragao', name: 'Avatar: Dragão', description: 'Reservado aos persistentes.', price: 30, slot: 'avatar', value: '🐉', icon: '🐉' },
    { id: 'icones_runicos', name: 'Ícones Rúnicos', description: 'Troca os ícones das missões por runas.', price: 12, slot: 'icons', value: 'runicos', icon: '🔮' }
  ];

  var ICON_SETS = {
    default: { water: '💧', sleep: '🌙', wake: '☀️', calisthenics: '💪', nails: '🤚' },
    runicos: { water: '🜄', sleep: '🜁', wake: '🜂', calisthenics: '🜃', nails: '⚖️' }
  };

  var GUILD_MASTER = {
    nailsFailure: 'Até os melhores guerreiros tropeçam. Afie sua espada e tente amanhã!',
    heartLost: 'O Mestre da Guilda anota: você perdeu meio coração. Sem drama — amanhã se recupera.',
    heartsEmpty: 'Seus corações acabaram esta semana, mas ninguém é expulso da Guilda. Respire e recomece na segunda.',
    perfectDay: 'Dia perfeito! A Guilda abre os cofres e te entrega ouro.',
    bossDefeated: 'Chefão derrotado! A semana foi sua, aventureiro.',
    bossEscaped: 'O chefão da semana escapou desta vez. Nenhuma punição — só mais uma chance na próxima.',
    missionDone: [
      'Missão cumprida, aventureiro.',
      'A Guilda registra seu feito.',
      'Mais um passo rumo à lenda.',
      'O Mestre da Guilda assente em aprovação.'
    ],
    act3Photo: 'Ato III: tire uma foto das suas mãos hoje e compare com a do primeiro dia. A prova da sua disciplina é visível.'
  };

  var NOTIFICATIONS = [
    { id: 'manha', hour: 7, minute: 0, title: 'A Jornada do Herói', body: 'O sol nasceu, aventureiro! Levante e reivindique seus XP de despertar e sua primeira Poção de Água.' },
    { id: 'tarde', hour: 15, minute: 0, title: 'A Jornada do Herói', body: 'Como está o treino da Guarda hoje? Lembre-se, 5 minutos separam você da glória!' },
    { id: 'noite', hour: 21, minute: 30, title: 'A Jornada do Herói', body: 'A taverna vai fechar. Largue as telas, proteja suas unhas e prepare-se para o descanso.' }
  ];

  var Config = {
    STORAGE_KEY: 'jornada_v1',
    SCHEMA_VERSION: 1,
    XP_PER_LEVEL: 100,
    GLASS_ML: 250,
    MAX_HEARTS: 3,
    HEART_PENALTY: 0.5,
    PERFECT_DAY_GOLD: 5,
    CLASS_MULTIPLIER: 1.1,
    CLASS_UNLOCK_ACT: 2,
    BOSS_XP_THRESHOLD: 100,
    HISTORY_LIMIT: 120,
    /* Combos: dias seguidos -> multiplicador de XP. Avaliado do maior para o menor. */
    STREAK_TIERS: [
      { minDays: 14, multiplier: 2 },
      { minDays: 7, multiplier: 1.5 },
      { minDays: 3, multiplier: 1.2 },
      { minDays: 0, multiplier: 1 }
    ],
    DEFAULT_BASELINE: { wakeTime: '07:00', bedTime: '23:30' },
    ACTS: ACTS,
    MISSIONS: MISSIONS,
    CLASSES: CLASSES,
    RELICS: RELICS,
    SHOP: SHOP,
    ICON_SETS: ICON_SETS,
    GUILD_MASTER: GUILD_MASTER,
    NOTIFICATIONS: NOTIFICATIONS
  };

  Config.missionById = function (id) {
    for (var i = 0; i < MISSIONS.length; i += 1) {
      if (MISSIONS[i].id === id) {
        return MISSIONS[i];
      }
    }
    return null;
  };

  Config.relicById = function (id) {
    for (var i = 0; i < RELICS.length; i += 1) {
      if (RELICS[i].id === id) {
        return RELICS[i];
      }
    }
    return null;
  };

  Config.shopItemById = function (id) {
    for (var i = 0; i < SHOP.length; i += 1) {
      if (SHOP[i].id === id) {
        return SHOP[i];
      }
    }
    return null;
  };

  Config.classById = function (id) {
    for (var i = 0; i < CLASSES.length; i += 1) {
      if (CLASSES[i].id === id) {
        return CLASSES[i];
      }
    }
    return null;
  };

  Jornada.Config = deepFreeze(Config);
})(window.Jornada);
