"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";

import { Button, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { useUser } from "@/lib/user-context";

import styles from "./register-form.module.css";

// Mirrors the server rules: 10–128 characters, 1–60 for the name.
const schema = z.object({
  email: z.email("Некорректный email"),
  display_name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(60, "Не больше 60 символов"),
  password: z
    .string()
    .min(10, "Минимум 10 символов")
    .max(128, "Не больше 128 символов"),
});

type Field = "email" | "display_name" | "password" | "form";
type Errors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ["email", "display_name", "password"];

export function RegisterForm() {
  const router = useRouter();
  const { setUser } = useUser();
  const [values, setValues] = useState({
    email: "",
    display_name: "",
    password: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field as Field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const response = await api.auth.register(parsed.data);
      setUser(response.user);
      router.push("/items");
    } catch (error) {
      if (error instanceof ApiError) {
        const field = error.field;
        if (field && FIELDS.includes(field as Field)) {
          setErrors({ [field]: error.message });
        } else if (error.status === 409) {
          setErrors({ email: "Аккаунт с таким email уже существует" });
        } else {
          setErrors({ form: error.message });
        }
      } else {
        setErrors({ form: "Не удалось отправить форму. Попробуйте ещё раз" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(event) => update("email", event.target.value)}
        error={errors.email}
        required
      />
      <Input
        label="Имя"
        name="display_name"
        autoComplete="nickname"
        value={values.display_name}
        onChange={(event) => update("display_name", event.target.value)}
        error={errors.display_name}
        required
      />
      <Input
        label="Пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Минимум 10 символов"
        value={values.password}
        onChange={(event) => update("password", event.target.value)}
        error={errors.password}
        required
      />

      {errors.form ? (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      ) : null}

      <Button type="submit" loading={submitting}>
        Создать аккаунт
      </Button>
    </form>
  );
}
