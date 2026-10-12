// Shift the decimal point for display without rounding fractional query thresholds.
export function formatQualityPercent(value) {
  const [whole, fraction = ''] = String(value).split('.');
  const integer = `${whole || '0'}${fraction.padEnd(2, '0').slice(0, 2)}`.replace(/^0+(?=\d)/, '');
  const decimal = fraction.slice(2).replace(/0+$/, '');
  return decimal ? `${integer}.${decimal}` : integer;
}
