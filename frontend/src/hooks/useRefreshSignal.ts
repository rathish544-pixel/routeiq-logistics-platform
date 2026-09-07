import { useEffect, useRef } from "react";

/**
 * Subscribes to the global "routeiq:refresh" event dispatched when
 * shared data changes (e.g. an order created from the header bar).
 * Calls onRefresh whenever such an event fires.
 */
export function useRefreshSignal(onRefresh: () => void) {
  const handlerRef = useRef(onRefresh);
  handlerRef.current = onRefresh;

  useEffect(() => {
    const handler = () => handlerRef.current();
    window.addEventListener("routeiq:refresh", handler);
    return () => window.removeEventListener("routeiq:refresh", handler);
  }, []);
}

/**
 * Dispatches the global refresh event after a shared-data mutation.
 */
export function emitRefreshSignal() {
  window.dispatchEvent(new CustomEvent("routeiq:refresh"));
}