import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PublicProfileView } from "@/components/public-profile";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { getPublicProfile } from "@/lib/public-profile";
import { languageAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await getServerLocale();
  const data = await getPublicProfile(id);

  if (!data) {
    return {
      title: `${translate(locale, "notFound.profile")} — jey.net`,
      robots: { index: false },
    };
  }

  const { profile, items } = data;
  const publicPath = `/u/${profile.handle}`;
  const description =
    items.length > 0
      ? `${translate(locale, "public.finished", { count: items.length })} · jey.net`
      : translate(locale, "public.empty");

  return {
    title: `${profile.display_name} — jey.net`,
    robots: data.preview ? { index: false, follow: false } : undefined,
    description,
    alternates: {
      canonical: publicPath,
      languages: languageAlternates(publicPath),
    },
    openGraph: {
      type: "profile",
      title: profile.display_name,
      description,
      url: publicPath,
      images: profile.avatar_key
        ? [`/media/${profile.avatar_key}`]
        : ["/og.png"],
    },
    twitter: {
      card: profile.avatar_key ? "summary" : "summary_large_image",
      title: profile.display_name,
      description,
      images: profile.avatar_key
        ? [`/media/${profile.avatar_key}`]
        : ["/og.png"],
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

  if (data.profile.handle && data.profile.handle !== id) {
    redirect(`/u/${data.profile.handle}`);
  }

  return (
    <PublicProfileView
      items={data.items}
      preview={data.preview}
      profile={data.profile}
    />
  );
}
