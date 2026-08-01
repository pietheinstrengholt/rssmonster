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
    'box-arrow-up-right',
    'shield-lock'
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
    expect(wrapper.classes()).toContain('bi');
    expect(wrapper.get('use').attributes('href')).toBe('#box-arrow-up-right');
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
});
