import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { BootstrapIcon } from '@dvuckovic/vue3-bootstrap-icons';

import { bootstrapIconNames } from '../bootstrap-icons.js';

describe('Bootstrap icon delivery', () => {
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
});
