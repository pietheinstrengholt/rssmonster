<template>
  <aside v-if="visible" class="install-prompt" aria-labelledby="install-prompt-title">
    <div class="install-prompt__copy">
      <strong id="install-prompt-title">Install RSSMonster</strong>
      <p>{{ guidance }}</p>
    </div>
    <div class="install-prompt__actions">
      <button
        v-if="deferredPrompt"
        type="button"
        class="install-prompt__install"
        @click="install"
      >Install</button>
      <button type="button" class="install-prompt__dismiss" @click="dismiss">Not now</button>
    </div>
  </aside>
</template>

<script>
import { isIOSDevice, isStandaloneWebApp } from '../../services/appInstallation.js';

const DISMISSED_KEY = 'rssmonster-install-prompt-dismissed';

export default {
  data() {
    return {
      deferredPrompt: null,
      manualIOSInstall: false,
      visible: false
    };
  },
  computed: {
    guidance() {
      return this.manualIOSInstall
        ? 'Use the browser Share menu and choose Add to Home Screen.'
        : 'Add the app for a standalone window, offline shell, and background notifications.';
    }
  },
  mounted() {
    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.handleAppInstalled);

    if (!isStandaloneWebApp() && isIOSDevice() && !this.wasDismissed()) {
      this.manualIOSInstall = true;
      this.visible = true;
    }
  },
  beforeUnmount() {
    window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.handleAppInstalled);
  },
  methods: {
    wasDismissed() {
      try {
        return sessionStorage.getItem(DISMISSED_KEY) === 'true';
      } catch {
        return false;
      }
    },
    handleBeforeInstallPrompt(event) {
      event.preventDefault();
      if (isStandaloneWebApp() || this.wasDismissed()) return;
      this.deferredPrompt = event;
      this.manualIOSInstall = false;
      this.visible = true;
    },
    handleAppInstalled() {
      this.deferredPrompt = null;
      this.visible = false;
    },
    async install() {
      if (!this.deferredPrompt) return;
      const prompt = this.deferredPrompt;
      this.deferredPrompt = null;
      await prompt.prompt();
      await prompt.userChoice.catch(() => null);
      this.visible = false;
    },
    dismiss() {
      try {
        sessionStorage.setItem(DISMISSED_KEY, 'true');
      } catch {
        // A denied storage write must not prevent dismissing the guidance.
      }
      this.deferredPrompt = null;
      this.visible = false;
    }
  }
};
</script>

<style scoped>
.install-prompt {
  align-items: center;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  bottom: max(16px, env(safe-area-inset-bottom));
  box-shadow: 0 12px 36px var(--shadow-card-subtle-color);
  color: var(--text-primary);
  display: flex;
  gap: 16px;
  left: max(16px, env(safe-area-inset-left));
  max-width: 520px;
  padding: 14px 16px;
  position: fixed;
  z-index: var(--layer-notification);
}

.install-prompt__copy {
  min-width: 0;
}

.install-prompt__copy strong {
  display: block;
  font-size: 14px;
  margin-bottom: 3px;
}

.install-prompt__copy p {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.4;
  margin: 0;
}

.install-prompt__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.install-prompt__actions button {
  border-radius: var(--radius-control);
  font-size: 13px;
  font-weight: 600;
  min-height: var(--control-height-compact);
  padding: 0 10px;
}

.install-prompt__install {
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
  color: var(--text-inverted);
}

.install-prompt__dismiss {
  background: var(--surface-control);
  border: 1px solid var(--border-control);
  color: var(--text-secondary);
}

@media (max-width: 560px) {
  .install-prompt {
    align-items: stretch;
    flex-direction: column;
    right: max(16px, env(safe-area-inset-right));
  }

  .install-prompt__actions {
    justify-content: flex-end;
  }
}
</style>
