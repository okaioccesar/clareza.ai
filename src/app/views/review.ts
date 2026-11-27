/** "Revisão da semana": wins, late tasks, reflection and next week's three priorities. */
import { dateKey } from '../../core/dates.ts';
import type { Task } from '../../core/model.ts';
import { reviewWeekStart, weekReview } from '../../core/review.ts';
import { html, plural, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { find, store } from '../store.ts';
import { dateLabel, rangeLabel } from '../format.ts';
import { colorDot, pageHeading } from '../components/common.ts';
import { contextLabel } from '../components/tasks.ts';

export interface ReviewDraft {
  week: string;
  wins: string;
  adjust: string;
  priorities: string[];
  selected: Set<string>;
}

let draft: ReviewDraft | null = null;

/** The draft for the week under review, created from the saved review when there is one. */
export function reviewDraft(): ReviewDraft {
  const week = reviewWeekStart(dateKey());
  if (draft?.week !== week) {
    const saved = store.data.reviews[week];
    draft = {
      week,
      wins: saved?.wins ?? '',
      adjust: saved?.adjust ?? '',
      priorities: [...(saved?.priorities ?? [])],
      selected: new Set(),
    };
  }
  // Drop selections for tasks that were completed or deleted meanwhile.
  draft.priorities = draft.priorities.filter((id) => find.task(id) && !find.task(id)!.done);
  return draft;
}

export function resetReviewDraft() {
  draft = null;
}

/** Open tasks offered as candidates for next week's priorities. */
export function candidates(): Task[] {
  const chosen = reviewDraft().priorities;
  const open = store.data.tasks
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        Number(chosen.includes(b.id)) - Number(chosen.includes(a.id)) ||
        Number(b.priority === 'high') - Number(a.priority === 'high') ||
        Number(b.pinned) - Number(a.pinned) ||
        (a.date || '9999').localeCompare(b.date || '9999'),
    );
  return open.slice(0, Math.max(12, chosen.length));
}

function step(number: number, title: string, description: string, body: Raw): Raw {
  return html`<section class="panel review-step">
    <div class="step-heading">
      <span class="step-number">${number}</span>
      <div>
        <h2>${title}</h2>
        <p class="small muted">${description}</p>
      </div>
    </div>
    ${body}
  </section>`;
}

export function reviewView(): Raw {
  const state = reviewDraft();
  const today = dateKey();
  const review = weekReview(store.data, state.week, today);
  const saved = store.data.reviews[state.week];
  const shown = review.completed.slice(-8).reverse();

  const wins = review.completed.length
    ? html`<div class="review-stat">
          <strong>${review.completed.length}</strong
          ><span>${review.completed.length === 1 ? 'tarefa concluída' : 'tarefas concluídas'}</span>
        </div>
        ${
          review.byArea.length > 1 || review.byArea[0]?.areaId
            ? html`<div class="chips">
                ${review.byArea.map(({ areaId, count }) => {
                  const area = find.area(areaId);
                  return html`<span class="chip static"
                    >${area ? colorDot(area.color) : ''}${area?.title ?? 'Sem área'} · ${count}</span
                  >`;
                })}
              </div>`
            : ''
        }
        <ul class="done-list">
          ${shown.map((t) => html`<li>${icon('check')}<span>${t.title}</span></li>`)}
        </ul>
        ${review.completed.length > shown.length ? html`<p class="small muted">e mais ${review.completed.length - shown.length}.</p>` : ''}`
    : html`<p class="muted">
        Nenhuma tarefa concluída nesta semana ainda. Tudo bem: a revisão também serve para recomeçar.
      </p>`;

  const late = review.late.length
    ? html`<div class="review-late">
        <label class="select-all"
          ><input
            type="checkbox"
            class="check small"
            data-review-all
            ${state.selected.size === review.late.length ? 'checked' : ''}
          />Selecionar todas (${review.late.length})</label
        >
        <div class="task-list compact">
          ${review.late.map(
            (t) =>
              html`<label class="review-item"
                ><input
                  type="checkbox"
                  class="check small"
                  data-review-select="${t.id}"
                  ${state.selected.has(t.id) ? 'checked' : ''}
                />
                <span class="task-main"
                  ><span class="task-title">${t.title}</span
                  ><span class="task-meta"
                    ><span class="due late">${icon('calendar')}${dateLabel(t.date)}</span>${contextLabel(t)}</span
                  ></span
                ></label
              >`,
          )}
        </div>
        <div class="bulk-bar">
          <span class="small muted" id="review-selected"
            >${plural(state.selected.size, 'selecionada', 'selecionadas')}</span
          >
          <select class="select" id="review-target" aria-label="Novo prazo">
            <option value="today">Para hoje</option>
            <option value="tomorrow">Para amanhã</option>
            <option value="next-monday">Para a próxima segunda</option>
            <option value="none">Sem prazo</option>
          </select>
          <button
            type="button"
            class="button secondary"
            data-action="review-reschedule"
            ${state.selected.size ? '' : 'disabled'}
          >
            Reagendar
          </button>
        </div>
      </div>`
    : html`<p class="muted">${icon('check')} Nenhuma tarefa atrasada. Seus prazos estão em dia.</p>`;

  const reflection = html`<div class="fields two">
    <label class="field"
      >O que funcionou?<textarea
        class="input"
        id="review-wins"
        rows="3"
        maxlength="5000"
        placeholder="Algo que deu certo e vale repetir…"
      >
${state.wins}</textarea>
    </label>
    <label class="field"
      >O que quero ajustar?<textarea
        class="input"
        id="review-adjust"
        rows="3"
        maxlength="5000"
        placeholder="Um ajuste pequeno para a próxima semana…"
      >
${state.adjust}</textarea>
    </label>
  </div>`;

  const priorities = html`<p class="small muted" id="review-priority-count">
      ${state.priorities.length} de 3 escolhidas
    </p>
    <div class="task-list compact">
      ${candidates().map((t) => {
        const chosen = state.priorities.includes(t.id);
        return html`<label class="review-item ${chosen ? 'chosen' : ''}"
          ><input
            type="checkbox"
            class="check small"
            data-review-priority="${t.id}"
            ${chosen ? 'checked' : ''}
            ${!chosen && state.priorities.length >= 3 ? 'disabled' : ''}
          />
          <span class="task-main"
            ><span class="task-title">${t.title}</span
            ><span class="task-meta"
              >${t.date ? html`<span class="due">${icon('calendar')}${dateLabel(t.date)}</span>` : ''}${contextLabel(t)}</span
            ></span
          ></label
        >`;
      })}
    </div>
    <form class="capture" id="review-new-priority">
      <span class="capture-icon" aria-hidden="true">${icon('plus')}</span
      ><label class="sr-only" for="review-priority-title">Nova prioridade</label
      ><input
        id="review-priority-title"
        maxlength="200"
        placeholder="Ou escreva uma nova prioridade…"
        ${state.priorities.length >= 3 ? 'disabled' : ''}
      /><button type="submit" class="capture-submit" aria-label="Adicionar prioridade">${icon('arrow')}</button>
    </form>`;

  return html`${pageHeading('Revisão · ' + rangeLabel(review.start, review.end), 'Feche a semana com clareza.', 'Quatro passos rápidos: reconhecer, reorganizar, refletir e escolher.')}
    <div class="review">
      ${step(1, 'O que você concluiu', 'Reconheça o que andou.', wins)}
      ${step(2, 'O que ficou para trás', 'Escolha um novo prazo para o que ainda importa.', late)}
      ${step(3, 'Reflexão', 'Duas perguntas, respostas curtas.', reflection)}
      ${step(4, 'Três prioridades', 'O que mais importa na próxima semana? Elas aparecem em Hoje.', priorities)}
      <div class="review-footer">
        <span class="small muted"
          >${saved?.savedAt ? 'Salva em ' + new Date(saved.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '.' : 'Ainda não salva.'}</span
        >
        <button type="button" class="button primary" data-action="review-save">
          ${icon('check')}${saved?.savedAt ? 'Atualizar revisão' : 'Concluir revisão'}
        </button>
      </div>
    </div>`;
}
