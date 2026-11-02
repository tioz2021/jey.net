"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { KIND_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { Item, ItemKind, ItemStatus, NewItem } from "@/lib/types";

import { TagInput } from "@/components/items/tag-input";
import { useToast } from "@/components/toasts";
import styles from "./item-form.module.css";

const KINDS = Object.entries(KIND_LABELS) as [ItemKind, string][];

/** Films and pictures are noted instantly; only books and notes are "in progress". */
const STATUS_BY_KIND: Record<ItemKind, ItemStatus[]> = {
  movie: ["planned", "done", "dropped"],
  image: ["planned", "done", "dropped"],
  book: ["planned", "in_progress", "done", "dropped"],
  other: ["planned", "in_progress", "done", "dropped"],
};

const SUBTITLE_LABELS: Record<ItemKind, string> = {
  movie: "Режиссёр",
  book: "Автор",
  image: "Описание",
  other: "Подробности",
};

type Field =
  | "title"
  | "subtitle"
  | "year"
  | "rating"
  | "review"
  | "source_url"
  | "tags"
  | "form";

type Errors = Partial<Record<Field, string>>;

interface Values {
  kind: ItemKind;
  title: string;
  subtitle: string;
  year: string;
  status: ItemStatus;
  rating: string;
  review: string;
  source_url: string;
  tags: string[];
}

const INITIAL: Values = {
  kind: "movie",
  title: "",
  subtitle: "",
  year: "",
  status: "done",
  rating: "",
  review: "",
  source_url: "",
  tags: [],
};

function toValues(item?: Item): Values {
  if (!item) {
    return INITIAL;
  }

  return {
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle ?? "",
    year: item.year === null ? "" : String(item.year),
    status: item.status,
    rating: item.rating === null ? "" : String(item.rating),
    review: item.review ?? "",
    source_url: item.source_url ?? "",
    tags: [...item.tags],
  };
}

function parseNumber(value: string, field: string, errors: Errors): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    errors[field as Field] = "Введите целое число";
    return null;
  }

  return parsed;
}

function validate(values: Values): { errors: Errors; item?: NewItem } {
  const errors: Errors = {};

  const title = values.title.trim();
  if (!title) {
    errors.title = "Название обязательно";
  } else if (title.length > 300) {
    errors.title = "Не больше 300 символов";
  }

  const subtitle = values.subtitle.trim();
  if (subtitle.length > 300) {
    errors.subtitle = "Не больше 300 символов";
  }

  const year = parseNumber(values.year, "year", errors);
  if (year !== null && (year < 1800 || year > 2100)) {
    errors.year = "Год от 1800 до 2100";
  }

  const rating = parseNumber(values.rating, "rating", errors);
  if (rating !== null && (rating < 1 || rating > 10)) {
    errors.rating = "Оценка от 1 до 10";
  }

  if (values.review.length > 20_000) {
    errors.review = "Не больше 20 000 символов";
  }

  const sourceUrl = values.source_url.trim();
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
    errors.source_url = "Ссылка должна начинаться с http:// или https://";
  } else if (sourceUrl.length > 2048) {
    errors.source_url = "Не больше 2048 символов";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors,
    item: {
      kind: values.kind,
      title,
      subtitle: subtitle || null,
      year,
      status: values.status,
      rating,
      review: values.review.trim() || null,
      source_url: sourceUrl || null,
      tags: values.tags,
    },
  };
}

export function ItemForm({
  initial,
  itemId,
}: {
  initial?: Item;
  itemId?: string;
}) {
  const router = useRouter();
  const { notifyError } = useToast();
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const statuses = STATUS_BY_KIND[values.kind];

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field as Field]: undefined }));
  }

  function changeKind(kind: ItemKind) {
    setValues((current) => ({
      ...current,
      kind,
      // A status that does not exist for the new kind would be rejected by
      // the server, so fall back to the first allowed one.
      status: STATUS_BY_KIND[kind].includes(current.status)
        ? current.status
        : (STATUS_BY_KIND[kind][0] ?? "planned"),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validate(values);
    setErrors(result.errors);
    if (!result.item) {
      return;
    }

    setSubmitting(true);
    try {
      const response = itemId
        ? await api.items.update(itemId, result.item)
        : await api.items.create(result.item);

      router.push(`/items/${response.item.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        const field = error.field;
        if (field && field !== "kind" && field !== "status") {
          setErrors({ [field]: error.message });
        } else {
          notifyError(error);
        }
      } else {
        notifyError(error);
      }
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.row}>
        <Select
          label="Тип"
          value={values.kind}
          onChange={(event) => changeKind(event.target.value as ItemKind)}
        >
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          label="Статус"
          value={values.status}
          onChange={(event) => update("status", event.target.value as ItemStatus)}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Название"
        value={values.title}
        onChange={(event) => update("title", event.target.value)}
        error={errors.title}
        required
      />

      <div className={styles.row}>
        <Input
          label={SUBTITLE_LABELS[values.kind]}
          value={values.subtitle}
          onChange={(event) => update("subtitle", event.target.value)}
          error={errors.subtitle}
        />

        <Input
          label="Год"
          inputMode="numeric"
          value={values.year}
          onChange={(event) => update("year", event.target.value)}
          error={errors.year}
        />
      </div>

      <div className={styles.row}>
        <Input
          label="Оценка"
          inputMode="numeric"
          hint="От 1 до 10"
          value={values.rating}
          onChange={(event) => update("rating", event.target.value)}
          error={errors.rating}
        />

        <Input
          label="Ссылка"
          type="url"
          placeholder="https://"
          value={values.source_url}
          onChange={(event) => update("source_url", event.target.value)}
          error={errors.source_url}
        />
      </div>

      <Textarea
        label="Заметка"
        hint="До 20 000 символов"
        rows={5}
        value={values.review}
        onChange={(event) => update("review", event.target.value)}
        error={errors.review}
      />

      <TagInput
        tags={values.tags}
        onChange={(tags) => update("tags", tags)}
        error={errors.tags}
      />

      {errors.form ? (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button type="submit" loading={submitting}>
          {itemId ? "Сохранить изменения" : "Сохранить"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push("/items")}
          disabled={submitting}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
