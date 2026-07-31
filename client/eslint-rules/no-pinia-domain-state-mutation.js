const DEFAULT_STORE_IDENTIFIERS = [
  'authStore',
  'overviewStore',
  'selectionStore',
  'uiStore'
];

const STORE_HOOKS = new Set([
  'useAuthStore',
  'useOverviewStore',
  'useSelectionStore',
  'useUiStore'
]);

const COLLECTION_MUTATING_METHODS = new Set([
  'add',
  'clear',
  'copyWithin',
  'delete',
  'fill',
  'pop',
  'push',
  'reverse',
  'set',
  'shift',
  'sort',
  'splice',
  'unshift'
]);

const PINIA_MUTATING_METHODS = new Set([
  '$patch',
  '$reset'
]);

// This function removes parser wrappers without changing the underlying mutation target.
const unwrapExpression = node => {
  let current = node;
  while (current && ['ChainExpression', 'TSAsExpression', 'TSNonNullExpression'].includes(current.type)) {
    current = current.expression;
  }
  return current;
};

// This function returns a statically named member property when one is available.
const memberName = node => {
  if (!node?.computed && node?.property?.type === 'Identifier') return node.property.name;
  if (node?.computed && node?.property?.type === 'Literal') return String(node.property.value);
  return null;
};

// This function identifies whether a member chain is rooted in a known Pinia store instance.
const isStoreOwnedExpression = (node, storeIdentifiers) => {
  const current = unwrapExpression(node);
  if (!current) return false;
  if (current.type === 'Identifier') return storeIdentifiers.has(current.name);
  if (current.type !== 'MemberExpression') return false;

  const object = unwrapExpression(current.object);
  if (
    object?.type === 'ThisExpression'
    && current.property?.type === 'Identifier'
    && storeIdentifiers.has(current.property.name)
  ) {
    return true;
  }
  return isStoreOwnedExpression(object, storeIdentifiers);
};

// This function distinguishes a store instance from state nested beneath that store.
const isStoreRootExpression = (node, storeIdentifiers) => {
  const current = unwrapExpression(node);
  if (current?.type === 'Identifier') return storeIdentifiers.has(current.name);
  return (
    current?.type === 'MemberExpression'
    && unwrapExpression(current.object)?.type === 'ThisExpression'
    && current.property?.type === 'Identifier'
    && storeIdentifiers.has(current.property.name)
  );
};

// This function reports a direct mutation with one stable repository-level message.
const reportMutation = (context, node) => {
  context.report({
    node,
    messageId: 'useAction'
  });
};

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require focused Pinia domain state changes to use owning store actions.'
    },
    schema: [],
    messages: {
      useAction: 'Mutate focused Pinia state through an owning store action.'
    }
  },

  // This function enforces action-owned mutation for script and Vue template expressions.
  create(context) {
    const storeIdentifiers = new Set(DEFAULT_STORE_IDENTIFIERS);

    // This operation learns local variables created directly from focused store hooks.
    const registerStoreVariable = node => {
      const callee = unwrapExpression(node.init)?.callee;
      if (
        node.id?.type === 'Identifier'
        && callee?.type === 'Identifier'
        && STORE_HOOKS.has(callee.name)
      ) {
        storeIdentifiers.add(node.id.name);
      }
    };

    // This operation rejects assignment operators rooted in focused stores.
    const checkAssignment = node => {
      if (isStoreOwnedExpression(node.left, storeIdentifiers)) {
        reportMutation(context, node);
      }
    };

    // This operation rejects increment and decrement operators rooted in focused stores.
    const checkUpdate = node => {
      if (isStoreOwnedExpression(node.argument, storeIdentifiers)) {
        reportMutation(context, node);
      }
    };

    // This operation rejects property deletion rooted in focused stores.
    const checkDelete = node => {
      if (node.operator === 'delete' && isStoreOwnedExpression(node.argument, storeIdentifiers)) {
        reportMutation(context, node);
      }
    };

    // This operation rejects mutating collection methods called on focused store state.
    const checkCall = node => {
      const callee = unwrapExpression(node.callee);
      if (callee?.type !== 'MemberExpression') return;

      const method = memberName(callee);
      const target = callee.object;
      const mutatesPiniaDirectly = PINIA_MUTATING_METHODS.has(method)
        && isStoreRootExpression(target, storeIdentifiers);
      const mutatesOwnedCollection = COLLECTION_MUTATING_METHODS.has(method)
        && isStoreOwnedExpression(target, storeIdentifiers)
        && !isStoreRootExpression(target, storeIdentifiers);
      if (mutatesPiniaDirectly || mutatesOwnedCollection) {
        reportMutation(context, node);
      }
    };

    const scriptVisitor = {
      VariableDeclarator: registerStoreVariable,
      AssignmentExpression: checkAssignment,
      UpdateExpression: checkUpdate,
      UnaryExpression: checkDelete,
      CallExpression: checkCall
    };

    const parserServices = context.sourceCode.parserServices;
    if (!parserServices?.defineTemplateBodyVisitor) return scriptVisitor;

    // This operation rejects two-way template bindings directly against focused store state.
    const templateVisitor = {
      // This visitor treats Vue model bindings as assignments to their target expression.
      "VAttribute[directive=true][key.name.name='model']"(node) {
        if (isStoreOwnedExpression(node.value?.expression, storeIdentifiers)) {
          reportMutation(context, node);
        }
      }
    };

    return parserServices.defineTemplateBodyVisitor(templateVisitor, scriptVisitor);
  }
};
