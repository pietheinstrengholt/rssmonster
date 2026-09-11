export const inferenceCapabilities = () => ({
  service: 'rssmonster-inference', apiVersion: '1', version: '2.3.0', status: 'ready',
  capabilities: Object.fromEntries(['embeddings', 'generation', 'classification', 'assistant'].map(name => [name, {
    configured: true, available: true, provider: 'local', model: `${name}-model`,
    ...(name === 'embeddings' ? { dimensions: 1024 } : {})
  }]))
});
