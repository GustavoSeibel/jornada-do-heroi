/* Bootstrap: dono do estado, faz a ponte entre UI e Engine e persiste a cada acao. */
window.Jornada = window.Jornada || {};

(function (Jornada) {
  'use strict';

  var Clock = Jornada.Clock;
  var Storage = Jornada.Storage;
  var Engine = Jornada.Engine;
  var UI = Jornada.UI;
  var Notifications = Jornada.Notifications;

  var TICK_MS = 20000;
  var state = Storage.load();
  var lastWakeOpen = null;

  function persist() {
    if (!Storage.save(state)) {
      UI.toast('Não consegui gravar o progresso neste navegador.', 'warn');
    }
  }

  /* Toda acao segue o mesmo caminho: engine -> persistencia -> render -> narracao. */
  function apply(events) {
    persist();
    UI.render(state);
    UI.playEvents(events);
  }

  function enableNotifications() {
    Notifications.request().then(function (allowed) {
      state.notificationsEnabled = allowed;
      persist();
      if (allowed) {
        Notifications.schedule();
      } else {
        UI.toast('Sem permissão para notificações. A jornada segue sem os chamados.', 'warn');
      }
    });
  }

  var handlers = {
    getState: function () {
      return state;
    },

    start: function (data) {
      var events = Engine.startJourney(state, data);
      state.notificationsEnabled = Boolean(data.notifications);
      persist();
      UI.showApp(state);
      UI.playEvents(events);
      lastWakeOpen = Engine.wakeWindowOpen(state);
      if (state.notificationsEnabled) {
        enableNotifications();
      }
    },

    addWater: function () {
      apply(Engine.addWaterGlass(state));
    },

    removeWater: function () {
      apply(Engine.removeWaterGlass(state));
    },

    bedCheckin: function () {
      apply(Engine.checkInBed(state));
    },

    logSleep: function (hours) {
      var events = Engine.logSleep(state, hours);
      if (events.length === 0 && !Engine.isComplete(state, 'sleep')) {
        UI.toast('Informe quantas horas você dormiu (entre 0 e 24).', 'warn');
      }
      apply(events);
    },

    logWake: function () {
      apply(Engine.logWake(state));
    },

    toggleExercise: function (index) {
      apply(Engine.toggleExercise(state, index));
    },

    answerNails: function (survived) {
      apply(Engine.answerNails(state, survived));
    },

    chooseClass: function (classId) {
      apply(Engine.chooseClass(state, classId));
    },

    buyItem: function (itemId) {
      apply(Engine.buyItem(state, itemId));
    },

    equipItem: function (itemId) {
      apply(Engine.equipItem(state, itemId));
    },

    advanceDay: function () {
      var events = Engine.advanceDebugDay(state);
      lastWakeOpen = Engine.wakeWindowOpen(state);
      apply(events);
    },

    reset: function () {
      Notifications.stop();
      Storage.clear();
      state = Storage.defaultState();
      persist();
      lastWakeOpen = null;
      UI.showOnboarding();
    }
  };

  /* Mantem o app honesto com a passagem do tempo: vira o dia a meia-noite e
     acende o botao de despertar assim que a janela abre. */
  function tick() {
    if (!state.onboarded) {
      return;
    }
    if (state.today.date !== Clock.todayISO()) {
      apply(Engine.hydrate(state));
      lastWakeOpen = Engine.wakeWindowOpen(state);
      return;
    }
    var open = Engine.wakeWindowOpen(state);
    if (open !== lastWakeOpen) {
      lastWakeOpen = open;
      UI.render(state);
    }
  }

  function boot() {
    UI.mount(handlers);

    if (!state.onboarded) {
      UI.showOnboarding();
    } else {
      var events = Engine.hydrate(state);
      persist();
      UI.showApp(state);
      UI.playEvents(events);
      lastWakeOpen = Engine.wakeWindowOpen(state);
      if (state.notificationsEnabled) {
        Notifications.schedule();
      }
    }

    window.setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        tick();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Jornada);
