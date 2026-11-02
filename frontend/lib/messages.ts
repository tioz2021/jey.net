/**
 * Turns API errors into short Russian messages a person can act on.
 *
 * The server's `code` decides the wording; `details.field` names the input to
 * highlight, and `request_id` is kept so a failure can be traced in the logs.
 */

import { errorMessage, isApiError } from "./errors";

/** Human names for the fields the API reports. */
export const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Пароль",
  current_password: "Текущий пароль",
  new_password: "Новый пароль",
  display_name: "Имя",
  title: "Название",
  subtitle: "Подзаголовок",
  year: "Год",
  rating: "Оценка",
  review: "Заметка",
  source_url: "Ссылка",
  tags: "Теги",
  kind: "Тип",
  status: "Статус",
  locale: "Язык",
  q: "Поиск",
  cursor: "Курсор страницы",
  limit: "Размер страницы",
  sort: "Сортировка",
  format: "Формат файла",
  token: "Токен",
  id: "Идентификатор",
};

export interface DescribedError {
  title: string;
  text: string;
  requestId: string | null;
}

export function describeError(error: unknown): DescribedError {
  if (!isApiError(error)) {
    return {
      title: "Не получилось",
      text: errorMessage(error),
      requestId: null,
    };
  }

  const requestId = error.requestId;

  switch (error.code) {
    case "rate_limited": {
      const seconds = error.details?.retry_after_secs;
      return {
        title: "Слишком много запросов",
        text: seconds
          ? `Повторите через ${formatDuration(seconds)}.`
          : "Подождите немного и попробуйте снова.",
        requestId,
      };
    }

    case "validation_error": {
      const field = error.field;
      const label = field ? (FIELD_LABELS[field] ?? field) : null;

      return {
        title: "Проверьте данные",
        text: label
          ? `Поле «${label}»: ${error.message}`
          : error.message,
        requestId,
      };
    }

    case "unauthorized":
      return {
        title: "Нужно войти",
        text: "Сессия истекла. Войдите снова.",
        requestId,
      };

    case "forbidden":
      return {
        title: "Нет доступа",
        text: "У этого действия нет прав.",
        requestId,
      };

    case "not_found":
      return {
        title: "Не найдено",
        text: "Запись уже удалена или принадлежит другому аккаунту.",
        requestId,
      };

    case "conflict":
      return {
        title: "Уже существует",
        text: error.message,
        requestId,
      };

    case "method_not_allowed":
      return {
        title: "Действие недоступно",
        text: "Этот способ запроса не поддерживается.",
        requestId,
      };

    case "internal":
      return {
        title: "Ошибка на сервере",
        text: "Мы записали её в журнал. Попробуйте ещё раз чуть позже.",
        requestId,
      };

    default:
      return {
        title: "Не получилось",
        text: error.message,
        requestId,
      };
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} ${plural(seconds, "секунду", "секунды", "секунд")}`;
  }

  const minutes = Math.ceil(seconds / 60);

  return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")}`;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}
