import { getSafeErrorDetails } from '../debug.js';
import { getInferenceRequestId } from '../middleware/requestLifecycle.js';

export class CompletionBudgetError extends Error {
  constructor() {
    super('Structured completion exhausted its token budget before finishing the answer');
    this.name = 'CompletionBudgetError';
    this.code = 'INFERENCE_COMPLETION_BUDGET_EXHAUSTED';
  }
}

// Inspect completion metadata before parsers turn truncated output into valid empty results.
export const createStructuredCompletion = async (client, request, {
  capability = 'GENERATION',
  operation,
  reasoningEffort
}) => {
  const response = await client.chat.completions.create({
    ...request,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  });
  const choice = response.choices?.[0];
  if (choice?.finish_reason === 'length') {
    const error = new CompletionBudgetError();
    const hasReasoning = [choice.message?.reasoning_content, choice.message?.reasoning]
      .some(value => typeof value === 'string' && value.trim().length > 0);
    const completionTokens = response.usage?.completion_tokens;
    const tokenBudget = request.max_completion_tokens ?? request.max_tokens;
    console.warn(
      `[INFERENCE] Structured completion exhausted its token budget. ${hasReasoning
        ? `Consider ${capability}_REASONING_EFFORT=none if supported by the backend/model.`
        : 'Check the model output limit and structured-output support.'}`,
      {
        ...getSafeErrorDetails(error),
        operation,
        requestId: getInferenceRequestId(),
        finishReason: 'length',
        hasReasoning,
        ...(Number.isSafeInteger(tokenBudget) && tokenBudget > 0 ? { tokenBudget } : {}),
        ...(Number.isSafeInteger(completionTokens) && completionTokens >= 0 ? { completionTokens } : {})
      }
    );
    throw error;
  }
  return choice?.message?.content || '';
};
