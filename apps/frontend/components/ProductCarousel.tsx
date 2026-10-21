"use client";

import { useState, useRef, useEffect } from "react";
import { ProductCard } from "./ProductCard";
import type { RecommendedProduct } from "./ProductCard";

const CARDS_TO_SHOW = 3;
const CARDS_PER_PAGE = CARDS_TO_SHOW;
const SCROLL_SPEED = 300;

export interface ProductCarouselProps {
  products: RecommendedProduct[];
  onSelect: (productId: string) => void;
  onQuickAdd: (productId: string) => void;
  /** Optional ARIA label for the carousel */
  ariaLabel?: string;
}

const carouselContainerStyle = {
  display: "flex",
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  padding: "1rem 0",
  scrollBehavior: "smooth",
  "-webkit-overflow-scrolling": "touch",
};

const cardStyle = {
  flex: "0 0 auto",
  width: `calc(100% / ${CARDS_TO_SHOW} - 1rem)`,
  marginRight: "0.5rem",
  marginBottom: "1rem",
  scrollSnap: "center",
};

const prevButtonStyle = {
  position: "absolute",
  left: "1rem",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 10,
  border: "none",
  background: "rgba(37, 99, 235, 0.8)",
  color: "#fff",
  padding: "0.5rem",
  borderRadius: "0.375rem",
  cursor: "pointer",
  display: "none",
  "@media (min-width: 768px)": {
    display: "block",
  },
};

const nextButtonStyle = {
  position: "absolute",
  right: "1rem",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 10,
  border: "none",
  background: "rgba(37, 99, 235, 0.8)",
  color: "#fff",
  padding: "0.5rem",
  borderRadius: "0.375rem",
  cursor: "pointer",
  display: "none",
  "@media (min-width: 768px)": {
    display: "block",
  },
};

const dotStyle = {
  width: "0.75rem",
  height: "0.75rem",
  borderRadius: "9999px",
  background: "#d1d5db",
  margin: "0 0.25rem",
  cursor: "pointer",
  transition: "background 0.2s",
  "&.active": {
    background: "#2563eb",
  },
};

const paginationContainerStyle = {
  display: "flex",
  justifyContent: "center",
  marginTop: "1rem",
};

export function ProductCarousel({
  products,
  onSelect,
  onQuickAdd,
  ariaLabel = "Product carousel",
}: ProductCarouselProps) {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const scrollPosition = containerRef.current.scrollLeft;
      const cardWidth = containerRef.current.clientWidth / CARDS_TO_SHOW + 0.5;
      const visibleIndex = Math.round(scrollPosition / cardWidth);
      setVisibleIndex(Math.max(0, Math.min(visibleIndex, products.length - CARDS_TO_SHOW)));
    };
    containerRef.current?.addEventListener("scroll", handleScroll);
    return () => containerRef.current?.removeEventListener("scroll", handleScroll);
  }, [products.length]);

  const handleSelect = (productId: string) => {
    onSelect(productId);
  };

  const handleQuickAdd = (productId: string) => {
    onQuickAdd(productId);
  };

  const totalPages = Math.max(1, products.length - CARDS_TO_SHOW + 1);

  const handlePageClick = (index: number) => {
    if (!containerRef.current) return;
    const cardWidth = containerRef.current.clientWidth / CARDS_TO_SHOW + 0.5;
    const scrollPosition = index * cardWidth;
    containerRef.current.scrollTo({
      left: scrollPosition,
      behavior: "smooth",
    });
    setVisibleIndex(index);
  };

  return (
    <div
      className="product-carousel"
      aria-label={ariaLabel}
      style={carouselContainerStyle}
      ref={containerRef}
    >
      {/* Prev Arrow */}
      <button
        type="button"
        onClick={() => {
          if (!containerRef.current) return;
          const currentScroll = containerRef.current.scrollLeft;
          const cardWidth = containerRef.current.clientWidth / CARDS_TO_SHOW + 0.5;
          containerRef.current.scrollLeft = Math.max(
            0,
            currentScroll - (cardWidth * CARDS_TO_SHOW)
          );
        }}
        aria-label="Previous page"
        style={prevButtonStyle}
      >
        ← Prev
      </button>

      {/* Next Arrow */}
      <button
        type="button"
        onClick={() => {
          if (!containerRef.current) return;
          const currentScroll = containerRef.current.scrollLeft;
          const cardWidth = containerRef.current.clientWidth / CARDS_TO_SHOW + 0.5;
          const maxScroll = containerRef.current.scrollWidth - containerRef.current.clientWidth;
          containerRef.current.scrollLeft = Math.min(
            maxScroll,
            currentScroll + (cardWidth * CARDS_TO_SHOW)
          );
        }}
        aria-label="Next page"
        style={nextButtonStyle}
      >
        Next →
      </button>

      {/* Product Cards */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {products.map((product, index) => {
          const startIndex = visibleIndex;
          const isVisible =
            index >= startIndex && index < startIndex + CARDS_TO_SHOW;
          const cardIndex = isVisible ? index - startIndex : -1;

          return isVisible ? (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={() => handleSelect(product.id)}
              onQuickAdd={() => handleQuickAdd(product.id)}
              style={cardStyle}
            />
          ) : null;
        })}
      </div>

      {/* Pagination Dots */}
      <div style={paginationContainerStyle}>
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            type="button"
            style={dotStyle}
            className={i === visibleIndex ? "active" : ""}
            onClick={() => handlePageClick(i)}
            aria-label={`Go to page ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Next Arrow */}
      <button
        type="button"
        onClick={() => {
          if (!containerRef.current) return;
          const currentScroll = containerRef.current.scrollLeft;
          const cardWidth = containerRef.current.clientWidth / CARDS_TO_SHOW + 0.5;
          const maxScroll = containerRef.current.scrollWidth - containerRef.current.clientWidth;
          containerRef.current.scrollLeft = Math.min(
            maxScroll,
            currentScroll + (cardWidth * CARDS_TO_SHOW)
          );
        }}
        aria-label="Next page"
        style={nextButtonStyle}
      >
        Next →
      </button>
    </div>
  );
}