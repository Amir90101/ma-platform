// Схема без пустых краёв: рабочий экран и страница гостя показывают только
// ту часть зала, где что-то стоит, — на телефоне места крупнее.
type Placed = { x: number; y: number; w: number; h: number; rotation: number };

export const FIT_PADDING = 30;

export function fitToItems<T extends Placed>(
  hall: { width: number; height: number },
  items: T[],
): { size: { width: number; height: number }; items: T[] } {
  if (items.length === 0) return { size: hall, items };
  // Повёрнутые фигуры берём с запасом: по большей стороне от центра.
  const boxes = items.map((i) => {
    if (!i.rotation) return [i.x, i.y, i.x + i.w, i.y + i.h];
    const r = Math.max(i.w, i.h) / 2;
    const cx = i.x + i.w / 2;
    const cy = i.y + i.h / 2;
    return [cx - r, cy - r, cx + r, cy + r];
  });
  const minX = Math.max(0, Math.min(...boxes.map((b) => b[0])) - FIT_PADDING);
  const minY = Math.max(0, Math.min(...boxes.map((b) => b[1])) - FIT_PADDING);
  const maxX = Math.min(
    hall.width,
    Math.max(...boxes.map((b) => b[2])) + FIT_PADDING,
  );
  const maxY = Math.min(
    hall.height,
    Math.max(...boxes.map((b) => b[3])) + FIT_PADDING,
  );
  return {
    size: { width: maxX - minX, height: maxY - minY },
    items: items.map((i) => ({ ...i, x: i.x - minX, y: i.y - minY })),
  };
}
