/* Relogio e persistencia. O Clock existe para que o botao de debug consiga
   avancar dias sem mexer no relogio do sistema — todo o resto do app pergunta
   as horas para ele, nunca para o Date diretamente. */
window.Jornada = window.Jornada || {};

(function (Jornada) {
  'use strict';

  var Config = Jornada.Config;
  var DAY_MS = 24 * 60 * 60 * 1000;

  /* ---------------------------------------------------------------- Clock */

  var offsetDays = 0;

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  var Clock = {
    setOffsetDays: function (days) {
      offsetDays = Number.isFinite(days) ? Math.trunc(days) : 0;
    },
    getOffsetDays: function () {
      return offsetDays;
    },
    now: function () {
      return new Date(Date.now() + offsetDays * DAY_MS);
    },
    isoOf: function (date) {
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    },
    todayISO: function () {
      return Clock.isoOf(Clock.now());
    },
    fromISO: function (iso) {
      var parts = String(iso).split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    },
    addDaysISO: function (iso, days) {
      var date = Clock.fromISO(iso);
      date.setDate(date.getDate() + days);
      return Clock.isoOf(date);
    },
    diffDays: function (fromISO, toISO) {
      var a = Clock.fromISO(fromISO);
      var b = Clock.fromISO(toISO);
      return Math.round((b.getTime() - a.getTime()) / DAY_MS);
    },
    /* 0 = domingo, 1 = segunda ... */
    weekdayOf: function (iso) {
      return Clock.fromISO(iso).getDay();
    },
    mondayOf: function (iso) {
      var weekday = Clock.weekdayOf(iso);
      var back = weekday === 0 ? 6 : weekday - 1;
      return Clock.addDaysISO(iso, -back);
    },
    minutesOfDay: function (date) {
      return date.getHours() * 60 + date.getMinutes();
    },
    /* '07:30' -> 450. Retorna null em qualquer entrada invalida. */
    parseTime: function (value) {
      var match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
      if (!match) {
        return null;
      }
      var hours = Number(match[1]);
      var minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) {
        return null;
      }
      return hours * 60 + minutes;
    },
    formatMinutes: function (minutes) {
      var normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
      return pad(Math.floor(normalized / 60)) + ':' + pad(normalized % 60);
    },
    formatISO: function (iso) {
      var parts = String(iso).split('-');
      return parts[2] + '/' + parts[1];
    }
  };

  Jornada.Clock = Clock;

  /* -------------------------------------------------------------- Storage */

  function clamp(value, min, max, fallback) {
    var num = Number(value);
    if (!Number.isFinite(num)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, num));
  }

  function bool(value) {
    return value === true;
  }

  function emptyDay(dateISO) {
    return {
      date: dateISO,
      water_glasses: 0,
      sleep_hours: 0,
      bedCheckin: false,
      bedTimeLogged: null,
      wake_time_logged: null,
      calisthenics_done: false,
      calisthenicsSteps: [false, false, false],
      nails_bitten: null,
      goldAwarded: false,
      claimed: { water: false, sleep: false, wake: false, calisthenics: false, nails: false }
    };
  }

  function zeroStreaks() {
    return { water: 0, sleep: 0, wake: 0, calisthenics: 0, nails: 0 };
  }

  function defaultState() {
    var today = Clock.todayISO();
    return {
      schemaVersion: Config.SCHEMA_VERSION,
      onboarded: false,
      heroName: '',
      startDate: today,
      baseline: {
        wakeTime: Config.DEFAULT_BASELINE.wakeTime,
        bedTime: Config.DEFAULT_BASELINE.bedTime
      },
      current_xp: 0,
      current_level: 1,
      gold: 0,
      hearts: Config.MAX_HEARTS,
      heroClass: null,
      weekXp: 0,
      weekStart: Clock.mondayOf(today),
      today: emptyDay(today),
      streaks: zeroStreaks(),
      bestStreaks: zeroStreaks(),
      unlocked: [],
      purchased: [],
      equipped: { theme: 'default', avatar: '🧑‍🌾', icons: 'default' },
      bosses: [],
      history: [],
      notificationsEnabled: false,
      debugDayOffset: 0
    };
  }

  /* Tudo que volta do localStorage e' tratado como hostil: cada campo passa por
     validacao de tipo/faixa e cai no padrao quando nao bate. */
  function sanitizeDay(raw, fallbackDateISO) {
    var base = emptyDay(fallbackDateISO);
    if (!raw || typeof raw !== 'object') {
      return base;
    }
    var steps = Array.isArray(raw.calisthenicsSteps) ? raw.calisthenicsSteps : [];
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : fallbackDateISO,
      water_glasses: clamp(raw.water_glasses, 0, 40, 0),
      sleep_hours: clamp(raw.sleep_hours, 0, 24, 0),
      bedCheckin: bool(raw.bedCheckin),
      bedTimeLogged: Clock.parseTime(raw.bedTimeLogged) === null ? null : raw.bedTimeLogged,
      wake_time_logged: Clock.parseTime(raw.wake_time_logged) === null ? null : raw.wake_time_logged,
      calisthenics_done: bool(raw.calisthenics_done),
      calisthenicsSteps: [bool(steps[0]), bool(steps[1]), bool(steps[2])],
      nails_bitten: raw.nails_bitten === true || raw.nails_bitten === false ? raw.nails_bitten : null,
      goldAwarded: bool(raw.goldAwarded),
      claimed: {
        water: bool(raw.claimed && raw.claimed.water),
        sleep: bool(raw.claimed && raw.claimed.sleep),
        wake: bool(raw.claimed && raw.claimed.wake),
        calisthenics: bool(raw.claimed && raw.claimed.calisthenics),
        nails: bool(raw.claimed && raw.claimed.nails)
      }
    };
  }

  function sanitizeStreaks(raw) {
    var result = zeroStreaks();
    if (!raw || typeof raw !== 'object') {
      return result;
    }
    Object.keys(result).forEach(function (key) {
      result[key] = Math.trunc(clamp(raw[key], 0, 9999, 0));
    });
    return result;
  }

  function sanitizeIdList(raw, isKnown) {
    if (!Array.isArray(raw)) {
      return [];
    }
    var seen = {};
    return raw.filter(function (id) {
      if (typeof id !== 'string' || seen[id] || !isKnown(id)) {
        return false;
      }
      seen[id] = true;
      return true;
    });
  }

  function sanitize(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== Config.SCHEMA_VERSION) {
      return base;
    }

    var startDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) ? raw.startDate : base.startDate;
    var purchased = sanitizeIdList(raw.purchased, function (id) {
      return Boolean(Config.shopItemById(id));
    });
    var equippedTheme = typeof raw.equipped === 'object' && raw.equipped ? raw.equipped.theme : null;
    var equippedIcons = typeof raw.equipped === 'object' && raw.equipped ? raw.equipped.icons : null;
    var equippedAvatar = typeof raw.equipped === 'object' && raw.equipped ? raw.equipped.avatar : null;

    function ownsSlotValue(slot, value) {
      return purchased.some(function (id) {
        var item = Config.shopItemById(id);
        return item && item.slot === slot && item.value === value;
      });
    }

    return {
      schemaVersion: Config.SCHEMA_VERSION,
      onboarded: bool(raw.onboarded),
      /* heroName nunca vai para innerHTML; ainda assim limitamos o tamanho. */
      heroName: typeof raw.heroName === 'string' ? raw.heroName.slice(0, 24) : '',
      startDate: startDate,
      baseline: {
        wakeTime: Clock.parseTime(raw.baseline && raw.baseline.wakeTime) === null
          ? base.baseline.wakeTime
          : raw.baseline.wakeTime,
        bedTime: Clock.parseTime(raw.baseline && raw.baseline.bedTime) === null
          ? base.baseline.bedTime
          : raw.baseline.bedTime
      },
      current_xp: Math.trunc(clamp(raw.current_xp, 0, 9999999, 0)),
      current_level: Math.trunc(clamp(raw.current_level, 1, 99999, 1)),
      gold: Math.trunc(clamp(raw.gold, 0, 999999, 0)),
      hearts: clamp(raw.hearts, 0, Config.MAX_HEARTS, Config.MAX_HEARTS),
      heroClass: Config.classById(raw.heroClass) ? raw.heroClass : null,
      weekXp: Math.trunc(clamp(raw.weekXp, 0, 9999999, 0)),
      weekStart: /^\d{4}-\d{2}-\d{2}$/.test(raw.weekStart) ? raw.weekStart : Clock.mondayOf(startDate),
      today: sanitizeDay(raw.today, Clock.todayISO()),
      streaks: sanitizeStreaks(raw.streaks),
      bestStreaks: sanitizeStreaks(raw.bestStreaks),
      unlocked: sanitizeIdList(raw.unlocked, function (id) {
        return Boolean(Config.relicById(id));
      }),
      purchased: purchased,
      equipped: {
        theme: equippedTheme === 'default' || ownsSlotValue('theme', equippedTheme) ? equippedTheme : 'default',
        avatar: typeof equippedAvatar === 'string' && equippedAvatar.length <= 8 ? equippedAvatar : base.equipped.avatar,
        icons: equippedIcons === 'default' || ownsSlotValue('icons', equippedIcons) ? equippedIcons : 'default'
      },
      bosses: Array.isArray(raw.bosses)
        ? raw.bosses
            .filter(function (entry) {
              return entry && typeof entry === 'object' && typeof entry.weekStart === 'string';
            })
            .slice(-Config.HISTORY_LIMIT)
            .map(function (entry) {
              return {
                weekStart: entry.weekStart,
                name: typeof entry.name === 'string' ? entry.name.slice(0, 60) : 'Chefão',
                defeated: bool(entry.defeated),
                xp: Math.trunc(clamp(entry.xp, 0, 9999999, 0))
              };
            })
        : [],
      history: Array.isArray(raw.history)
        ? raw.history.slice(-Config.HISTORY_LIMIT).map(function (entry) {
            return sanitizeDay(entry, Clock.todayISO());
          })
        : [],
      notificationsEnabled: bool(raw.notificationsEnabled),
      debugDayOffset: Math.trunc(clamp(raw.debugDayOffset, 0, 400, 0))
    };
  }

  var Storage = {
    emptyDay: emptyDay,
    zeroStreaks: zeroStreaks,
    defaultState: defaultState,
    sanitize: sanitize,

    load: function () {
      var raw = null;
      try {
        raw = JSON.parse(window.localStorage.getItem(Config.STORAGE_KEY));
      } catch (error) {
        raw = null;
      }
      /* O offset precisa valer antes da sanitizacao, que usa Clock.todayISO(). */
      Clock.setOffsetDays(raw && Number.isFinite(Number(raw.debugDayOffset)) ? Number(raw.debugDayOffset) : 0);
      var state = sanitize(raw);
      Clock.setOffsetDays(state.debugDayOffset);
      return state;
    },

    save: function (state) {
      try {
        window.localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (error) {
        return false;
      }
    },

    clear: function () {
      try {
        window.localStorage.removeItem(Config.STORAGE_KEY);
      } catch (error) {
        /* Navegador sem storage: a sessao atual continua funcionando em memoria. */
      }
      Clock.setOffsetDays(0);
    }
  };

  Jornada.Storage = Storage;
})(window.Jornada);
