// Варианты длительности на публичной странице: от минимальной брони с шагом
// 30 минут (или шагом слота, если он 60), всего шесть часов вариантов.
export function durationOptions(
  minDuration: number,
  slotStep: number,
): number[] {
  const inc = slotStep === 60 ? 60 : 30;
  // Минимальная длительность, кратная шагу слота: иначе окон не будет.
  const first = Math.ceil(minDuration / slotStep) * slotStep;
  const options: number[] = [];
  for (let m = first; m <= first + 6 * 60 && m <= 24 * 60; m += inc) {
    options.push(m);
  }
  return options;
}
