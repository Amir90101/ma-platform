import { redirect } from "next/navigation";

// Регистрация закрыта (этап 9.2): заведения подключает владелец платформы,
// владелец заведения получает приглашение на email.
export default function RegisterPage() {
  redirect("/login");
}
