function normalize(version: string): number[] {
  return version
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const aPart = a[index] ?? 0;
    const bPart = b[index] ?? 0;

    if (aPart > bPart) {
      return 1;
    }

    if (aPart < bPart) {
      return -1;
    }
  }

  return 0;
}

export function isVersionBelowMinimum(currentVersion: string, minimumVersion: string): boolean {
  return compareVersions(currentVersion, minimumVersion) < 0;
}
