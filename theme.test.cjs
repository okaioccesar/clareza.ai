const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function setup(t, { stored, systemDark = false, storageUnavailable = false } = {}) {
  const dom = new JSDOM('<meta name="theme-color"><select data-theme-picker><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select>' +
    ['landing', 'workspace'].map(id => '<div id="' + id + '"><button data-theme-choice="light"><svg></svg></button><button data-theme-choice="dark"><svg></svg></button></div>').join(''),
    { url: 'https://clareza.example', runScripts: 'outside-only' });
  const w = dom.window;
  let mediaChange;
  const media = { matches: systemDark, addEventListener(name, listener) { mediaChange = listener; } };
  w.matchMedia = () => media;
  if (stored) w.localStorage.setItem('clareza.theme', stored);
  if (storageUnavailable) Object.defineProperty(w, 'localStorage', { get() { throw Error('blocked'); } });
  w.eval(fs.readFileSync('dist/theme.js', 'utf8'));
  t.after(() => w.close());
  return {
    w, media, root: w.document.documentElement,
    $: selector => w.document.querySelector(selector),
    system(value) { media.matches = value; mediaChange(); },
    storage(key, value) { w.dispatchEvent(new w.StorageEvent('storage', { key, newValue: value })); }
  };
}

test('tema salvo é aplicado antes do DOMContentLoaded e os dois controles ficam sincronizados', t => {
  const app = setup(t, { stored: 'dark' });
  assert.equal(app.root.dataset.theme, 'dark');
  assert.equal(app.root.style.colorScheme, 'dark');
  app.$('#landing [data-theme-choice="light"] svg').dispatchEvent(new app.w.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(app.root.dataset.theme, 'light');
  assert.equal(app.w.localStorage.getItem('clareza.theme'), 'light');
  assert.equal(app.$('#workspace [data-theme-choice="light"]').getAttribute('aria-pressed'), 'true');
  assert.equal(app.$('#workspace [data-theme-choice="dark"]').getAttribute('aria-pressed'), 'false');
  assert.equal(app.$('[data-theme-picker]').value, 'light');
});

test('sistema acompanha o dispositivo; seleção manual persiste até restaurar Sistema', t => {
  const app = setup(t, { stored: 'system', systemDark: true });
  app.system(false);
  assert.equal(app.root.dataset.theme, 'light');
  app.storage('clareza.theme', 'dark');
  app.system(false);
  assert.equal(app.root.dataset.theme, 'dark');
  const picker = app.$('[data-theme-picker]');
  picker.value = 'system';
  picker.dispatchEvent(new app.w.Event('change', { bubbles: true }));
  assert.equal(app.root.dataset.theme, 'light');
  app.system(true);
  assert.equal(app.root.dataset.theme, 'dark');
});

test('remover a preferência ou limpar o armazenamento em outra aba restaura o sistema', t => {
  const app = setup(t, { stored: 'dark' });
  app.storage('clareza.theme', null);
  assert.equal(app.root.dataset.theme, 'light');
  app.storage('clareza.theme', 'dark');
  app.storage(null, null);
  assert.equal(app.root.dataset.theme, 'light');
  app.storage('unrelated', 'dark');
  assert.equal(app.root.dataset.theme, 'light');
});

test('teclado interrompe movimento e alterna o tema imediatamente', t => {
  const app = setup(t);
  app.$('#landing [data-theme-choice="dark"]').dispatchEvent(new app.w.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(app.root.classList.contains('theme-changing'), true);
  app.w.document.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Tab' }));
  assert.equal(app.root.classList.contains('theme-changing'), false);
  app.$('#workspace [data-theme-choice="light"]').click();
  assert.equal(app.root.dataset.theme, 'light');
  assert.equal(app.root.classList.contains('theme-changing'), false);
});

test('armazenamento indisponível ou preferência inválida não impede alternar temas', t => {
  const app = setup(t, { storageUnavailable: true });
  app.$('#landing [data-theme-choice="dark"]').click();
  assert.equal(app.root.dataset.theme, 'dark');
  const invalid = setup(t, { stored: 'invalid', systemDark: true });
  assert.equal(invalid.root.dataset.theme, 'dark');
});
