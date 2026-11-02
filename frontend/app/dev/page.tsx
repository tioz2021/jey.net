"use client";

import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toasts";
import { ApiError } from "@/lib/errors";

import styles from "./page.module.css";

function ToastDemo() {
  const { notify, notifyError } = useToast();

  return (
    <div className={styles.row}>
      <Button
        variant="secondary"
        onClick={() =>
          notifyError(
            new ApiError(
              429,
              "rate_limited",
              "too many attempts",
              { retry_after_secs: 75 },
              "demo-request-rate-limit",
            ),
          )
        }
      >
        Лимит запросов
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          notifyError(
            new ApiError(
              400,
              "validation_error",
              "rating must be between 1 and 10",
              { field: "rating" },
              "demo-request-validation",
            ),
          )
        }
      >
        Ошибка поля
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          notify({
            tone: "success",
            title: "Готово",
            text: "Запись сохранена",
            requestId: null,
          })
        }
      >
        Успех
      </Button>
    </div>
  );
}

export default function DevPlaygroundPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>jey.net</h1>
          <p className={styles.subtitle}>
            Демо-страница базовых компонентов. Страницы портала появятся дальше.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className={styles.sections}>
        <Card title="Кнопки">
          <div className={styles.row}>
            <Button>Основная</Button>
            <Button variant="secondary">Вторичная</Button>
            <Button variant="ghost">Прозрачная</Button>
            <Button variant="danger">Опасная</Button>
          </div>
          <div className={styles.row} style={{ marginTop: "var(--space-4)" }}>
            <Button size="sm">Маленькая</Button>
            <Button loading>Загрузка</Button>
            <Button disabled>Недоступна</Button>
          </div>
        </Card>

        <Card title="Поля">
          <div className={styles.stack}>
            <Input label="Название" placeholder="Interstellar" />
            <Input
              label="Год"
              inputMode="numeric"
              hint="От 1800 до 2100"
              placeholder="2014"
            />
            <Input
              label="Оценка"
              defaultValue="11"
              error="Оценка должна быть от 1 до 10"
            />
            <Textarea
              label="Заметка"
              placeholder="Что запомнилось"
              hint="До 20 000 символов"
            />
            <Select label="Тип" defaultValue="movie">
              <option value="movie">Фильм</option>
              <option value="book">Книга</option>
              <option value="image">Картинка</option>
              <option value="other">Другое</option>
            </Select>
          </div>
        </Card>

        <Card title="Бейджи">
          <div className={styles.row}>
            <Badge>Нейтральный</Badge>
            <Badge tone="accent">Акцент</Badge>
            <Badge tone="success">Готово</Badge>
            <Badge tone="danger">Удалено</Badge>
          </div>
        </Card>

        <Card title="Диалог">
          <p className={styles.paragraph}>
            Диалог построен на нативном &lt;dialog&gt;: Escape, подложка и
            удержание фокуса работают средствами браузера.
          </p>
          <div className={styles.row} style={{ marginTop: "var(--space-4)" }}>
            <Button onClick={() => setDialogOpen(true)}>Открыть диалог</Button>
          </div>
          <Dialog
            open={dialogOpen}
            title="Удалить запись?"
            onClose={() => setDialogOpen(false)}
            footer={
              <>
                <Button
                  variant="secondary"
                  onClick={() => setDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button variant="danger" onClick={() => setDialogOpen(false)}>
                  Удалить
                </Button>
              </>
            }
          >
            <p className={styles.paragraph}>
              Запись переедет в корзину: её можно будет вернуть. Это пример
              содержимого диалога.
            </p>
          </Dialog>
        </Card>

        <Card title="Уведомления">
          <ToastDemo />
        </Card>

        <Card title="Скелетоны">
          <div className={styles.stack}>
            <Skeleton width="60%" />
            <Skeleton width="100%" height="2.5rem" />
            <Skeleton width="80%" />
          </div>
        </Card>
      </div>
    </main>
  );
}
