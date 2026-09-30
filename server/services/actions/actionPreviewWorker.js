import { parentPort, workerData } from 'node:worker_threads';
import { compileActionRegex, matchesActionArticle } from '../../utils/actionRegex.js';

const regex = compileActionRegex(workerData.expression);
parentPort.postMessage(workerData.articles.filter(article => matchesActionArticle(regex, article)).map(article => article.id));
