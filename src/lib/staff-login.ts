// Сотрудник входит по логину без email (этап 9.3). Supabase Auth нужен
// email, поэтому логин хранится как служебный адрес на домене, куда письма
// не уходят: aigerim → aigerim@staff.local. Пароль задаёт и меняет владелец.
export const STAFF_EMAIL_DOMAIN = "staff.local";

// Латиница, цифры, точка, дефис и подчёркивание; 3–32 символа.
export const STAFF_LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function staffEmail(login: string) {
  return `${login}@${STAFF_EMAIL_DOMAIN}`;
}

export function staffLogin(email: string): string | null {
  const suffix = `@${STAFF_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : null;
}
