// Workspace interactions in the built app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, addDays, weekStart } from '../src/core/dates.ts';
import { open, boot, tick, GUEST_KEY } from './helpers/browser.js';

const today = dateKey();

test('captura cria tarefa para hoje, atualiza o resumo e pode ser desfeita', async (t) => {
  const app = await open(t, { tasks: [{ id: 'old', title: 'Tarefa existente' }] });
  app.add('Revisar proposta');
  assert.equal(app.data().tasks.length, 2);
  assert.equal(app.data().tasks[1].date, today);
  assert.match(app.text('.today-heading .lead'), /1 tarefa em aberto/);
  assert.equal(app.w.document.activeElement.id, 'quick-task-title');
  app.$('#toast button').click();
  assert.deepEqual(
    app.data().tasks.map((task) => task.id),
    ['old'],
  );
});

test('falha ao salvar mantém o rascunho e não cria tarefa só na memória', async (t) => {
  const app = await boot(t, { configured: false, url: 'http://localhost/' });
  app.$('#local-mode-start').click();
  app.w.Storage.prototype.setItem = () => {
    throw new Error('quota exceeded');
  };
  app.add('Não perder este rascunho');
  assert.equal(app.data().tasks.length, 0);
  assert.equal(app.$('#quick-task-title').value, 'Não perder este rascunho');
  assert.match(app.text('#toast span'), /salvar/i);
});

test('concluir mantém o foco na próxima tarefa e o filtro mostra a concluída', async (t) => {
  const app = await open(t, {
    tasks: [
      { id: 'a', title: 'Primeira', date: today },
      { id: 'b', title: 'Segunda', date: today },
    ],
  });
  const check = app.$('[data-task-row="a"] input');
  check.focus();
  check.click();
  assert.equal(app.data().tasks.find((x) => x.id === 'a').done, true);
  assert.equal(app.w.document.activeElement.dataset.id, 'b');
  app.$('[data-focus-key="day-filter-done"]').click();
  assert.match(app.text('.day-results'), /Primeira/);
  assert.doesNotMatch(app.text('.day-results'), /Segunda/);
});

test('rascunho da captura e cursor da intenção sobrevivem a uma nova renderização', async (t) => {
  const app = await open(t);
  app.input('#quick-task-title', 'Uma tarefa ainda não enviada');
  app.$('[data-focus-key="day-filter-focus"]').click();
  assert.equal(app.$('#quick-task-title').value, 'Uma tarefa ainda não enviada');
  app.input('#daily-note', 'Meu texto de intenção');
  app.$('#daily-note').focus();
  app.$('#daily-note').setSelectionRange(4, 9);
  app.$('[data-focus-key="day-filter-late"]').click();
  app.$('#daily-note').focus();
  app.$('#daily-note').setSelectionRange(4, 9);
  app.$('[data-task-row]')?.remove();
  app.w.dispatchEvent(new app.w.Event('hashchange'));
  assert.equal(app.w.document.activeElement.id, 'daily-note');
  assert.equal(app.$('#daily-note').selectionStart, 4);
  assert.equal(app.$('#daily-note').selectionEnd, 9);
});

test('busca dentro de uma área fica restrita a essa área e a captura herda a área', async (t) => {
  const app = await open(t, {
    areas: [
      { id: 'work', title: 'Trabalho' },
      { id: 'study', title: 'Estudos' },
    ],
    tasks: [
      { id: 'a', title: 'Revisar trabalho', areaId: 'work' },
      { id: 'b', title: 'Revisar estudo', areaId: 'study' },
    ],
  });
  await app.go('#area/work');
  app.input('#task-search', 'Revisar');
  assert.match(app.text('#task-results'), /Revisar trabalho/);
  assert.doesNotMatch(app.text('#task-results'), /Revisar estudo/);
  app.add('Nova tarefa de trabalho');
  assert.equal(app.data().tasks.at(-1).areaId, 'work');
});

test('títulos com HTML são exibidos como texto', async (t) => {
  const app = await open(t);
  app.add('<img src=x onerror=alert(1)>');
  assert.equal(app.$('.day-results img'), null);
  assert.match(app.text('.day-results'), /<img src=x/);
});

test('barra lateral recolhível salva a preferência e o menu móvel isola o fundo', async (t) => {
  const desktop = await open(t);
  desktop.$('#sidebar-collapse').click();
  assert.equal(desktop.w.document.body.dataset.sidebar, 'compact');
  assert.equal(desktop.w.localStorage.getItem('clareza.sidebar'), 'compact');
  assert.equal(desktop.$('#sidebar-collapse').getAttribute('aria-expanded'), 'false');

  const mobile = await open(t, {}, { mobile: true });
  assert.equal(mobile.$('#sidebar').hasAttribute('inert'), true);
  mobile.$('#mobile-menu').click();
  assert.equal(mobile.$('main').hasAttribute('inert'), true);
  assert.equal(mobile.$('#tabbar').hasAttribute('inert'), true);
  assert.equal(mobile.$('#sidebar').hasAttribute('inert'), false);
  mobile.$('#sidebar-backdrop').click();
  assert.equal(mobile.$('main').hasAttribute('inert'), false);
  assert.equal(mobile.w.document.activeElement.id, 'mobile-menu');
  mobile.$('#mobile-menu').click();
  mobile.$('#navigation [data-view="all"]').click();
  assert.equal(mobile.$('main').hasAttribute('inert'), false);
  assert.equal(mobile.w.document.activeElement.id, 'view');
});

test('redimensionar não deixa o foco em controles ocultos', async (t) => {
  const app = await open(t);
  app.$('#navigation .nav-item').focus();
  app.resize(true);
  assert.equal(app.$('#sidebar').hasAttribute('inert'), true);
  assert.equal(app.w.document.activeElement.id, 'mobile-menu');
  app.resize(false);
  assert.equal(app.$('#sidebar').hasAttribute('inert'), false);
  assert.equal(app.w.document.activeElement.id, 'view');
});

test('menu móvel prende o Tab e ignora campos desabilitados', async (t) => {
  const app = await open(t, {}, { mobile: true });
  const sidebar = app.$('#sidebar');
  sidebar.insertAdjacentHTML('beforeend', '<input disabled><input tabindex="-1">');
  sidebar.querySelectorAll('a,button,input').forEach((el) => (el.getClientRects = () => [{}]));
  app.$('#mobile-menu').click();
  app.$('#account-open').focus();
  const tab = new app.w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  app.$('#account-open').dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(app.w.document.activeElement, app.$('#sidebar .brand'));
  app.w.document.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.$('main').hasAttribute('inert'), false);
  assert.equal(app.w.document.activeElement.id, 'mobile-menu');
});

test('projeto pluraliza contadores e lembra o modo quadro por projeto', async (t) => {
  const app = await open(t, {
    projects: [
      { id: 'a', title: 'VaiSeguro' },
      { id: 'b', title: 'Outro' },
    ],
    tasks: [{ id: 'one', title: 'Teste', projectId: 'a' }],
  });
  await app.go('#project/a');
  assert.match(app.text('.project-summary'), /1 tarefa em aberto/);
  app.$('[data-mode="board"]').click();
  assert.ok(app.$('.board'));
  await app.go('#project/b');
  assert.equal(app.$('.board'), null);
  await app.go('#project/a');
  assert.ok(app.$('.board'));
});

test('arrastar no quadro muda o status e conclui tarefas recorrentes uma vez', async (t) => {
  const app = await open(t, { tasks: [{ id: 'r', title: 'Treino', date: today, repeat: 'daily' }] });
  await app.go('#all');
  app.$('[data-mode="board"]').click();
  const card = app.$('[data-drag-task="r"]');
  const data = { setData() {}, effectAllowed: '' };
  const drag = (type, target) => {
    const event = new app.w.Event(type, { bubbles: true, cancelable: true });
    event.dataTransfer = data;
    target.dispatchEvent(event);
  };
  drag('dragstart', card);
  drag('dragover', app.$('[data-drop-status="done"]'));
  drag('drop', app.$('[data-drop-status="done"]'));
  const tasks = app.data().tasks;
  assert.equal(tasks.find((x) => x.id === 'r').status, 'done');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].date, addDays(today, 1));
});

test('modal respeita o contexto do prazo, permite retirar a data e salva o horário', async (t) => {
  const app = await open(t, { projects: [{ id: 'a', title: 'VaiSeguro' }] });
  await app.go('#project/a');
  app.$('#quick-create').click();
  const form = () => app.$('#entity-form').elements;
  assert.equal(form().date.value, '');
  assert.equal(form().time.disabled, true, 'sem prazo, sem horário');
  assert.equal(form().projectId.value, 'a');
  app.$('[data-close]').click();

  await app.go('#today');
  app.$('#quick-create').click();
  assert.equal(form().date.value, today);
  assert.equal(form().time.disabled, false);
  form().title.value = 'Reunião';
  form().time.value = '14:30';
  app.$('[data-clear-date]').click();
  assert.equal(form().date.value, '');
  assert.equal(form().time.disabled, true);
  app.change(form().date, today);
  form().time.value = '14:30';
  app.submit('#entity-form');
  const task = app.data().tasks[0];
  assert.equal(task.time, '14:30');
  assert.match(app.text('.day-results'), /14:30/);
});

test('repetir exige prazo e os passos são salvos com a tarefa', async (t) => {
  const app = await open(t);
  app.$('#quick-create').click();
  const form = app.$('#entity-form').elements;
  form.title.value = 'Rotina';
  app.$('[data-clear-date]').click();
  form.repeat.value = 'weekly';
  app.submit('#entity-form');
  assert.equal(app.data().tasks.length, 0);
  assert.match(form.date.validationMessage, /prazo/);
  app.change(form.date, today);
  app.input('#new-subtask', 'Primeiro passo');
  app.$('[data-action="add-subtask"]').click();
  app.submit('#entity-form');
  const task = app.data().tasks[0];
  assert.equal(task.repeat, 'weekly');
  assert.deepEqual(
    task.subtasks.map((s) => s.title),
    ['Primeiro passo'],
  );
});

test('seletores temáticos e calendário gravam e removem o prazo', async (t) => {
  const app = await open(t);
  app.$('#quick-create').click();
  await tick();
  const select = app.$('#entity-form [name="priority"]');
  assert.equal(select.hidden, true);
  select.closest('details').querySelector('[data-value="high"]').click();
  assert.equal(select.value, 'high');
  const input = app.$('#entity-form [name="date"]');
  const picker = input.closest('details');
  picker.open = true;
  await tick(10);
  picker.querySelector('[data-date]').click();
  assert.match(input.value, /^\d{4}-\d{2}-\d{2}$/);
  picker.open = true;
  await tick(10);
  picker.querySelector('[aria-label="Remover prazo"]').click();
  assert.equal(input.value, '');
  assert.equal(app.$('#entity-dialog').open, true);
});

test('excluir um projeto preserva as tarefas e pode ser desfeito', async (t) => {
  const app = await open(t, {
    projects: [{ id: 'p', title: 'Projeto' }],
    tasks: [{ id: 't', title: 'Tarefa', projectId: 'p' }],
  });
  await app.go('#project/p');
  app.$('[data-action="edit-project"]').click();
  app.$('#entity-delete').click();
  await tick();
  assert.equal(app.data().projects.length, 0);
  assert.equal(app.data().tasks[0].projectId, '');
  app.$('#toast button').click();
  assert.equal(app.data().projects.length, 1);
  assert.equal(app.data().tasks[0].projectId, 'p');
});

test('busca global encontra áreas, tarefas e páginas e abre o resultado', async (t) => {
  const app = await open(t, {
    areas: [{ id: 'a', title: 'Saúde' }],
    pages: [{ id: 'p', title: 'Notas', blocks: [{ type: 'text', text: 'saude mental' }] }],
  });
  app.w.document.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  assert.equal(app.$('#command-dialog').open, true);
  app.input('#command-input', 'saude');
  const results = app.$$('#command-results button').map((b) => b.textContent);
  assert.equal(results.length, 2, 'busca ignora acentos');
  app.$('[data-command-view="area"]').click();
  await tick();
  assert.equal(app.w.location.hash, '#area/a');
});

test('página: blocos são editados, reordenados e excluídos com desfazer', async (t) => {
  const app = await open(t, {
    pages: [{ id: 'p', title: 'Notas', blocks: [{ id: 'b1', type: 'text', text: 'Primeiro' }] }],
  });
  await app.go('#page/p');
  app.$('[data-action="block-add"][data-type="check"]').click();
  app.input('[data-block-input]:last-of-type', 'Item');
  const page = () => app.data().pages[0];
  await tick(350);
  assert.equal(page().blocks.length, 2);
  app.$$('[data-action="block-up"]')[1].click();
  assert.equal(page().blocks[0].type, 'check');
  app.$$('[data-action="block-delete"]')[0].click();
  assert.equal(page().blocks.length, 1);
  app.$('#toast button').click();
  assert.equal(page().blocks.length, 2);
});

test('assistente sem IA online responde comandos locais e aplica a proposta com desfazer', async (t) => {
  const app = await open(t);
  app.$('#assistant-open').click();
  await tick();
  app.input('#assistant-input', 'Crie revisar proposta amanhã com prioridade alta');
  app.submit('#assistant-form');
  await tick();
  assert.match(app.text('#assistant-messages'), /Preparei uma tarefa/);
  assert.equal(app.data().tasks.length, 0, 'nada muda antes de aplicar');
  [...app.$$('#assistant-messages button')].find((b) => b.textContent === 'Aplicar proposta').click();
  assert.equal(app.data().tasks[0].title, 'revisar proposta');
  assert.equal(app.data().tasks[0].priority, 'high');
  app.$('#toast button').click();
  assert.equal(app.data().tasks.length, 0);
});

test('assistente online envia contexto sem notas e pode ser interrompido', async (t) => {
  const app = await open(t, { tasks: [{ id: 't', title: 'Estudar', notes: 'nota privada' }] });
  const sent = [];
  const fetch = app.w.fetch;
  app.w.fetch = async (url, options = {}) => {
    if (url !== '/api/chat') return fetch(url, options);
    if (!options.method) return { ok: true, status: 200, json: async () => ({ configured: true }) };
    sent.push(JSON.parse(options.body));
    return new Promise((_, reject) =>
      options.signal.addEventListener('abort', () => reject(new app.w.DOMException('Aborted', 'AbortError'))),
    );
  };
  app.$('#assistant-open').click();
  await tick();
  app.input('#assistant-input', 'Organize meu dia');
  app.submit('#assistant-form');
  await tick();
  assert.equal(sent.length, 1);
  assert.doesNotMatch(JSON.stringify(sent[0]), /nota privada/);
  app.$('#assistant-stop').click();
  await tick();
  assert.match(app.text('#assistant-messages'), /Resposta interrompida/);
  assert.equal(app.$('#assistant-send').disabled, false);
  app.w.document.dispatchEvent(new app.w.Event('clareza:workspace-locked'));
  assert.equal(app.text('#assistant-messages'), '');
});

test('revisão semanal reagenda atrasadas em lote, com desfazer', async (t) => {
  const late = addDays(today, -3);
  const app = await open(t, {
    tasks: [
      { id: 'a', title: 'Atrasada A', date: late },
      { id: 'b', title: 'Atrasada B', date: late },
      { id: 'c', title: 'Em dia', date: today },
    ],
  });
  await app.go('#review');
  assert.match(app.text('.review'), /Atrasada A/);
  app.change('[data-review-all]', undefined);
  app.$('[data-review-all]').checked = true;
  app.change('[data-review-all]');
  app.change('#review-target', 'tomorrow');
  app.$('[data-action="review-reschedule"]').click();
  const dates = Object.fromEntries(app.data().tasks.map((x) => [x.id, x.date]));
  assert.deepEqual(dates, { a: addDays(today, 1), b: addDays(today, 1), c: today });
  assert.match(app.text('#toast span'), /2 tarefas reagendadas/);
  app.$('#toast button').click();
  assert.equal(app.data().tasks[0].date, late);
});

test('revisão semanal salva reflexão e até três prioridades, que aparecem em Hoje', async (t) => {
  const ids = ['p1', 'p2', 'p3', 'p4'];
  const app = await open(t, { tasks: ids.map((id) => ({ id, title: 'Prioridade ' + id })) });
  await app.go('#review');
  app.input('#review-wins', 'Treinei três vezes');
  for (const id of ids.slice(0, 3)) {
    const box = app.$(`[data-review-priority="${id}"]`);
    box.checked = true;
    app.change(box);
  }
  assert.equal(app.$('[data-review-priority="p4"]').disabled, true, 'no máximo três');
  app.$('[data-action="review-save"]').click();
  const reviews = app.data().reviews;
  const [week] = Object.keys(reviews);
  assert.ok([weekStart(today), addDays(weekStart(today), -7)].includes(week));
  assert.equal(reviews[week].wins, 'Treinei três vezes');
  assert.deepEqual(reviews[week].priorities, ['p1', 'p2', 'p3']);
  await app.go('#today');
  assert.match(app.text('.priorities'), /Prioridade p1/);
  assert.equal(app.$('.callout'), null, 'a revisão salva não é mais sugerida');
});

test('lembretes: pedem permissão, disparam no horário e não repetem', async (t) => {
  const shown = [];
  const app = await open(
    t,
    { tasks: [{ id: 't', title: 'Reunião', date: today, time: '00:00' }] },
    {
      beforeStart(w) {
        w.Notification = class {
          static permission = 'default';
          static async requestPermission() {
            w.Notification.permission = 'granted';
            return 'granted';
          }
          constructor(title, options) {
            shown.push({ title, ...options });
          }
        };
      },
    },
  );
  app.$('#account-open').click();
  app.$('#settings-open').click();
  assert.equal(app.$('#settings-dialog').open, true);
  assert.equal(app.$('#notify-options').hidden, true);
  const toggle = app.$('#notify-enabled');
  toggle.checked = true;
  app.change(toggle);
  await tick();
  assert.equal(app.$('#notify-options').hidden, false);
  const settings = JSON.parse(app.w.localStorage.getItem('clareza.notifications'));
  assert.equal(settings.enabled, true);

  // Pretend the last check happened just before the reminder time (lead: 15 minutes).
  settings.lead = 0;
  settings.summary = false;
  app.w.localStorage.setItem('clareza.notifications', JSON.stringify(settings));
  app.w.localStorage.setItem('clareza.notifications.checked', String(new Date(today + 'T00:00:00').getTime() - 1000));
  app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));
  assert.ok(shown.length <= 1);
  app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));
  assert.ok(shown.length <= 1, 'o mesmo lembrete não aparece duas vezes');
});

test('tema escolhido no topo é salvo e refletido nas preferências', async (t) => {
  const app = await open(t);
  app.$('.topbar [data-theme-choice="dark"]').click();
  assert.equal(app.w.document.documentElement.dataset.theme, 'dark');
  assert.equal(app.w.localStorage.getItem('clareza.theme'), 'dark');
  assert.equal(app.$('#theme-preference').value, 'dark');
});

test('o espaço local antigo (v1) é migrado ao abrir em modo local', async (t) => {
  const app = await boot(t, {
    configured: false,
    url: 'http://localhost/',
    beforeStart(w) {
      w.localStorage.removeItem(GUEST_KEY);
      w.localStorage.setItem('clareza.tasks.v1', JSON.stringify([{ id: 'v1', title: 'Muito antiga', done: true }]));
    },
  });
  app.$('#local-mode-start').click();
  assert.equal(app.data().tasks[0].title, 'Muito antiga');
  assert.equal(app.data().tasks[0].status, 'done');
});
