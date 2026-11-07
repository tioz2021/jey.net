import { useParams } from "react-router-dom";

import { LandingScreen } from "@/components/public/landing-screen";
import { PublicProfileScreen } from "@/components/public/public-profile-screen";
import { PublicCollectionScreen } from "@/components/public/public-collection-screen";

export function LandingRoute() {
  return <LandingScreen />;
}

export function PublicProfileRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <PublicProfileScreen id={id} />;
}

export function PublicCollectionRoute() {
  const { id = "", slug = "" } = useParams<{ id: string; slug: string }>();
  return <PublicCollectionScreen id={id} slug={slug} />;
}
