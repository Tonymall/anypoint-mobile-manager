// ============================================================
// API Detail - pure helpers
// ============================================================

export function normalizePolicyKey(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
