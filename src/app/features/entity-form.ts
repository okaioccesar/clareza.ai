/** One dialog to create and edit tasks, projects, pages and areas. */
import { COLORS, REPEATS, STATUSES } from '../../core/model.ts';
import type { Area, Block, Page, Project, Status, Subtask, Task } from '../../core/model.ts';
import { dateKey, isDateKey, isTime } from '../../core/dates.ts';
import { blankTask, changeStatus, newId } from '../../core/workspace.ts';
import { $, html, maybe, type Raw } from '../dom.ts';
import { hydrateIcons, icon } from '../icons.ts';
import { find, store } from '../store.ts';
import { ui } from '../ui.ts';
import { toast } from '../toast.ts';
import { COLOR_LABEL, REPEAT_LABEL, STATUS_LABEL } from '../format.ts';
import { commit, navigate } from '../render.ts';

export type Kind = 'task' | 'project' | 'page' | 'area';
type Entity = Task | Project | Page | Area;

export interface Defaults {
  title?: string;
  notes?: string;
  date?: string;
  status?: Status;
  color?: string;
  projectId?: string;
  areaId?: string;
  blocks?: Block[];
}

let editing: { kind: Kind; id: string; defaults: Defaults } | null = null;
let subtasks: Subtask[] = [];

const NAMES: Record<Kind, [eyebrow: string, noun: string, article: 'Novo' | 'Nova']> = {
  task: ['Tarefa', 'tarefa', 'Nova'],
  project: ['Projeto', 'projeto', 'Novo'],
  page: ['Página', 'página', 'Nova'],
  area: ['Área da vida', 'área', 'Nova'],
};

const form = () => $<HTMLFormElement>('#entity-form');
type Fields = HTMLFormControlsCollection & Record<string, HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>;
const fields = () => form().elements as Fields;

const options = (items: readonly string[], labels: Record<string, string>, selected: string) =>
  items.map((key) => html`<option value="${key}" ${key === selected ? 'selected' : ''}>${labels[key]}</option>`);

function projectOptions(selected: string): Raw {
  return html`<option value="">Sem projeto</option>
    ${store.data.projects
      .filter((p) => !p.archived || p.id === selected)
      .map((p) => html`<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.title}</option>`)}`;
}

function areaOptions(selected: string, inherited: boolean): Raw {
  return html`<option value="">${inherited ? 'Usar a área do projeto' : 'Sem área'}</option>
    ${store.data.areas.map(
      (a) => html`<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${a.title}</option>`,
    )}`;
}

const contextArea = () => (ui.route.view === 'area' ? ui.route.id : '');
const contextProject = () => (ui.route.view === 'project' ? ui.route.id : '');

function taskFields(task: Task | undefined, d: Defaults): Raw {
  const date = task?.date ?? d.date ?? (ui.route.view === 'today' ? dateKey() : '');
  return html` <label class="field"
      >O que precisa ser feito?<input
        class="input"
        name="title"
        required
        maxlength="200"
        value="${task?.title ?? d.title ?? ''}"
        placeholder="Ex.: revisar a proposta"
    /></label>
    <div class="fields two">
      <div class="field">
        <span>Prazo</span>
        <div class="date-row">
          <input class="input" name="date" type="date" aria-label="Prazo" value="${date}" /><button
            type="button"
            class="text-button"
            data-clear-date
            aria-pressed="${!date}"
          >
            Sem prazo
          </button>
        </div>
      </div>
      <label class="field"
        >Horário <span class="optional">para lembrete</span
        ><input class="input" name="time" type="time" value="${task?.time ?? ''}" ${date ? '' : 'disabled'}
      /></label>
    </div>
    <div class="fields two">
      <label class="field"
        >Prioridade<select class="select" name="priority">
          <option value="normal">Normal</option>
          <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>Alta</option>
        </select></label
      >
      <label class="field"
        >Status<select class="select" name="status">
          ${options(STATUSES, STATUS_LABEL, task?.status ?? d.status ?? 'todo')}
        </select></label
      >
    </div>
    <div class="fields two">
      <label class="field"
        >Projeto<select class="select" name="projectId">
          ${projectOptions(task?.projectId ?? d.projectId ?? contextProject())}
        </select></label
      >
      <label class="field"
        >Área da vida<select class="select" name="areaId">
          ${areaOptions(task?.areaId ?? d.areaId ?? contextArea(), true)}
        </select></label
      >
    </div>
    <label class="field"
      >Notas <span class="optional">opcional</span
      ><textarea class="input" name="notes" rows="3" maxlength="2000">${task?.notes ?? d.notes ?? ''}</textarea>
    </label>
    <label class="check-label"
      ><input class="check small" name="pinned" type="checkbox" ${task?.pinned ? 'checked' : ''} />Fixar em Hoje</label
    >
    <details class="details" ${subtasks.length || (task && task.repeat !== 'none') ? 'open' : ''}>
      <summary>
        Passos e repetição${subtasks.length ? html` <span class="count">${subtasks.length}</span>` : ''}
      </summary>
      <label class="field"
        >Repetir<select class="select" name="repeat">
          ${options(REPEATS, REPEAT_LABEL, task?.repeat ?? 'none')}</select
        ><small class="muted"
          >Ao concluir, a próxima ocorrência é criada com os passos desmarcados. Requer um prazo.</small
        ></label
      >
      <div class="field">
        <span>Passos desta tarefa</span>
        <div id="subtask-editor" class="subtasks"></div>
        <div class="subtask-add">
          <input
            class="input"
            id="new-subtask"
            aria-label="Novo passo"
            placeholder="Adicionar um passo…"
            maxlength="200"
          /><button type="button" class="button secondary" data-action="add-subtask">${icon('plus')}Adicionar</button>
        </div>
      </div>
    </details>`;
}

function projectFields(project: Project | undefined): Raw {
  return html` <label class="field"
      >Título<input
        class="input"
        name="title"
        required
        maxlength="200"
        value="${project?.title ?? ''}"
        placeholder="Ex.: reforma do escritório"
    /></label>
    <label class="field"
      >Descrição <span class="optional">opcional</span
      ><textarea class="input" name="description" rows="3" maxlength="2000">${project?.description ?? ''}</textarea>
    </label>
    <div class="fields two">
      <label class="field"
        >Cor<select class="select" name="color">
          ${options(COLORS, COLOR_LABEL, project?.color ?? 'blue')}
        </select></label
      >
      <label class="field"
        >Área da vida<select class="select" name="areaId">
          ${areaOptions(project?.areaId ?? contextArea(), false)}
        </select></label
      >
    </div>
    ${project ? html`<label class="check-label"><input class="check small" type="checkbox" name="archived" ${project.archived ? 'checked' : ''} />Arquivar projeto</label>` : ''}`;
}

function pageFields(page: Page | undefined, d: Defaults): Raw {
  return html` <label class="field"
      >Título<input
        class="input"
        name="title"
        required
        maxlength="200"
        value="${page?.title ?? d.title ?? ''}"
        placeholder="Ex.: ideias para o próximo mês"
    /></label>
    <div class="fields two">
      <label class="field"
        >Projeto<select class="select" name="projectId">
          ${projectOptions(page?.projectId ?? contextProject())}
        </select></label
      >
      <label class="field"
        >Área da vida<select class="select" name="areaId">
          ${areaOptions(page?.areaId ?? contextArea(), true)}
        </select></label
      >
    </div>
    <label class="check-label"
      ><input class="check small" name="favorite" type="checkbox" ${page?.favorite ? 'checked' : ''} />Favoritar na
      barra lateral</label
    >`;
}

function areaFields(area: Area | undefined, d: Defaults): Raw {
  return html` <label class="field"
      >Título<input
        class="input"
        name="title"
        required
        maxlength="200"
        placeholder="Ex.: Estudos"
        value="${area?.title ?? d.title ?? ''}"
    /></label>
    <label class="field"
      >Descrição <span class="optional">opcional</span
      ><textarea class="input" name="description" rows="2" maxlength="2000">${area?.description ?? ''}</textarea>
    </label>
    <label class="field"
      >Cor<select class="select" name="color">
        ${options(COLORS, COLOR_LABEL, area?.color ?? d.color ?? 'blue')}
      </select></label
    >
    <p class="small muted">Uma área reúne tarefas, projetos e páginas de uma parte da sua vida.</p>`;
}

export function openEntity(kind: Kind, entity?: Entity | null, defaults: Defaults = {}) {
  editing = { kind, id: entity?.id ?? '', defaults };
  const [eyebrow, noun, article] = NAMES[kind];
  $('#entity-kind').textContent = eyebrow;
  $('#entity-title').textContent = entity ? `Editar ${noun}` : `${article} ${noun}`;
  $('#entity-delete').hidden = !entity;
  subtasks = kind === 'task' ? structuredClone((entity as Task | undefined)?.subtasks ?? []) : [];

  const body =
    kind === 'task'
      ? taskFields(entity as Task | undefined, defaults)
      : kind === 'project'
        ? projectFields(entity as Project | undefined)
        : kind === 'page'
          ? pageFields(entity as Page | undefined, defaults)
          : areaFields(entity as Area | undefined, defaults);
  const container = $('#entity-fields');
  container.innerHTML = body.html;
  hydrateIcons(container);
  renderSubtasks();
  const dialog = $<HTMLDialogElement>('#entity-dialog');
  if (!dialog.open) dialog.showModal();
  fields().title!.focus();
}

function renderSubtasks() {
  const holder = maybe('#subtask-editor');
  if (!holder) return;
  holder.innerHTML = subtasks
    .map(
      (s, i) =>
        html`<div class="subtask-row">
          <input
            type="checkbox"
            class="check small"
            aria-label="Concluir passo ${i + 1}"
            data-subtask-done="${s.id}"
            ${s.done ? 'checked' : ''}
          />
          <input
            type="text"
            class="input bare"
            aria-label="Passo ${i + 1}"
            data-subtask-title="${s.id}"
            value="${s.title}"
            maxlength="200"
          />
          <button
            type="button"
            class="icon-button small"
            aria-label="Remover passo ${i + 1}"
            data-action="remove-subtask"
            data-id="${s.id}"
          >
            ${icon('x')}
          </button>
        </div>`,
    )
    .join('');
}

function addSubtask() {
  const input = maybe<HTMLInputElement>('#new-subtask');
  const title = input?.value.trim();
  if (!input || !title) return;
  if (subtasks.length >= 200) return toast('Limite de 200 passos por tarefa.');
  subtasks.push({ id: newId(), title, done: false });
  input.value = '';
  renderSubtasks();
  input.focus();
}

function invalid(field: HTMLInputElement, message: string) {
  field.setCustomValidity(message);
  field.reportValidity();
}

function submit() {
  if (!editing) return;
  const v = fields();
  const title = v.title!.value.trim();
  if (!title) return invalid(v.title!, 'Escreva um título.');
  const { kind, id, defaults } = editing;
  const data = store.data;
  const now = new Date().toISOString();
  let created: Entity | null = null;

  if (kind === 'task') {
    const date = v.date!.value;
    const time = date ? v.time!.value : '';
    if (date && !isDateKey(date)) return invalid(v.date!, 'Escolha uma data válida.');
    if (time && !isTime(time)) return invalid(v.time!, 'Escolha um horário válido.');
    if (v.repeat!.value !== 'none' && !date) return invalid(v.date!, 'Defina o prazo para repetir esta tarefa.');
    addSubtask();
    let task = find.task(id);
    if (!task) {
      task = blankTask({ title });
      data.tasks.push(task);
      created = task;
    }
    const scheduleChanged = task.date !== date || task.repeat !== v.repeat!.value;
    Object.assign(task, {
      title,
      notes: v.notes!.value.trim(),
      date,
      time,
      priority: v.priority!.value === 'high' ? 'high' : 'normal',
      projectId: v.projectId!.value,
      areaId: v.areaId!.value,
      pinned: v.pinned!.checked,
      repeat: date ? v.repeat!.value : 'none',
      repeatDay: scheduleChanged || !task.repeatDay ? Number(date.slice(-2)) || 1 : task.repeatDay,
      subtasks: subtasks.map((s) => ({ ...s, title: s.title.trim() })).filter((s) => s.title),
    });
    changeStatus(data.tasks, task, v.status!.value as Status);
  } else if (kind === 'project') {
    let project = find.project(id);
    if (!project) {
      project = { id: newId(), title, description: '', color: 'blue', archived: false, areaId: '' };
      data.projects.push(project);
      created = project;
    }
    Object.assign(project, {
      title,
      description: v.description!.value.trim(),
      color: v.color!.value,
      archived: !!v.archived?.checked,
      areaId: v.areaId!.value,
    });
  } else if (kind === 'page') {
    let page = find.page(id);
    if (!page) {
      page = {
        id: newId(),
        title,
        areaId: '',
        projectId: '',
        favorite: false,
        updatedAt: now,
        blocks: defaults.blocks ?? [{ id: newId(), type: 'text', text: '', checked: false }],
      };
      data.pages.push(page);
      created = page;
    }
    Object.assign(page, {
      title,
      projectId: v.projectId!.value,
      areaId: v.areaId!.value,
      favorite: v.favorite!.checked,
      updatedAt: now,
    });
  } else {
    let area = find.area(id);
    if (!area) {
      area = { id: newId(), title, description: '', color: 'blue' };
      data.areas.push(area);
      created = area;
    }
    Object.assign(area, { title, description: v.description!.value.trim(), color: v.color!.value });
  }

  $<HTMLDialogElement>('#entity-dialog').close();
  const message = id
    ? 'Alterações salvas.'
    : `${NAMES[kind][1][0]!.toUpperCase() + NAMES[kind][1].slice(1)} ${NAMES[kind][2] === 'Nova' ? 'criada' : 'criado'}.`;
  commit(message);
  if (created && kind === 'page') navigate('page', created.id);
  if (created && kind === 'area') {
    ui.areaTab = 'tasks';
    navigate('area', created.id);
  }
}

function remove() {
  if (!editing) return;
  const { kind, id } = editing;
  const data = store.data;
  const list: Entity[] =
    kind === 'task' ? data.tasks : kind === 'project' ? data.projects : kind === 'page' ? data.pages : data.areas;
  const index = list.findIndex((x) => x.id === id);
  if (index < 0) return;
  const [removed] = list.splice(index, 1);
  // Unlink (never delete) tasks and pages that belonged to a removed project or area.
  const unlinked: { entity: { projectId?: string; areaId?: string }; field: 'projectId' | 'areaId' }[] = [];
  const field = kind === 'project' ? 'projectId' : kind === 'area' ? 'areaId' : null;
  if (field)
    for (const entity of [...data.tasks, ...data.pages, ...(field === 'areaId' ? data.projects : [])] as {
      projectId?: string;
      areaId?: string;
    }[])
      if (entity[field] === id) {
        unlinked.push({ entity, field });
        entity[field] = '';
      }

  $<HTMLDialogElement>('#entity-dialog').close();
  if (ui.route.id === id)
    navigate(kind === 'task' ? 'all' : kind === 'page' ? 'pages' : kind === 'project' ? 'projects' : 'space');
  const message = field ? 'Excluído. Tarefas e páginas foram preservadas.' : 'Excluído.';
  commit(message, () => {
    list.splice(index, 0, removed!);
    unlinked.forEach(({ entity, field }) => (entity[field] = id));
    commit('Restaurado.');
  });
}

export function setupEntityForm() {
  const element = form();
  element.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  $('#entity-delete').addEventListener('click', remove);
  element.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    target.setCustomValidity?.('');
    if (target.name === 'date' || target.name === 'repeat') {
      const v = fields();
      v.date?.setCustomValidity('');
      if (v.time) v.time.disabled = !v.date?.value;
      maybe('[data-clear-date]', element)?.setAttribute('aria-pressed', String(!v.date?.value));
    }
    if (target.dataset.subtaskTitle) {
      const step = subtasks.find((s) => s.id === target.dataset.subtaskTitle);
      if (step) step.title = target.value;
    }
  });
  element.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === 'date') target.dispatchEvent(new Event('input', { bubbles: true }));
    if (target.dataset.subtaskDone) {
      const step = subtasks.find((s) => s.id === target.dataset.subtaskDone);
      if (step) step.done = target.checked;
    }
  });
  element.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).id === 'new-subtask' && event.key === 'Enter') {
      event.preventDefault();
      addSubtask();
    }
  });
  element.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-clear-date]')) {
      const date = fields().date!;
      date.value = '';
      date.dispatchEvent(new Event('input', { bubbles: true }));
      date.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const action = target.closest<HTMLElement>('[data-action]');
    if (action?.dataset.action === 'add-subtask') addSubtask();
    if (action?.dataset.action === 'remove-subtask') {
      subtasks = subtasks.filter((s) => s.id !== action.dataset.id);
      renderSubtasks();
    }
  });
}
