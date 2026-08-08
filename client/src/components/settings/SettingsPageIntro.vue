<template>
  <section class="settings-insight-card" :aria-labelledby="titleId">
    <span class="settings-insight-icon" aria-hidden="true">
      <BootstrapIcon :icon="icon" />
    </span>
    <div>
      <p class="settings-page-eyebrow">{{ eyebrow }}</p>
      <h3 :id="titleId">{{ title }}</h3>
      <p><slot /></p>
    </div>
  </section>
</template>

<script>
export default {
  name: 'SettingsPageIntro',
  props: {
    eyebrow: {
      type: String,
      required: true
    },
    icon: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    titleId: {
      type: String,
      required: true
    }
  }
};
</script>
