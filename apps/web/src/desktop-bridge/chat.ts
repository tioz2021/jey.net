import type { BridgeContext } from "./context";

export async function handleChat(ctx: BridgeContext): Promise<Response | null> {
  const { api, url, path, method, body, json, remote } = ctx;

  if (path === "/api/v1/chat/threads" && method === "GET") {
    return json(await api.invoke("local_chat_threads"));
  }
  if (path === "/api/v1/chat/unread" && method === "GET") {
    return json(await api.invoke("local_chat_unread"));
  }

  const chatMessages = path.match(/^\/api\/v1\/chat\/threads\/([^/]+)\/messages$/);
  if (chatMessages) {
    const threadId = chatMessages[1];
    if (method === "GET") {
      const before = url.searchParams.get("before");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      return json(
        await api.invoke("local_chat_messages", {
          threadId,
          before,
          limit: Number.isFinite(limit) ? limit : 50,
        }),
      );
    }
    if (method === "POST") {
      if (body?.reply_to_id) return remote(method, path, body);
      try {
        return json(
          await api.invoke("local_chat_send", {
            threadId,
            body: body?.body ?? null,
            clientId: body?.client_id,
            encrypted: body?.encrypted ?? null,
          }),
        );
      } catch {
        return remote(method, path, body);
      }
    }
  }

  const chatUserDevices = path.match(/^\/api\/v1\/chat\/users\/([^/]+)\/devices$/);
  if (chatUserDevices && method === "GET") {
    return json(
      await api.invoke("local_chat_user_devices", {
        userId: chatUserDevices[1],
      }),
    );
  }

  const chatRead = path.match(/^\/api\/v1\/chat\/threads\/([^/]+)\/read$/);
  if (chatRead && method === "POST") {
    return json(await api.invoke("local_chat_read", { threadId: chatRead[1] }));
  }

  const chatMute = path.match(/^\/api\/v1\/chat\/threads\/([^/]+)\/mute$/);
  if (chatMute && (method === "POST" || method === "DELETE")) {
    return json(
      await api.invoke("local_chat_mute", {
        threadId: chatMute[1],
        muted: method === "POST",
      }),
    );
  }

  const chatThread = path.match(/^\/api\/v1\/chat\/threads\/([^/]+)$/);
  if (chatThread && method === "GET") {
    try {
      return json(await api.invoke("local_chat_thread", { threadId: chatThread[1] }));
    } catch {
      return remote(method, path);
    }
  }

  return null;
}
