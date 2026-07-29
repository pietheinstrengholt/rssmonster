// This function flattens one Express parameter value without dropping repeats.
export const normalizeGreaderParameterValues = value => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.flatMap(normalizeGreaderParameterValues);
  }

  return [String(value)];
};

// This function reads all body and query occurrences while preserving source order.
export const getGreaderParameterValues = (req, name) => [
  ...normalizeGreaderParameterValues(req.body?.[name]),
  ...normalizeGreaderParameterValues(req.query?.[name])
];

// This function reads the first normalized compatibility parameter.
export const getFirstGreaderParameterValue = (req, name) =>
  getGreaderParameterValues(req, name)[0];
