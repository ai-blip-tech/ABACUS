export type PlanogramClipboardItem = {
  id: string;
  x: number;
  y: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clonePlanogramItem<T extends PlanogramClipboardItem>(source: T, id: string, pasteIndex: number): T {
  const clone = structuredClone(source);
  const offset = Math.max(1, pasteIndex) * 2.5;
  return {
    ...clone,
    id,
    x: clamp(source.x + offset, 0, 94),
    y: clamp(source.y + offset, 0, 94),
  };
}

export function isEditablePlanogramShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}
