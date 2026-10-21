"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      language?: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Виджет Cloudflare Turnstile. Токен одноразовый: после отправки формы
// виджет пересоздают сменой key у компонента.
export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callback.current = onToken;
  });

  useEffect(() => {
    if (!ready || !ref.current || !window.turnstile) return;
    const id = window.turnstile.render(ref.current, {
      sitekey: siteKey,
      language: "ru",
      callback: (token) => callback.current(token),
      "expired-callback": () => callback.current(""),
      "error-callback": () => callback.current(""),
    });
    return () => window.turnstile?.remove(id);
  }, [ready, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
      />
      <div ref={ref} className="min-h-16" data-testid="turnstile" />
    </>
  );
}
