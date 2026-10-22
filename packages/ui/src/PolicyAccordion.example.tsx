import { PolicyAccordion, type MerchantPolicyInfo } from "./PolicyAccordion.js";

const examplePolicy: MerchantPolicyInfo = {
  returnWindowDays: 30,
  restockingFeePercent: 10,
  freeShippingThresholdStroops: "500000000", // 50 XLM in stroops
  escrowProtectionNotice:
    "Purchases are secured by Delego smart contract escrow. Funds are released only after you verify delivery.",
};

export function PolicyAccordionExample() {
  return (
    <div style={{ maxWidth: "600px", padding: "1.5rem" }}>
      <h2>Product Details & Merchant Policies</h2>
      <PolicyAccordion
        policy={examplePolicy}
        merchantName="Stellar Crafts"
        warrantyInfo="1-year manufacturer warranty against functional defects."
        fulfillmentTerms="Dispatched within 24 hours with tracked on-chain shipping milestones."
      />
    </div>
  );
}
