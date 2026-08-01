<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :class="iconClasses"
    role="graphics-document"
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
    }
  },
  computed: {
    // Returns compatibility classes for the icon's visual options.
    iconClasses() {
      return [
        'bi',
        this.variant ? `bi--variant-${this.variant}` : null,
        this.size ? `bi--size-${this.size}` : null,
        this.animation ? `bi--animation-${this.animation}` : null
      ];
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
.bi {
  width: 1em;
  height: 1em;
  margin-bottom: 0.125em;
  fill: currentColor;
  font-size: 1em;
  vertical-align: middle;
}

.bi--variant-success { color: var(--bs-success); }
.bi--variant-warning { color: var(--bs-warning); }
.bi--variant-danger { color: var(--bs-danger); }
.bi--variant-info { color: var(--bs-info); }
.bi--variant-primary { color: var(--bs-primary); }
.bi--variant-secondary { color: var(--bs-secondary); }
.bi--variant-dark { color: var(--bs-dark); }
.bi--variant-light { color: var(--bs-light); }
.bi--size-sm { font-size: 0.75em; }
.bi--size-md { font-size: 1.25rem; }
.bi--size-lg { font-size: 1.33333333rem; }
.bi--size-2x { font-size: 2rem; }
.bi--size-3x { font-size: 3rem; }
.bi--size-4x { font-size: 4rem; }
.bi--size-5x { font-size: 5rem; }
.bi--animation-cylon { animation: bi-animation-cylon 0.75s ease-in-out infinite alternate; }
.bi--animation-cylon-vertical { animation: bi-animation-cylon-vertical 0.75s ease-in-out infinite alternate; }
.bi--animation-fade { animation: bi-animation-fade 0.75s ease-in-out infinite alternate; }
.bi--animation-spin { animation: bi-animation-spin 2s linear infinite normal; }
.bi--animation-spin-reverse { animation: bi-animation-spin 2s linear infinite reverse; }
.bi--animation-spin-pulse { animation: bi-animation-spin 1s steps(8) infinite normal; }
.bi--animation-spin-reverse-pulse { animation: bi-animation-spin 1s steps(8) infinite reverse; }
.bi--animation-throb { animation: bi-animation-throb 0.75s ease-in-out infinite alternate; }

@keyframes bi-animation-cylon {
  0% { transform: translate(-25%); }
  100% { transform: translate(25%); }
}

@keyframes bi-animation-cylon-vertical {
  0% { transform: translateY(25%); }
  100% { transform: translateY(-25%); }
}

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
