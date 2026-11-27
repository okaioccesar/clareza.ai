/** A notebook page made of simple blocks. */
import type { Block, BlockType } from '../../core/model.ts';
import { html, type Raw } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { find } from '../store.ts';
import { ui } from '../ui.ts';
import { emptyState } from '../components/common.ts';
import { contextLabel } from '../components/tasks.ts';

export const BLOCKS: Record<BlockType, [label: string, symbol: IconName, placeholder: string]> = {
  text: ['Texto', 'text', 'Escreva aqui…'],
  heading: ['Título', 'heading', 'Título da seção'],
  check: ['Checklist', 'check', 'Um item para lembrar'],
  quote: ['Citação', 'quote', 'Uma ideia para destacar'],
  divider: ['Divisor', 'minus', ''],
};

function block(b: Block, index: number, total: number): Raw {
  const [label, , placeholder] = BLOCKS[b.type];
  return html`<div class="page-block ${b.type}">
    <div class="block-tools">
      <button
        type="button"
        class="icon-button small"
        data-action="block-up"
        data-id="${b.id}"
        aria-label="Mover bloco ${index + 1} para cima"
        ${index === 0 ? 'disabled' : ''}
      >
        ${icon('up')}
      </button>
      <button
        type="button"
        class="icon-button small"
        data-action="block-down"
        data-id="${b.id}"
        aria-label="Mover bloco ${index + 1} para baixo"
        ${index === total - 1 ? 'disabled' : ''}
      >
        ${icon('down')}
      </button>
      <button
        type="button"
        class="icon-button small"
        data-action="block-delete"
        data-id="${b.id}"
        aria-label="Excluir bloco ${index + 1}"
      >
        ${icon('trash')}
      </button>
    </div>
    ${b.type === 'check' ? html`<input type="checkbox" class="check small" data-block-check="${b.id}" aria-label="Marcar item ${index + 1}" ${b.checked ? 'checked' : ''} />` : ''}
    ${
      b.type === 'divider'
        ? html`<hr />`
        : html`<textarea
            class="block-input ${b.checked ? 'checked' : ''}"
            data-block-input="${b.id}"
            aria-label="${label} do bloco ${index + 1}"
            placeholder="${placeholder}"
            maxlength="20000"
            rows="1"
          >
${b.text}</textarea>`
    }
  </div>`;
}

export function pageView(): Raw {
  const page = find.page(ui.route.id);
  if (!page)
    return emptyState('Página não encontrada.', 'Escolha outra página no seu caderno.', {
      action: 'nav-pages',
      label: 'Abrir páginas',
    });
  return html`<div class="document-top">
      <button type="button" class="text-button" data-action="nav-pages">${icon('left')}Páginas</button>
      <div class="button-row">
        <button
          type="button"
          class="button ghost ${page.favorite ? 'active' : ''}"
          data-action="favorite-page"
          data-id="${page.id}"
          aria-pressed="${page.favorite}"
        >
          ${icon('star')}${page.favorite ? 'Favorita' : 'Favoritar'}
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label="Editar detalhes da página"
          data-action="edit-page"
          data-id="${page.id}"
        >
          ${icon('more')}
        </button>
      </div>
    </div>
    <article class="document">
      <input
        id="page-title"
        class="document-title"
        aria-label="Título da página"
        value="${page.title}"
        maxlength="200"
      />
      <div class="document-meta">
        ${contextLabel(page) || html`<span>Página pessoal</span>`}<span>Salvamento automático</span>
      </div>
      <div id="blocks">${page.blocks.map((b, i) => block(b, i, page.blocks.length))}</div>
      <div class="block-add" role="group" aria-label="Adicionar bloco">
        ${(Object.keys(BLOCKS) as BlockType[]).map(
          (type) =>
            html`<button type="button" class="chip" data-action="block-add" data-type="${type}">
              ${icon(BLOCKS[type][1])}${BLOCKS[type][0]}
            </button>`,
        )}
      </div>
    </article>`;
}
