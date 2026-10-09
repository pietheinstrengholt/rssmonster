import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundRefresh } from '../background.js';
import { DESKTOP_DEFAULTS } from '../settings.js';

const fixture = (configuration = {}) => {
  let settings = { ...DESKTOP_DEFAULTS, ...configuration };
  const children = [];
  const background = createBackgroundRefresh({ getSettings: () => settings,
    startWorker: async (config, receive, fail) => {
      const child = { config, receive, fail, messages: [], stops: 0,
        send(message) { this.messages.push(message); }, async stop() { this.stops++; } };
      children.push(child);
      return child;
    }
  });
  return { background, children, configure: async change => { settings = { ...settings, ...change }; await background.configure(); } };
};

test('automatic refresh owns one worker across repeated starts and manual triggers', async () => {
  const { background, children } = fixture();
  await background.start(); await background.start();
  await Promise.all([background.refresh(), background.refresh(), background.refresh()]);
  assert.equal(children.length, 1);
  assert.equal(children[0].config.refreshIntervalMinutes, 15);
  assert.deepEqual(children[0].messages, ['refresh', 'refresh', 'refresh']);
  await background.stop();
  assert.equal(children[0].stops, 1);
  await assert.rejects(background.refresh(), /shutting down/);
});

test('disabled refresh has no worker; manual refresh is one shot and can repeat', async () => {
  const { background, children } = fixture({ automaticRefresh: false });
  await background.start();
  assert.equal(children.length, 0);
  assert.equal(background.getState().workerStatus, 'disabled');
  await background.refresh();
  assert.equal(children[0].config.automaticRefresh, false);
  children[0].receive({ type: 'finished' });
  await background.refresh();
  assert.equal(children.length, 2);
  await background.stop();
});

test('interval updates reuse the process, and disabling drains it before re-enabling', async () => {
  const { background, children, configure } = fixture();
  await background.start();
  await configure({ continueInTray: false });
  assert.deepEqual(children[0].messages, []);
  await configure({ refreshIntervalMinutes: 5 });
  assert.equal(children[0].messages[0].settings.refreshIntervalMinutes, 5);
  await configure({ automaticRefresh: false });
  assert.equal(children[0].stops, 1);
  await configure({ automaticRefresh: true });
  assert.equal(children.length, 2);
  await background.stop();
});

test('enabling automation during a manual one-shot drains it before starting the recurring worker', async () => {
  const { background, children, configure } = fixture({ automaticRefresh: false });
  await background.start();
  await background.refresh();
  const manual = children[0];
  let finishDrain;
  const draining = new Promise(resolve => { finishDrain = resolve; });
  manual.stop = async () => { manual.stops++; await draining; manual.receive({ type: 'finished' }); };
  const enabled = configure({ automaticRefresh: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manual.stops, 1);
  assert.equal(children.length, 1, 'The recurring worker must wait for the manual child to exit');
  finishDrain();
  await enabled;
  assert.equal(children.length, 2);
  assert.equal(children[1].config.automaticRefresh, true);
  children[1].receive({ type: 'activity', workerStatus: 'healthy', nextRefreshAt: '2026-10-09T12:15:00Z' });
  assert.equal(background.getState().workerStatus, 'healthy');
  assert.ok(background.getState().nextRefreshAt);
  await background.stop();
});

test('quitting during the manual-to-automatic drain prevents a new recurring worker', async () => {
  const { background, children, configure } = fixture({ automaticRefresh: false });
  await background.start();
  await background.refresh();
  const manual = children[0];
  let finishDrain;
  const draining = new Promise(resolve => { finishDrain = resolve; });
  manual.stop = async () => { manual.stops++; await draining; };
  const enabled = configure({ automaticRefresh: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manual.stops, 1);
  const stopped = background.stop();
  finishDrain();
  await Promise.all([enabled, stopped]);
  assert.equal(children.length, 1, 'Quitting must not launch another scheduled cycle');
  assert.equal(background.getState().workerStatus, 'stopping');
});

test('worker failure clears the schedule and explicit refresh retries without a restart loop', async () => {
  const { background, children } = fixture();
  await background.start();
  children[0].receive({ type: 'activity', nextRefreshAt: '2026-10-09T12:15:00Z' });
  children[0].fail(new Error('Crawler exited'));
  assert.equal(background.getState().workerStatus, 'error');
  assert.equal(background.getState().nextRefreshAt, null);
  assert.equal(children.length, 1);
  await background.refresh();
  assert.equal(children.length, 2);
  assert.equal(background.getState().error, null);
  await background.stop();
});
