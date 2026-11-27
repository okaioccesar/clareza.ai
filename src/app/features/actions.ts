/** Event delegation for everything rendered inside the views and the sidebar. */
import type { BlockType, Status } from '../../core/model.ts';
import { dateKey } from '../../core/dates.ts';
import { createTask } from '../../core/day.ts';
import { changeStatus, effectiveArea, newId } from '../../core/workspace.ts';
import { $, all, maybe } from '../dom.ts';
import { autosave, find, save, store } from '../store.ts';
import { toast } from '../toast.ts';
import { saveViewPreference, ui, type Mode, type StatusFilter, type Tab } from '../ui.ts';
import { dateLabel } from '../format.ts';
import { commit, navigate, render, renderNav, resizeBlocks, updateTaskResults } from '../render.ts';
import { captureDrafts, draftKey, taskResults } from '../components/tasks.ts';
import { openEntity } from './entity-form.ts';
import { openAssistant } from './assistant.ts';

/** Tasks shown by the current list view, used when filters change. */
function currentTasks() {
  const data = store.data;
  if (ui.route.view === 'project') return data.tasks.filter((t) => t.projectId === ui.route.id);
  if (ui.route.view === 'area') return data.tasks.filter((t) => effectiveArea(data, t) === ui.route.id);
  return data.tasks;
}

const WEEK_TEMPLATE: [BlockType, string][] = [
  ['heading', 'O que importa nesta semana?'],
  ['text', ''],
  ['heading', 'Três prioridades'],
  ['check', ''],
  ['check', ''],
  ['check', ''],
  ['heading', 'Compromissos e espaço livre'],
  ['text', ''],
  ['heading', 'Revisão'],
  ['quote', 'O que funcionou? O que quero ajustar?'],
];

function scratchTitle() {
  return store.data.scratch.trim().split('\n')[0]!.slice(0, 200);
}

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const close = target.closest<HTMLElement>('[data-close]');
  if (close) {
    close.closest('dialog')?.close();
    return;
  }

  const filter = target.closest<HTMLElement>('[data-day-filter]');
  if (filter) {
    ui.dayFilter = filter.dataset.dayFilter as typeof ui.dayFilter;
    render();
    return;
  }

  const button = target.closest<HTMLElement>('[data-action]');
  if (!button || button.closest('#entity-form')) return;
  const { action = '', id = '' } = button.dataset;
  const data = store.data;
  const task = find.task(id);
  const page = find.page(ui.route.id);

  switch (action) {
    case 'nav':
      ui.projectFilter = '';
      navigate(button.dataset.view!, id);
      break;
    case 'nav-projects':
      ui.spaceTab = 'projects';
      navigate('space');
      break;
    case 'nav-pages':
      ui.spaceTab = 'pages';
      navigate('space');
      break;
    case 'nav-space':
      navigate('space');
      break;
    case 'nav-review':
      navigate('review');
      break;
    case 'new-task':
      openEntity('task', null, { date: button.dataset.date, status: button.dataset.status as Status | undefined });
      break;
    case 'edit-task':
      if (task) openEntity('task', task);
      break;
    case 'pin-task':
      if (task) {
        task.pinned = !task.pinned;
        commit(task.pinned ? 'Tarefa fixada em Hoje.' : 'Tarefa desafixada.');
      }
      break;
    case 'new-project':
      openEntity('project');
      break;
    case 'edit-project':
      openEntity('project', find.project(id));
      break;
    case 'new-page':
      openEntity('page');
      break;
    case 'edit-page':
      openEntity('page', find.page(id));
      break;
    case 'new-area':
      openEntity('area');
      break;
    case 'edit-area':
      openEntity('area', find.area(id));
      break;
    case 'suggest-area':
      openEntity('area', null, { title: button.dataset.title, color: button.dataset.color });
      break;
    case 'favorite-page': {
      const target = find.page(id);
      if (target) {
        target.favorite = !target.favorite;
        commit(target.favorite ? 'Página favoritada.' : 'Página removida dos favoritos.');
      }
      break;
    }
    case 'set-mode':
      ui.mode = button.dataset.mode as Mode;
      saveViewPreference();
      render();
      break;
    case 'space-tab':
      ui.spaceTab = button.dataset.tab as Tab;
      render();
      break;
    case 'area-tab':
      ui.areaTab = button.dataset.tab as Tab;
      render();
      break;
    case 'week-prev':
    case 'week-next':
      ui.weekOffset += action === 'week-prev' ? -1 : 1;
      render();
      break;
    case 'week-current':
      ui.weekOffset = 0;
      ui.selectedDay = dateKey();
      render();
      break;
    case 'open-day':
      ui.selectedDay = button.dataset.date!;
      ui.weekOffset = 0;
      navigate('week');
      break;
    case 'day-assistant':
      openAssistant('Organize meu dia');
      break;
    case 'scratch-task':
    case 'scratch-page':
      if (!data.scratch.trim()) return toast('Escreva uma ideia no rascunho primeiro.');
      if (action === 'scratch-task')
        openEntity('task', null, { title: scratchTitle(), notes: data.scratch.slice(0, 2000), date: '' });
      else
        openEntity('page', null, {
          title: scratchTitle(),
          blocks: [{ id: newId(), type: 'text', text: data.scratch, checked: false }],
        });
      break;
    case 'template-page': {
      const created = {
        id: newId(),
        title: 'Planejamento da semana',
        areaId: '',
        projectId: '',
        favorite: false,
        updatedAt: new Date().toISOString(),
        blocks: WEEK_TEMPLATE.map(([type, text]) => ({ id: newId(), type, text, checked: false })),
      };
      data.pages.push(created);
      save();
      navigate('page', created.id);
      break;
    }
    case 'block-add':
      if (page) {
        const block = { id: newId(), type: button.dataset.type as BlockType, text: '', checked: false };
        page.blocks.push(block);
        page.updatedAt = new Date().toISOString();
        commit();
        all<HTMLTextAreaElement>('[data-block-input]')
          .find((x) => x.dataset.blockInput === block.id)
          ?.focus();
      }
      break;
    case 'block-up':
    case 'block-down':
    case 'block-delete': {
      if (!page) break;
      const index = page.blocks.findIndex((b) => b.id === id);
      if (index < 0) break;
      page.updatedAt = new Date().toISOString();
      if (action === 'block-delete') {
        const [removed] = page.blocks.splice(index, 1);
        commit('Bloco excluído.', () => {
          page.blocks.splice(index, 0, removed!);
          commit('Bloco restaurado.');
        });
      } else {
        const destination = action === 'block-up' ? index - 1 : index + 1;
        if (destination < 0 || destination >= page.blocks.length) break;
        [page.blocks[index], page.blocks[destination]] = [page.blocks[destination]!, page.blocks[index]!];
        commit();
      }
      break;
    }
  }
}

function onChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.closest('#entity-form, #settings-dialog')) return;
  const data = store.data;

  if (target.dataset.action === 'toggle-task') {
    const task = find.task(target.dataset.id);
    if (!task) return;
    const next = changeStatus(data.tasks, task, target.checked ? 'done' : 'todo');
    commit(
      task.done
        ? next
          ? `Concluída. Próxima em ${dateLabel(next.date).toLocaleLowerCase('pt-BR')}.`
          : 'Tarefa concluída.'
        : 'Tarefa reaberta.',
    );
  } else if (target.dataset.change === 'status') {
    const task = find.task(target.dataset.id);
    if (task) {
      changeStatus(data.tasks, task, target.value as Status);
      commit('Status atualizado.');
    }
  } else if (target.dataset.change === 'filter-status') {
    ui.status = target.value as StatusFilter;
    saveViewPreference();
    updateTaskResults(() => taskResults(currentTasks()));
  } else if (target.dataset.change === 'filter-project') {
    ui.projectFilter = target.value;
    updateTaskResults(() => taskResults(currentTasks()));
  } else if (target.dataset.blockCheck) {
    const page = find.page(ui.route.id);
    const block = page?.blocks.find((b) => b.id === target.dataset.blockCheck);
    if (!page || !block) return;
    block.checked = target.checked;
    page.updatedAt = new Date().toISOString();
    save();
    target.closest('.page-block')?.querySelector('textarea')?.classList.toggle('checked', block.checked);
  }
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const data = store.data;
  if (target.id === 'daily-note') {
    data.daily[dateKey()] = target.value;
    autosave();
  } else if (target.id === 'scratch') {
    data.scratch = target.value;
    autosave();
  } else if (target.id === 'task-search') {
    ui.query = target.value;
    updateTaskResults(() => taskResults(currentTasks()));
  } else if (target.id === 'page-title') {
    const page = find.page(ui.route.id);
    if (!page) return;
    page.title = target.value;
    page.updatedAt = new Date().toISOString();
    $('#breadcrumb').textContent = target.value;
    renderNav();
    autosave();
  } else if (target.dataset.blockInput) {
    const page = find.page(ui.route.id);
    const block = page?.blocks.find((b) => b.id === target.dataset.blockInput);
    if (!page || !block) return;
    block.text = target.value;
    page.updatedAt = new Date().toISOString();
    resizeBlocks(target.parentElement!);
    autosave();
  } else if (target.closest('#quick-task-form')) {
    target.setCustomValidity('');
    const form = target.closest('form') as HTMLFormElement;
    const elements = form.elements as unknown as Record<string, HTMLInputElement>;
    captureDrafts.set(draftKey(), { title: elements.title!.value, date: elements.date!.value });
  }
}

/** Quick capture: Enter adds the task with undo. */
function onSubmit(event: SubmitEvent) {
  const form = event.target as HTMLFormElement;
  if (form.id !== 'quick-task-form') return;
  event.preventDefault();
  const elements = form.elements as unknown as Record<string, HTMLInputElement>;
  const data = store.data;
  try {
    const task = createTask(
      {
        title: elements.title!.value,
        date: elements.date!.value,
        areaId: ui.route.view === 'area' ? ui.route.id : '',
        projectId: ui.route.view === 'project' ? ui.route.id : '',
      },
      data,
    );
    data.tasks.push(task);
    if (!save()) {
      data.tasks.splice(data.tasks.indexOf(task), 1);
      return;
    }
    const snapshot = JSON.stringify(task);
    captureDrafts.delete(draftKey());
    if (ui.route.view === 'today') ui.dayFilter = 'today';
    render();
    maybe('#quick-task-title')?.focus();
    toast(
      task.date ? `Tarefa criada para ${dateLabel(task.date).toLocaleLowerCase('pt-BR')}.` : 'Tarefa criada sem prazo.',
      () => {
        const current = find.task(task.id);
        if (!current) return;
        if (JSON.stringify(current) !== snapshot)
          return toast('A tarefa foi alterada. Abra os detalhes para ajustá-la.');
        const index = store.data.tasks.indexOf(current);
        store.data.tasks.splice(index, 1);
        if (!save()) {
          store.data.tasks.splice(index, 0, current);
          return;
        }
        render();
        toast('Tarefa removida.');
      },
    );
  } catch (error) {
    elements.title!.setCustomValidity((error as Error).message);
    elements.title!.reportValidity();
  }
}

// ——— Drag and drop between board columns and week days ———
let dragged = '';
const DROP = '[data-drop-status],[data-drop-date]';

function setupDragAndDrop() {
  document.addEventListener('dragstart', (event) => {
    const card = (event.target as HTMLElement).closest?.<HTMLElement>('[data-drag-task]');
    if (!card || !event.dataTransfer) return;
    dragged = card.dataset.dragTask!;
    event.dataTransfer.setData('text/plain', dragged);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  document.addEventListener('dragover', (event) => {
    const zone = (event.target as HTMLElement).closest?.(DROP);
    if (!zone || !dragged) return;
    event.preventDefault();
    zone.classList.add('drag-over');
  });
  document.addEventListener('dragleave', (event) => {
    const zone = (event.target as HTMLElement).closest?.(DROP);
    if (zone && !zone.contains(event.relatedTarget as Node)) zone.classList.remove('drag-over');
  });
  document.addEventListener('drop', (event) => {
    const zone = (event.target as HTMLElement).closest?.<HTMLElement>(DROP);
    if (!zone || !dragged) return;
    event.preventDefault();
    const task = find.task(dragged);
    dragged = '';
    if (!task) return;
    if (zone.dataset.dropStatus) changeStatus(store.data.tasks, task, zone.dataset.dropStatus as Status);
    if (zone.dataset.dropDate !== undefined) {
      task.date = zone.dataset.dropDate;
      if (!task.date) {
        task.time = '';
        task.repeat = 'none';
      } else task.repeatDay = Number(task.date.slice(-2));
    }
    commit('Tarefa movida.');
  });
  document.addEventListener('dragend', () => {
    dragged = '';
    document.querySelectorAll('.drag-over, .dragging').forEach((el) => el.classList.remove('drag-over', 'dragging'));
  });
}

export function setupActions() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  setupDragAndDrop();
}
