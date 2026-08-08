import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsMetric from '../src/components/settings/SettingsMetric.vue';
import SettingsPageIntro from '../src/components/settings/SettingsPageIntro.vue';

describe('Settings presentation primitives', () => {
  // Verifies the shared page introduction preserves heading and icon accessibility semantics.
  it('renders an informational page introduction with a labelled section', () => {
    const wrapper = mount(SettingsPageIntro, {
      props: {
        eyebrow: 'Settings — Insights',
        icon: 'diagram-3-fill',
        title: 'Insight overview',
        titleId: 'insight-title'
      },
      slots: {
        default: 'Review current insight activity.'
      },
      global: {
        stubs: { BootstrapIcon: true }
      }
    });

    expect(wrapper.attributes('aria-labelledby')).toBe('insight-title');
    expect(wrapper.get('h3').attributes('id')).toBe('insight-title');
    expect(wrapper.get('.settings-page-eyebrow').text()).toBe('Settings — Insights');
    expect(wrapper.text()).toContain('Review current insight activity.');
  });

  // Verifies a shared metric retains the established label and value structure.
  it('renders numeric and formatted metric values', async () => {
    const wrapper = mount(SettingsMetric, {
      props: { label: 'Coverage', value: 42 }
    });

    expect(wrapper.get('.settings-metric-label').text()).toBe('Coverage');
    expect(wrapper.get('strong').text()).toBe('42');

    await wrapper.setProps({ value: '42.0%' });
    expect(wrapper.get('strong').text()).toBe('42.0%');
  });
});
