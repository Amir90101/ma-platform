import { Suspense } from "react";
import { OnlineBookingAlerts } from "@/components/bookings/online-booking-alerts";

// Общая обёртка экранов заведения: уведомления о новых онлайн-бронях
// видны на любом из них и не теряются при переходах. id заведения
// уведомления берут из адреса (useParams) — только во время запроса,
// поэтому они внутри Suspense и не мешают пререндеру оболочки.
export default function VenueLayout({
  children,
}: LayoutProps<"/app/[venueId]">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <OnlineBookingAlerts />
      </Suspense>
    </>
  );
}
