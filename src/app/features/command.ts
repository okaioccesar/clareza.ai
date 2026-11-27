/** Global search and quick actions (Ctrl K or /). */
import { $, all, html, isTyping, maybe, type Raw } from '../dom.ts';
import { hydrateIcons, icon, type IconName } from '../icons.ts';
import { find, store } from '../store.ts';
import { navigate } from '../render.ts';
import { openEntity, type Kind } from './entity-form.ts';

interface Result {
  kind: string;
  symbol: IconName;
  title: string;
  content: string;
  id: string;
  view: string;
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

const CREATE: [Kind, string, IconName][] = [
  ['task', 'Nova tarefa', 'list'],
  ['project', 'Novo projeto', 'folder'],
  ['page', 'Nova página', 'file'],
  ['area', 'Nova área', 'target'],
];

const GO: [string, string, IconName][] = [
  ['today', 'Ir para Hoje', 'sun'],
  ['week', 'Ir para Semana', 'calendar'],
  ['review', 'Revisão da semana', 'sparkle'],
];

function results(query: string): Result[] {
  const data = store.data;
  const q = fold(query.trim());
  const items: Result[] = [
    ...data.tasks.map((t) => ({
      kind: t.done ? 'Concluída' : 'Tarefa',
      symbol: 'list' as const,
      title: t.title,
      content: t.notes,
      id: t.id,
      view: 'task',
    })),
    ...data.projects.map((p) => ({
      kind: 'Projeto',
      symbol: 'folder' as const,
      title: p.title,
      content: p.description,
      id: p.id,
      view: 'project',
    })),
    ...data.pages.map((p) => ({
      kind: 'Página',
      symbol: 'file' as const,
      title: p.title,
      content: p.blocks.map((b) => b.text).join(' '),
      id: p.id,
      view: 'page',
    })),
    ...data.areas.map((a) => ({
      kind: 'Área',
      symbol: 'target' as const,
      title: a.title,
      content: a.description,
      id: a.id,
      view: 'area',
    })),
  ];
  return items.filter((x) => fold(x.title + ' ' + x.content).includes(q)).slice(0, 20);
}

function renderResults() {
  const query = $<HTMLInputElement>('#command-input').value;
  const found = query.trim() ? results(query) : [];
  const groups: Raw[] = [];
  if (!query.trim()) {
    groups.push(
      html`<div class="command-group">Criar</div>
        ${CREATE.map(
          ([kind, label, symbol]) =>
            html`<button type="button" data-command-new="${kind}">
              ${icon(symbol)}<span>${label}</span>${icon('plus')}
            </button>`,
        )}`,
    );
    groups.push(
      html`<div class="command-group">Ir para</div>
        ${GO.map(
          ([view, label, symbol]) =>
            html`<button type="button" data-command-view="${view}">
              ${icon(symbol)}<span>${label}</span>${icon('arrow')}
            </button>`,
        )}`,
    );
  } else if (found.length) {
    groups.push(
      html`<div class="command-group">Resultados</div>
        ${found.map(
          (x) =>
            html`<button type="button" data-command-view="${x.view}" data-id="${x.id}">
              ${icon(x.symbol)}<span>${x.title}</span><small>${x.kind}</small>
            </button>`,
        )}`,
    );
  } else groups.push(html`<p class="command-empty">Nenhum resultado. Experimente outra palavra.</p>`);
  const container = $('#command-results');
  container.innerHTML = groups.join('');
  hydrateIcons(container);
}

export function openCommand() {
  if (maybe('dialog[open]')) return;
  const input = $<HTMLInputElement>('#command-input');
  input.value = '';
  renderResults();
  $<HTMLDialogElement>('#command-dialog').showModal();
  input.focus();
}

function choose(button: HTMLElement) {
  $<HTMLDialogElement>('#command-dialog').close();
  const { commandNew, commandView, id = '' } = button.dataset;
  if (commandNew) openEntity(commandNew as Kind);
  else if (commandView === 'task') openEntity('task', find.task(id));
  else if (commandView) navigate(commandView, id);
}

export function setupCommand() {
  $('#command-open').addEventListener('click', openCommand);
  $('#command-input').addEventListener('input', renderResults);
  $('#command-results').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (button) choose(button);
  });
  // Arrow keys move through results; Enter opens the first one when typing.
  $('#command-dialog').addEventListener('keydown', (event) => {
    const buttons = all('#command-results button');
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      (next < 0 ? $('#command-input') : buttons[Math.min(next, buttons.length - 1)])?.focus();
    } else if (event.key === 'Enter' && (event.target as HTMLElement).id === 'command-input' && buttons[0]) {
      event.preventDefault();
      choose(buttons[0]);
    }
  });

  document.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommand();
    } else if (modifier && event.key === 'Enter' && !maybe('dialog[open]')) {
      event.preventDefault();
      openEntity('task');
    } else if (!isTyping(event.target) && event.key === '/' && !maybe('dialog[open]')) {
      event.preventDefault();
      openCommand();
    }
  });
}
