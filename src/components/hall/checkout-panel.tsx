"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  addSessionItem,
  checkoutSession,
  getReceipt,
  type Receipt,
  removeSessionItem,
} from "@/app/app/session-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useHydrated } from "@/lib/hooks/use-hydrated";

type Method = "cash" | "kaspi" | "card";
const METHODS: Method[] = ["cash", "kaspi", "card"];

// Чек при остановке: время по тарифам и товары считает база, скидку и
// разбивку оплаты вводит администратор. Закрытие и оплаты — одна транзакция.
export function CheckoutPanel({
  sessionId,
  onCancel,
}: {
  sessionId: string;
  onCancel: () => void;
}) {
  const tw = useTranslations("Work");
  const hydrated = useHydrated();
  const [receipt, setReceipt] = useState<Receipt>();
  const [error, setError] = useState<string>();
  const [discount, setDiscount] = useState("");
  const [payments, setPayments] = useState<
    { method: Method; amount: string }[]
  >([{ method: "cash", amount: "" }]);
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    () =>
      startTransition(async () => {
        const r = await getReceipt(sessionId);
        if (r.ok) setReceipt(r.receipt);
        else setError(r.error);
      }),
    [sessionId],
  );
  useEffect(load, [load]);

  if (!receipt) {
    return error ? (
      <p className="text-destructive text-sm">{tw(`errors.${error}`)}</p>
    ) : null;
  }

  const discountValue = /^\d+$/.test(discount) ? Number(discount) : 0;
  const total = Math.max(receipt.subtotal - discountValue, 0);
  // Пока введена одна строка оплаты, она равна итогу.
  const rows =
    payments.length === 1 && payments[0].amount === ""
      ? [{ ...payments[0], amount: String(total) }]
      : payments;
  const distributed = rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="grid gap-4" data-testid="checkout">
      <p className="text-muted-foreground text-sm">{tw("stopHint")}</p>
      <section className="grid gap-1 text-sm" data-testid="receipt">
        <h3 className="font-medium">{tw("receipt")}</h3>
        {receipt.package && (
          <p className="flex justify-between gap-4">
            <span>{tw("packageLine", { name: receipt.package.name })}</span>
            <span>{tw("currency", { amount: receipt.package.price })}</span>
          </p>
        )}
        {receipt.lines.map((line) => (
          <p key={line.tariff_id} className="flex justify-between gap-4">
            <span>
              {tw("receiptLine", {
                name: line.name,
                minutes: line.minutes,
                price: line.price_per_hour,
              })}
            </span>
            <span>{tw("currency", { amount: line.amount })}</span>
          </p>
        ))}
        {receipt.items.map((item) => (
          <p key={item.id} className="flex items-center justify-between gap-4">
            <span>
              {tw("itemLine", { name: item.name, qty: item.qty })}
              <button
                type="button"
                className="text-muted-foreground ml-2 text-xs hover:underline"
                aria-label={tw("removeItem", { name: item.name })}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await removeSessionItem(item.id);
                    if (!r.ok) setError(r.error);
                    load();
                  })
                }
              >
                ✕
              </button>
            </span>
            <span>{tw("currency", { amount: item.price * item.qty })}</span>
          </p>
        ))}
        <p className="flex justify-between gap-4 border-t pt-1 font-medium">
          <span>{tw("subtotal")}</span>
          <span data-testid="receipt-subtotal">
            {tw("currency", { amount: receipt.subtotal })}
          </span>
        </p>
      </section>

      <form
        className="grid grid-cols-[1fr_6rem_4rem_auto] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const formData = new FormData(form);
          startTransition(async () => {
            const r = await addSessionItem(sessionId, formData);
            if (r.ok) {
              form.reset();
              setError(undefined);
            } else setError(r.error);
            load();
          });
        }}
      >
        <div className="grid min-w-0 gap-1">
          <Label htmlFor="item-name" className="text-xs">
            {tw("itemName")}
          </Label>
          <Input id="item-name" name="name" maxLength={100} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="item-price" className="text-xs">
            {tw("itemPrice")}
          </Label>
          <Input id="item-price" name="price" type="number" min={0} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="item-qty" className="text-xs">
            {tw("itemQty")}
          </Label>
          <Input
            id="item-qty"
            name="qty"
            type="number"
            min={1}
            defaultValue={1}
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending || !hydrated}>
          {tw("addItem")}
        </Button>
      </form>

      <div className="grid max-w-48 gap-1">
        <Label htmlFor="discount">{tw("discount")}</Label>
        <Input
          id="discount"
          type="number"
          min={0}
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>

      <p className="flex justify-between text-lg font-semibold">
        <span>{tw("total")}</span>
        <span data-testid="receipt-total">
          {tw("currency", { amount: total })}
        </span>
      </p>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{tw("payment")}</legend>
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label={`${tw("payment")} ${i + 1}`}
              value={row.method}
              onChange={(e) =>
                setPayments(
                  rows.map((p, j) =>
                    j === i ? { ...p, method: e.target.value as Method } : p,
                  ),
                )
              }
            >
              {METHODS.map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {tw(`methods.${m}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              type="number"
              min={0}
              className="w-32"
              aria-label={`${tw("paymentAmount")} ${i + 1}`}
              value={row.amount}
              onChange={(e) =>
                setPayments(
                  rows.map((p, j) =>
                    j === i ? { ...p, amount: e.target.value } : p,
                  ),
                )
              }
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPayments(rows.filter((_, j) => j !== i))}
              >
                {tw("removePayment")}
              </Button>
            )}
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setPayments([
                ...rows,
                {
                  method: rows.length === 1 ? "kaspi" : "card",
                  amount: String(Math.max(total - distributed, 0)),
                },
              ])
            }
          >
            {tw("splitPayment")}
          </Button>
        </div>
        {distributed !== total && (
          <p className="text-sm text-amber-700">
            {tw("paidLeft", { amount: total - distributed })}
          </p>
        )}
      </fieldset>

      {error && (
        <p className="text-destructive text-sm" data-testid="work-error">
          {tw(`errors.${error}`)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="lg"
          disabled={pending || !hydrated}
          onClick={() =>
            startTransition(async () => {
              const r = await checkoutSession(
                sessionId,
                discountValue,
                rows
                  .map((p) => ({
                    method: p.method,
                    amount: Number(p.amount) || 0,
                  }))
                  .filter((p) => p.amount > 0),
              );
              if (!r.ok) setError(r.error);
            })
          }
        >
          {pending ? tw("checkingOut") : tw("checkout")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tw("backToGame")}
        </Button>
      </div>
    </div>
  );
}
