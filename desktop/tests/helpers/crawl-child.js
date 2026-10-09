import { EventEmitter } from 'node:events';
import { startDesktopCrawlWorker } from '../../crawl-process.js';

const port = new EventEmitter();
port.postMessage = message => process.send(message);
process.on('message', data => port.emit('message', { data }));
const worker = await startDesktopCrawlWorker(port, JSON.parse(process.env.RSSMONSTER_DESKTOP_CRAWL_SETTINGS));
process.on('message', data => { if (data === 'stop') void worker.shutdown('Test closing'); });
const running = worker.start();
process.send({ type: 'listening' });
await running;
process.send({ type: 'finished' });
process.disconnect();
