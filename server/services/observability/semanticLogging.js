const enabled = value => ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());

// Reuses the established component debug switches for verbose semantic diagnostics.
export const isSemanticDebugEnabled = (
  component,
  environment = process.env
) => {
  if (component === 'topic') {
    return enabled(environment.TOPIC_DEBUG) || enabled(environment.EVENT_DEBUG);
  }
  if (component === 'island') {
    return enabled(environment.ISLAND_DEBUG) || enabled(environment.EVENT_DEBUG);
  }
  return enabled(environment.EVENT_DEBUG);
};

export const debugSemanticLog = (component, ...values) => {
  if (isSemanticDebugEnabled(component)) console.log(...values);
};

export default { debugSemanticLog, isSemanticDebugEnabled };
