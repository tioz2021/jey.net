import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const titles: Array<[string, string]> = [
  ["/items/new", "Добавить запись"],
  ["/items", "Мои записи"],
  ["/collections", "Коллекции"],
  ["/feed", "Лента"],
  ["/recommendations", "Рекомендации"],
  ["/people", "Люди"],
  ["/notifications", "Уведомления"],
  ["/dashboard", "Обзор"],
  ["/trash", "Корзина"],
  ["/settings", "Настройки"],
  ["/admin", "Админка"],
  ["/login", "Вход"],
  ["/privacy", "Политика конфиденциальности"],
  ["/terms", "Условия использования"],
];

export function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = titles.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    document.title = match ? `${match[1]} — jey.net` : pathname.startsWith("/u/") ? "Профиль — jey.net" : "jey.net — личный каталог";
  }, [pathname]);
  return null;
}
