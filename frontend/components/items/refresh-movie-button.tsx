"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";

/** Re-fetches the TMDB snapshot, keeping the user's own edits intact. */
export function RefreshMovieButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { notify, notifyError } = useToast();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);

  async function refresh() {
    setPending(true);

    try {
      await api.items.refresh(itemId);
      router.refresh();
      notify({
        tone: "success",
        title: t("item.refreshed"),
        text: t("item.refreshedText"),
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
      {t("item.refresh")}
    </Button>
  );
}
