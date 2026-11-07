import { useParams } from "react-router-dom";

import { LandingScreen } from "@/components/public/landing-screen";
import { PublicProfileScreen } from "@/components/public/public-profile-screen";

export function LandingRoute() {
  return <LandingScreen />;
}

export function PublicProfileRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <PublicProfileScreen id={id} />;
}
