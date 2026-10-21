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
