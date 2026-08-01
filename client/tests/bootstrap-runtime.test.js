import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Dropdown from 'bootstrap/js/dist/dropdown.js';

const mainSourcePath = resolve(process.cwd(), 'src/main.js');
const authenticatedShellSourcePath = resolve(
  process.cwd(),
  'src/services/authenticatedShell.js'
);

describe('Bootstrap runtime boundary', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads only the Dropdown plugin from the authenticated shell boundary', () => {
    const mainSource = readFileSync(mainSourcePath, 'utf8');
    const authenticatedShellSource = readFileSync(authenticatedShellSourcePath, 'utf8');

    expect(mainSource).not.toContain("bootstrap/js/dist/dropdown.js");
    expect(authenticatedShellSource).toContain("import 'bootstrap/js/dist/dropdown.js'");
    expect(authenticatedShellSource).not.toContain('bootstrap.bundle');
    expect(mainSource).not.toContain('bootstrap.bundle');
  });

  it('opens and closes a representative dropdown', () => {
    document.body.innerHTML = `
      <div class="dropdown">
        <button id="dropdown-test" data-bs-toggle="dropdown" aria-expanded="false">Open</button>
        <div class="dropdown-menu">Menu</div>
      </div>
    `;
    const toggle = document.getElementById('dropdown-test');
    const menu = document.querySelector('.dropdown-menu');
    const dropdown = Dropdown.getOrCreateInstance(toggle);

    dropdown.show();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.classList.contains('show')).toBe(true);

    dropdown.hide();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(menu.classList.contains('show')).toBe(false);
    dropdown.dispose();
  });
});
