"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";

/** Re-fetches the TMDB snapshot, keeping the user's own edits intact. */
export function RefreshMovieButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { notify, notifyError } = useToast();
  const [pending, setPending] = useState(false);

  async function refresh() {
    setPending(true);

    try {
      await api.items.refresh(itemId);
      router.refresh();
      notify({
        tone: "success",
        title: "Данные обновлены",
        text: "Актёры и факты загружены заново из TMDB.",
        requestId: null,
      });
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      loading={pending}
      size="sm"
      variant="secondary"
      onClick={refresh}
    >
      Обновить из TMDB
    </Button>
  );
}
