import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Lets shared anchors navigate inside React Router instead of reloading. */
export function NavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    (window as unknown as { __jeyNavigate?: (href: string) => void }).__jeyNavigate = (href) => navigate(href);
    return () => {
      delete (window as unknown as { __jeyNavigate?: (href: string) => void }).__jeyNavigate;
    };
  }, [navigate]);
  return null;
}
