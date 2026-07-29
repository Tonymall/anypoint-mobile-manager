// ============================================================
// Anypoint Mobile Platform - ARM API version state
// ============================================================
// Deliberately dependency-free so api.ts can reset it without
// creating an import cycle with armApiVersion.ts.
// ============================================================

export type ArmApiVersion = 'v1' | 'v2';

/** The version we try first; the console uses v2. */
export const PREFERRED_ARM_VERSION: ArmApiVersion = 'v2';

let pinnedVersion: ArmApiVersion | null = null;

/** The ARM base path for the version in effect (preferred until proven otherwise). */
export function getArmBase(): string {
  return `/armui/api/${pinnedVersion ?? PREFERRED_ARM_VERSION}`;
}

/** The negotiated version; null means nothing has been negotiated yet. */
export function getArmVersion(): ArmApiVersion | null {
  return pinnedVersion;
}

export function pinArmVersion(version: ArmApiVersion): void {
  pinnedVersion = version;
}

/** Forget the negotiated version (session or region change). */
export function resetArmVersion(): void {
  pinnedVersion = null;
}
