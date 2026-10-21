// Ответы RPC отчётов (jsonb), см. docs/DATABASE.md.

export type RevenueReport = {
  total: number;
  by_method: { cash: number; kaspi: number; card: number };
  by_day: {
    day: string;
    total: number;
    cash: number;
    kaspi: number;
    card: number;
  }[];
  by_resource: {
    resource_id: string;
    name: string;
    total: number;
    sessions: number;
  }[];
};

export const PAYMENT_METHODS = ["cash", "kaspi", "card"] as const;

export type LoadReport = {
  open_minutes: number;
  resources: {
    resource_id: string;
    name: string;
    busy_minutes: number;
    // null — за период заведение ещё не работало (нет часов работы).
    percent: number | null;
  }[];
  bookings: {
    total: number;
    online: number;
    online_share: number | null;
    no_show: number;
    online_no_show: number;
  };
  no_shows_by_day: { day: string; count: number }[];
  no_shows_by_guest: { name: string | null; phone: string; count: number }[];
};
