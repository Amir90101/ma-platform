// Текст уведомлений для Telegram (HTML-разметка бота). Чистая функция:
// перевод передаёт вызывающий, чтобы её можно было проверить в юнит-тестах.

export type NotificationKind =
  "booking_created" | "booking_cancelled" | "booking_no_show" | "shift_closed";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type BookingPayload = {
  venue: string;
  timezone: string;
  resource: string;
  starts_at: string;
  ends_at: string;
  source: "online" | "phone" | "manual";
  guests: number | null;
  comment: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  package: string | null;
  cancel_reason: string | null;
  cancelled_by_guest: boolean;
};

export type ShiftPayload = {
  venue: string;
  timezone: string;
  closed_by: string | null;
  expected_cash: number | null;
  closing_cash: number | null;
};

export function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const money = (n: number) => n.toLocaleString("ru-RU");

export function formatNotification(
  kind: NotificationKind,
  payload: BookingPayload | ShiftPayload,
  t: Translate,
): string {
  if (kind === "shift_closed") return formatShift(payload as ShiftPayload, t);

  const b = payload as BookingPayload;
  const day = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: b.timezone,
  }).format(new Date(b.starts_at));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: b.timezone,
    }).format(new Date(iso));

  const title = {
    booking_created: t("bookingCreated"),
    booking_cancelled: t("bookingCancelled"),
    booking_no_show: t("bookingNoShow"),
  }[kind];
  const lines = [
    `<b>${escapeHtml(title)}</b> · ${escapeHtml(b.venue)}`,
    escapeHtml(
      t("when", {
        resource: b.resource,
        day,
        from: time(b.starts_at),
        to: time(b.ends_at),
      }),
    ),
  ];
  const guest = [b.customer_name, b.customer_phone].filter(Boolean).join(", ");
  if (guest) lines.push(escapeHtml(guest));
  if (kind === "booking_created") {
    lines.push(escapeHtml(t(`source.${b.source}`)));
    if (b.package) lines.push(escapeHtml(t("package", { name: b.package })));
    if (b.guests) lines.push(escapeHtml(t("guests", { count: b.guests })));
    if (b.comment) lines.push(escapeHtml(t("comment", { text: b.comment })));
  }
  if (kind === "booking_cancelled") {
    lines.push(
      escapeHtml(
        b.cancelled_by_guest
          ? t("cancelledByGuest")
          : t("cancelReason", { reason: b.cancel_reason ?? "—" }),
      ),
    );
  }
  return lines.join("\n");
}

function formatShift(s: ShiftPayload, t: Translate) {
  const expected = s.expected_cash ?? 0;
  const counted = s.closing_cash ?? 0;
  const diff = counted - expected;
  const lines = [
    `<b>${escapeHtml(t("shiftClosed"))}</b> · ${escapeHtml(s.venue)}`,
    escapeHtml(t("closedBy", { name: s.closed_by ?? "—" })),
    escapeHtml(
      t("cash", {
        expected: money(expected),
        counted: money(counted),
        diff: money(diff),
      }),
    ),
  ];
  if (diff < 0) {
    lines.push(`<b>${escapeHtml(t("shortage", { amount: money(-diff) }))}</b>`);
  }
  return lines.join("\n");
}
