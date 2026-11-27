/** "Hoje": the day at a glance, quick capture and the daily notes. */
import { dateKey, weekDates } from '../../core/dates.ts';
import { dayTasks, summary, type DayFilter } from '../../core/day.ts';
import { isReviewDue, weekPriorities } from '../../core/review.ts';
import { html, plural, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { ui } from '../ui.ts';
import { greeting, longToday, weekday, dateLabel } from '../format.ts';
import { emptyState, linkButton, sectionHeading } from '../components/common.ts';
import { filterTasks, quickCapture, taskList, taskRow } from '../components/tasks.ts';
import { projectCard } from '../components/cards.ts';
import { profile } from '../session.ts';

const EMPTY: Record<DayFilter, [string, string]> = {
  today: ['Um dia livre para começar.', 'Adicione uma tarefa acima ou peça ao assistente para organizar o dia.'],
  focus: ['O que merece sua atenção?', 'Fixe uma tarefa com o alfinete para mantê-la aqui.'],
  late: ['Prazos em dia.', 'Você não tem tarefas atrasadas.'],
  done: ['Tudo que você concluir aparece aqui.', 'Cada passo conta.'],
};

function ring(percent: number): Raw {
  const circumference = 2 * Math.PI * 26;
  return html`<svg class="ring" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="26" class="ring-track" />
    <circle
      cx="32"
      cy="32"
      r="26"
      class="ring-value"
      stroke-dasharray="${circumference}"
      stroke-dashoffset="${circumference * (1 - percent / 100)}"
    />
  </svg>`;
}

function weekStrip(today: string): Raw {
  return html`<div class="week-strip" aria-label="Dias desta semana">
    ${weekDates().map((date) => {
      const busy = store.data.tasks.some((t) => t.date === date && !t.done);
      return html`<button
        type="button"
        data-action="open-day"
        data-date="${date}"
        class="${date === today ? 'current' : ''} ${date < today ? 'past' : ''}"
        ${date === today ? html`aria-current="date"` : ''}
        aria-label="Abrir ${dateLabel(date)} na semana"
      >
        <span>${weekday(date)}</span><strong>${Number(date.slice(-2))}</strong><i class="${busy ? 'busy' : ''}"></i>
      </button>`;
    })}
  </div>`;
}

function headline(stats: ReturnType<typeof summary>): string {
  if (!stats.total) return 'Nada marcado para hoje. Um bom momento para planejar.';
  const parts = [plural(stats.open, 'tarefa em aberto', 'tarefas em aberto')];
  if (stats.late) parts.push(plural(stats.late, 'atrasada', 'atrasadas'));
  if (stats.done) parts.push(plural(stats.done, 'concluída', 'concluídas'));
  return parts.join(' · ');
}

export function todayView(): Raw {
  const data = store.data;
  const today = dateKey();
  const stats = summary(data, today);
  const tasks = filterTasks(dayTasks(data, ui.dayFilter, today), ui.dayFilter === 'done' ? 'done' : 'open');
  const priorities = weekPriorities(data, today);
  const projects = data.projects.filter((p) => !p.archived).slice(0, 3);
  const name = profile.firstName;
  const filters: [DayFilter, string, number][] = [
    ['today', 'Todas', stats.open],
    ['focus', 'Fixadas', stats.focus],
    ['late', 'Atrasadas', stats.late],
    ['done', 'Concluídas', stats.done],
  ];

  return html` <header class="page-heading today-heading">
      <div>
        <p class="eyebrow">${longToday()}</p>
        <h1>${greeting()}${name ? ', ' + name : ''}.</h1>
        <p class="lead">${headline(stats)}</p>
      </div>
      <div class="heading-actions">
        <button type="button" class="button secondary" data-action="day-assistant">
          ${icon('sparkle')}Organizar meu dia
        </button>
      </div>
    </header>
    ${weekStrip(today)}
    <div class="columns">
      <div class="column-main">
        ${
          isReviewDue(data, today)
            ? html`<section class="callout">
                <span class="callout-icon">${icon('sparkle')}</span>
                <div>
                  <strong>Hora de revisar a semana</strong>
                  <p>Veja o que você concluiu, reorganize o que ficou e escolha três prioridades.</p>
                </div>
                <button type="button" class="button primary" data-action="nav" data-view="review">
                  Começar revisão
                </button>
              </section>`
            : ''
        }
        ${
          priorities.length
            ? html`<section class="panel priorities" aria-labelledby="priorities-heading">
                ${sectionHeading('Prioridades da semana', linkButton('Revisão', 'review'))}
                <div class="task-list">${priorities.map(taskRow)}</div>
              </section>`
            : ''
        }
        <section class="panel" aria-labelledby="tasks-heading">
          <div class="section-heading">
            <h2 id="tasks-heading">Na sua mesa</h2>
            ${linkButton('Todas as tarefas', 'all')}
          </div>
          <div class="tabs" role="group" aria-label="Filtrar tarefas do dia">
            ${filters.map(
              ([key, label, count]) =>
                html`<button
                  type="button"
                  data-day-filter="${key}"
                  data-focus-key="day-filter-${key}"
                  aria-pressed="${ui.dayFilter === key}"
                >
                  ${label}<span class="count">${count}</span>
                </button>`,
            )}
          </div>
          ${quickCapture()}
          <div class="day-results">
            ${taskList(tasks, emptyState(...EMPTY[ui.dayFilter], undefined, ui.dayFilter === 'done' ? 'check' : 'sun'))}
          </div>
        </section>
      </div>
      <aside class="column-side" aria-label="Apoio do dia">
        <section class="panel progress-panel">
          <div class="progress-ring">
            ${ring(stats.percent)}<span><strong>${stats.percent}</strong>%</span>
          </div>
          <div>
            <h2>Seu progresso</h2>
            <p class="small muted">
              ${stats.total ? `${stats.done} de ${stats.total} tarefas de hoje concluídas.` : 'Seu progresso aparece conforme você conclui tarefas.'}
            </p>
          </div>
          <div
            role="progressbar"
            class="sr-only"
            aria-label="Progresso de hoje"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${stats.percent}"
          ></div>
        </section>
        <section class="panel note-panel">
          <label for="daily-note"
            ><h2>Intenção do dia</h2>
            <span class="small muted">O que faria hoje valer a pena?</span></label
          >
          <textarea id="daily-note" class="note" maxlength="5000" placeholder="Hoje, quero dar atenção a…">
${data.daily[today] || ''}</textarea>
        </section>
        <section class="panel note-panel">
          <label for="scratch"
            ><h2>Rascunho</h2>
            <span class="small muted">Tire da cabeça. Organize depois.</span></label
          >
          <textarea id="scratch" class="note" maxlength="20000" placeholder="Uma ideia, um lembrete, qualquer coisa…">
${data.scratch}</textarea>
          <div class="button-row">
            <button type="button" class="text-button" data-action="scratch-task">Virar tarefa${icon('arrow')}</button
            ><button type="button" class="text-button" data-action="scratch-page">Virar página${icon('arrow')}</button>
          </div>
        </section>
        <section class="panel">
          ${sectionHeading('Projetos', linkButton('Ver todos', 'projects'))}
          ${
            projects.length
              ? html`<div class="mini-projects">${projects.map(projectCard)}</div>`
              : html`<button type="button" class="tile tile-new" data-action="new-project">
                  ${icon('plus')}<span class="tile-title">Comece um projeto</span
                  ><span class="tile-text">Reúna tarefas e notas em torno de um objetivo.</span>
                </button>`
          }
        </section>
      </aside>
    </div>`;
}
