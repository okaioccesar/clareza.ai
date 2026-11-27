/** A single status message at the bottom of the screen, optionally with "Desfazer". */
import { $ } from './dom.ts';

let timer: ReturnType<typeof setTimeout> | undefined;
let undo: (() => void) | null = null;

export function toast(message: string, onUndo?: () => void) {
  clearTimeout(timer);
  undo = onUndo ?? null;
  const element = $('#toast');
  $('span', element).textContent = message;
  $('button', element).hidden = !onUndo;
  element.hidden = false;
  timer = setTimeout(() => (element.hidden = true), onUndo ? 10_000 : 4_500);
}

export function setupToast() {
  $('#toast button').addEventListener('click', () => {
    const action = undo;
    undo = null;
    $('#toast').hidden = true;
    action?.();
  });
}
