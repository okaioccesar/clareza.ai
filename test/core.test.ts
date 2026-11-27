import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, merge, nextDate, changeStatus } from '../src/core/workspace.ts';
import { weekDates } from '../src/core/dates.ts';
import { dayTasks, summary, createTask } from '../src/core/day.ts';
import { reconcile, parseCache, empty, hasContent } from '../src/core/sync.ts';
import type { Workspace } from '../src/core/model.ts';

test('migra tarefas antigas preservando conclusão, notas e prazo', () => {
  const [task] = normalize({
    tasks: [
      {
        id: 'old',
        title: 'Antiga',
        notes: 'Detalhes',
        date: '2026-10-14',
        done: true,
        completedAt: '2026-10-14T15:00:00Z',
      },
    ],
  }).tasks;
  assert.equal(task!.status, 'done');
  assert.equal(task!.notes, 'Detalhes');
  assert.equal(task!.date, '2026-10-14');
  assert.equal(task!.completedAt, '2026-10-14T15:00:00Z');
});

test('semana inicia na segunda inclusive no domingo e na virada do ano', () => {
  assert.deepEqual(weekDates(0, new Date(2027, 0, 3, 12)), [
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
  ]);
  assert.equal(weekDates(1, new Date(2027, 0, 3, 12))[0], '2027-01-04');
});

test('importação preserva registros locais e reconecta novos projetos', () => {
  const local = normalize({
    tasks: [{ id: 'same', title: 'Local' }],
    projects: [{ id: 'p1', title: 'Local projeto' }],
  });
  const incoming = normalize({
    tasks: [
      { id: 'same', title: 'Outra versão' },
      { id: 'new', title: 'Nova', projectId: 'p2' },
    ],
    projects: [{ id: 'p2', title: 'Importado' }],
  });
  const merged = merge(local, incoming);
  assert.equal(merged.tasks.length, 2);
  assert.equal(merged.tasks.find((t) => t.id === 'same')!.title, 'Local');
  assert.equal(merged.tasks.find((t) => t.id === 'new')!.projectId, 'p2');
  assert.equal(merged.projects.length, 2);
});

test('rejeita arquivo errado, normaliza dados incompletos e datas inválidas', () => {
  assert.throws(() => normalize({ hello: 'world' }));
  const normalized = normalize({
    tasks: [null, { id: 't', title: 'Teste', date: '2026-02-30', time: '09:00', projectId: 'missing' }],
    pages: [{ id: 'n', title: 'Nota', blocks: [null, { type: 'script', text: '<script>alert(1)</script>' }] }],
  });
  assert.equal(normalized.tasks[0]!.date, '');
  assert.equal(normalized.tasks[0]!.time, '', 'horário sem data é descartado');
  assert.equal(normalized.tasks[0]!.projectId, '');
  assert.equal(normalized.pages[0]!.blocks[0]!.type, 'text');
  assert.equal(normalized.pages[0]!.blocks[0]!.text, '<script>alert(1)</script>');
});

test('horário e revisões semanais sobrevivem à normalização', () => {
  const data = normalize({
    tasks: [
      { id: 't', title: 'Reunião', date: '2026-10-14', time: '14:30' },
      { id: 'u', title: 'X', date: '2026-10-14', time: '25:00' },
    ],
    reviews: {
      '2026-10-12': { wins: 'Bom', priorities: ['t', 'a', 'b', 'c'], completed: 4, savedAt: '2026-10-16T10:00:00Z' },
      nope: {},
    },
  });
  assert.equal(data.tasks[0]!.time, '14:30');
  assert.equal(data.tasks[1]!.time, '');
  assert.deepEqual(Object.keys(data.reviews), ['2026-10-12']);
  assert.equal(data.reviews['2026-10-12']!.priorities.length, 3);
  assert.deepEqual(normalize({ tasks: [] }).reviews, {});
});

test('áreas e subtarefas sobrevivem à importação sem alterar dados antigos', () => {
  const current = normalize({
    areas: [{ id: 'a', title: 'Estudos' }],
    projects: [{ id: 'p', title: 'Curso', areaId: 'a' }],
    tasks: [
      {
        id: 't',
        title: 'Aula',
        projectId: 'p',
        areaId: 'a',
        subtasks: [{ id: 's', title: 'Ler', done: true }],
        date: '2026-10-14',
        repeat: 'weekly',
      },
    ],
  });
  const imported = merge(current, normalize({ tasks: [{ id: 'old', title: 'Antiga' }] }));
  assert.equal(imported.areas.length, 1);
  assert.equal(imported.tasks.find((t) => t.id === 't')!.subtasks[0]!.done, true);
  assert.equal(imported.tasks.find((t) => t.id === 't')!.repeat, 'weekly');
  assert.equal(imported.tasks.find((t) => t.id === 'old')!.repeat, 'none');
  assert.equal(imported.projects[0]!.areaId, 'a');
});

test('recorrência mensal mantém o dia original no fim de fevereiro e ano bissexto', () => {
  assert.equal(nextDate('2026-01-31', 'monthly', '2026-01-31', 31), '2026-02-28');
  assert.equal(nextDate('2026-02-28', 'monthly', '2026-02-28', 31), '2026-03-31');
  assert.equal(nextDate('2028-01-31', 'monthly', '2028-01-31', 31), '2028-02-29');
  assert.equal(nextDate('2026-12-31', 'monthly', '2026-12-31', 31), '2027-01-31');
  assert.equal(nextDate('2026-03-15', 'monthly', '2026-03-20', 15), '2026-04-15');
});

test('recorrência pula datas passadas sem acumular tarefas', () => {
  assert.equal(nextDate('2026-01-01', 'daily', '2026-10-14'), '2026-10-15');
  assert.equal(nextDate('2026-10-07', 'weekly', '2026-10-20'), '2026-10-21');
  assert.equal(nextDate('2026-01-31', 'monthly', '2026-10-14', 31), '2026-10-31');
  assert.equal(nextDate('2026-01-15', 'monthly', '2026-05-20', 15), '2026-06-15');
});

test('concluir uma tarefa recorrente cria apenas uma próxima ocorrência e reseta subtarefas', () => {
  const task = normalize({
    tasks: [
      {
        id: 't',
        title: 'Revisão',
        date: '2026-10-14',
        time: '09:00',
        repeat: 'weekly',
        subtasks: [{ id: 's', title: 'Ler', done: true }],
      },
    ],
  }).tasks[0]!;
  const tasks = [task];
  const now = new Date(2026, 9, 14, 12);
  changeStatus(tasks, task, 'done', now);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1]!.date, '2026-10-21');
  assert.equal(tasks[1]!.time, '09:00');
  assert.equal(tasks[1]!.subtasks[0]!.done, false);
  assert.equal(task.subtasks[0]!.done, true);
  changeStatus(tasks, task, 'todo', now);
  changeStatus(tasks, task, 'done', now);
  assert.equal(tasks.length, 2);
  const reloaded = normalize({ tasks });
  changeStatus(reloaded.tasks, reloaded.tasks[0]!, 'todo', now);
  changeStatus(reloaded.tasks, reloaded.tasks[0]!, 'done', now);
  assert.equal(reloaded.tasks.length, 2);
});

const fixture = () =>
  normalize({
    tasks: [
      { id: 'today', title: 'Hoje', date: '2026-10-20' },
      { id: 'late', title: 'Atrasada', date: '2026-10-19' },
      { id: 'future', title: 'Futura', date: '2026-10-24' },
      { id: 'pin', title: 'Fixada', date: '2026-10-25', pinned: true },
      { id: 'inbox', title: 'Sem prazo' },
      { id: 'done', title: 'Feita', done: true, completedAt: new Date(2026, 9, 20, 12).toISOString() },
    ],
  });

test('resumo do dia considera atrasadas e fixadas sem antecipar outras tarefas futuras', () => {
  const state = fixture();
  assert.deepEqual(summary(state, '2026-10-20'), { open: 3, done: 1, late: 1, focus: 1, total: 4, percent: 25 });
  assert.deepEqual(
    dayTasks(state, 'today', '2026-10-20').map((t) => t.id),
    ['today', 'late', 'pin'],
  );
});

test('filtros separam fixadas, atrasadas e conclusões do dia', () => {
  const state = fixture();
  assert.deepEqual(
    dayTasks(state, 'focus', '2026-10-20').map((t) => t.id),
    ['pin'],
  );
  assert.deepEqual(
    dayTasks(state, 'late', '2026-10-20').map((t) => t.id),
    ['late'],
  );
  assert.deepEqual(
    dayTasks(state, 'done', '2026-10-20').map((t) => t.id),
    ['done'],
  );
  assert.equal(summary(normalize({ tasks: [] }), '2026-10-20').percent, 0);
});

test('captura rápida valida título, prazo e horário, normaliza associações e preserva o espaço', () => {
  const state = normalize({
    tasks: [],
    areas: [{ id: 'a', title: 'Trabalho' }],
    projects: [{ id: 'p', title: 'Projeto', areaId: 'a' }],
  });
  const task = createTask(
    { title: '  Revisar proposta  ', date: '2026-10-20', time: '10:00', projectId: 'p', areaId: 'a' },
    state,
    new Date(2026, 9, 20, 12),
  );
  assert.equal(task.title, 'Revisar proposta');
  assert.equal(task.projectId, 'p');
  assert.equal(task.areaId, 'a');
  assert.equal(task.time, '10:00');
  assert.equal(task.repeat, 'none');
  assert.deepEqual(task.subtasks, []);
  assert.equal(state.tasks.length, 0);
  assert.throws(() => createTask({ title: '   ' }, state));
  assert.throws(() => createTask({ title: 'x', date: '2026-02-30' }, state));
  assert.throws(() => createTask({ title: 'x', date: '2026-02-03', time: '7h' }, state));
  assert.throws(() => createTask({ title: 'x'.repeat(201) }, state));
  assert.equal(createTask({ title: 'x', time: '10:00' }, state).time, '', 'sem data, sem horário');
});

const data = (title?: string): Workspace => normalize({ tasks: title ? [{ id: 'a', title }] : [] });
const cache = (workspace: Workspace, revision: number) => ({
  format: 1 as const,
  data: workspace,
  revision,
  dirty: true,
  writeId: 'w',
});

test('conta vazia é separada dos dados locais e não importa automaticamente', () => {
  assert.deepEqual(reconcile({ revision: 0, data: null }, null).data, empty());
  assert.equal(hasContent(data('local')), true);
  assert.equal(hasContent(data()), false);
});

test('alterações offline são mantidas quando a versão remota não avançou', () => {
  const result = reconcile({ revision: 2, data: data('cloud') }, cache(data('local'), 2));
  assert.equal(result.data.tasks[0]!.title, 'local');
  assert.equal(result.dirty, true);
  assert.equal(result.conflict, false);
});

test('conflito mantém cópia local sem sobrescrever uma versão remota nova', () => {
  const result = reconcile({ revision: 3, data: data('cloud') }, cache(data('local'), 2));
  assert.equal(result.conflict, true);
  assert.equal(result.data.tasks[0]!.title, 'local');
  assert.equal(result.revision, 2);
});

test('resposta perdida é reconhecida ao reencontrar os mesmos dados na conta', () => {
  const result = reconcile({ revision: 3, data: data('igual') }, cache(data('igual'), 2));
  assert.equal(result.conflict, false);
  assert.equal(result.dirty, false);
  assert.equal(result.revision, 3);
});

test('cache incompleto não é tratado como espaço válido', () => {
  assert.throws(() => parseCache('{'));
  assert.throws(() => parseCache(JSON.stringify({ format: 1, revision: -1 })));
  assert.equal(parseCache(null), null);
});
