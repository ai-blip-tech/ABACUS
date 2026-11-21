export const wallFinishFields = [
  'roomDesignFinishes', 'roomDesignMouldings', 'roomDesignProfiles', 'roomDesignProfileSettings', 'roomDesignTiles',
  'roomDesignTileSettings', 'roomDesignTileFillReport', 'roomDesignTileRegions', 'roomDesignTileProducts',
] as const;

export type PlannerWallFinish = Partial<Record<(typeof wallFinishFields)[number], unknown>>;

function isBoundedValue(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 2048;
  if (Array.isArray(value)) return value.length <= 5000 && value.every(item => isBoundedValue(item, depth + 1));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const entries = Object.entries(value);
  return entries.length <= 100 && entries.every(([key, item]) =>
    /^[\w-]{1,160}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && isBoundedValue(item, depth + 1));
}

export function validatePlannerWallFinish(value: unknown): PlannerWallFinish {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(value).length > 250_000 || !isBoundedValue(value)
    || Object.keys(value).some(key => !wallFinishFields.includes(key as typeof wallFinishFields[number]))) {
    throw Error('Некорректные данные отделки стены');
  }
  return value as PlannerWallFinish;
}

export function readPlannerWallFinish(metadata: Record<string, unknown>): PlannerWallFinish {
  return validatePlannerWallFinish(JSON.parse(JSON.stringify(Object.fromEntries(
    wallFinishFields.filter(field => metadata[field] !== undefined).map(field => [field, metadata[field]]),
  ))));
}
