// This function reduces transport failures to stable resource-state diagnostics.
export function normalizeResourceError(error) {
  const status = Number(error?.response?.status);
  return {
    message: error?.message || 'The resource could not be loaded.',
    code: error?.code || null,
    status: Number.isFinite(status) ? status : null
  };
}
