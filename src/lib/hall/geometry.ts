// Геометрия карты зала. Координаты в условных единицах холста зала,
// x и y — левый верхний угол фигуры без поворота, поворот вокруг центра.

export const GRID = 10;
export const MIN_SIZE = 20;

export function snap(value: number, step = GRID): number {
  return Math.round(value / step) * step;
}

// Konva отдаёт поворот в любых градусах, база хранит 0–359.
export function normalizeRotation(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type Box = { x: number; y: number; w: number; h: number };

// Фигура целиком внутри зала с учётом поворота: держим в зале описанный
// вокруг повёрнутой фигуры прямоугольник, двигая её центр.
export function clampToHall(
  box: Box & { rotation?: number },
  hall: { width: number; height: number },
): Box {
  const w = clamp(box.w, MIN_SIZE, hall.width);
  const h = clamp(box.h, MIN_SIZE, hall.height);
  const rad = ((box.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = Math.min((w * cos + h * sin) / 2, hall.width / 2);
  const halfH = Math.min((w * sin + h * cos) / 2, hall.height / 2);
  const cx = clamp(box.x + w / 2, halfW, hall.width - halfW);
  const cy = clamp(box.y + h / 2, halfH, hall.height - halfH);
  return { w, h, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) };
}

// Следующее свободное имя: «Стол 1», «Стол 2» → «Стол 3».
export function nextName(prefix: string, names: string[]): string {
  const pattern = new RegExp(`^${escapeRegExp(prefix)} (\\d+)$`);
  const max = names.reduce((acc, name) => {
    const n = Number(pattern.exec(name)?.[1] ?? 0);
    return Math.max(acc, n);
  }, 0);
  return `${prefix} ${max + 1}`;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Свободное место для новой фигуры: сканируем сетку слева направо, сверху вниз.
export function freeSpot(
  size: { w: number; h: number },
  taken: Box[],
  hall: { width: number; height: number },
  gap = 20,
): { x: number; y: number } {
  for (let y = gap; y + size.h <= hall.height; y += GRID * 2) {
    for (let x = gap; x + size.w <= hall.width; x += GRID * 2) {
      const box = { x, y, ...size };
      if (!taken.some((t) => overlaps(box, t, gap))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function overlaps(a: Box, b: Box, gap: number) {
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}
