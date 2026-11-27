/** Task list, inbox, "Meu espaço", areas and projects. */
import { effectiveArea, isInbox } from '../../core/workspace.ts';
import { html, plural, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { find, store } from '../store.ts';
import { ui } from '../ui.ts';
import { button, colorDot, emptyState, pageHeading, sectionHeading, tabs } from '../components/common.ts';
import { quickCapture, taskList, taskSection, filterTasks } from '../components/tasks.ts';
import { areaCard, newProjectTile, pageCard, projectCard } from '../components/cards.ts';

export function allTasksView(): Raw {
  return html`${pageHeading('Tarefas', 'Suas tarefas', 'Tudo o que está em aberto, em um só lugar.', button('Nova tarefa', 'new-task', 'primary', 'plus'))}
  ${taskSection(store.data.tasks)}`;
}

export function inboxView(): Raw {
  const tasks = filterTasks(store.data.tasks.filter(isInbox));
  return html`${pageHeading('Capturar agora, organizar depois', 'Caixa de entrada', 'Tarefas sem área, projeto ou prazo ficam aqui até você decidir o próximo passo.')}
  ${quickCapture('')}
  ${taskList(tasks, emptyState('Caixa de entrada vazia.', 'Tudo o que você capturar sem prazo aparece aqui.', undefined, 'inbox'))}`;
}

const SUGGESTED_AREAS: [string, string][] = [
  ['Rotina', 'blue'],
  ['Trabalho', 'orange'],
  ['Estudos', 'purple'],
  ['Saúde', 'green'],
  ['Metas', 'rose'],
  ['Finanças', 'green'],
  ['Viagens', 'blue'],
];

export function spaceView(): Raw {
  const data = store.data;
  const action = {
    areas: ['Nova área', 'new-area'],
    projects: ['Novo projeto', 'new-project'],
    pages: ['Nova página', 'new-page'],
  }[ui.spaceTab as 'areas' | 'projects' | 'pages'] ?? ['Nova área', 'new-area'];
  const inboxCount = data.tasks.filter(isInbox).length;

  let content: Raw;
  if (ui.spaceTab === 'projects') {
    const archived = data.projects.filter((p) => p.archived);
    content = html`<div class="grid">
        ${data.projects.filter((p) => !p.archived).map(projectCard)}${newProjectTile()}
      </div>
      ${
        archived.length
          ? html`${sectionHeading('Arquivados')}
              <div class="grid">${archived.map(projectCard)}</div>`
          : ''
      }`;
  } else if (ui.spaceTab === 'pages') {
    const pages = [...data.pages].sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt),
    );
    content = html`<div class="callout subtle">
        <span class="callout-icon">${icon('book')}</span>
        <div>
          <strong>Um roteiro para a semana</strong>
          <p>Comece com um modelo de planejamento ou uma página em branco.</p>
        </div>
        ${button('Usar modelo', 'template-page')}
      </div>
      <div class="grid">
        ${pages.length ? pages.map(pageCard) : emptyState('Um espaço para suas ideias.', 'Textos, títulos e checklists, do seu jeito.', { action: 'new-page', label: 'Nova página' }, 'book')}
      </div>`;
  } else {
    content = data.areas.length
      ? html`<div class="grid">${data.areas.map(areaCard)}</div>`
      : html`<div class="onboarding">
          <span class="empty-icon">${icon('folder')}</span>
          <h2>As partes da sua vida, cada uma no seu lugar.</h2>
          <p>Comece por uma área. Você pode adicionar outras quando precisar.</p>
          <div class="chips">
            ${SUGGESTED_AREAS.map(
              ([title, color]) =>
                html`<button
                  type="button"
                  class="chip"
                  data-action="suggest-area"
                  data-title="${title}"
                  data-color="${color}"
                >
                  ${colorDot(color)}${title}
                </button>`,
            )}
          </div>
          ${button('Criar outra área', 'new-area', 'ghost', 'plus')}
        </div>`;
  }

  return html`${pageHeading('Uma visão do todo', 'Meu espaço', 'Organize por áreas da vida, projetos e páginas.', button(action[0]!, action[1]!, 'primary', 'plus'))}
    <div class="tabs-row">
      ${tabs(
        [
          ['areas', 'Áreas', data.areas.length],
          ['projects', 'Projetos', data.projects.filter((p) => !p.archived).length],
          ['pages', 'Páginas', data.pages.length],
        ],
        ui.spaceTab,
        'space-tab',
      )}<button type="button" class="text-button" data-action="nav" data-view="inbox">
        ${icon('inbox')}Caixa de entrada<span class="count">${inboxCount}</span>
      </button>
    </div>
    ${content}`;
}

export function areaView(): Raw {
  const data = store.data;
  const area = find.area(ui.route.id);
  if (!area)
    return emptyState('Área não encontrada.', 'Abra Meu espaço para escolher outra área.', {
      action: 'nav-space',
      label: 'Meu espaço',
    });
  const tasks = data.tasks.filter((t) => effectiveArea(data, t) === area.id);
  const projects = data.projects.filter((p) => p.areaId === area.id && !p.archived);
  const pages = data.pages.filter((p) => effectiveArea(data, p) === area.id);
  const [label, action] =
    ui.areaTab === 'projects'
      ? ['Novo projeto', 'new-project']
      : ui.areaTab === 'pages'
        ? ['Nova página', 'new-page']
        : ['Nova tarefa', 'new-task'];

  const content =
    ui.areaTab === 'projects'
      ? html`<div class="grid">${projects.map(projectCard)}${newProjectTile()}</div>`
      : ui.areaTab === 'pages'
        ? html`<div class="grid">
            ${pages.length ? pages.map(pageCard) : emptyState('Espaço para guardar ideias.', 'Crie uma página para esta área.', { action: 'new-page', label: 'Nova página' }, 'book')}
          </div>`
        : taskSection(tasks);

  return html`${pageHeading(
    'Área da vida',
    area.title,
    area.description,
    html`<button type="button" class="button secondary" data-action="edit-area" data-id="${area.id}">Editar área</button
      >${button(label, action, 'primary', 'plus')}`,
  )}
  ${tabs(
    [
      ['tasks', 'Tarefas', tasks.filter((t) => !t.done).length],
      ['projects', 'Projetos', projects.length],
      ['pages', 'Páginas', pages.length],
    ],
    ui.areaTab,
    'area-tab',
  )}
  ${content}`;
}

export function projectView(): Raw {
  const data = store.data;
  const project = find.project(ui.route.id);
  if (!project)
    return emptyState('Projeto não encontrado.', 'Escolha outro projeto.', {
      action: 'nav-projects',
      label: 'Ver projetos',
    });
  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const open = tasks.filter((t) => !t.done).length;
  const pages = data.pages.filter((p) => p.projectId === project.id);
  const area = find.area(project.areaId);

  return html`${pageHeading(
      'Projeto' + (project.archived ? ' · arquivado' : '') + (area ? ' · ' + area.title : ''),
      project.title,
      project.description,
      html`<button type="button" class="button secondary" data-action="edit-project" data-id="${project.id}">
          Editar projeto</button
        >${button('Nova tarefa', 'new-task', 'primary', 'plus')}`,
    )}
    <p class="project-summary">
      ${colorDot(project.color)}<strong>${plural(open, 'tarefa em aberto', 'tarefas em aberto')}</strong
      ><span>${plural(tasks.length - open, 'concluída', 'concluídas')}</span>
    </p>
    ${taskSection(tasks, false)}
    ${sectionHeading('Páginas do projeto', button('Nova página', 'new-page', 'ghost', 'plus'))}
    <div class="grid">
      ${pages.length ? pages.map(pageCard) : html`<p class="muted">Guarde decisões, ideias e referências em uma página deste projeto.</p>`}
    </div>`;
}
