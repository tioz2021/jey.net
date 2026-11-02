"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";

import { Button, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { useToast } from "@/components/toasts";
import { useUser } from "@/lib/user-context";

import styles from "./login-form.module.css";

const schema = z.object({
  email: z.email("Некорректный email"),
  // The server only ever answers "wrong email or password"; length is its
  // business, so the form does not check it.
  password: z.string().min(1, "Введите пароль"),
});

type Errors = Partial<Record<"email" | "password" | "form", string>>;

/** Only same-origin paths are allowed as a return address. */
function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/items";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useUser();
  const { notifyError } = useToast();

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  function update(field: "email" | "password", value: string) {
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
          fieldErrors[field as "email" | "password"] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const response = await api.auth.login(parsed.data);
      setUser(response.user);
      router.push(safeNext(searchParams.get("next")));
      router.refresh();
    } catch (error) {
      // The server does not say whether the email exists, and neither do we.
      if (error instanceof ApiError && error.status === 401) {
        setErrors({ form: "Неверный email или пароль" });
      } else if (error instanceof ApiError && error.code === "rate_limited") {
        notifyError(error);
      } else if (error instanceof ApiError) {
        setErrors({ form: error.message });
      } else {
        setErrors({ form: "Не удалось войти. Попробуйте ещё раз" });
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
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
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
        Войти
      </Button>
    </form>
  );
}
