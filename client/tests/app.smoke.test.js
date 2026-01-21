import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import App from '../src/App.vue';

describe('App smoke test', () => {
  it('mounts without crashing', () => {
    const wrapper = mount(App);

    expect(wrapper.exists()).toBe(true);
  });
});