/** Small DOM helpers shared by every module. */

export function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento não encontrado: ${selector}`);
  return element;
}

export function maybe<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function all<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for use inside HTML templates. Every user value must pass through this. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char]!);
}

/** Tagged template that escapes interpolations unless they are wrapped with `raw()`. */
export class Raw {
  readonly html: string;
  constructor(html: string) {
    this.html = html;
  }
  toString() {
    return this.html;
  }
}
export const raw = (html: string) => new Raw(html);

type Part = string | number | boolean | null | undefined | Raw | Part[];

function render(part: Part): string {
  if (part === null || part === undefined || part === false) return '';
  if (part instanceof Raw) return part.html;
  if (Array.isArray(part)) return part.map(render).join('');
  return esc(part);
}

export function html(strings: TemplateStringsArray, ...values: Part[]): Raw {
  let out = strings[0]!;
  values.forEach((value, index) => (out += render(value) + strings[index + 1]));
  return new Raw(out);
}

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Downloads `data` as a pretty-printed JSON file. */
export function downloadJSON(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
