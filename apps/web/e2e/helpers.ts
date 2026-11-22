import { expect, type APIRequestContext, type BrowserContext } from "@playwright/test";

export const API = "http://127.0.0.1:8091";
const PASSWORD = "correct horse battery";
let registrationIp = 0;

export interface Account {
  id: string;
  handle: string;
  name: string;
  email: string;
  cookie: string;
}

function sessionFrom(response: Awaited<ReturnType<APIRequestContext["post"]>>): Promise<string> {
  const header = response
    .headersArray()
    .find((entry) => entry.name.toLowerCase() === "set-cookie")?.value;
  if (!header) throw new Error("registration did not set a session cookie");
  const pair = header.split(";")[0];
  if (!pair.startsWith("jey_session=")) throw new Error("unexpected session cookie");
  return Promise.resolve(pair);
}

export async function register(
  request: APIRequestContext,
  name: string,
): Promise<Account> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  registrationIp += 1;
  const response = await request.post(`${API}/api/v1/auth/register`, {
    headers: { "x-forwarded-for": `10.0.0.${registrationIp}` },
    data: { email, password: PASSWORD, display_name: name },
  });
  if (response.status() !== 201) {
    throw new Error(`registration failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return {
    id: body.user.id,
    handle: body.user.handle,
    name,
    email,
    cookie: await sessionFrom(response),
  };
}

export async function useSession(context: BrowserContext, account: Account) {
  await context.addCookies([
    {
      name: "jey_session",
      value: account.cookie.replace("jey_session=", ""),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function createItem(
  request: APIRequestContext,
  account: Account,
  input: {
    title: string;
    rating?: number;
    review?: string;
    kind?: string;
  },
) {
  const response = await request.post(`${API}/api/v1/items`, {
    headers: { cookie: account.cookie },
    data: {
      kind: input.kind ?? "movie",
      title: input.title,
      status: "done",
      rating: input.rating ?? 9,
      review: input.review ?? "E2E review",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).item as { id: string; slug: string; title: string };
}

export async function follow(
  request: APIRequestContext,
  viewer: Account,
  author: Account,
) {
  const response = await request.post(`${API}/api/v1/users/${author.id}/follow`, {
    headers: { cookie: viewer.cookie },
    data: {},
  });
  expect(response.status()).toBe(200);
}

export function unique(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
