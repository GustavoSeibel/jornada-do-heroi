/* Renderizacao e bindings. A UI nunca decide regra: ela le o estado, pergunta
   ao Engine e delega as acoes para os handlers recebidos no mount.
   Todo texto entra por textContent — nenhum innerHTML com dado do usuario. */
window.Jornada = window.Jornada || {};

(function (Jornada) {
  'use strict';

  var Config = Jornada.Config;
  var Clock = Jornada.Clock;
  var Engine = Jornada.Engine;
  var Confetti = Jornada.Confetti;

  var refs = {};
  var handlers = {};
  var activeView = 'missions';
  var lastPointer = null;
  var plank = { intervalId: null, remaining: 0, index: -1 };

  /* --------------------------------------------------------- Helpers DOM */

  function el(tag, options, children) {
    var node = document.createElement(tag);
    var opts = options || {};

    Object.keys(opts).forEach(function (key) {
      var value = opts[key];
      if (value === null || value === undefined || value === false) {
        return;
      }
      if (key === 'class') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key === 'dataset') {
        Object.keys(value).forEach(function (dataKey) {
          node.dataset[dataKey] = value[dataKey];
        });
      } else if (key === 'style') {
        Object.keys(value).forEach(function (styleKey) {
          node.style[styleKey] = value[styleKey];
        });
      } else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    });

    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) {
        return;
      }
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });

    return node;
  }

  function clear(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  /* ------------------------------------------------------ Helpers visuais */

  function formatHours(value) {
    var whole = Math.floor(value);
    var minutes = Math.round((value - whole) * 60);
    return minutes === 0 ? whole + 'h' : whole + 'h' + (minutes < 10 ? '0' : '') + minutes;
  }

  function formatLiters(value) {
    return String(value).replace('.', ',') + ' L';
  }

  function formatMultiplier(value) {
    return String(Math.round(value * 100) / 100).replace('.', ',') + 'x';
  }

  function lerpChannel(from, to, t) {
    return Math.round(from + (to - from) * t);
  }

  /* A barra de agua vai do vermelho seco ao azul cristalino, passando pelo ambar. */
  function waterColor(progress) {
    var stops = [[194, 65, 12], [251, 191, 36], [56, 189, 248]];
    var scaled = Math.max(0, Math.min(1, progress)) * (stops.length - 1);
    var index = Math.min(stops.length - 2, Math.floor(scaled));
    var t = scaled - index;
    var a = stops[index];
    var b = stops[index + 1];
    return 'rgb(' + lerpChannel(a[0], b[0], t) + ',' + lerpChannel(a[1], b[1], t) + ',' + lerpChannel(a[2], b[2], t) + ')';
  }

  function heartsLabel(hearts) {
    var full = Math.floor(hearts);
    var hasHalf = hearts - full >= 0.5;
    var text = '';
    var i;
    for (i = 0; i < full; i += 1) {
      text += '♥';
    }
    if (hasHalf) {
      text += '◖';
    }
    for (i = full + (hasHalf ? 1 : 0); i < Config.MAX_HEARTS; i += 1) {
      text += '♡';
    }
    return text;
  }

  function iconFor(state, missionId) {
    var set = Config.ICON_SETS[state.equipped.icons] || Config.ICON_SETS.default;
    return set[missionId];
  }

  function xpLabel(state, missionId) {
    var preview = Engine.xpPreview(state, missionId);
    var extras = [];
    if (preview.comboMultiplier > 1) {
      extras.push('combo ' + formatMultiplier(preview.comboMultiplier));
    }
    if (preview.classMultiplier > 1) {
      extras.push('classe ' + formatMultiplier(preview.classMultiplier));
    }
    return '+' + preview.total + ' XP' + (extras.length ? ' (' + extras.join(' · ') + ')' : '');
  }

  /* ------------------------------------------------------------- Toasts */

  function toast(text, tone) {
    var node = el('div', { class: 'toast toast--' + (tone || 'info'), text: text });
    refs.toastStack.appendChild(node);

    while (refs.toastStack.children.length > 4) {
      refs.toastStack.removeChild(refs.toastStack.firstChild);
    }

    window.setTimeout(function () {
      node.classList.add('is-leaving');
      window.setTimeout(function () {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }, 300);
    }, 3400);
  }

  /* -------------------------------------------------- Cartoes de missao */

  function buildCard(state, mission, parts) {
    var complete = Engine.isComplete(state, mission.id);
    var progress = Engine.progressOf(state, mission.id);

    var fill = el('div', { class: 'bar__fill', style: { width: Math.round(progress * 100) + '%' } });
    if (parts.fillColor) {
      fill.style.background = parts.fillColor;
    }

    var children = [
      el('div', { class: 'mission__head' }, [
        el('span', { class: 'mission__icon', 'aria-hidden': 'true', text: iconFor(state, mission.id) }),
        el('div', { class: 'mission__titles' }, [
          el('div', { class: 'mission__name', text: mission.name }),
          el('div', { class: 'mission__subtitle', text: mission.subtitle })
        ]),
        el('span', { class: 'mission__xp', text: complete ? 'Concluída' : xpLabel(state, mission.id) })
      ]),
      el('p', { class: 'mission__goal', text: parts.goalText }),
      el('div', { class: 'bar' }, [fill])
    ];

    return el('article', {
      class: 'mission' + (complete ? ' is-complete' : ''),
      dataset: { accent: mission.color }
    }, children.concat(parts.body || []));
  }

  function waterCard(state) {
    var mission = Config.missionById('water');
    var phase = Engine.phaseFor(state, 'water');
    var count = state.today.water_glasses;
    var total = Math.max(phase.goalGlasses, count);

    var glasses = el('div', { class: 'glasses', 'aria-hidden': 'true' });
    for (var i = 0; i < total; i += 1) {
      glasses.appendChild(el('div', { class: 'glass' + (i < count ? ' is-filled' : '') }));
    }

    var controls = el('div', { class: 'mission__controls' }, [
      el('button', {
        class: 'btn btn--round',
        type: 'button',
        'aria-label': 'Remover um copo',
        disabled: count === 0 || state.today.claimed.water,
        onClick: function () { handlers.removeWater(); }
      }, ['−']),
      el('div', { class: 'counter' }, [
        document.createTextNode(count + ' / ' + phase.goalGlasses),
        el('small', { text: 'copos de ' + Config.GLASS_ML + ' ml' })
      ]),
      el('button', {
        class: 'btn btn--accent',
        type: 'button',
        onClick: function () { handlers.addWater(); }
      }, ['Beber um copo'])
    ]);

    return buildCard(state, mission, {
      goalText: 'Meta do Ato: ' + phase.goalGlasses + ' copos (' + formatLiters(phase.liters) + ') ao longo do dia.',
      fillColor: waterColor(Engine.progressOf(state, 'water')),
      body: [glasses, controls]
    });
  }

  function sleepCard(state) {
    var mission = Config.missionById('sleep');
    var phase = Engine.phaseFor(state, 'sleep');
    var day = state.today;
    var target = Engine.bedTarget(state);

    var goalText = phase.bedToleranceMin === null
      ? 'Dormir no mínimo ' + formatHours(phase.minHours) + ' e deitar até ' + Clock.formatMinutes(target) + '.'
      : 'Dormir no mínimo ' + formatHours(phase.minHours) + ' e manter horário fixo: deitar entre '
        + Clock.formatMinutes(target - phase.bedToleranceMin) + ' e ' + Clock.formatMinutes(target + phase.bedToleranceMin) + '.';

    var hoursInput = el('input', {
      class: 'field__input',
      type: 'number',
      min: '0',
      max: '24',
      step: '0.25',
      placeholder: 'Horas dormidas',
      value: day.sleep_hours > 0 ? String(day.sleep_hours) : '',
      style: { maxWidth: '150px' }
    });

    var body = [
      el('div', { class: 'mission__controls' }, [
        el('button', {
          class: 'btn btn--accent',
          type: 'button',
          disabled: day.bedCheckin,
          onClick: function () { handlers.bedCheckin(); }
        }, [day.bedCheckin ? 'Deitou às ' + day.bedTimeLogged + ' ✓' : 'Larguei as telas e fui deitar'])
      ]),
      el('div', { class: 'mission__controls' }, [
        hoursInput,
        el('button', {
          class: 'btn btn--accent',
          type: 'button',
          onClick: function () { handlers.logSleep(hoursInput.value); }
        }, ['Registrar manhã'])
      ])
    ];

    if (day.sleep_hours > 0) {
      body.push(el('p', { class: 'mission__goal', text: 'Registrado: ' + formatHours(day.sleep_hours) + ' de sono.' }));
    }
    if (day.bedCheckin && !Engine.bedTimeOk(state)) {
      body.push(el('p', {
        class: 'note',
        text: 'O check-in de hoje saiu do horário-alvo, então o XP não conta — mas o registro fica para você se acompanhar.'
      }));
    }

    return buildCard(state, mission, { goalText: goalText, body: body });
  }

  function wakeCard(state) {
    var mission = Config.missionById('wake');
    var day = state.today;
    var window_ = Engine.wakeWindow(state);
    var open = Engine.wakeWindowOpen(state);
    var logged = day.wake_time_logged !== null;

    var body = [
      el('div', { class: 'mission__controls' }, [
        el('button', {
          class: 'btn btn--accent',
          type: 'button',
          disabled: logged || !open,
          onClick: function () { handlers.logWake(); }
        }, [logged ? 'Despertou às ' + day.wake_time_logged + ' ✓' : 'Despertar!'])
      ])
    ];

    if (!logged) {
      body.push(el('p', {
        class: 'mission__goal',
        text: open
          ? 'A janela está aberta agora. Reivindique seu XP!'
          : 'O botão só acende entre ' + Clock.formatMinutes(window_.startMin) + ' e ' + Clock.formatMinutes(window_.endMin) + '.'
      }));
    }

    return buildCard(state, mission, {
      goalText: 'Desperte entre ' + Clock.formatMinutes(window_.startMin) + ' e ' + Clock.formatMinutes(window_.endMin)
        + ' (seu horário habitual é ' + state.baseline.wakeTime + ').',
      body: body
    });
  }

  function stopPlank() {
    if (plank.intervalId !== null) {
      window.clearInterval(plank.intervalId);
      plank.intervalId = null;
    }
    plank.remaining = 0;
    plank.index = -1;
  }

  function calisthenicsCard(state) {
    var mission = Config.missionById('calisthenics');
    var phase = Engine.phaseFor(state, 'calisthenics');
    var day = state.today;
    var locked = day.claimed.calisthenics;

    var list = el('ul', { class: 'exercise-list' });

    phase.exercises.forEach(function (exercise, index) {
      var done = day.calisthenicsSteps[index];
      var row = el('li', { class: 'exercise' + (done ? ' is-done' : '') });

      row.appendChild(el('input', {
        type: 'checkbox',
        checked: done,
        disabled: locked,
        'aria-label': exercise.label,
        onChange: function () { handlers.toggleExercise(index); }
      }));
      row.appendChild(el('span', { class: 'exercise__label', text: exercise.label }));

      if (exercise.seconds > 0 && !done) {
        var counting = plank.index === index && plank.intervalId !== null;
        row.appendChild(el('span', {
          id: 'plank-timer',
          class: 'timer',
          text: counting ? plank.remaining + 's' : ''
        }));
        row.appendChild(el('button', {
          class: 'btn btn--ghost',
          type: 'button',
          disabled: locked || counting,
          onClick: function () { startPlankTimer(index, exercise.seconds); }
        }, [counting ? 'Contando' : 'Cronômetro']));
      }

      list.appendChild(row);
    });

    return buildCard(state, mission, {
      goalText: 'Circuito de 5 minutos do ' + Engine.actFor(state).roman + '. Marque cada exercício ao terminar.',
      body: [list]
    });
  }

  function startPlankTimer(index, seconds) {
    stopPlank();
    plank.index = index;
    plank.remaining = seconds;

    plank.intervalId = window.setInterval(function () {
      plank.remaining -= 1;
      var display = document.getElementById('plank-timer');

      if (plank.remaining <= 0) {
        stopPlank();
        if (display) {
          display.textContent = '';
        }
        handlers.toggleExercise(index);
        return;
      }
      if (display) {
        display.textContent = plank.remaining + 's';
      }
    }, 1000);

    render(handlers.getState());
  }

  function nailsCard(state) {
    var mission = Config.missionById('nails');
    var day = state.today;
    var answered = day.nails_bitten !== null;
    var streak = state.streaks.nails;
    var toBonus = mission.bonusEvery - (streak % mission.bonusEvery);

    var body = [
      el('div', { class: 'counter', style: { textAlign: 'left', minWidth: '0' } }, [
        document.createTextNode(streak + ' dia' + (streak === 1 ? '' : 's')),
        el('small', { text: 'sem sofrer dano' })
      ]),
      el('p', { class: 'mission__goal', text: 'Minhas unhas sobreviveram ao dia de hoje?' }),
      el('div', { class: 'choice-row' }, [
        el('button', {
          class: 'btn btn--accent',
          type: 'button',
          disabled: answered,
          onClick: function () { handlers.answerNails(true); }
        }, ['Sim']),
        el('button', {
          class: 'btn btn--ghost',
          type: 'button',
          disabled: answered,
          onClick: function () { handlers.answerNails(false); }
        }, ['Não'])
      ])
    ];

    if (answered) {
      body.push(el('p', {
        class: 'mission__check',
        text: day.nails_bitten
          ? 'Resposta registrada. O contador zerou, mas a jornada continua.'
          : 'Resposta registrada: mais um dia de vontade de ferro.'
      }));
    } else {
      body.push(el('p', {
        class: 'mission__goal',
        text: 'Faltam ' + toBonus + ' dia' + (toBonus === 1 ? '' : 's') + ' para as Manoplas de Ferro (+' + mission.bonusXp + ' XP).'
      }));
    }

    return buildCard(state, mission, {
      goalText: 'Check-in de honestidade no fim do dia. Responder já vale o registro; só o "Sim" rende XP.',
      body: body
    });
  }

  var CARD_BUILDERS = {
    water: waterCard,
    sleep: sleepCard,
    wake: wakeCard,
    calisthenics: calisthenicsCard,
    nails: nailsCard
  };

  /* ------------------------------------------------------------ Render */

  function renderHud(state) {
    var act = Engine.actFor(state);
    var intoLevel = Engine.xpIntoLevel(state.current_xp);
    var bestStreak = Engine.MISSION_IDS.reduce(function (max, id) {
      return Math.max(max, state.streaks[id]);
    }, 0);

    refs.hudAvatar.textContent = state.equipped.avatar;
    refs.hudName.textContent = state.heroName;
    refs.hudAct.textContent = act.roman + ' — ' + act.title;
    refs.hudDay.textContent = String(Engine.dayNumber(state));
    refs.hudLevel.textContent = 'Nível ' + state.current_level;
    refs.hudXp.textContent = intoLevel + ' / ' + Config.XP_PER_LEVEL + ' XP';
    refs.hudXpFill.style.width = Math.round((intoLevel / Config.XP_PER_LEVEL) * 100) + '%';
    refs.hudHearts.textContent = heartsLabel(state.hearts);
    refs.hudHearts.title = state.hearts + ' de ' + Config.MAX_HEARTS + ' corações nesta semana';
    refs.hudGold.textContent = String(state.gold);
    refs.hudStreak.textContent = String(bestStreak);
  }

  function renderClassPrompt(state) {
    var show = Engine.canChooseClass(state) && !state.heroClass;
    refs.classPrompt.hidden = !show;
    clear(refs.classOptions);
    if (!show) {
      return;
    }
    Config.CLASSES.forEach(function (heroClass) {
      refs.classOptions.appendChild(el('button', {
        class: 'class-option',
        type: 'button',
        onClick: function () { handlers.chooseClass(heroClass.id); }
      }, [
        el('strong', { text: heroClass.name }),
        el('span', { text: heroClass.description })
      ]));
    });
  }

  function renderMissions(state) {
    var act = Engine.actFor(state);
    refs.actIntro.textContent = act.intro;

    refs.act3Note.hidden = act.number < 3;
    if (act.number >= 3) {
      refs.act3Note.textContent = Config.GUILD_MASTER.act3Photo;
    }

    renderClassPrompt(state);

    clear(refs.missionList);
    Engine.MISSION_IDS.forEach(function (id) {
      refs.missionList.appendChild(CARD_BUILDERS[id](state));
    });
  }

  function renderShop(state) {
    clear(refs.shopList);
    Config.SHOP.forEach(function (item) {
      var owned = state.purchased.indexOf(item.id) !== -1;
      var equipped = state.equipped[item.slot] === item.value;
      var action;

      if (!owned) {
        action = el('button', {
          class: 'btn btn--accent',
          type: 'button',
          disabled: state.gold < item.price,
          onClick: function () { handlers.buyItem(item.id); }
        }, ['Comprar']);
      } else {
        action = el('button', {
          class: equipped ? 'btn btn--primary' : 'btn btn--ghost',
          type: 'button',
          onClick: function () { handlers.equipItem(item.id); }
        }, [equipped ? 'Equipado' : 'Equipar']);
      }

      refs.shopList.appendChild(el('div', { class: 'shop-item' }, [
        el('span', { class: 'shop-item__icon', 'aria-hidden': 'true', text: item.icon }),
        el('div', { class: 'shop-item__body' }, [
          el('div', { class: 'shop-item__name', text: item.name }),
          el('div', { class: 'shop-item__desc', text: item.description }),
          el('div', { class: 'shop-item__price', text: owned ? 'Adquirido' : item.price + ' 🪙' })
        ]),
        action
      ]));
    });
  }

  function renderProfile(state) {
    clear(refs.relicList);
    Config.RELICS.forEach(function (relic) {
      var unlocked = state.unlocked.indexOf(relic.id) !== -1;
      refs.relicList.appendChild(el('div', {
        class: 'relic ' + (unlocked ? 'is-unlocked' : 'is-locked')
      }, [
        el('span', { class: 'relic__icon', 'aria-hidden': 'true', text: relic.icon }),
        el('div', { class: 'relic__text' }, [
          el('span', { class: 'relic__name', text: unlocked ? relic.name : 'Relíquia selada' }),
          el('span', { class: 'relic__hint', text: relic.hint })
        ])
      ]));
    });

    clear(refs.streakList);
    Engine.MISSION_IDS.forEach(function (id) {
      var mission = Config.missionById(id);
      var days = state.streaks[id];
      refs.streakList.appendChild(el('div', { class: 'streak-row' }, [
        el('span', { text: mission.name }),
        el('span', {
          class: 'streak-row__value',
          text: days + (days === 1 ? ' dia · ' : ' dias · ') + formatMultiplier(Engine.streakMultiplier(Engine.comboLength(state, id)))
        })
      ]));
    });

    clear(refs.bossList);
    if (state.bosses.length === 0) {
      refs.bossList.appendChild(el('p', {
        class: 'panel__text',
        text: 'O chefão da semana é resolvido no domingo: basta ter ' + Config.BOSS_XP_THRESHOLD + ' XP acumulados na semana.'
      }));
    } else {
      state.bosses.slice().reverse().forEach(function (entry) {
        refs.bossList.appendChild(el('div', {
          class: 'boss-row' + (entry.defeated ? ' is-defeated' : '')
        }, [
          el('span', { text: entry.name + ' · semana de ' + Clock.formatISO(entry.weekStart) }),
          el('span', { class: 'boss-row__result', text: entry.defeated ? 'Derrotado' : 'Escapou' })
        ]));
      });
    }

    var heroClass = Config.classById(state.heroClass);
    refs.debugInfo.textContent = 'Dia ' + Engine.dayNumber(state) + ' · ' + Clock.todayISO()
      + ' · classe: ' + (heroClass ? heroClass.name : 'nenhuma')
      + (state.debugDayOffset > 0 ? ' · +' + state.debugDayOffset + ' dia(s) de debug' : '');
  }

  function render(state) {
    document.body.dataset.theme = state.equipped.theme;
    renderHud(state);
    renderMissions(state);
    renderShop(state);
    renderProfile(state);
  }

  /* ------------------------------------------------------------ Eventos */

  function playEvents(events) {
    (events || []).forEach(function (item) {
      switch (item.type) {
        case 'message':
          toast(item.text, item.tone);
          break;
        case 'xp':
          toast('+' + item.amount + ' XP' + (item.bonus ? ' — Bônus de Sobrevivência!' : ''), item.bonus ? 'epic' : 'success');
          break;
        case 'level':
          toast('Nível ' + item.level + ' alcançado!', 'epic');
          break;
        case 'gold':
          toast('+' + item.amount + ' moedas de ouro', 'epic');
          break;
        case 'relic':
          toast(item.icon + ' ' + item.name + ' desbloqueado!', 'epic');
          break;
        case 'heart':
          toast(Config.GUILD_MASTER.heartLost, 'warn');
          break;
        case 'boss':
          toast(item.defeated ? item.name + ' foi derrotado!' : item.name + ' escapou desta vez.', item.defeated ? 'epic' : 'warn');
          break;
        case 'confetti':
          Confetti.burst(item.intensity, lastPointer);
          break;
        default:
          break;
      }
    });
  }

  function switchView(view) {
    activeView = view;
    refs.tabs.forEach(function (tab) {
      var isActive = tab.dataset.view === view;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    refs.views.missions.hidden = view !== 'missions';
    refs.views.shop.hidden = view !== 'shop';
    refs.views.profile.hidden = view !== 'profile';
  }

  /* -------------------------------------------------------------- Mount */

  function mount(boundHandlers) {
    handlers = boundHandlers;

    refs.onboarding = document.getElementById('screen-onboarding');
    refs.app = document.getElementById('screen-app');
    refs.toastStack = document.getElementById('toast-stack');

    refs.hudAvatar = document.getElementById('hud-avatar');
    refs.hudName = document.getElementById('hud-name');
    refs.hudAct = document.getElementById('hud-act');
    refs.hudDay = document.getElementById('hud-day');
    refs.hudLevel = document.getElementById('hud-level');
    refs.hudXp = document.getElementById('hud-xp');
    refs.hudXpFill = document.getElementById('hud-xp-fill');
    refs.hudHearts = document.getElementById('hud-hearts');
    refs.hudGold = document.getElementById('hud-gold');
    refs.hudStreak = document.getElementById('hud-streak');

    refs.actIntro = document.getElementById('act-intro');
    refs.act3Note = document.getElementById('act3-note');
    refs.classPrompt = document.getElementById('class-prompt');
    refs.classOptions = document.getElementById('class-options');
    refs.missionList = document.getElementById('mission-list');
    refs.shopList = document.getElementById('shop-list');
    refs.relicList = document.getElementById('relic-list');
    refs.streakList = document.getElementById('streak-list');
    refs.bossList = document.getElementById('boss-list');
    refs.debugInfo = document.getElementById('debug-info');

    refs.views = {
      missions: document.getElementById('view-missions'),
      shop: document.getElementById('view-shop'),
      profile: document.getElementById('view-profile')
    };
    refs.tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    refs.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchView(tab.dataset.view);
      });
    });

    Confetti.mount(document.getElementById('confetti-canvas'));
    document.addEventListener('pointerdown', function (pointerEvent) {
      lastPointer = { x: pointerEvent.clientX, y: pointerEvent.clientY };
    });

    document.getElementById('onboarding-form').addEventListener('submit', function (submitEvent) {
      submitEvent.preventDefault();
      handlers.start({
        heroName: document.getElementById('input-hero-name').value,
        wakeTime: document.getElementById('input-wake-time').value,
        bedTime: document.getElementById('input-bed-time').value,
        notifications: document.getElementById('input-notifications').checked
      });
    });

    document.getElementById('btn-advance-day').addEventListener('click', function () {
      handlers.advanceDay();
    });
    document.getElementById('btn-reset').addEventListener('click', function () {
      if (window.confirm('Recomeçar a jornada apaga XP, relíquias e histórico. Continuar?')) {
        handlers.reset();
      }
    });

    switchView(activeView);
  }

  function showApp(state) {
    refs.onboarding.hidden = true;
    refs.app.hidden = false;
    render(state);
  }

  function showOnboarding() {
    stopPlank();
    refs.onboarding.hidden = false;
    refs.app.hidden = true;
  }

  Jornada.UI = {
    mount: mount,
    render: render,
    showApp: showApp,
    showOnboarding: showOnboarding,
    playEvents: playEvents,
    toast: toast
  };
})(window.Jornada);
