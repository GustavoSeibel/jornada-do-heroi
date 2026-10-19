/* Chamados do Mestre da Guilda. Sem service worker, a Notification API so'
   dispara com a aba aberta — por isso cada horario se reagenda apos disparar.
   Usa o relogio real do sistema, nunca o Clock de debug. */
window.Jornada = window.Jornada || {};

(function (Jornada) {
  'use strict';

  var Config = Jornada.Config;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var timers = [];

  function supported() {
    return typeof window.Notification === 'function';
  }

  function granted() {
    return supported() && window.Notification.permission === 'granted';
  }

  function msUntil(hour, minute) {
    var now = new Date();
    var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target = new Date(target.getTime() + DAY_MS);
    }
    return target.getTime() - now.getTime();
  }

  function fire(entry) {
    try {
      /* eslint-disable-next-line no-new */
      new window.Notification(entry.title, { body: entry.body, tag: entry.id, icon: null });
    } catch (error) {
      /* Alguns navegadores bloqueiam a construcao direta; ignorar e seguir agendando. */
    }
  }

  function scheduleEntry(entry) {
    var timer = window.setTimeout(function () {
      if (granted()) {
        fire(entry);
      }
      scheduleEntry(entry);
    }, msUntil(entry.hour, entry.minute));
    timers.push(timer);
  }

  var Notifications = {
    supported: supported,
    granted: granted,

    request: function () {
      if (!supported()) {
        return Promise.resolve(false);
      }
      if (window.Notification.permission === 'granted') {
        return Promise.resolve(true);
      }
      if (window.Notification.permission === 'denied') {
        return Promise.resolve(false);
      }
      try {
        return Promise.resolve(window.Notification.requestPermission()).then(function (result) {
          return result === 'granted';
        });
      } catch (error) {
        return Promise.resolve(false);
      }
    },

    stop: function () {
      timers.forEach(function (timer) {
        window.clearTimeout(timer);
      });
      timers = [];
    },

    schedule: function () {
      Notifications.stop();
      if (!granted()) {
        return false;
      }
      Config.NOTIFICATIONS.forEach(scheduleEntry);
      return true;
    },

    /* Horarios em texto, para a UI explicar o que foi agendado. */
    describe: function () {
      return Config.NOTIFICATIONS.map(function (entry) {
        return (entry.hour < 10 ? '0' : '') + entry.hour + ':' + (entry.minute < 10 ? '0' : '') + entry.minute;
      }).join(', ');
    }
  };

  Jornada.Notifications = Notifications;
})(window.Jornada);
