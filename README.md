# A Jornada do Herói

App gamificado de mudança de hábitos. Seis missões diárias, XP, níveis, combos, corações e ouro — em HTML, CSS e JavaScript puro, sem build e sem dependências.

## Como rodar

Abra o `index.html` com duplo clique. Os scripts são carregados com `<script>` clássico justamente para funcionar em `file://`.

Se o seu navegador bloquear o `localStorage` em `file://` (acontece em algumas configurações do Chrome), sirva a pasta por HTTP:

```
npx serve .
```

## No celular

O projeto é um PWA instalável. Abra a URL publicada no navegador do celular e use **Adicionar à tela de início**: o app ganha ícone próprio, abre em tela cheia sem barra de navegador e funciona offline, porque o service worker guarda o app shell em cache.

Duas coisas importantes sobre instalação:

- O service worker só é registrado em origem segura (`https://` ou `localhost`). Em `file://` o app continua funcionando normalmente, mas sem instalação nem cache offline.
- Todos os caminhos do `manifest.json` e do `sw.js` são relativos, porque o GitHub Pages serve o projeto dentro de uma subpasta. Trocar por caminhos absolutos quebraria a instalação.

Ao publicar uma versão nova, suba o `CACHE_VERSION` em [sw.js](sw.js) para que o cache antigo seja descartado.

## Como o jogo funciona

### Núcleo

- **XP**: cada missão concluída paga `XP base x multiplicador de combo x multiplicador de classe`.
- **Nível**: sobe a cada 100 XP, sem teto.
- **Ato**: o roadmap de 7 em 7 dias. Ato I "O Camponês Desperto" (dias 1-7), Ato II "O Aprendiz da Guilda" (dias 8-14), Ato III "O Guerreiro Consolidado" (dias 15-21) e Ato IV "A Lenda Viva" (dia 22 em diante). É o Ato que define as metas de cada missão.
- **Combos**: 1 a 2 dias seguidos valem 1x, 3 a 6 dias 1,2x, 7 a 13 dias 1,5x, 14 ou mais 2x.
- **Corações**: 3 por semana, resetam na segunda-feira. Fechar o dia sem bater a meta mínima de água ou de sono custa meio coração. Zerar não gera punição: só uma mensagem do Mestre da Guilda.
- **Ouro**: 5 moedas por dia perfeito (as seis missões concluídas). Gasto em cosméticos na loja.
- **Classe**: liberada no Ato II, dá +10% de XP permanente em uma missão à sua escolha.
- **Chefão**: resolvido no domingo. Acumular 100 XP na semana derrota o chefão automaticamente; não acumular apenas registra que ele escapou.

### As seis missões

| Missão | Ato I | Ato II+ |
| --- | --- | --- |
| A Poção de Vitalidade (água) | 6 copos, 1,5 L, +10 XP | 10 copos, 2,5 L, +15 XP |
| O Descanso na Taverna (sono) | 6h30 e deitar 15 min mais cedo, +15 XP | 7h30 e horário fixo (±30 min), +20 XP |
| Saudação ao Sol (despertar) | 15 min mais cedo, +20 XP | 30 a 60 min mais cedo, +30 XP |
| O Treino da Guarda (calistenia) | flexões na parede, agachamentos, prancha de 20s, +25 XP | flexões inclinadas, agachamentos, prancha de 40s, +35 XP (a partir do Ato III) |
| A Vontade de Ferro (unhas) | +10 XP por dia, +50 XP a cada 7 dias seguidos | igual |
| A Tentação Açucarada (doces) | até 2 doces por dia, +10 XP | até 1 doce no Ato II (+15 XP), nenhum do Ato III em diante (+20 XP) |

O botão de despertar só fica ativo dentro da janela calculada a partir do seu horário habitual. O check-in de sono tem duas partes: o noturno (largou as telas) registra a hora em que você deitou, e o matinal registra quantas horas dormiu.

Na missão dos doces, registrar o que você comeu não paga nada sozinho: o XP sai de **encerrar o dia** dentro da cota. Encerrar com a cota estourada também é registrado — zera o combo, sem perder XP nem coração — porque o valor está no hábito de responder com honestidade. Depois de encerrado, o dia fica travado até a virada da meia-noite.

### Relíquias

Conquistadas por mérito, nunca compradas: Espada de Madeira, Escudo de Bronze, Travesseiro de Penas de Fênix, Manoplas de Ferro, Amuleto do Sabor Amargo e Elmo da Disciplina.

## Notificações

Os três chamados (07:00, 15:00 e 21:30) usam a Notification API do navegador. **Sem service worker e sem backend, eles só disparam com a aba aberta.** Para notificações reais com o app fechado seria necessário transformar o projeto em PWA com service worker e push server.

## Estrutura

```
index.html          telas de onboarding, missões, loja e perfil
css/styles.css      paleta, temas e barras de progresso
js/config.js        dados puros: metas, fases, recompensas, textos
js/storage.js       relógio (com offset de debug) e persistência sanitizada
js/engine.js        todas as regras do jogo, sem DOM
js/ui.js            renderização e bindings, sem regra de negócio
js/confetti.js      partículas em canvas
js/notifications.js agendamento dos chamados
js/app.js           bootstrap e ligação entre UI e engine
```

A separação é intencional: o `engine.js` é testável sem navegador, e a `ui.js` só sabe perguntar ao engine e desenhar o resultado.

## Dados e privacidade

Tudo fica em `localStorage`, na chave `jornada_v1`. Nada sai do dispositivo, não há conta nem servidor. Todo texto vai para a tela via `textContent`, nunca `innerHTML`, e o estado lido do storage passa por validação de tipo e faixa antes de ser usado — entrada corrompida cai no padrão em vez de quebrar o app.

## Ferramentas de teste

Na aba "Herói", o "Pergaminho do Arquimago" tem dois botões: **Avançar um dia** (fecha o dia atual, aplica combos, corações e chefão) e **Recomeçar jornada** (apaga tudo).
