import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BootstrapIcon from '../src/components/shared/BootstrapIcon.vue';
import {
  BOOTSTRAP_ICON_SPRITE_ID,
  injectBootstrapIcons
} from '../src/services/bootstrapIcons.js';

import { bootstrapIconNames } from '../bootstrap-icons.js';

describe('Bootstrap icon delivery', () => {
  afterEach(() => {
    document.getElementById(BOOTSTRAP_ICON_SPRITE_ID)?.remove();
  });

  it.each([
    'sunrise-fill',
    'sliders2',
    'folder-plus',
    'pencil-square',
    'lightning-charge-fill',
    'arrow-left',
    'arrow-left-right',
    'box-arrow-up-right',
    'shield-lock',
    'exclamation-circle'
  ])('includes %s in the generated sprite', icon => {
    expect(bootstrapIconNames).toContain(icon);
  });

  it('renders representative icons through the SVG sprite component', () => {
    const wrapper = mount(BootstrapIcon, {
      props: {
        icon: 'box-arrow-up-right'
      }
    });

    expect(wrapper.element.tagName.toLowerCase()).toBe('svg');
    expect(wrapper.classes()).toContain('app-icon');
    expect(wrapper.classes()).toContain('app-icon--inline');
    expect(wrapper.classes()).toContain('bi');
    expect(wrapper.get('use').attributes('href')).toBe('#box-arrow-up-right');
  });

  it('renders control icons without the inline alignment context', () => {
    const wrapper = mount(BootstrapIcon, {
      props: {
        context: 'control',
        icon: 'check-lg'
      }
    });

    expect(wrapper.classes()).toContain('app-icon--control');
    expect(wrapper.classes()).not.toContain('app-icon--inline');
  });

  it('preserves icon option classes and transforms', () => {
    const wrapper = mount(BootstrapIcon, {
      props: {
        animation: 'spin',
        flipH: true,
        icon: 'arrow-clockwise',
        rotate: 90,
        size: 'lg',
        variant: 'primary'
      }
    });

    expect(wrapper.classes()).toEqual(expect.arrayContaining([
      'bi',
      'bi--animation-spin',
      'bi--size-lg',
      'bi--variant-primary'
    ]));
    expect(wrapper.get('g').attributes('transform')).toBe('scale(-1 1)rotate(90)');
  });

  it('hides decorative icons from assistive technology', () => {
    const wrapper = mount(BootstrapIcon, {
      props: {
        decorative: true,
        icon: 'check-lg'
      }
    });

    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('role')).toBeUndefined();
  });

  it('preserves existing aria-hidden usage as decorative', () => {
    const wrapper = mount(BootstrapIcon, {
      attrs: {
        'aria-hidden': 'true'
      },
      props: {
        icon: 'check-lg'
      }
    });

    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('role')).toBeUndefined();
  });

  it('labels meaningful icons through the component contract', () => {
    const wrapper = mount(BootstrapIcon, {
      props: {
        icon: 'exclamation-circle-fill',
        label: 'Feed refresh failed'
      }
    });

    expect(wrapper.attributes('aria-label')).toBe('Feed refresh failed');
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    expect(wrapper.attributes('role')).toBe('img');
  });

  it('injects the sprite once and rejects non-SVG markup', () => {
    expect(injectBootstrapIcons('<div>invalid</div>')).toBe(false);
    expect(injectBootstrapIcons('<svg><symbol id="rss"></symbol></svg>')).toBe(true);
    expect(injectBootstrapIcons('<svg><symbol id="other"></symbol></svg>')).toBe(true);

    const sprites = document.querySelectorAll(`#${BOOTSTRAP_ICON_SPRITE_ID}`);
    expect(sprites).toHaveLength(1);
    expect(sprites[0].getAttribute('aria-hidden')).toBe('true');
    expect(sprites[0].querySelector('#rss')).not.toBeNull();
    expect(sprites[0].querySelector('#other')).toBeNull();
  });

  it('loads the shared sprite only from the authenticated shell boundary', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/main.js'), 'utf8');
    const authenticatedShellSource = readFileSync(
      resolve(process.cwd(), 'src/services/authenticatedShell.js'),
      'utf8'
    );

    expect(mainSource).not.toContain('virtual:bootstrap-icons-sprite');
    expect(authenticatedShellSource).toContain('virtual:bootstrap-icons-sprite');
  });
});
