/** Task lists, the kanban board, filters and quick capture. */
import type { Task } from '../../core/model.ts';
import { STATUSES } from '../../core/model.ts';
import { dateKey } from '../../core/dates.ts';
import { compareTasks } from '../../core/day.ts';
import { effectiveArea } from '../../core/workspace.ts';
import { html, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { find, store } from '../store.ts';
import { ui } from '../ui.ts';
import { REPEAT_LABEL, STATUS_LABEL, dateLabel } from '../format.ts';
import { colorDot, emptyState } from './common.ts';

/** Project (or, when absent, area) label shown next to a task. */
export function contextLabel(task: { projectId: string; areaId: string }): Raw | '' {
  const project = find.project(task.projectId);
  if (project) return html`<span class="tag">${colorDot(project.color)}${project.title}</span>`;
  const area = find.area(effectiveArea(store.data, task));
  return area ? html`<span class="tag">${colorDot(area.color)}${area.title}</span>` : '';
}

function dueLabel(task: Task): Raw | '' {
  if (!task.date) return '';
  const late = !task.done && task.date < dateKey();
  return html`<span class="due ${late ? 'late' : ''}"
    >${task.time ? icon('clock') : icon('calendar')}${dateLabel(task.date)}${task.time ? ' · ' + task.time : ''}</span
  >`;
}

function badges(task: Task): Raw {
  const doneSteps = task.subtasks.filter((s) => s.done).length;
  return html`${task.subtasks.length ? html`<span class="meta-badge" title="Subtarefas concluídas">${icon('check')}${doneSteps}/${task.subtasks.length}</span>` : ''}${
    task.repeat !== 'none'
      ? html`<span class="meta-badge" title="${REPEAT_LABEL[task.repeat]}">${icon('repeat')}</span>`
      : ''
  }${task.notes ? html`<span class="meta-badge" title="Tem notas">${icon('file')}</span>` : ''}`;
}

export function taskRow(task: Task): Raw {
  const high = task.priority === 'high';
  return html`<div
    class="task-row ${task.done ? 'done' : ''}"
    data-task-row="${task.id}"
    draggable="true"
    data-drag-task="${task.id}"
  >
    <input
      type="checkbox"
      class="check"
      data-action="toggle-task"
      data-id="${task.id}"
      aria-label="${task.done ? 'Reabrir' : 'Concluir'} ${task.title}"
      ${task.done ? 'checked' : ''}
    />
    <div class="task-main">
      <button type="button" class="task-title" data-action="edit-task" data-id="${task.id}">${task.title}</button>
      <div class="task-meta">${dueLabel(task)}${contextLabel(task)}${badges(task)}</div>
    </div>
    <div class="task-actions">
      ${high ? html`<span class="priority" title="Alta prioridade">${icon('flag')}<span class="sr-only">Alta prioridade</span></span>` : ''}
      <button
        type="button"
        class="icon-button small pin ${task.pinned ? 'active' : ''}"
        data-action="pin-task"
        data-id="${task.id}"
        aria-pressed="${task.pinned}"
        aria-label="${task.pinned ? 'Desafixar' : 'Fixar'} tarefa"
        title="${task.pinned ? 'Desafixar de Hoje' : 'Fixar em Hoje'}"
      >
        ${icon('pin')}
      </button>
      <button
        type="button"
        class="icon-button small"
        data-action="edit-task"
        data-id="${task.id}"
        aria-label="Editar ${task.title}"
      >
        ${icon('more')}
      </button>
    </div>
  </div>`;
}

export function taskList(tasks: Task[], empty?: Raw): Raw {
  if (!tasks.length)
    return (
      empty ??
      emptyState('Nenhuma tarefa por aqui.', 'Crie uma tarefa ou ajuste os filtros.', {
        action: 'new-task',
        label: 'Nova tarefa',
      })
    );
  return html`<div class="task-list">${tasks.map(taskRow)}</div>`;
}

export function board(tasks: Task[]): Raw {
  return html`<div class="board">
    ${STATUSES.map((status) => {
      const column = tasks.filter((t) => t.status === status);
      return html`<section class="board-column" data-drop-status="${status}">
        <div class="column-heading">
          <i class="status-dot ${status}"></i>
          <h3>${STATUS_LABEL[status]}</h3>
          <span class="count">${column.length}</span>
          <button
            type="button"
            class="icon-button small"
            data-action="new-task"
            data-status="${status}"
            aria-label="Adicionar em ${STATUS_LABEL[status]}"
          >
            ${icon('plus')}
          </button>
        </div>
        ${column.length ? column.map(card) : html`<p class="column-empty">Arraste uma tarefa para cá.</p>`}
      </section>`;
    })}
  </div>`;
}

function card(task: Task): Raw {
  return html`<article class="card" draggable="true" data-drag-task="${task.id}">
    <button type="button" class="card-title" data-action="edit-task" data-id="${task.id}">${task.title}</button>
    ${task.notes ? html`<p>${task.notes.slice(0, 90)}</p>` : ''}
    <div class="task-meta">
      ${dueLabel(task)}${contextLabel(task)}${task.priority === 'high' ? html`<span class="priority">${icon('flag')}Alta</span>` : ''}
    </div>
    <select class="select compact" aria-label="Status de ${task.title}" data-change="status" data-id="${task.id}">
      ${STATUSES.map(
        (s) => html`<option value="${s}" ${task.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`,
      )}
    </select>
  </article>`;
}

/** Applies the toolbar filters (status, project, text) and the standard sort. */
export function filterTasks(tasks: Task[], status = ui.status): Task[] {
  const query = ui.query.toLocaleLowerCase('pt-BR');
  return tasks
    .filter((t) => status === 'all' || (status === 'done' ? t.done : !t.done))
    .filter((t) => !ui.projectFilter || t.projectId === ui.projectFilter)
    .filter(
      (t) =>
        !query ||
        `${t.title} ${t.notes} ${find.project(t.projectId)?.title || ''}`.toLocaleLowerCase('pt-BR').includes(query),
    )
    .sort(compareTasks);
}

export function toolbar(showProjectFilter = true): Raw {
  return html`<div class="toolbar">
    <div class="segmented" role="group" aria-label="Modo de exibição">
      <button type="button" data-action="set-mode" data-mode="list" aria-pressed="${ui.mode === 'list'}">
        ${icon('list')}Lista
      </button>
      <button type="button" data-action="set-mode" data-mode="board" aria-pressed="${ui.mode === 'board'}">
        ${icon('board')}Quadro
      </button>
    </div>
    <div class="filters">
      <select class="select" aria-label="Filtrar por status" data-change="filter-status">
        <option value="open" ${ui.status === 'open' ? 'selected' : ''}>Em aberto</option>
        <option value="all" ${ui.status === 'all' ? 'selected' : ''}>Todos os status</option>
        <option value="done" ${ui.status === 'done' ? 'selected' : ''}>Concluídas</option>
      </select>
      ${
        showProjectFilter
          ? html`<select class="select" aria-label="Filtrar por projeto" data-change="filter-project">
              <option value="">Todos os projetos</option>
              ${store.data.projects.map(
                (p) => html`<option value="${p.id}" ${ui.projectFilter === p.id ? 'selected' : ''}>${p.title}</option>`,
              )}
            </select>`
          : ''
      }
      <label class="search-field"
        >${icon('search')}<input
          id="task-search"
          type="search"
          placeholder="Buscar"
          aria-label="Buscar tarefas"
          value="${ui.query}"
      /></label>
    </div>
  </div>`;
}

export function taskResults(tasks: Task[]): Raw {
  const list = filterTasks(tasks);
  return ui.mode === 'board' ? board(filterTasks(tasks, 'all')) : taskList(list);
}

/** Toolbar + quick capture + results, used by task, project and area views. */
export function taskSection(tasks: Task[], showProjectFilter = true): Raw {
  return html`${toolbar(showProjectFilter)}${quickCapture()}
    <div id="task-results">${taskResults(tasks)}</div>`;
}

const drafts = new Map<string, { title: string; date: string }>();
export const draftKey = () => ui.route.view + '/' + ui.route.id;
export const captureDrafts = drafts;

export function quickCapture(defaultDate = ui.route.view === 'today' ? dateKey() : ''): Raw {
  const draft = drafts.get(draftKey()) ?? { title: '', date: defaultDate };
  return html`<form class="capture" id="quick-task-form" aria-label="Adicionar tarefa rapidamente" autocomplete="off">
    <span class="capture-icon" aria-hidden="true">${icon('plus')}</span>
    <label class="sr-only" for="quick-task-title">Título da nova tarefa</label>
    <input
      id="quick-task-title"
      name="title"
      required
      maxlength="200"
      placeholder="Adicionar tarefa…"
      value="${draft.title}"
    />
    <label class="capture-date"
      ><span class="sr-only">Prazo da nova tarefa</span
      ><input id="quick-task-date" name="date" type="date" value="${draft.date}"
    /></label>
    <button type="submit" class="capture-submit" aria-label="Adicionar tarefa" title="Adicionar (Enter)">
      ${icon('arrow')}
    </button>
  </form>`;
}
