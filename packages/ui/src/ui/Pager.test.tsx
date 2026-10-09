import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { Pager, paginate } from "./Pager";

describe("paginate", () => {
  const list = ["a", "b", "c", "d", "e"];

  it("cuts the list into pages", () => {
    expect(paginate(list, 1, 2)).toEqual({
      pageCount: 3,
      currentPage: 1,
      firstIndex: 0,
      items: ["a", "b"],
    });
    expect(paginate(list, 3, 2)).toEqual({
      pageCount: 3,
      currentPage: 3,
      firstIndex: 4,
      items: ["e"],
    });
  });

  it("clamps an out-of-range page to the nearest one", () => {
    expect(paginate(list, 0, 2).currentPage).toBe(1);
    expect(paginate(list, 9, 2)).toMatchObject({ currentPage: 3, items: ["e"] });
  });

  it("has one empty page for an empty list", () => {
    expect(paginate([], 1, 2)).toEqual({
      pageCount: 1,
      currentPage: 1,
      firstIndex: 0,
      items: [],
    });
  });
});

describe("Pager", () => {
  it("steps to the previous and next page", () => {
    const onPageChange = vi.fn();
    render(<Pager page={2} pageCount={3} onPageChange={onPageChange} />);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("marks Previous disabled on the first page and Next on the last, and ignores them there", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pager page={1} pageCount={2} onPageChange={onPageChange} />,
    );
    const previous = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(previous);
    expect(onPageChange).not.toHaveBeenCalled();
    rerender(<Pager page={2} pageCount={2} onPageChange={onPageChange} />);
    expect(previous).toHaveAttribute("aria-disabled", "false");
    expect(next).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(next);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("keeps the focus on Next onto the last page, and says the page it is on", () => {
    const { rerender } = render(<Pager page={1} pageCount={2} onPageChange={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Next" });
    next.focus();
    const status = screen.getByRole("status");
    rerender(<Pager page={2} pageCount={2} onPageChange={vi.fn()} />);
    expect(next).toHaveFocus();
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Page 2 of 2");
  });
});
