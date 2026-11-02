import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>jey</h1>
      <p className={styles.text}>
        Каркас приложения готов. Страницы входа, списка и статистики появятся в
        следующих задачах — без оформления, только функциональность.
      </p>
      <p className={styles.hint}>
        Проверка связи с сервером:{" "}
        <a href="/health" target="_blank" rel="noreferrer">
          <code>/health</code>
        </a>
      </p>
    </main>
  );
}
