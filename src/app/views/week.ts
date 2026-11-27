/** "Semana": tasks laid out by day, with drag and drop between days. */
import { dateKey, weekDates } from '../../core/dates.ts';
import type { Task } from '../../core/model.ts';
import { isReviewDue } from '../../core/review.ts';
import { html, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { ui } from '../ui.ts';
import { rangeLabel, weekday, dateLabel } from '../format.ts';
import { button, pageHeading, sectionHeading } from '../components/common.ts';
import { contextLabel } from '../components/tasks.ts';

function weekTask(task: Task): Raw {
  return html`<article
    class="week-task ${task.done ? 'done' : ''} ${task.priority === 'high' ? 'high' : ''}"
    draggable="true"
    data-drag-task="${task.id}"
  >
    <input
      type="checkbox"
      class="check small"
      data-action="toggle-task"
      data-id="${task.id}"
      aria-label="${task.done ? 'Reabrir' : 'Concluir'} ${task.title}"
      ${task.done ? 'checked' : ''}
    />
    <div>
      <button type="button" data-action="edit-task" data-id="${task.id}">${task.title}</button>
      <div class="task-meta">
        ${task.time ? html`<span class="due">${icon('clock')}${task.time}</span>` : ''}${contextLabel(task)}
      </div>
    </div>
  </article>`;
}

export function weekView(): Raw {
  const data = store.data;
  const dates = weekDates(ui.weekOffset);
  const today = dateKey();
  const byTime = (a: Task, b: Task) =>
    Number(a.done) - Number(b.done) || (a.time || '99').localeCompare(b.time || '99');
  const unscheduled = data.tasks.filter((t) => !t.date && !t.done);

  return html`${pageHeading(
      'Visão da semana',
      'Faça espaço na agenda.',
      'Distribua as tarefas nos dias. Arraste para mudar o prazo.',
      html`${ui.weekOffset === 0 || isReviewDue(data) ? button('Revisar semana', 'nav-review', 'secondary', 'sparkle') : ''}${button('Nova tarefa', 'new-task', 'primary', 'plus')}`,
    )}
    <div class="week-controls">
      <button type="button" class="icon-button" data-action="week-prev" aria-label="Semana anterior">
        ${icon('left')}
      </button>
      <strong>${rangeLabel(dates[0]!, dates[6]!)}</strong>
      <button type="button" class="icon-button" data-action="week-next" aria-label="Próxima semana">
        ${icon('chevron')}
      </button>
      ${ui.weekOffset !== 0 ? html`<button type="button" class="button ghost" data-action="week-current">Esta semana</button>` : ''}
    </div>
    <div class="week-board">
      ${dates.map((date) => {
        const tasks = data.tasks.filter((t) => t.date === date).sort(byTime);
        return html`<section
          class="day-column ${date === today ? 'today' : ''} ${date === ui.selectedDay ? 'selected' : ''} ${date < today ? 'past' : ''}"
          data-drop-date="${date}"
          aria-label="${dateLabel(date)}"
        >
          <div class="day-heading">
            <span>${weekday(date)}</span
            ><strong>${Number(date.slice(-2))}</strong
            >${tasks.length ? html`<span class="count">${tasks.filter((t) => !t.done).length}</span>` : ''}
          </div>
          ${tasks.map(weekTask)}
          <button
            type="button"
            class="day-add"
            data-action="new-task"
            data-date="${date}"
            aria-label="Adicionar tarefa em ${dateLabel(date)}"
          >
            ${icon('plus')}Adicionar
          </button>
        </section>`;
      })}
    </div>
    ${sectionHeading('Sem data', html`<span class="small muted">Arraste para um dia para definir o prazo.</span>`, unscheduled.length)}
    <div class="unscheduled" data-drop-date="">
      ${unscheduled.length ? unscheduled.map(weekTask) : html`<p class="muted">Nenhuma tarefa sem prazo.</p>`}
    </div>`;
}
