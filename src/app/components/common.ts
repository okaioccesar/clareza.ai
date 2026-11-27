/** Building blocks shared by several views. */
import { html, type Raw } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';

export function button(
  label: string,
  action: string,
  style: 'primary' | 'secondary' | 'ghost' = 'secondary',
  symbol?: IconName,
): Raw {
  return html`<button type="button" class="button ${style}" data-action="${action}">
    ${symbol ? icon(symbol) : ''}${label}
  </button>`;
}

export function pageHeading(eyebrow: string, title: string, description: string, actions: Raw | string = ''): Raw {
  return html`<header class="page-heading">
    <div>
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      ${description ? html`<p class="lead">${description}</p>` : ''}
    </div>
    <div class="heading-actions">${actions}</div>
  </header>`;
}

export function emptyState(
  title: string,
  text: string,
  action?: { action: string; label: string },
  symbol: IconName = 'inbox',
): Raw {
  return html`<div class="empty">
    <span class="empty-icon">${icon(symbol)}</span>
    <h3>${title}</h3>
    <p>${text}</p>
    ${action ? button(action.label, action.action, 'secondary', 'plus') : ''}
  </div>`;
}

export function sectionHeading(title: string, extra: Raw | string = '', count?: number): Raw {
  return html`<div class="section-heading">
    <h2>${title}${count !== undefined ? html` <span class="count">${count}</span>` : ''}</h2>
    ${extra}
  </div>`;
}

export function linkButton(label: string, view: string, id = ''): Raw {
  return html`<button type="button" class="text-button" data-action="nav" data-view="${view}" data-id="${id}">
    ${label}${icon('arrow')}
  </button>`;
}

export function tabs(items: [key: string, label: string, count?: number][], current: string, action: string): Raw {
  return html`<div class="tabs" role="group">
    ${items.map(
      ([key, label, count]) =>
        html`<button type="button" data-action="${action}" data-tab="${key}" aria-pressed="${key === current}">
          ${label}${count !== undefined ? html`<span class="count">${count}</span>` : ''}
        </button>`,
    )}
  </div>`;
}

export const colorDot = (color: string) => html`<i class="dot ${color}" aria-hidden="true"></i>`;
