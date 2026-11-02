import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicProfileView } from "@/components/public-profile";
import { getPublicProfile } from "@/lib/public-profile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getPublicProfile(id);

  if (!data) {
    return { title: "Профиль не найден — jey.net", robots: { index: false } };
  }

  const { profile, items } = data;
  const description =
    items.length > 0
      ? `Завершённых записей: ${items.length}. Фильмы, книги и картинки, собранные в jey.net.`
      : "Публичный профиль в jey.net.";

  return {
    title: `${profile.display_name} — jey.net`,
    description,
    alternates: { canonical: `/u/${id}` },
    openGraph: {
      type: "profile",
      title: profile.display_name,
      description,
      url: `/u/${id}`,
      images: profile.avatar_key ? [`/media/${profile.avatar_key}`] : undefined,
    },
    twitter: {
      card: "summary",
      title: profile.display_name,
      description,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProfile(id);

  if (!data) {
    notFound();
  }

  return <PublicProfileView items={data.items} profile={data.profile} />;
}
