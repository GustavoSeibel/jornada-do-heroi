/* Regras do jogo. Este modulo nao toca no DOM nem no localStorage: recebe o
   estado, aplica as regras e devolve uma lista de eventos para a UI narrar. */
window.Jornada = window.Jornada || {};

(function (Jornada) {
  'use strict';

  var Config = Jornada.Config;
  var Clock = Jornada.Clock;
  var Storage = Jornada.Storage;
  var MISSION_IDS = ['water', 'sleep', 'wake', 'calisthenics', 'nails', 'sweets'];

  function event(type, payload) {
    var result = { type: type };
    Object.keys(payload || {}).forEach(function (key) {
      result[key] = payload[key];
    });
    return result;
  }

  /* Minutos "da noite": 23:45 e 00:30 precisam ser comparaveis entre si, entao
     qualquer horario antes do meio-dia e' tratado como pertencente ao dia seguinte. */
  function nightMinutes(minutes) {
    return minutes < 12 * 60 ? minutes + 1440 : minutes;
  }

  /* ------------------------------------------------------- Leitura do estado */

  function dayNumber(state) {
    return Math.max(1, Clock.diffDays(state.startDate, Clock.todayISO()) + 1);
  }

  function actForDay(day) {
    for (var i = 0; i < Config.ACTS.length; i += 1) {
      if (day >= Config.ACTS[i].dayStart && day <= Config.ACTS[i].dayEnd) {
        return Config.ACTS[i];
      }
    }
    return Config.ACTS[Config.ACTS.length - 1];
  }

  function actFor(state) {
    return actForDay(dayNumber(state));
  }

  /* Escolhe a fase da missao valida para o Ato atual (a de maior minAct que couber). */
  function phaseFor(state, missionId) {
    var mission = Config.missionById(missionId);
    var act = actFor(state).number;
    var chosen = mission.phases[0];
    for (var i = 0; i < mission.phases.length; i += 1) {
      if (act >= mission.phases[i].minAct) {
        chosen = mission.phases[i];
      }
    }
    return chosen;
  }

  function streakMultiplier(comboDays) {
    for (var i = 0; i < Config.STREAK_TIERS.length; i += 1) {
      if (comboDays >= Config.STREAK_TIERS[i].minDays) {
        return Config.STREAK_TIERS[i].multiplier;
      }
    }
    return 1;
  }

  function classMultiplier(state, missionId) {
    var heroClass = Config.classById(state.heroClass);
    return heroClass && heroClass.mission === missionId ? Config.CLASS_MULTIPLIER : 1;
  }

  /* O combo inclui o dia de hoje: 3 dias seguidos ja valem 1.2x. */
  function comboLength(state, missionId) {
    return state.streaks[missionId] + 1;
  }

  function xpPreview(state, missionId) {
    var phase = phaseFor(state, missionId);
    var combo = streakMultiplier(comboLength(state, missionId));
    var hero = classMultiplier(state, missionId);
    return {
      base: phase.xp,
      comboMultiplier: combo,
      classMultiplier: hero,
      total: Math.round(phase.xp * combo * hero)
    };
  }

  function bedTarget(state) {
    var phase = phaseFor(state, 'sleep');
    var baseline = Clock.parseTime(state.baseline.bedTime);
    return nightMinutes(baseline) - phase.bedEarlierMin;
  }

  function bedTimeOk(state) {
    var day = state.today;
    if (!day.bedTimeLogged) {
      return false;
    }
    var phase = phaseFor(state, 'sleep');
    var logged = nightMinutes(Clock.parseTime(day.bedTimeLogged));
    var target = bedTarget(state);
    if (phase.bedToleranceMin === null) {
      return logged <= target;
    }
    return Math.abs(logged - target) <= phase.bedToleranceMin;
  }

  function wakeWindow(state) {
    var phase = phaseFor(state, 'wake');
    var baseline = Clock.parseTime(state.baseline.wakeTime);
    return {
      startMin: baseline + phase.windowStartOffset,
      endMin: baseline + phase.windowEndOffset
    };
  }

  function wakeWindowOpen(state) {
    var window_ = wakeWindow(state);
    var nowMin = Clock.minutesOfDay(Clock.now());
    return nowMin >= window_.startMin && nowMin <= window_.endMin;
  }

  function isComplete(state, missionId) {
    var day = state.today;
    var phase = phaseFor(state, missionId);
    switch (missionId) {
      case 'water':
        return day.water_glasses >= phase.goalGlasses;
      case 'sleep':
        return day.bedCheckin && day.sleep_hours >= phase.minHours && bedTimeOk(state);
      case 'wake':
        return day.wake_time_logged !== null;
      case 'calisthenics':
        return day.calisthenicsSteps.every(function (done) {
          return done;
        });
      case 'nails':
        return day.nails_bitten === false;
      case 'sweets':
        return day.sweetsClosed && day.sweets_count <= phase.maxSweets;
      default:
        return false;
    }
  }

  function sweetsWithinQuota(state) {
    return state.today.sweets_count <= phaseFor(state, 'sweets').maxSweets;
  }

  function progressOf(state, missionId) {
    var day = state.today;
    var phase = phaseFor(state, missionId);
    switch (missionId) {
      case 'water':
        return Math.min(1, day.water_glasses / phase.goalGlasses);
      case 'sleep':
        if (isComplete(state, missionId)) {
          return 1;
        }
        return (day.bedCheckin ? 0.5 : 0) + (day.sleep_hours > 0 ? 0.5 : 0);
      case 'wake':
        return day.wake_time_logged !== null ? 1 : 0;
      case 'calisthenics':
        return day.calisthenicsSteps.filter(Boolean).length / day.calisthenicsSteps.length;
      case 'nails':
        return day.nails_bitten === false ? 1 : 0;
      /* Meia barra enquanto o dia corre dentro da cota; cheia ao encerrar; vazia se estourou. */
      case 'sweets':
        if (isComplete(state, missionId)) {
          return 1;
        }
        return sweetsWithinQuota(state) ? 0.5 : 0;
      default:
        return 0;
    }
  }

  function levelForXp(xp) {
    return Math.floor(xp / Config.XP_PER_LEVEL) + 1;
  }

  function xpIntoLevel(xp) {
    return xp % Config.XP_PER_LEVEL;
  }

  /* --------------------------------------------------------- Mutacoes basicas */

  function unlockRelic(state, relicId, events) {
    if (!relicId || state.unlocked.indexOf(relicId) !== -1) {
      return;
    }
    var relic = Config.relicById(relicId);
    if (!relic) {
      return;
    }
    state.unlocked.push(relicId);
    events.push(event('relic', { id: relic.id, name: relic.name, icon: relic.icon }));
  }

  function addXp(state, amount, events) {
    if (amount <= 0) {
      return;
    }
    var levelBefore = state.current_level;
    state.current_xp += amount;
    state.weekXp += amount;
    state.current_level = levelForXp(state.current_xp);
    if (state.current_level > levelBefore) {
      events.push(event('level', { level: state.current_level }));
    }
    evaluateBoss(state, events);
  }

  /* O chefao e' resolvido no domingo da semana corrente; vencer e' automatico
     ao acumular o XP semanal minimo. Perder nao gera punicao alguma. */
  function bossEntryFor(state, weekStart) {
    for (var i = 0; i < state.bosses.length; i += 1) {
      if (state.bosses[i].weekStart === weekStart) {
        return state.bosses[i];
      }
    }
    return null;
  }

  function bossNameFor(state) {
    return actFor(state).boss;
  }

  function evaluateBoss(state, events) {
    var today = Clock.todayISO();
    if (Clock.weekdayOf(today) !== 0 || Clock.mondayOf(today) !== state.weekStart) {
      return;
    }
    if (state.weekXp < Config.BOSS_XP_THRESHOLD || bossEntryFor(state, state.weekStart)) {
      return;
    }
    var name = bossNameFor(state);
    state.bosses.push({ weekStart: state.weekStart, name: name, defeated: true, xp: state.weekXp });
    events.push(event('boss', { name: name, defeated: true }));
    events.push(event('message', { text: Config.GUILD_MASTER.bossDefeated, tone: 'success' }));
    events.push(event('confetti', { intensity: 'epic' }));
  }

  function randomPraise() {
    var list = Config.GUILD_MASTER.missionDone;
    return list[Math.floor(Math.random() * list.length)];
  }

  /* Ponto unico onde XP de missao e' concedido: evita pagar duas vezes no mesmo dia. */
  function settleMission(state, missionId, events) {
    var day = state.today;
    if (day.claimed[missionId] || !isComplete(state, missionId)) {
      return;
    }
    var preview = xpPreview(state, missionId);
    day.claimed[missionId] = true;
    state.streaks[missionId] += 1;
    state.bestStreaks[missionId] = Math.max(state.bestStreaks[missionId], state.streaks[missionId]);

    events.push(event('mission', { missionId: missionId, name: Config.missionById(missionId).name }));
    addXp(state, preview.total, events);
    events.push(event('xp', {
      amount: preview.total,
      missionId: missionId,
      comboMultiplier: preview.comboMultiplier,
      classMultiplier: preview.classMultiplier
    }));
    events.push(event('message', { text: randomPraise(), tone: 'success' }));
    events.push(event('confetti', { intensity: 'normal' }));

    var mission = Config.missionById(missionId);
    var phase = phaseFor(state, missionId);
    unlockRelic(state, phase.unlockItem, events);
    if (mission.unlockStreak && state.streaks[missionId] >= mission.unlockStreak) {
      unlockRelic(state, mission.unlockItem, events);
    }
    if (mission.bonusEvery && state.streaks[missionId] % mission.bonusEvery === 0) {
      unlockRelic(state, mission.unlockItem, events);
      addXp(state, mission.bonusXp, events);
      events.push(event('xp', { amount: mission.bonusXp, missionId: missionId, bonus: true }));
      events.push(event('confetti', { intensity: 'epic' }));
    }

    settlePerfectDay(state, events);
  }

  function settlePerfectDay(state, events) {
    var day = state.today;
    if (day.goldAwarded) {
      return;
    }
    var perfect = MISSION_IDS.every(function (id) {
      return day.claimed[id];
    });
    if (!perfect) {
      return;
    }
    day.goldAwarded = true;
    state.gold += Config.PERFECT_DAY_GOLD;
    events.push(event('gold', { amount: Config.PERFECT_DAY_GOLD }));
    events.push(event('message', { text: Config.GUILD_MASTER.perfectDay, tone: 'success' }));
    events.push(event('confetti', { intensity: 'epic' }));
  }

  /* ----------------------------------------------------------- Virada de dia */

  function closeDay(state, events) {
    var day = state.today;
    /* Metas minimas nao cumpridas custam meio coracao — uma vez por dia. */
    if (!day.claimed.water || !day.claimed.sleep) {
      state.hearts = Math.max(0, state.hearts - Config.HEART_PENALTY);
      events.push(event('heart', { remaining: state.hearts }));
    }
    MISSION_IDS.forEach(function (id) {
      if (!day.claimed[id]) {
        state.streaks[id] = 0;
      }
    });
    state.history.push(day);
    if (state.history.length > Config.HISTORY_LIMIT) {
      state.history = state.history.slice(-Config.HISTORY_LIMIT);
    }
  }

  function resolvePendingBoss(state, events) {
    if (bossEntryFor(state, state.weekStart)) {
      return;
    }
    var defeated = state.weekXp >= Config.BOSS_XP_THRESHOLD;
    var name = bossNameFor(state);
    state.bosses.push({ weekStart: state.weekStart, name: name, defeated: defeated, xp: state.weekXp });
    events.push(event('boss', { name: name, defeated: defeated }));
    if (!defeated) {
      events.push(event('message', { text: Config.GUILD_MASTER.bossEscaped, tone: 'info' }));
    }
  }

  function rollover(state) {
    var events = [];
    var today = Clock.todayISO();
    var guard = 0;

    while (state.today.date !== today && guard < 400) {
      guard += 1;
      closeDay(state, events);

      var nextDate = Clock.addDaysISO(state.today.date, 1);
      var nextWeekStart = Clock.mondayOf(nextDate);
      if (nextWeekStart !== state.weekStart) {
        resolvePendingBoss(state, events);
        state.weekStart = nextWeekStart;
        state.weekXp = 0;
        state.hearts = Config.MAX_HEARTS;
      }
      state.today = Storage.emptyDay(nextDate);
    }

    if (guard >= 400) {
      state.today = Storage.emptyDay(today);
      state.weekStart = Clock.mondayOf(today);
    }

    if (state.hearts <= 0) {
      events.push(event('message', { text: Config.GUILD_MASTER.heartsEmpty, tone: 'warn' }));
    }
    return events;
  }

  /* Recompensa de Ato e marcos que independem de acao do usuario. */
  function syncMilestones(state, events) {
    if (dayNumber(state) >= 15) {
      unlockRelic(state, 'elmo_disciplina', events);
    }
    evaluateBoss(state, events);
  }

  function hydrate(state) {
    var events = rollover(state);
    syncMilestones(state, events);
    return events;
  }

  /* ------------------------------------------------------------- Acoes da UI */

  function addWaterGlass(state) {
    var events = [];
    var phase = phaseFor(state, 'water');
    if (state.today.water_glasses >= phase.goalGlasses + 8) {
      return events;
    }
    state.today.water_glasses += 1;
    settleMission(state, 'water', events);
    return events;
  }

  function removeWaterGlass(state) {
    if (state.today.claimed.water || state.today.water_glasses === 0) {
      return [];
    }
    state.today.water_glasses -= 1;
    return [];
  }

  function checkInBed(state) {
    var events = [];
    if (state.today.bedCheckin) {
      return events;
    }
    state.today.bedCheckin = true;
    state.today.bedTimeLogged = Clock.formatMinutes(Clock.minutesOfDay(Clock.now()));
    settleMission(state, 'sleep', events);
    return events;
  }

  function logSleep(state, hours) {
    var events = [];
    var value = Number(hours);
    if (!Number.isFinite(value) || value <= 0 || value > 24) {
      return events;
    }
    state.today.sleep_hours = Math.round(value * 100) / 100;
    settleMission(state, 'sleep', events);
    return events;
  }

  function logWake(state) {
    var events = [];
    if (state.today.wake_time_logged !== null || !wakeWindowOpen(state)) {
      return events;
    }
    state.today.wake_time_logged = Clock.formatMinutes(Clock.minutesOfDay(Clock.now()));
    settleMission(state, 'wake', events);
    return events;
  }

  function toggleExercise(state, index) {
    var events = [];
    var steps = state.today.calisthenicsSteps;
    if (index < 0 || index >= steps.length || state.today.claimed.calisthenics) {
      return events;
    }
    steps[index] = !steps[index];
    state.today.calisthenics_done = steps.every(Boolean);
    settleMission(state, 'calisthenics', events);
    return events;
  }

  function answerNails(state, survived) {
    var events = [];
    if (state.today.nails_bitten !== null) {
      return events;
    }
    state.today.nails_bitten = !survived;
    if (survived) {
      settleMission(state, 'nails', events);
    } else {
      state.streaks.nails = 0;
      events.push(event('message', { text: Config.GUILD_MASTER.nailsFailure, tone: 'warn' }));
    }
    return events;
  }

  function addSweet(state) {
    var day = state.today;
    if (day.sweetsClosed || day.sweets_count >= 50) {
      return [];
    }
    day.sweets_count += 1;
    return [];
  }

  function removeSweet(state) {
    var day = state.today;
    if (day.sweetsClosed || day.sweets_count === 0) {
      return [];
    }
    day.sweets_count -= 1;
    return [];
  }

  /* Encerrar o dia e' o que vale XP: registrar doces sozinho nao paga nada. */
  function closeSweetsDay(state) {
    var events = [];
    if (state.today.sweetsClosed) {
      return events;
    }
    state.today.sweetsClosed = true;
    if (sweetsWithinQuota(state)) {
      settleMission(state, 'sweets', events);
    } else {
      state.streaks.sweets = 0;
      events.push(event('message', { text: Config.GUILD_MASTER.sweetsFailure, tone: 'warn' }));
    }
    return events;
  }

  function canChooseClass(state) {
    return actFor(state).number >= Config.CLASS_UNLOCK_ACT;
  }

  function chooseClass(state, classId) {
    var events = [];
    var heroClass = Config.classById(classId);
    if (!heroClass || state.heroClass || !canChooseClass(state)) {
      return events;
    }
    state.heroClass = heroClass.id;
    events.push(event('message', { text: 'Classe escolhida: ' + heroClass.name + '.', tone: 'success' }));
    events.push(event('confetti', { intensity: 'epic' }));
    return events;
  }

  function buyItem(state, itemId) {
    var events = [];
    var item = Config.shopItemById(itemId);
    if (!item || state.purchased.indexOf(itemId) !== -1) {
      return events;
    }
    if (state.gold < item.price) {
      events.push(event('message', { text: 'Ouro insuficiente, aventureiro.', tone: 'warn' }));
      return events;
    }
    state.gold -= item.price;
    state.purchased.push(itemId);
    state.equipped[item.slot] = item.value;
    events.push(event('message', { text: item.name + ' adquirido e equipado.', tone: 'success' }));
    events.push(event('confetti', { intensity: 'normal' }));
    return events;
  }

  function equipItem(state, itemId) {
    var events = [];
    var item = Config.shopItemById(itemId);
    if (!item || state.purchased.indexOf(itemId) === -1) {
      return events;
    }
    state.equipped[item.slot] = state.equipped[item.slot] === item.value
      ? (item.slot === 'avatar' ? state.equipped.avatar : 'default')
      : item.value;
    return events;
  }

  function startJourney(state, options) {
    var wakeTime = Clock.parseTime(options.wakeTime) === null ? Config.DEFAULT_BASELINE.wakeTime : options.wakeTime;
    var bedTime = Clock.parseTime(options.bedTime) === null ? Config.DEFAULT_BASELINE.bedTime : options.bedTime;
    state.heroName = String(options.heroName || '').trim().slice(0, 24) || 'Aventureiro';
    state.baseline = { wakeTime: wakeTime, bedTime: bedTime };
    state.startDate = Clock.todayISO();
    state.weekStart = Clock.mondayOf(state.startDate);
    state.today = Storage.emptyDay(state.startDate);
    state.onboarded = true;
    return [event('message', { text: actForDay(1).intro, tone: 'info' })];
  }

  function advanceDebugDay(state) {
    state.debugDayOffset += 1;
    Clock.setOffsetDays(state.debugDayOffset);
    var events = rollover(state);
    syncMilestones(state, events);
    return events;
  }

  Jornada.Engine = {
    MISSION_IDS: MISSION_IDS,
    dayNumber: dayNumber,
    actFor: actFor,
    actForDay: actForDay,
    phaseFor: phaseFor,
    streakMultiplier: streakMultiplier,
    classMultiplier: classMultiplier,
    comboLength: comboLength,
    xpPreview: xpPreview,
    bedTarget: bedTarget,
    bedTimeOk: bedTimeOk,
    wakeWindow: wakeWindow,
    wakeWindowOpen: wakeWindowOpen,
    isComplete: isComplete,
    sweetsWithinQuota: sweetsWithinQuota,
    progressOf: progressOf,
    levelForXp: levelForXp,
    xpIntoLevel: xpIntoLevel,
    canChooseClass: canChooseClass,
    hydrate: hydrate,
    rollover: rollover,
    addWaterGlass: addWaterGlass,
    removeWaterGlass: removeWaterGlass,
    checkInBed: checkInBed,
    logSleep: logSleep,
    logWake: logWake,
    toggleExercise: toggleExercise,
    answerNails: answerNails,
    addSweet: addSweet,
    removeSweet: removeSweet,
    closeSweetsDay: closeSweetsDay,
    chooseClass: chooseClass,
    buyItem: buyItem,
    equipItem: equipItem,
    startJourney: startJourney,
    advanceDebugDay: advanceDebugDay
  };
})(window.Jornada);
