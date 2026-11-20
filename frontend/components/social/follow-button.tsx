"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useToast } from "@/components/toasts";
import { useUser } from "@/lib/user-context";

export function FollowButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { notifyError } = useToast();
  const { user } = useUser();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user || user.id === userId) return;
    api.follows
      .status(userId)
      .then((state) => {
        if (!cancelled) setFollowing(state.following);
      })
      .catch(() => {
        if (!cancelled) setFollowing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, user]);

  if (!user || user.id === userId || following === null) return null;

  async function toggle() {
    setBusy(true);
    try {
      const state = following
        ? await api.follows.unfollow(userId)
        : await api.follows.follow(userId);
      setFollowing(state.following);
      window.dispatchEvent(new Event("jey:follows-updated"));
    } catch (cause) {
      notifyError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      aria-pressed={following}
      disabled={busy}
      onClick={() => void toggle()}
      size="sm"
      variant="secondary"
    >
      {following ? t("feed.following") : t("feed.follow")}
    </Button>
  );
}
