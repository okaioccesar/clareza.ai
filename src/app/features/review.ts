/** Interactions of the weekly review screen. */
import { dateKey } from '../../core/dates.ts';
import { reschedule, targetDate, weekReview, type RescheduleTarget } from '../../core/review.ts';
import { blankTask } from '../../core/workspace.ts';
import { maybe, plural } from '../dom.ts';
import { save, store } from '../store.ts';
import { toast } from '../toast.ts';
import { commit, render } from '../render.ts';
import { reviewDraft } from '../views/review.ts';
import { dateLabel } from '../format.ts';

const inReview = () => !!maybe('.view-review');

function rescheduleSelected() {
  const draft = reviewDraft();
  const ids = [...draft.selected];
  if (!ids.length) return;
  const target = (maybe<HTMLSelectElement>('#review-target')?.value ?? 'today') as RescheduleTarget;
  const date = targetDate(target);
  const before = store.data;
  store.replace(reschedule(before, ids, date));
  draft.selected.clear();
  const label = date ? dateLabel(date).toLocaleLowerCase('pt-BR') : 'sem prazo';
  commit(`${plural(ids.length, 'tarefa reagendada', 'tarefas reagendadas')} para ${label}.`, () => {
    store.replace(before);
    commit('Reagendamento desfeito.');
  });
}

function saveReview() {
  const draft = reviewDraft();
  const data = store.data;
  const previous = data.reviews[draft.week];
  data.reviews[draft.week] = {
    wins: draft.wins.trim(),
    adjust: draft.adjust.trim(),
    priorities: draft.priorities.slice(0, 3),
    completed: weekReview(data, draft.week, dateKey()).completed.length,
    savedAt: new Date().toISOString(),
  };
  commit('Revisão salva. Suas prioridades aparecem em Hoje.', () => {
    if (previous) data.reviews[draft.week] = previous;
    else delete data.reviews[draft.week];
    commit('Revisão desfeita.');
  });
}

export function setupReview() {
  document.addEventListener('click', (event) => {
    if (!inReview()) return;
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'review-reschedule') rescheduleSelected();
    if (action === 'review-save') saveReview();
  });

  document.addEventListener('change', (event) => {
    if (!inReview()) return;
    const target = event.target as HTMLInputElement;
    const draft = reviewDraft();
    if (target.dataset.reviewSelect) {
      if (target.checked) draft.selected.add(target.dataset.reviewSelect);
      else draft.selected.delete(target.dataset.reviewSelect);
      render();
    } else if (target.hasAttribute('data-review-all')) {
      const late = weekReview(store.data, draft.week).late.map((t) => t.id);
      draft.selected = new Set(target.checked ? late : []);
      render();
    } else if (target.dataset.reviewPriority) {
      const id = target.dataset.reviewPriority;
      draft.priorities = target.checked
        ? [...draft.priorities, id].slice(0, 3)
        : draft.priorities.filter((p) => p !== id);
      render();
    }
  });

  document.addEventListener('input', (event) => {
    if (!inReview()) return;
    const target = event.target as HTMLTextAreaElement;
    if (target.id === 'review-wins') reviewDraft().wins = target.value;
    if (target.id === 'review-adjust') reviewDraft().adjust = target.value;
  });

  // A new priority becomes a task without a date, so it shows up in the inbox and in Hoje.
  document.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    if (form.id !== 'review-new-priority') return;
    event.preventDefault();
    const input = maybe<HTMLInputElement>('#review-priority-title');
    const title = input?.value.trim();
    const draft = reviewDraft();
    if (!title || draft.priorities.length >= 3) return;
    const task = blankTask({ title, priority: 'high' });
    store.data.tasks.push(task);
    if (!save()) {
      store.data.tasks.pop();
      return;
    }
    draft.priorities.push(task.id);
    render();
    maybe<HTMLInputElement>('#review-priority-title')?.focus();
    toast('Prioridade criada como tarefa.');
  });
}
