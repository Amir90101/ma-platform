"use client";

import { useState } from "react";
import { BookingPicker, type PickedSlot } from "./booking-picker";
import type { PublicHall } from "./types";

// Онлайн-бронь на публичной странице: выбор окна, затем форма гостя.
export function PublicBooking(props: {
  venueId: string;
  timezone: string;
  today: string;
  maxDaysAhead: number;
  minDuration: number;
  slotStep: number;
  halls: PublicHall[];
}) {
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  return <BookingPicker {...props} picked={picked} onPick={setPicked} />;
}
