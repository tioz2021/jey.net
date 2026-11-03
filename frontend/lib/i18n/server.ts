import { cookies, headers } from "next/headers";

import { detectLocale, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/** Cookie wins; otherwise the browser's Accept-Language; otherwise Russian. */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;

  if (isLocale(stored)) {
    return stored;
  }

  const accept = (await headers()).get("accept-language");
  return detectLocale(accept);
}
