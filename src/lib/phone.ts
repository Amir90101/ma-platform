// Телефон гостя в формате базы +7XXXXXXXXXX. Принимает «8 700 123 45 67»,
// «+7 (700) 123-45-67», «7001234567». null — номер не распознан.
export function normalizeKzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    return `+7${digits.slice(1)}`;
  }
  return null;
}
