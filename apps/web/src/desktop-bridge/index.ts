import { reportClientError } from "@/lib/client-errors";

import { handleAccount } from "./account";
import { handleChat } from "./chat";
import { createBridgeContext, type BridgeContext, type Invoke } from "./context";
import { handleItems } from "./items";
import { handleSocial } from "./social";

type Handler = (ctx: BridgeContext) => Promise<Response | null>;

const HANDLERS: Handler[] = [handleAccount, handleItems, handleSocial, handleChat];

function tauri(): { invoke: Invoke } | null {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return api?.core?.invoke ? { invoke: api.core.invoke } : null;
}

/** Offline bridge for the catalogue subset. Unknown API calls are rejected. */
export function installDesktopBridge() {
  const api = tauri();
  if (!api) return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!raw.includes("/api/v1/")) return originalFetch(input, init);
    const url = new URL(raw, window.location.origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const ctx = createBridgeContext(api, url, method, body || undefined);

    try {
      for (const handler of HANDLERS) {
        const response = await handler(ctx);
        if (response) return response;
      }
      return await ctx.fallback();
    } catch (error) {
      reportClientError("desktop-bridge", error);
      return ctx.fallback();
    }
  };
}
