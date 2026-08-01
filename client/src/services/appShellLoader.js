let appShellPromise;

// This function loads the authenticated shell and its runtime dependencies through one reusable request boundary.
export const loadAppShell = () => {
  if (!appShellPromise) {
    appShellPromise = Promise.all([
      import('../AppShell.vue'),
      import('./authenticatedShell.js')
    ])
      .then(([appShellModule]) => appShellModule.default)
      .catch(error => {
        appShellPromise = undefined;
        throw error;
      });
  }

  return appShellPromise;
};
