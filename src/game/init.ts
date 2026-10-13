import RAPIER from '@dimforge/rapier2d-compat';

let initPromise: Promise<void> | null = null;

export function initRapier(): Promise<void> {
  if (!initPromise) {
    initPromise = RAPIER.init();
  }
  return initPromise;
}
