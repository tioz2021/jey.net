/**
 * Turns API errors into short messages a person can act on.
 *
 * The server's stable `code` decides the wording; `details.field` names the
 * input to highlight. Server messages stay in English on purpose: the client
 * owns the user-facing language.
 */

import type { PluralForms, TranslationKey } from "./i18n";
import { isApiError } from "./errors";

export interface ErrorTranslator {
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  plural: (count: number, forms: PluralForms) => string;
}

const FIELD_KEYS: Record<string, TranslationKey> = {
  email: "field.email",
  display_name: "field.display_name",
  title: "form.title",
  subtitle: "field.subtitle",
  year: "form.year",
  rating: "form.rating",
  review: "form.note",
  source_url: "field.source_url",
  tags: "form.tags",
  kind: "form.kind",
  status: "form.status",
  locale: "field.locale",
  q: "field.q",
  external_id: "field.external_id",
  details: "field.details",
};

export interface DescribedError {
  title: string;
  text: string;
  requestId: string | null;
}

export function describeError(
  error: unknown,
  x: ErrorTranslator,
): DescribedError {
  if (!isApiError(error)) {
    return {
      title: x.t("error.fallbackTitle"),
      text: x.t("error.fallbackText"),
      requestId: null,
    };
  }

  const requestId = error.requestId;

  switch (error.code) {
    case "rate_limited": {
      const seconds = error.details?.retry_after_secs;
      return {
        title: x.t("error.rateTitle"),
        text: seconds
          ? x.t("error.rateRetry", { duration: duration(seconds, x) })
          : x.t("error.rateText"),
        requestId,
      };
    }

    case "validation_error": {
      const field = error.field;
      const label = field ? FIELD_KEYS[field] : null;

      return {
        title: x.t("error.validationTitle"),
        text: label
          ? x.t("error.validationField", { field: x.t(label) })
          : x.t("error.validationText"),
        requestId,
      };
    }

    case "unauthorized":
      return {
        title: x.t("error.unauthorizedTitle"),
        text: x.t("error.unauthorizedText"),
        requestId,
      };

    case "forbidden":
      return {
        title: x.t("error.forbiddenTitle"),
        text: x.t("error.forbiddenText"),
        requestId,
      };

    case "not_found":
      return {
        title: x.t("error.notFoundTitle"),
        text: x.t("error.notFoundText"),
        requestId,
      };

    case "conflict":
      return {
        title: x.t("error.conflictTitle"),
        text: x.t("error.conflictText"),
        requestId,
      };

    case "method_not_allowed":
      return {
        title: x.t("error.methodTitle"),
        text: x.t("error.methodText"),
        requestId,
      };

    case "payload_too_large":
      return {
        title: x.t("error.tooLargeTitle"),
        text: x.t("error.tooLargeText"),
        requestId,
      };

    case "unsupported_media_type":
      return {
        title: x.t("error.mediaTitle"),
        text: x.t("error.mediaText"),
        requestId,
      };

    case "unavailable":
      return {
        title: x.t("error.unavailableTitle"),
        text: x.t("error.unavailableText"),
        requestId,
      };

    case "internal":
      return {
        title: x.t("error.internalTitle"),
        text: x.t("error.internalText"),
        requestId,
      };

    default:
      return {
        title: x.t("error.fallbackTitle"),
        text: x.t("error.fallbackText"),
        requestId,
      };
  }
}

function duration(seconds: number, x: ErrorTranslator): string {
  if (seconds < 60) {
    return x.plural(seconds, {
      one: x.t("error.seconds.one", { n: seconds }),
      few: x.t("error.seconds.few", { n: seconds }),
      many: x.t("error.seconds.many", { n: seconds }),
      other: x.t("error.seconds.many", { n: seconds }),
    });
  }

  const minutes = Math.ceil(seconds / 60);

  return x.plural(minutes, {
    one: x.t("error.minutes.one", { n: minutes }),
    few: x.t("error.minutes.few", { n: minutes }),
    many: x.t("error.minutes.many", { n: minutes }),
    other: x.t("error.minutes.many", { n: minutes }),
  });
}
