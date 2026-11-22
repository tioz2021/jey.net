// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedCardHeader } from "./feed-card-header";
import { FeedKindFilter } from "./feed-kind-filter";
import { RecommendationReviews } from "./recommendation-reviews";
import { LocaleProvider } from "@/lib/locale-context";

function wrap(ui: React.ReactNode) {
  return <LocaleProvider initialLocale="ru">{ui}</LocaleProvider>;
}

const reviews = [
  { author_name: "Alice", author_handle: "alice", rating: 10, review: "First", updated_at: "2026-01-03" },
  { author_name: "Bob", author_handle: "bob", rating: 9, review: "Second", updated_at: "2026-01-02" },
  { author_name: "Carol", author_handle: "carol", rating: 8, review: "Third", updated_at: "2026-01-01" },
];

describe("feed card components", () => {
  it("renders social proof, score and header actions", () => {
    render(wrap(
      <FeedCardHeader
        actions={<button type="button">action</button>}
        avatars={[{ name: "Alice" }, { name: "Bob" }]}
        score="9/10"
      >
        Alice, Bob
      </FeedCardHeader>,
    ));

    expect(screen.getByText("Alice, Bob")).toBeInTheDocument();
    expect(screen.getByText("9/10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "action" })).toBeInTheDocument();
  });

  it("shows two reviews first and expands the rest", () => {
    render(wrap(<RecommendationReviews reviews={reviews} />));

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("Third")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Показать все 3 рецензии" }));
    expect(screen.getByText("Third")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Свернуть" }));
    expect(screen.queryByText("Third")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty review list", () => {
    const { container } = render(wrap(<RecommendationReviews reviews={[]} />));
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the selected category and its counts", () => {
    const onChange = vi.fn();
    render(wrap(
      <FeedKindFilter
        counts={{ all: 12, movie: 7, game: 5 }}
        onChange={onChange}
        value={null}
      />,
    ));

    expect(screen.getByRole("button", { name: /Все записи/ })).toHaveTextContent("12");
    fireEvent.click(screen.getByRole("button", { name: /Игры/ }));
    expect(onChange).toHaveBeenCalledWith("game");
  });
});
