import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Lets shared anchors navigate inside React Router instead of reloading. */
export function NavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    (window as unknown as { __jeyNavigate?: (href: string) => void }).__jeyNavigate = (href) => navigate(href);
    return () => {
      delete (window as unknown as { __jeyNavigate?: (href: string) => void }).__jeyNavigate;
    };
  }, [navigate]);

  useEffect(() => {
    window.dispatchEvent(new Event("jey:route-changed"));
  }, [location.pathname, location.search]);

  useEffect(() => {
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    window.scrollTo({ top: 0, left: 0, behavior });
  }, [location.pathname]);

  useEffect(() => {
    const pending = window.sessionStorage.getItem("jey-after-login");
    if (pending) {
      window.sessionStorage.removeItem("jey-after-login");
      navigate(pending);
    }
  }, [navigate]);

  return null;
}
