/** Cards for areas, projects and pages. */
import type { Area, Page, Project } from '../../core/model.ts';
import { dateKey } from '../../core/dates.ts';
import { effectiveArea } from '../../core/workspace.ts';
import { html, plural, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { find, store } from '../store.ts';
import { dateLabel } from '../format.ts';
import { colorDot } from './common.ts';

export function projectCard(project: Project): Raw {
  const tasks = store.data.tasks.filter((t) => t.projectId === project.id);
  const done = tasks.filter((t) => t.done).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const area = find.area(project.areaId);
  return html`<button
    type="button"
    class="tile project-tile ${project.color}"
    data-action="nav"
    data-view="project"
    data-id="${project.id}"
  >
    <span class="tile-top"
      ><span class="tile-icon">${icon('folder')}</span>${area ? html`<span class="tag">${area.title}</span>` : ''}</span
    >
    <span class="tile-title">${project.title}</span>
    <span class="tile-text">${project.description || 'Um espaço para reunir os próximos passos.'}</span>
    <span class="progress-label"><span>${done}/${tasks.length} tarefas</span><span>${percent}%</span></span>
    <span class="progress" aria-hidden="true"><i style="width:${percent}%"></i></span>
  </button>`;
}

export function newProjectTile(): Raw {
  return html`<button type="button" class="tile tile-new" data-action="new-project">
    ${icon('plus')}<span class="tile-title">Novo projeto</span
    ><span class="tile-text">Reúna tarefas e notas em torno de um objetivo.</span>
  </button>`;
}

export function areaCard(area: Area): Raw {
  const data = store.data;
  const tasks = data.tasks.filter((t) => !t.done && effectiveArea(data, t) === area.id).length;
  const projects = data.projects.filter((p) => p.areaId === area.id && !p.archived).length;
  const pages = data.pages.filter((p) => effectiveArea(data, p) === area.id).length;
  return html`<button
    type="button"
    class="tile area-tile ${area.color}"
    data-action="nav"
    data-view="area"
    data-id="${area.id}"
  >
    <span class="tile-top"><span class="tile-icon">${colorDot(area.color)}</span>${icon('arrow')}</span>
    <span class="tile-title">${area.title}</span>
    <span class="tile-text">${area.description || 'Tarefas, projetos e ideias desta parte da vida.'}</span>
    <span class="tile-stats"
      ><span>${plural(tasks, 'tarefa', 'tarefas')}</span><span>${plural(projects, 'projeto', 'projetos')}</span
      ><span>${plural(pages, 'página', 'páginas')}</span></span
    >
  </button>`;
}

export function pageCard(page: Page): Raw {
  const preview = page.blocks
    .filter((b) => b.type !== 'divider')
    .map((b) => b.text)
    .join(' ')
    .slice(0, 140);
  const project = find.project(page.projectId);
  const area = !project ? find.area(effectiveArea(store.data, page)) : undefined;
  return html`<article class="tile page-tile">
    <span class="tile-top"
      ><span class="tile-icon">${icon('file')}</span>
      <button
        type="button"
        class="icon-button small star ${page.favorite ? 'active' : ''}"
        data-action="favorite-page"
        data-id="${page.id}"
        aria-pressed="${page.favorite}"
        aria-label="${page.favorite ? 'Desfavoritar' : 'Favoritar'} ${page.title}"
      >
        ${icon('star')}
      </button></span
    >
    <button type="button" class="tile-title" data-action="nav" data-view="page" data-id="${page.id}">
      ${page.title}
    </button>
    <p class="tile-text">${preview || 'Uma página em branco. Tudo pode começar aqui.'}</p>
    <span class="tile-footer"
      >${project ? html`<span class="tag">${colorDot(project.color)}${project.title}</span>` : area ? html`<span class="tag">${colorDot(area.color)}${area.title}</span>` : html`<span></span>`}<span
        class="small muted"
        >${page.updatedAt ? dateLabel(dateKey(new Date(page.updatedAt))) : ''}</span
      ></span
    >
  </article>`;
}
