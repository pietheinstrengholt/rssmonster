import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readClientSource = path => readFileSync(resolve(process.cwd(), path), 'utf8');

const themeSource = readClientSource('src/assets/styles/theme.css');
const sidebarRowSources = [
  'src/components/sidebar/SidebarNavItem.vue',
  'src/components/sidebar/SidebarFeedItem.vue',
  'src/components/sidebar/SidebarCategoryGroup.vue'
].map(readClientSource);
const sidebarSources = [
  ...sidebarRowSources,
  readClientSource('src/components/sidebar/Sidebar.vue'),
  readClientSource('src/components/sidebar/SidebarActionButton.vue'),
  readClientSource('src/components/sidebar/SidebarSectionTitle.vue')
];
const sidebarActionSource = readClientSource('src/components/sidebar/SidebarActionButton.vue');
const sidebarCategorySource = readClientSource('src/components/sidebar/SidebarCategoryGroup.vue');
const sidebarSectionTitleSource = readClientSource('src/components/sidebar/SidebarSectionTitle.vue');
const mobileOptionsSource = readClientSource('src/components/shell/MobileMenuOverlay.vue');

describe('sidebar style cascade', () => {
  it('defines theme-owned navigation row states', () => {
    for (const token of [
      '--sidebar-row-background',
      '--sidebar-row-text',
      '--sidebar-row-hover-background',
      '--sidebar-row-selected-background',
      '--sidebar-row-selected-text',
      '--sidebar-row-selected-hover-background',
      '--sidebar-row-alert-background',
      '--sidebar-row-alert-hover-background',
      '--sidebar-row-alert-text',
      '--sidebar-row-error-background',
      '--sidebar-row-error-text',
      '--sidebar-row-disabled-background',
      '--sidebar-row-disabled-text'
    ]) {
      expect(themeSource).toContain(`${token}:`);
    }
  });

  it('retains the deeper dark sidebar background without changing global chrome', () => {
    expect(themeSource).toMatch(
      /:root\[data-theme="dark"\][\s\S]*?--sidebar-background: #11161D;/
    );
    expect(themeSource).toContain('--sidebar-row-background: rgba(255, 255, 255, 0.035);');
    expect(readClientSource('src/AppShell.vue')).toContain('background-color: var(--sidebar-background);');
  });

  it('restores light sidebar row tiles against a quieter backdrop', () => {
    expect(themeSource).toMatch(
      /:root \{[\s\S]*?--sidebar-background: var\(--surface-page\);[\s\S]*?--sidebar-row-background: var\(--surface-chrome\);/
    );
    expect(themeSource).toMatch(
      /:root\[data-theme="dark"\][\s\S]*?--sidebar-background: #11161D;[\s\S]*?--sidebar-row-background: rgba\(255, 255, 255, 0\.035\);/
    );
  });

  it('uses the standard readable foreground for dark refresh alerts', () => {
    expect(themeSource).toMatch(
      /:root\[data-theme="dark"\][\s\S]*?--sidebar-row-alert-text: var\(--text-primary\);/
    );
  });

  it('keeps selected mobile category labels readable in dark mode', () => {
    expect(mobileOptionsSource.match(
      /--options-selected-text: var\(--color-primary-icon-dark\);/g
    )).toHaveLength(2);
    expect(mobileOptionsSource.match(/class="options-row-label"/g)).toHaveLength(2);
    expect(mobileOptionsSource).toMatch(
      /:global\(:root\[data-theme='dark'\] #mobile-container \.options-row\.selected > \.options-row-label\) \{\s*color: var\(--text-inverted\);/
    );
  });

  it('keeps section titles quieter than navigation rows in both themes', () => {
    expect(themeSource.match(/--sidebar-section-title-text: var\(--text-secondary\);/g)).toHaveLength(2);
    expect(themeSource).toContain('--sidebar-row-selected-text: var(--color-primary);');
    expect(sidebarSectionTitleSource).toContain('font-size: 0.8125rem;');
    expect(sidebarSectionTitleSource).toContain('font-weight: 500;');
  });

  it('uses a restrained semantic icon palette for All feeds statuses', () => {
    for (const status of ['briefing', 'unread', 'read', 'favorite', 'hot', 'clicked']) {
      expect(themeSource.match(new RegExp(`--sidebar-icon-${status}:`, 'g'))).toHaveLength(2);
    }

    expect(sidebarRowSources[0]).toContain('.icon-briefing { color: var(--sidebar-icon-briefing); }');
    expect(sidebarRowSources[0]).toContain('.icon-unread { color: var(--sidebar-icon-unread); }');
    expect(sidebarRowSources[0]).toContain('.icon-read { color: var(--sidebar-icon-read); }');
    expect(sidebarRowSources[0]).toContain('.icon-star { color: var(--sidebar-icon-favorite); }');
    expect(sidebarRowSources[0]).toContain('.icon-hot { color: var(--sidebar-icon-hot); }');
    expect(sidebarRowSources[0]).toContain('.icon-clicked { color: var(--sidebar-icon-clicked); }');
    expect(sidebarRowSources[0]).toMatch(
      /\.sidebar-status-item\.selected \.sidebar-icon \{[\s\S]*?color: var\(--sidebar-row-selected-text\);/
    );
  });

  it('applies category selection to its header without selecting expanded feeds', () => {
    expect(sidebarCategorySource).toContain('.sidebar-category.selected > .sidebar-category-header');
    expect(sidebarCategorySource).not.toMatch(
      /\.sidebar-category\.selected[^,{]*:deep\(\.sidebar-feed/
    );
    expect(sidebarCategorySource).not.toMatch(
      /\.sidebar-category\.selected[^,{]*\.sidebar-feed-list/
    );
  });

  it('renders expanded categories as one rounded group with square internal feed states', () => {
    expect(sidebarCategorySource).toContain("{ expanded: isExpanded, selected: isSelectedCategory }");
    expect(sidebarCategorySource).toMatch(
      /\.sidebar-category\.expanded \{[\s\S]*?background-color: var\(--sidebar-group-background\);[\s\S]*?overflow: hidden;/
    );
    expect(sidebarCategorySource).toMatch(
      /\.sidebar-feed-list \{[\s\S]*?--sidebar-row-background: var\(--sidebar-group-background\);/
    );
    expect(sidebarCategorySource).toMatch(
      /\.sidebar-category-header \{[\s\S]*?border-radius: var\(--radius-compact\);/
    );
    expect(sidebarCategorySource).toMatch(
      /\.sidebar-category\.expanded > \.sidebar-category-header \{[\s\S]*?border-radius: var\(--radius-compact\) var\(--radius-compact\) 0 0;/
    );
    expect(sidebarRowSources[1]).toMatch(/\.sidebar-feed\.selected \{[\s\S]*?border-radius: 0;/);
    expect(themeSource.match(/--sidebar-group-background:/g)).toHaveLength(2);
  });

  it('maps sidebar geometry to the shared compact foundations', () => {
    const combinedSource = sidebarSources.join('\n');

    for (const token of [
      '--control-height-compact',
      '--control-height-default',
      '--radius-compact',
      '--radius-control',
      '--motion-duration-fast',
      '--motion-duration-normal',
      '--motion-easing-standard'
    ]) {
      expect(combinedSource).toContain(`var(${token})`);
    }

    expect(combinedSource).not.toMatch(/border-radius:\s*(?:6|8)px/);
    expect(combinedSource).not.toMatch(/(?:min-)?height:\s*(?:24|36|40)px/);
    expect(combinedSource).not.toContain('150ms ease');
  });

  it('transitions only properties that change across navigation row states', () => {
    for (const source of sidebarRowSources) {
      const transitions = [...source.matchAll(/transition:\s*([^;]+);/g)].map((match) => match[1]);

      expect(transitions).not.toHaveLength(0);
      for (const transition of transitions) {
        expect(transition).not.toMatch(/\b(?:transform|box-shadow)\b/);
        expect(transition).toMatch(/background-color/);
        expect(transition).toMatch(/color/);
      }
    }
  });

  it('centers action labels without optical margin or transform corrections', () => {
    expect(sidebarActionSource).toMatch(
      /\.sidebar-button > div \{[\s\S]*?align-items: center;[\s\S]*?line-height: 1\.25;/
    );
    expect(sidebarActionSource).toMatch(
      /\.sidebar-management-button > div \{[\s\S]*?justify-content: center;[\s\S]*?line-height: 1\.2;/
    );
    expect(sidebarActionSource).not.toMatch(/\.sidebar-button \.sidebar-item-title \{[^}]*margin-(?:top|bottom):/);
    expect(sidebarActionSource).not.toContain('transform: translateY(');
  });

  it('keeps navigation rows full width so counts align to the right edge', () => {
    expect(sidebarRowSources[0]).toMatch(
      /\.sidebar-item \{[\s\S]*?width: calc\(100% - \(2 \* var\(--space-3\)\)\);/
    );
    expect(sidebarRowSources[0]).toMatch(
      /\.sidebar-count-wrapper \{[\s\S]*?margin-left: auto;/
    );
  });

  it('keeps one complete sidebar action palette', () => {
    for (const action of ['refresh', 'add', 'read']) {
      for (const state of [
        'background',
        'text',
        'border',
        'hover-background',
        'hover-border',
        'active-background',
        'focus'
      ]) {
        const token = `--sidebar-action-${action}-${state}`;
        expect(themeSource).toContain(`${token}:`);
        expect(sidebarActionSource).toContain(`var(${token})`);
      }
    }

    expect(themeSource).not.toContain('--sidebar-primary-action-');
    expect(themeSource).not.toContain('--sidebar-action-mark-as-read-');
    expect(sidebarActionSource).not.toContain('--sidebar-primary-action-');
    expect(mobileOptionsSource).not.toContain('--sidebar-action-');
    expect(mobileOptionsSource).toContain('var(--mobile-options-refresh-background)');
    expect(mobileOptionsSource).toContain('var(--mobile-options-add-background)');
    expect(themeSource).toMatch(
      /:root\[data-theme="dark"\][\s\S]*?--mobile-options-add-hover-text: var\(--badge-quality-text\);[\s\S]*?--mobile-options-add-text: var\(--badge-quality-text\);/
    );
  });

  it('gives neutral management actions a complete translucent state palette', () => {
    for (const state of [
      'background',
      'hover-background',
      'active-background',
      'border',
      'hover-border',
      'text',
      'focus'
    ]) {
      const token = `--sidebar-secondary-action-${state}`;
      expect(themeSource.match(new RegExp(`${token}:`, 'g'))).toHaveLength(2);
      expect(sidebarActionSource).toContain(`var(${token})`);
    }

    expect(themeSource).toContain('--sidebar-secondary-action-background: rgba(255, 255, 255, 0.64);');
    expect(themeSource).toContain('--sidebar-secondary-action-background: rgba(42, 51, 66, 0.62);');
  });

  it('keeps row components theme-independent and free of specificity overrides', () => {
    for (const source of sidebarSources) {
      expect(source).not.toContain("data-theme='dark'");
      expect(source).not.toContain('!important');
    }

    for (const source of sidebarRowSources) {
      expect(source).toContain('<button');
      expect(source).toContain('type="button"');
      expect(source).not.toContain('role="button"');
      expect(source).not.toContain('tabindex="0"');
      expect(source).toContain('var(--sidebar-row-background)');
      expect(source).toContain('var(--sidebar-row-selected-background)');
      expect(source).toContain(':focus-visible');
      expect(source).toContain('var(--focus-ring-color)');
    }
  });
});
