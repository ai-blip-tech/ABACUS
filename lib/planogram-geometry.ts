export type PlanogramRoomGeometry = { width: number; length: number };
export type PlanogramItemGeometry = {
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
};

const minimumItemPercent = 4;

export function planogramItemSizePercent(item: Pick<PlanogramItemGeometry, "width" | "depth">, room: PlanogramRoomGeometry) {
  return {
    width: Math.max(minimumItemPercent, item.width / room.width * 100),
    depth: Math.max(minimumItemPercent, item.depth / room.length * 100),
  };
}

export function planogramItemPositionBounds(item: PlanogramItemGeometry, room: PlanogramRoomGeometry) {
  const size = planogramItemSizePercent(item, room);
  const radians = item.rotation * Math.PI / 180;
  // CSS percentages use the board's width for X and height for Y. Convert the
  // crossed axis before calculating the rotated pixel contour.
  const depthOnXAxis = size.depth * room.length / room.width;
  const widthOnYAxis = size.width * room.width / room.length;
  const boundingWidth = Math.abs(size.width * Math.cos(radians)) + Math.abs(depthOnXAxis * Math.sin(radians));
  const boundingDepth = Math.abs(widthOnYAxis * Math.sin(radians)) + Math.abs(size.depth * Math.cos(radians));

  return {
    minX: (boundingWidth - size.width) / 2,
    maxX: 100 - (size.width + boundingWidth) / 2,
    minY: (boundingDepth - size.depth) / 2,
    maxY: 100 - (size.depth + boundingDepth) / 2,
    ...size,
    boundingWidth,
    boundingDepth,
  };
}

function clampAxis(value: number, minimum: number, maximum: number) {
  if (minimum > maximum) return (minimum + maximum) / 2;
  return Math.max(minimum, Math.min(maximum, value));
}

export function clampPlanogramItemToRoom<T extends PlanogramItemGeometry>(item: T, room: PlanogramRoomGeometry): T {
  const bounds = planogramItemPositionBounds(item, room);
  return {
    ...item,
    x: clampAxis(item.x, bounds.minX, bounds.maxX),
    y: clampAxis(item.y, bounds.minY, bounds.maxY),
  };
}

export function planogramItemCenterPercent(item: PlanogramItemGeometry, room: PlanogramRoomGeometry) {
  const size = planogramItemSizePercent(item, room);
  return {
    x: item.x + size.width / 2,
    y: item.y + size.depth / 2,
  };
}
