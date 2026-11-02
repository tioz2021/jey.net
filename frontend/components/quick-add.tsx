"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ItemForm } from "@/components/forms/item-form";
import { useToast } from "@/components/toasts";
import { Dialog } from "@/components/ui";

import styles from "./quick-add.module.css";

/** Creates a record from any page without leaving it. */
export function QuickAdd() {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Добавить запись"
        className={styles.button}
        onClick={() => setOpen(true)}
        title="Добавить запись"
        type="button"
      >
        +
      </button>

      <Dialog open={open} title="Новая запись" onClose={() => setOpen(false)}>
        <ItemForm
          onSaved={() => {
            setOpen(false);
            router.refresh();
            notify({
              tone: "success",
              title: "Запись создана",
              text: "Она уже в каталоге.",
              requestId: null,
            });
          }}
        />
      </Dialog>
    </>
  );
}
