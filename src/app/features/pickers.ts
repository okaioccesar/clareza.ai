/**
 * Themed replacements for native <select> and <input type="date">.
 * The native element stays in the DOM (hidden) as the source of truth, so forms and
 * change events keep working; the picker only mirrors and updates it.
 */
import { dateKey, fromKey } from '../../core/dates.ts';

function closeOthers(current: HTMLDetailsElement) {
  document.querySelectorAll<HTMLDetailsElement>('.picker[open]').forEach((other) => {
    if (other !== current) other.open = false;
  });
}

function wire(picker: HTMLDetailsElement, trigger: HTMLElement) {
  picker.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && picker.open) {
      event.preventDefault();
      event.stopPropagation();
      picker.open = false;
      trigger.focus();
    }
  });
  picker.addEventListener('focusout', (event) => {
    if (!picker.contains(event.relatedTarget as Node)) picker.open = false;
  });
}

function labelOf(control: HTMLSelectElement | HTMLInputElement, fallback: string) {
  const label = control.labels?.[0];
  const text = label
    ? [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())?.textContent?.trim()
    : '';
  return control.getAttribute('aria-label') || text || control.name || fallback;
}

function enhanceSelect(select: HTMLSelectElement) {
  select.dataset.enhanced = 'true';
  const name = labelOf(select, 'Selecionar');
  const picker = document.createElement('details');
  picker.className = 'picker ' + [...select.classList].filter((c) => c !== 'select').join(' ');
  const trigger = document.createElement('summary');
  const label = document.createElement('span');
  const arrow = document.createElement('span');
  arrow.className = 'picker-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  trigger.append(label, arrow);
  const menu = document.createElement('div');
  menu.className = 'picker-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', name);

  const sync = () => {
    label.textContent = select.selectedOptions[0]?.textContent || '';
    trigger.setAttribute('aria-label', `${name}: ${label.textContent}`);
    menu
      .querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === select.value)));
  };

  for (const option of select.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = option.disabled;
    button.textContent = option.textContent;
    button.dataset.value = option.value;
    button.addEventListener('click', () => {
      select.value = option.value;
      sync();
      picker.open = false;
      trigger.focus();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    menu.append(button);
  }

  select.before(picker);
  select.hidden = true;
  picker.append(trigger, menu, select);
  select.addEventListener('change', sync);
  picker.addEventListener('toggle', () => picker.open && closeOthers(picker));
  picker.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    picker.open = true;
    const buttons = [...menu.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : index < 0 && event.key === 'ArrowUp'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });
  wire(picker, trigger);
  sync();
}

const WEEK_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function enhanceDate(input: HTMLInputElement) {
  input.dataset.calendar = 'true';
  const name = labelOf(input, 'Prazo');
  const picker = document.createElement('details');
  picker.className = 'picker date-picker';
  const trigger = document.createElement('summary');
  const panel = document.createElement('div');
  panel.className = 'picker-menu calendar';
  let month = new Date();

  const sync = () => {
    trigger.textContent = input.value
      ? fromKey(input.value)
          .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
          .replace(' de ', ' ')
      : 'Sem prazo';
    trigger.setAttribute('aria-label', `${name}: ${trigger.textContent}`);
  };
  const choose = (value: string) => {
    input.value = value;
    input.setCustomValidity('');
    sync();
    picker.open = false;
    trigger.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const button = (text: string, label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  };

  function draw() {
    panel.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'calendar-heading';
    const title = document.createElement('strong');
    const label = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    title.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const move = (offset: number) => {
      month.setMonth(month.getMonth() + offset);
      draw();
      panel.querySelector<HTMLButtonElement>(offset < 0 ? 'button' : '.calendar-heading button:last-child')?.focus();
    };
    heading.append(
      button('‹', 'Mês anterior', () => move(-1)),
      title,
      button('›', 'Próximo mês', () => move(1)),
    );

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    for (const letter of WEEK_LETTERS) {
      const cell = document.createElement('span');
      cell.textContent = letter;
      cell.setAttribute('aria-hidden', 'true');
      grid.append(cell);
    }
    for (let i = 0; i < month.getDay(); i++) grid.append(document.createElement('span'));
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const today = dateKey();
    for (let day = 1; day <= days; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
      const value = dateKey(date);
      const b = button(String(day), date.toLocaleDateString('pt-BR', { dateStyle: 'full' }), () => choose(value));
      b.dataset.date = value;
      b.setAttribute('aria-pressed', String(value === input.value));
      if (value === today) b.setAttribute('aria-current', 'date');
      b.disabled = (!!input.min && value < input.min) || (!!input.max && value > input.max);
      grid.append(b);
    }
    grid.addEventListener('keydown', (event) => {
      const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
      if (!offset) return;
      const buttons = [...grid.querySelectorAll('button')];
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      buttons[Math.max(0, Math.min(buttons.length - 1, index + offset))]?.focus();
    });

    const footer = document.createElement('div');
    footer.className = 'calendar-footer';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    footer.append(
      button('Sem prazo', 'Remover prazo', () => choose('')),
      button('Hoje', 'Selecionar hoje', () => choose(dateKey())),
      button('Amanhã', 'Selecionar amanhã', () => choose(dateKey(tomorrow))),
    );
    panel.append(heading, grid, footer);
  }

  input.before(picker);
  input.hidden = true;
  picker.append(trigger, panel, input);
  sync();
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  picker.addEventListener('toggle', () => {
    if (!picker.open) return;
    month = input.value ? fromKey(input.value) : new Date();
    month.setDate(1);
    draw();
    closeOthers(picker);
  });
  wire(picker, trigger);
}

export function enhance(root: ParentNode = document) {
  root.querySelectorAll<HTMLSelectElement>('select:not([data-enhanced])').forEach(enhanceSelect);
  root.querySelectorAll<HTMLInputElement>('input[type="date"]:not([data-calendar])').forEach(enhanceDate);
}

export function setupPickers() {
  document.addEventListener('click', (event) => {
    document.querySelectorAll<HTMLDetailsElement>('.picker[open]').forEach((picker) => {
      if (!picker.contains(event.target as Node)) picker.open = false;
    });
  });
  new MutationObserver(() => enhance()).observe(document.body, { childList: true, subtree: true });
  enhance();
}
