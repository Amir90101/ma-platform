import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// true после гидратации. Кнопки форм на Server Actions держим неактивными
// до неё: нажатие на медленном устройстве до подключения React теряется.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
