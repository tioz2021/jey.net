"use client";

import { Textarea } from "@/components/ui";
import { StarRating } from "@/components/forms/star-rating";
import { useI18n } from "@/lib/locale-context";

import type { Errors, Values } from "./item-form-model";
import styles from "./item-form.module.css";

export function ItemFormNotes({
  values,
  errors,
  draftRestored,
  onUpdate,
}: {
  values: Values;
  errors: Errors;
  draftRestored: boolean;
  onUpdate: <K extends keyof Values>(field: K, value: Values[K]) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <StarRating
        label={t("form.rating")}
        hint={t("form.ratingHint")}
        value={values.rating}
        onChange={(rating) => onUpdate("rating", rating)}
        error={errors.rating}
      />

      <Textarea
        label={t("form.note")}
        hint={t("form.noteHint")}
        rows={5}
        value={values.review}
        onChange={(event) => onUpdate("review", event.target.value)}
        error={errors.review}
      />

      <Textarea
        label={t("form.privateNote")}
        hint={t("form.privateNoteHint")}
        rows={5}
        value={values.body}
        onChange={(event) => onUpdate("body", event.target.value)}
        error={errors.body}
      />

      {draftRestored ? (
        <p className={styles.draftHint} role="status">
          {t("form.draftRestored")}
        </p>
      ) : null}
    </>
  );
}
