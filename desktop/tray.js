import { fileURLToPath } from 'node:url';

export const ACTIVITY_LABELS = Object.freeze({
  idle: 'Idle', refreshing: 'Refreshing feeds', processing: 'Processing articles',
  error: 'Some feeds could not be refreshed', disabled: 'Automatic refresh disabled', starting: 'Starting local services'
});
const timestamp = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not available';

export const createDesktopTray = ({ Tray, Menu, nativeImage, window, settings, runtime, quit, platform = process.platform }) => {
  let tray;
  let polling;
  let updating = false;
  let stopped = false;
  let activity = { status: 'starting' };
  const open = () => {
    if (stopped || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  const runAction = action => void Promise.resolve().then(action).catch(error => {
    console.error('Desktop tray action failed:', error);
    activity = { ...activity, status: 'error' };
    render();
  });
  const render = () => {
    if (!tray || stopped) return;
    const { settings: configuration, capabilities } = settings.get();
    const label = ACTIVITY_LABELS[activity.status] || ACTIVITY_LABELS.error;
    tray.setToolTip(`RSSMonster — ${label}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'RSSMonster', enabled: false }, { type: 'separator' },
      { label: 'Open RSSMonster', click: open },
      { label: 'Refresh feeds now', enabled: activity.status !== 'starting', click: () => runAction(() => runtime.background.refresh()) },
      { type: 'separator' },
      { label: `Status: ${label}${activity.processingArticles && activity.status === 'refreshing' ? ' · Processing articles' : ''}`, enabled: false },
      { label: `Last refresh: ${timestamp(activity.lastRefreshAt)}`, enabled: false },
      { label: `Next refresh: ${timestamp(activity.nextRefreshAt)}`, enabled: false },
      ...(activity.newArticles === null || activity.newArticles === undefined ? [] : [{ label: `New articles in last refresh: ${activity.newArticles}`, enabled: false }]),
      { type: 'separator' },
      { label: 'Launch at sign-in', type: 'checkbox', checked: configuration.launchAtLogin, enabled: capabilities.login,
        click: item => runAction(() => settings.update({ ...settings.get().settings, launchAtLogin: item.checked })) },
      { type: 'separator' }, { label: 'Quit RSSMonster', click: quit }
    ]));
  };
  const update = async () => {
    if (updating || stopped) return;
    updating = true;
    try { activity = await runtime.getActivity(); } catch (error) {
      console.error('Desktop activity unavailable:', error);
      activity = { status: 'error' };
    } finally { updating = false; render(); }
  };
  try {
    const icon = nativeImage.createFromPath(fileURLToPath(new URL('./resources/tray.png', import.meta.url))).resize({ width: platform === 'darwin' ? 18 : 24 });
    if (icon.isEmpty()) throw new Error('Desktop tray icon is unavailable.');
    if (platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.on('click', open);
    tray.on('double-click', open);
    render();
    polling = setInterval(() => { void update(); }, 5000);
    void update();
  } catch (error) {
    console.error('System tray unavailable; closing the window will quit:', error);
    tray?.destroy();
    tray = undefined;
  }
  const close = event => {
    if (!stopped && tray && settings.get().settings.continueInTray) { event.preventDefault(); window.hide(); }
  };
  window.on('close', close);
  return {
    available: () => Boolean(tray) && !stopped,
    open,
    applySettings: () => { if (!settings.get().settings.continueInTray) open(); render(); },
    stop: () => {
      stopped = true;
      clearInterval(polling);
      window.removeListener('close', close);
      tray?.destroy();
      tray = undefined;
    }
  };
};
