import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/core/workspace.ts';
import {
  reviewWeekStart,
  isReviewDue,
  weekReview,
  reschedule,
  targetDate,
  weekPriorities,
} from '../src/core/review.ts';
import { remindersFor, dueReminders, normalizeSettings, defaultSettings } from '../src/core/reminders.ts';

// 2026-10-19 is a Monday.
test('revisão olha a semana atual e, na segunda, a semana que terminou', () => {
  assert.equal(reviewWeekStart('2026-10-23'), '2026-10-19');
  assert.equal(reviewWeekStart('2026-10-25'), '2026-10-19');
  assert.equal(reviewWeekStart('2026-10-26'), '2026-10-19');
  assert.equal(reviewWeekStart('2026-10-27'), '2026-10-26');
});

test('revisão é sugerida de sexta a segunda até ser salva', () => {
  const empty = normalize({ tasks: [] });
  assert.equal(isReviewDue(empty, '2026-10-21'), false);
  assert.equal(isReviewDue(empty, '2026-10-23'), true);
  const saved = normalize({ tasks: [], reviews: { '2026-10-19': { savedAt: '2026-10-23T10:00:00Z' } } });
  assert.equal(isReviewDue(saved, '2026-10-24'), false);
});

test('resumo da semana separa concluídas, atrasadas e restantes', () => {
  const state = normalize({
    areas: [{ id: 'a', title: 'Saúde' }],
    tasks: [
      { id: 'd1', title: 'Feita', done: true, completedAt: new Date(2026, 9, 20, 10).toISOString(), areaId: 'a' },
      { id: 'd0', title: 'Antiga', done: true, completedAt: new Date(2026, 9, 10, 10).toISOString() },
      { id: 'late', title: 'Atrasada', date: '2026-10-21' },
      { id: 'next', title: 'Sábado', date: '2026-10-24' },
      { id: 'far', title: 'Longe', date: '2026-11-10' },
    ],
  });
  const review = weekReview(state, '2026-10-19', '2026-10-23');
  assert.deepEqual(
    review.completed.map((t) => t.id),
    ['d1'],
  );
  assert.deepEqual(
    review.late.map((t) => t.id),
    ['late'],
  );
  assert.deepEqual(
    review.remaining.map((t) => t.id),
    ['next'],
  );
  assert.deepEqual(review.byArea, [{ areaId: 'a', count: 1 }]);
});

test('reagendar em lote altera apenas as selecionadas e não muta o original', () => {
  const state = normalize({
    tasks: [
      { id: 'a', title: 'A', date: '2026-10-20', time: '09:00', repeat: 'weekly' },
      { id: 'b', title: 'B', date: '2026-10-20' },
    ],
  });
  const moved = reschedule(state, ['a'], targetDate('next-monday', '2026-10-23'));
  assert.equal(moved.tasks[0]!.date, '2026-10-26');
  assert.equal(moved.tasks[1]!.date, '2026-10-20');
  assert.equal(state.tasks[0]!.date, '2026-10-20');
  const cleared = reschedule(state, ['a'], targetDate('none'));
  assert.equal(cleared.tasks[0]!.time, '');
  assert.equal(cleared.tasks[0]!.repeat, 'none');
});

test('prioridades da revisão anterior aparecem na semana seguinte', () => {
  const state = normalize({
    tasks: [
      { id: 'p', title: 'Prioridade' },
      { id: 'x', title: 'Feita', done: true },
    ],
    reviews: { '2026-10-19': { priorities: ['p', 'x', 'missing'], savedAt: '2026-10-25T10:00:00Z' } },
  });
  assert.deepEqual(
    weekPriorities(state, '2026-10-27').map((t) => t.id),
    ['p'],
  );
});

test('lembretes respeitam antecedência, tarefas concluídas e resumo diário', () => {
  const state = normalize({
    tasks: [
      { id: 'a', title: 'Reunião', date: '2026-10-20', time: '10:00' },
      { id: 'b', title: 'Concluída', date: '2026-10-20', time: '11:00', done: true },
      { id: 'c', title: 'Sem horário', date: '2026-10-20' },
    ],
  });
  const settings = { ...defaultSettings(), enabled: true, lead: 15 };
  const list = remindersFor(state, settings, '2026-10-20');
  assert.deepEqual(
    list.map((r) => r.tag),
    ['summary:2026-10-20', 'task:a:2026-10-20T10:00'],
  );
  assert.equal(list[1]!.at.getHours(), 9);
  assert.equal(list[1]!.at.getMinutes(), 45);
  assert.equal(remindersFor(state, { ...settings, enabled: false }, '2026-10-20').length, 0);
});

test('lembretes vencidos há muito tempo não disparam em sequência', () => {
  const state = normalize({ tasks: [{ id: 'a', title: 'Reunião', date: '2026-10-20', time: '10:00' }] });
  const settings = { ...defaultSettings(), enabled: true, lead: 0, summary: false };
  const now = new Date(2026, 9, 20, 10, 0, 30);
  assert.equal(dueReminders(state, settings, new Date(2026, 9, 20, 9, 59), now).length, 1);
  assert.equal(dueReminders(state, settings, new Date(2026, 9, 20, 10, 0, 10), now).length, 0);
  assert.equal(dueReminders(state, settings, new Date(2026, 9, 19), new Date(2026, 9, 20, 11)).length, 0);
});

test('configurações inválidas voltam ao padrão', () => {
  assert.deepEqual(normalizeSettings({ enabled: 'sim', lead: 7, summaryTime: '8h' }), defaultSettings());
});
