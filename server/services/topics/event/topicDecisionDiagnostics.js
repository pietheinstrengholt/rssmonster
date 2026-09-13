import { channel } from 'node:diagnostics_channel';
import { isSemanticDebugEnabled } from '../../observability/semanticLogging.js';
export const topicDiagnosticChannel = channel('rssmonster.topics.decisions');
export function emitTopicDecision(payload) {
  const debug = isSemanticDebugEnabled('topic') || ['trace', 'report'].includes(process.env.SEMANTIC_REPORT_LEVEL);
  if (!debug && !topicDiagnosticChannel.hasSubscribers) return;
  topicDiagnosticChannel.publish(payload);
  if (debug) console.log('[TOPIC TRACE]', JSON.stringify(payload));
}
