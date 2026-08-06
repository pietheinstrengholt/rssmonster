<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :class="iconClasses"
    :role="iconRole"
    :aria-hidden="isDecorative ? 'true' : undefined"
    :aria-label="isDecorative ? undefined : label || undefined"
  >
    <g :transform="iconTransform" transform-origin="center">
      <use :href="`#${icon}`" />
    </g>
  </svg>
</template>

<script>
export default {
  name: 'BootstrapIcon',
  props: {
    icon: {
      type: String,
      required: true
    },
    variant: {
      type: String,
      default: ''
    },
    size: {
      type: [String, Number],
      default: ''
    },
    flipH: {
      type: Boolean,
      default: false
    },
    flipV: {
      type: Boolean,
      default: false
    },
    rotate: {
      type: [String, Number],
      default: ''
    },
    animation: {
      type: String,
      default: ''
    },
    context: {
      type: String,
      default: 'inline',
      validator: value => ['inline', 'control'].includes(value)
    },
    decorative: {
      type: Boolean,
      default: false
    },
    label: {
      type: String,
      default: ''
    }
  },
  computed: {
    // Returns compatibility classes for the icon's visual options.
    iconClasses() {
      return [
        'app-icon',
        `app-icon--${this.context}`,
        'bi',
        this.variant ? `bi--variant-${this.variant}` : null,
        this.size ? `bi--size-${this.size}` : null,
        this.animation ? `bi--animation-${this.animation}` : null
      ];
    },
    // Returns the image role only when assistive technology should announce the icon.
    iconRole() {
      return this.isDecorative ? undefined : 'img';
    },
    // Treats the component prop and existing aria-hidden usage as the same decorative contract.
    isDecorative() {
      return this.decorative || this.$attrs['aria-hidden'] === true || this.$attrs['aria-hidden'] === 'true';
    },
    // Returns the combined flip and rotation transform applied around the icon center.
    iconTransform() {
      let scale = '';

      if (this.flipH && this.flipV) {
        scale = 'scale(-1 -1)';
      } else if (this.flipH) {
        scale = 'scale(-1 1)';
      } else if (this.flipV) {
        scale = 'scale(1 -1)';
      }

      const rotation = this.rotate ? `rotate(${this.rotate})` : '';
      return `${scale}${rotation}`;
    }
  }
};
</script>

<style scoped>
.app-icon {
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
  fill: currentColor;
  font-size: 1em;
}

.app-icon--inline {
  display: inline-block;
  margin-bottom: 0.125em;
  vertical-align: middle;
}

.app-icon--control {
  display: block;
  margin: 0;
  vertical-align: initial;
}

.bi--variant-success { color: var(--color-success); }
.bi--variant-warning { color: var(--color-warning); }
.bi--variant-danger { color: var(--color-danger); }
.bi--variant-info { color: var(--color-info-strong); }
.bi--variant-primary { color: var(--color-primary); }
.bi--variant-secondary { color: var(--color-secondary); }
.bi--variant-dark { color: var(--text-secondary); }
.bi--variant-light { color: var(--text-inverted); }
.bi--size-sm { font-size: 0.75em; }
.bi--size-md { font-size: 1.25rem; }
.bi--size-lg { font-size: 1.33333333rem; }
.bi--size-2x { font-size: 2rem; }
.bi--size-3x { font-size: 3rem; }
.bi--size-4x { font-size: 4rem; }
.bi--size-5x { font-size: 5rem; }
.bi--animation-fade { animation: bi-animation-fade 0.75s ease-in-out infinite alternate; }
.bi--animation-spin { animation: bi-animation-spin 2s linear infinite normal; }
.bi--animation-spin-reverse { animation: bi-animation-spin 2s linear infinite reverse; }
.bi--animation-spin-pulse { animation: bi-animation-spin 1s steps(8) infinite normal; }
.bi--animation-spin-reverse-pulse { animation: bi-animation-spin 1s steps(8) infinite reverse; }
.bi--animation-throb { animation: bi-animation-throb 0.75s ease-in-out infinite alternate; }

@keyframes bi-animation-fade {
  0% { opacity: 0.1; }
  100% { opacity: 1; }
}

@keyframes bi-animation-spin {
  0% { transform: rotate(0); }
  100% { transform: rotate(359deg); }
}

@keyframes bi-animation-throb {
  0% {
    opacity: 0.5;
    transform: scale(0.5);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
