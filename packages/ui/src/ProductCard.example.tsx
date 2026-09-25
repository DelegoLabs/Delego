/**
 * Example usage of the ProductCard component
 * This file demonstrates how to use ProductCard in an agent conversation
 */

import { ProductCard, type RecommendedProduct } from "./ProductCard.js";

// Example product data
const exampleProduct: RecommendedProduct = {
  id: "prod_12345",
  title: "Wireless Bluetooth Headphones",
  description: "Premium noise-cancelling headphones with 30-hour battery life",
  priceStroops: "500000000", // 50 XLM in stroops
  currency: "XLM",
  merchantAddress: "GAXYZ...",
  merchantRating: 4.5,
  imageUrl: "https://example.com/product-image.jpg",
  inStock: true,
};

// Example usage in a React component
export function ProductRecommendationExample() {
  const handleSelect = (productId: string) => {
    console.log(`User selected product: ${productId}`);
    // Trigger agent action to proceed with purchase
  };

  const handleReject = (productId: string) => {
    console.log(`User rejected product: ${productId}`);
    // Ask agent to recommend another product
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Product Recommendation</h2>
      <p>Based on your preferences, I found this product:</p>
      
      <ProductCard
        product={exampleProduct}
        onSelect={handleSelect}
        onReject={handleReject}
      />
    </div>
  );
}

// Example: Multiple products in a grid
export function MultipleProductsExample() {
  const products: RecommendedProduct[] = [
    exampleProduct,
    {
      id: "prod_67890",
      title: "Smart Watch Pro",
      description: "Fitness tracking with heart rate monitor and GPS",
      priceStroops: "300000000", // 30 XLM
      currency: "USDC",
      merchantAddress: "GABCD...",
      merchantRating: 4.8,
      imageUrl: "https://example.com/watch.jpg",
      inStock: false, // Out of stock example
    },
  ];

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Here are some products you might like:</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1.5rem",
          marginTop: "1rem",
        }}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onSelect={(id) => console.log("Selected:", id)}
            onReject={(id) => console.log("Rejected:", id)}
          />
        ))}
      </div>
    </div>
  );
}
