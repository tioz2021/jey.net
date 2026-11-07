/** Public profile URLs use a handle; the item API expects the user UUID. */
export async function resolvePublicUserId(handle: string): Promise<string> {
  const response = await fetch(`/api/v1/public/users/${encodeURIComponent(handle)}`, { credentials: "include" });
  if (!response.ok) throw new Error("public profile not found");
  const data = (await response.json()) as { profile: { id: string } };
  return data.profile.id;
}
