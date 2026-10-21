import { act, render, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { useInfiniteScroll } from "./useInfiniteScroll";

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(private readonly callback: IntersectionObserverCallback) {
    IntersectionObserverMock.instances.push(this);
  }
  trigger(isIntersecting = true) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function Harness({ loadMore, hasMore = true, disabled = false }: { loadMore: () => Promise<void> | void; hasMore?: boolean; disabled?: boolean }) {
  const ref = useInfiniteScroll({ hasMore, isLoading: false, onLoadMore: loadMore, disabled });
  return <div ref={ref} />;
}

describe("useInfiniteScroll", () => {
  beforeEach(() => {
    IntersectionObserverMock.instances = [];
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads once for repeated observer callbacks while a request is pending", async () => {
    let finish!: () => void;
    const loadMore = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<Harness loadMore={loadMore} />);

    act(() => {
      IntersectionObserverMock.instances[0].trigger();
      IntersectionObserverMock.instances[0].trigger();
    });
    expect(loadMore).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1));
  });

  it("does not observe when the catalog is complete", () => {
    const loadMore = vi.fn();
    render(<Harness loadMore={loadMore} hasMore={false} />);
    expect(IntersectionObserverMock.instances).toHaveLength(0);
  });

  it("disconnects the observer during cleanup", () => {
    const loadMore = vi.fn();
    const { unmount } = render(<Harness loadMore={loadMore} />);
    const observer = IntersectionObserverMock.instances[0];
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("is safe when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    expect(() => render(<Harness loadMore={vi.fn()} />)).not.toThrow();
  });
});
