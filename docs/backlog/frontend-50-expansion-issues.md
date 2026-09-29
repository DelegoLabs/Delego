# Frontend Expansion Backlog (50 Issues)

Comprehensive, developer-ready issues for `apps/frontend` (`@delegolabs/web`) and `packages/ui` (`@delegolabs/ui`).
**Sizing:** 1–2 developer-days per issue (~75 dev-days total).
**Prerequisites:** All issues include explicit TypeScript data types, component props, and request/response models.

---

## 📋 Table of Contents
1. [Theme 1: AI Agent Conversational Commerce & Copilot (FE-01 – FE-10)](#theme-1-ai-agent-conversational-commerce--copilot)
2. [Theme 2: Merchant Portal & Storefront UI (FE-11 – FE-20)](#theme-2-merchant-portal--storefront-ui)
3. [Theme 3: Stellar Web3 Superpowers & Frictionless Auth (FE-21 – FE-30)](#theme-3-stellar-web3-superpowers--frictionless-auth)
4. [Theme 4: Real-World Delivery & Dispute UI (FE-31 – FE-40)](#theme-4-real-world-delivery--dispute-ui)
5. [Theme 5: Advanced Controls, Team Approvals & Analytics (FE-41 – FE-50)](#theme-5-advanced-controls-team-approvals--analytics)

---

## Theme 1: AI Agent Conversational Commerce & Copilot

### Conversational Buyer Agent Chat Drawer
- **Estimate:** 2 days
- **Context:** Users need an interactive slide-out chat interface to converse with their Buyer Agent to find products and review purchase proposals.
- **Data Types:**
```typescript
export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status: "sending" | "streaming" | "complete" | "error";
  toolCalls?: AgentToolCall[];
  proposalId?: string;
}

export interface AgentToolCall {
  toolName: "search_catalog" | "check_limits" | "estimate_escrow";
  arguments: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
}
```
- **Tasks:**
  - [ ] Implement `ChatDrawer` in `apps/frontend/components/chat/ChatDrawer.tsx`
  - [ ] Add message history list with auto-scroll on new stream chunks
  - [ ] Support expandable tool-call indicators showing agent reasoning
  - [ ] Add unit tests in `ChatDrawer.test.tsx`
- **Acceptance Criteria:**
  - [ ] Drawer opens smoothly via navbar shortcut or Cmd+J
  - [ ] Renders messages with distinct user and assistant styling
  - [ ] Displays loading skeleton during agent generation

---

### In-Chat Product Recommendation Card
- **Estimate:** 1 day
- **Context:** When the agent recommends products, it should render rich interactive product cards inside the conversation stream.
- **Data Types:**
```typescript
export interface RecommendedProduct {
  id: string;
  title: string;
  description: string;
  priceStroops: string;
  currency: "USDC" | "XLM" | "EURC";
  merchantAddress: string;
  merchantRating: number; // 0 to 5.0
  imageUrl: string;
  inStock: boolean;
}

export interface ProductCardProps {
  product: RecommendedProduct;
  onSelect: (productId: string) => void;
  onReject: (productId: string) => void;
}
```
- **Tasks:**
  - [ ] Create `ProductCard` component in `packages/ui/src/ProductCard.tsx`
  - [ ] Display image, price formatted via `formatAmount`, and merchant star rating
  - [ ] Add "Buy with Agent" and "Skip" action buttons
- **Acceptance Criteria:**
  - [ ] Formats currency and stroops correctly
  - [ ] Handles missing image fallback gracefully

---

### Interactive Purchase Proposal Card Inside Chat
- **Estimate:** 2 days
- **Context:** When an agent proposes a purchase, render an actionable proposal card in chat allowing 1-click escrow approval.
- **Data Types:**
```typescript
export interface PurchaseProposal {
  proposalId: string;
  orderId: string;
  itemTitle: string;
  amountStroops: string;
  assetCode: string;
  merchantAddress: string;
  estimatedDeliveryDays: number;
  requiresApproval: boolean;
  spendingLimitRemainingStroops: string;
  expiresAt: string;
}

export interface PurchaseProposalCardProps {
  proposal: PurchaseProposal;
  onApprove: (proposalId: string) => Promise<void>;
  onDecline: (proposalId: string, reason?: string) => Promise<void>;
}
```
- **Tasks:**
  - [ ] Create `PurchaseProposalCard.tsx` in `apps/frontend/components/chat/`
  - [ ] Wire 1-click approval trigger calling `api.approveProposal`
  - [ ] Display countdown badge before proposal expiration
- **Acceptance Criteria:**
  - [ ] Clicking Approve triggers transaction preview modal if signature is required
  - [ ] Shows disabled state once approved or expired

---

### Agent Reasoning & Step Trace Visualizer
- **Estimate:** 1 day
- **Context:** Give users visibility into how the agent decided to pick a merchant or negotiate a discount.
- **Data Types:**
```typescript
export interface AgentExecutionStep {
  stepIndex: number;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  details?: string;
  durationMs?: number;
  timestamp: string;
}

export interface AgentTraceViewerProps {
  steps: AgentExecutionStep[];
  isLive: boolean;
}
```
- **Tasks:**
  - [ ] Build accordion-style trace stepper component
  - [ ] Add pulsing indicator for live running steps
- **Acceptance Criteria:**
  - [ ] Step timings display in seconds/ms
  - [ ] Error steps highlight in red with failure explanation

---

### Buyer Agent Persona & Autonomy Settings Card
- **Estimate:** 1 day
- **Context:** Let users configure agent aggressiveness (e.g. prioritize lowest price vs. highest merchant rating).
- **Data Types:**
```typescript
export type OptimizationStrategy = "lowest_price" | "highest_rating" | "fastest_delivery" | "balanced";

export interface AgentPersonaConfig {
  agentId: string;
  name: string;
  strategy: OptimizationStrategy;
  maxAutonomousBudgetStroops: string;
  negotiationAllowed: boolean;
  preferredAsset: "USDC" | "XLM" | "EURC";
}
```
- **Tasks:**
  - [ ] Create `AgentSettingsCard.tsx` under `apps/frontend/components/settings/`
  - [ ] Add radio card group for strategies and slider for autonomous threshold
- **Acceptance Criteria:**
  - [ ] Form changes persist via `PUT /api/agent/config`
  - [ ] Toast notification appears on successful save

---

### Voice Input Mic Button for Agent Prompts
- **Estimate:** 1 day
- **Context:** Allow users to speak their purchase instructions on mobile/desktop via Web Speech API.
- **Data Types:**
```typescript
export interface VoiceInputState {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
}

export interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}
```
- **Tasks:**
  - [ ] Build `VoiceInputButton` with Web Speech API recognition hook
  - [ ] Animate recording waveform while listening
- **Acceptance Criteria:**
  - [ ] Injects recognized text directly into chat input
  - [ ] Shows disabled tooltip if browser lacks Web Speech support

---

### Agent User Preference Memory Inspector & Editor
- **Estimate:** 2 days
- **Context:** Users should see and delete what preferences the agent has memorized (e.g., shoe size, address, brand preferences).
- **Data Types:**
```typescript
export interface AgentMemoryItem {
  id: string;
  category: "personal" | "preference" | "constraint" | "history";
  key: string;
  value: string;
  confidence: number; // 0.0 - 1.0
  updatedAt: string;
}

export interface AgentMemoryTableProps {
  memories: AgentMemoryItem[];
  onDelete: (id: string) => Promise<void>;
}
```
- **Tasks:**
  - [ ] Build memory table with category badges and search filter
  - [ ] Add single-item delete and "Clear All Memories" modal
- **Acceptance Criteria:**
  - [ ] Immediate UI optimistic delete on removal
  - [ ] Confirms before bulk clearing

---

### Contextual Quick Prompt Chips
- **Estimate:** 1 day
- **Context:** Show smart prompt suggestions based on user shopping history (e.g. "Reorder coffee beans", "Check pending approvals").
- **Data Types:**
```typescript
export interface PromptChip {
  id: string;
  label: string;
  promptText: string;
  category: "reorder" | "query" | "approval";
}

export interface PromptChipsBarProps {
  chips: PromptChip[];
  onSelect: (promptText: string) => void;
}
```
- **Tasks:**
  - [ ] Implement horizontally scrollable chips bar above chat input
  - [ ] Add keyboard navigation support (arrow keys + Enter)
- **Acceptance Criteria:**
  - [ ] Clicking a chip populates chat input and automatically sends prompt

---

### Live Agent Activity Status Banner
- **Estimate:** 1 day
- **Context:** Top bar banner indicating what the agent is currently doing in the background (e.g. "Searching 12 merchants for headphones...").
- **Data Types:**
```typescript
export interface AgentLiveStatus {
  agentId: string;
  state: "idle" | "searching" | "negotiating" | "awaiting_approval" | "executing";
  currentTaskDescription?: string;
  activeOrderId?: string;
}
```
- **Tasks:**
  - [ ] Create `AgentLiveStatusBanner` in layout header
  - [ ] Connect to WebSocket notification stream for live status events
- **Acceptance Criteria:**
  - [ ] Smooth slide-in/slide-out animation when agent transitions from idle to active

---

### Agent Order Simulation Comparison Drawer
- **Estimate:** 2 days
- **Context:** Before placing an order, show a side-by-side comparison of merchant quotes found by the agent.
- **Data Types:**
```typescript
export interface MerchantQuote {
  merchantId: string;
  merchantName: string;
  itemPriceStroops: string;
  shippingPriceStroops: string;
  estimatedDeliveryDays: number;
  reputationScore: number;
  contractEscrowSupported: boolean;
}

export interface QuoteComparisonDrawerProps {
  quotes: MerchantQuote[];
  onSelectQuote: (merchantId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}
```
- **Tasks:**
  - [ ] Build table/cards drawer comparing price, delivery, and reputation
  - [ ] Highlight the agent's recommended best-value pick
- **Acceptance Criteria:**
  - [ ] Sortable by total cost, speed, or reputation score

---

## Theme 2: Merchant Portal & Storefront UI

### Merchant Store Registration & Soroban Verification Wizard
- **Estimate:** 2 days
- **Context:** Sellers need a multi-step onboarding wizard to register their merchant address in the `delego-marketplace` contract.
- **Data Types:**
```typescript
export interface MerchantRegistrationForm {
  storeName: string;
  description: string;
  contactEmail: string;
  stellarPayoutAddress: string;
  category: "electronics" | "clothing" | "services" | "digital" | "other";
  websiteUrl?: string;
}

export type OnboardingStep = "store_info" | "wallet_verify" | "contract_register" | "complete";
```
- **Tasks:**
  - [ ] Build wizard page at `apps/frontend/app/merchant/register/page.tsx`
  - [ ] Integrate Freighter signing for contract merchant registration
- **Acceptance Criteria:**
  - [ ] Validates Stellar public key format with `StrKey.isValidEd25519PublicKey`
  - [ ] Displays Soroban transaction hash upon on-chain registration

---

### Merchant Product Catalog Grid with Stock Toggle
- **Estimate:** 2 days
- **Context:** Merchants need a management dashboard listing their products with active/inactive stock toggles.
- **Data Types:**
```typescript
export interface MerchantProduct {
  id: string;
  sku: string;
  title: string;
  priceStroops: string;
  assetCode: "USDC" | "XLM" | "EURC";
  stockQuantity: number;
  isListed: boolean;
  updatedAt: string;
}
```
- **Tasks:**
  - [ ] Create `/merchant/catalog` page with responsive data grid
  - [ ] Implement toggle switch for instant listing/unlisting
- **Acceptance Criteria:**
  - [ ] Optimistic UI update when switching `isListed`
  - [ ] Pagination controls for catalogs > 50 items

---

### Add/Edit Product Modal with Image Uploader
- **Estimate:** 2 days
- **Context:** Modal form for merchants to create or update product listings.
- **Data Types:**
```typescript
export interface ProductFormData {
  title: string;
  description: string;
  priceDecimal: string;
  assetCode: "USDC" | "XLM" | "EURC";
  stockQuantity: number;
  imageFile?: File;
  category: string;
}
```
- **Tasks:**
  - [ ] Modal with drag-and-drop file upload and preview
  - [ ] Auto-converts standard decimal amount to stroops on submit
- **Acceptance Criteria:**
  - [ ] Client-side validation: title required, price > 0, stock >= 0
  - [ ] Image file size capped at 5MB with mime validation

---

### Merchant Orders & Funded Escrow Queue
- **Estimate:** 2 days
- **Context:** A queue of incoming customer orders that have funded escrows waiting to be fulfilled.
- **Data Types:**
```typescript
export interface MerchantEscrowOrder {
  orderId: string;
  escrowId: string;
  buyerAddress: string;
  amountStroops: string;
  currency: string;
  status: "funded" | "shipped" | "delivered" | "released";
  shippingAddress: string;
  fundedAt: string;
  deadline: string;
}
```
- **Tasks:**
  - [ ] Build `/merchant/orders` page with filter tabs (To Ship, Shipped, Settled)
  - [ ] Display countdown to escrow deadline
- **Acceptance Criteria:**
  - [ ] Orders nearing timeout are highlighted with amber/red urgency badges

---

### Upload Tracking Number & Proof of Shipment Modal
- **Estimate:** 1 day
- **Context:** Merchants mark orders as shipped by providing carrier name and tracking code.
- **Data Types:**
```typescript
export type ShippingCarrier = "fedex" | "ups" | "usps" | "dhl" | "other";

export interface ShipmentSubmission {
  orderId: string;
  carrier: ShippingCarrier;
  trackingNumber: string;
  shippingNotes?: string;
}
```
- **Tasks:**
  - [ ] Modal form validating tracking number format
  - [ ] Call `api.submitShipment` and refresh merchant order list
- **Acceptance Criteria:**
  - [ ] Updates order state to "shipped" and triggers buyer notification

---

### Merchant Payout History & Settlement Table
- **Estimate:** 1 day
- **Context:** List of completed escrow releases paid out to the merchant's Stellar address.
- **Data Types:**
```typescript
export interface PayoutRecord {
  id: string;
  escrowId: string;
  amountStroops: string;
  currency: string;
  transactionHash: string;
  ledgerClosedAt: string;
  feeStroops: string;
}
```
- **Tasks:**
  - [ ] Build payout table with Stellar Expert explorer external links
  - [ ] Include total earnings summary metric card
- **Acceptance Criteria:**
  - [ ] Displays exact transaction hashes with 1-click copy button

---

### Merchant Dispute Response Drawer
- **Estimate:** 2 days
- **Context:** When a buyer opens a dispute, the merchant needs a drawer to submit counter-evidence before contract arbitration.
- **Data Types:**
```typescript
export interface DisputeResponseForm {
  disputeId: string;
  responseStatement: string;
  proofOfDeliveryUrl?: string;
  counterOfferStroops?: string; // Partial refund offer
}
```
- **Tasks:**
  - [ ] Slide-out drawer displaying buyer's dispute claim
  - [ ] Form for merchant response and counter-settlement offer
- **Acceptance Criteria:**
  - [ ] Disables submission once dispute arbitration period expires

---

### Merchant Reputation & Verification Badge Component
- **Estimate:** 1 day
- **Context:** Visual badge displaying merchant tier and Soroban on-chain reputation score.
- **Data Types:**
```typescript
export interface MerchantReputationProps {
  score: number; // 0 to 100
  totalOrdersCompleted: number;
  isVerified: boolean;
  size?: "sm" | "md" | "lg";
}
```
- **Tasks:**
  - [ ] Create `MerchantReputationBadge.tsx` in `packages/ui`
  - [ ] Dynamic color coding (green >= 90, blue 75-89, yellow 50-74, red < 50)
- **Acceptance Criteria:**
  - [ ] Tooltip explains score derivation from on-chain transactions

---

### Merchant Webhook Configuration Card
- **Estimate:** 1 day
- **Context:** Allow merchants to register endpoints to receive webhooks for new orders and funded escrows.
- **Data Types:**
```typescript
export interface MerchantWebhookConfig {
  webhookUrl: string;
  secretKey: string;
  subscribedEvents: ("order.created" | "escrow.funded" | "escrow.released" | "dispute.opened")[];
  isActive: boolean;
}
```
- **Tasks:**
  - [ ] Form with event checkboxes and webhook URL input
  - [ ] Include "Send Test Webhook" ping button
- **Acceptance Criteria:**
  - [ ] URL validation requires HTTPS in production

---

### Public Merchant Storefront Page (`/store/[merchantId]`)
- **Estimate:** 2 days
- **Context:** Public facing shop page displaying all active products for a specific verified merchant.
- **Data Types:**
```typescript
export interface StorefrontData {
  merchantId: string;
  storeName: string;
  description: string;
  stellarAddress: string;
  reputationScore: number;
  products: MerchantProduct[];
}
```
- **Tasks:**
  - [ ] Implement dynamic Next.js App Router page at `app/store/[merchantId]/page.tsx`
  - [ ] Add search bar to filter store products
- **Acceptance Criteria:**
  - [ ] Fast server-rendered initial load with SEO metadata

---

## Theme 3: Stellar Web3 Superpowers & Frictionless Auth

### Passkey / WebAuthn Biometric Registration Modal
- **Estimate:** 2 days
- **Context:** Allow users to register FaceID / TouchID passkeys so agents can transact without browser extension popups.
- **Data Types:**
```typescript
export interface PasskeyCredential {
  credentialId: string;
  publicKey: string;
  name: string;
  createdAt: string;
}

export interface PasskeyRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credential: PasskeyCredential) => void;
}
```
- **Tasks:**
  - [ ] Modal implementing `navigator.credentials.create()` for WebAuthn
  - [ ] Send credential to backend for registration against Stellar account
- **Acceptance Criteria:**
  - [ ] Gracefully falls back if WebAuthn is unsupported on device

---

### Temporary Session Key Grant UI
- **Estimate:** 2 days
- **Context:** Grant an agent a time-bounded, cryptographic session key with a spending cap.
- **Data Types:**
```typescript
export interface SessionKeyGrant {
  sessionPublicKey: string;
  maxAllowanceStroops: string;
  durationHours: number;
  allowedContractCalls: string[];
  expiresAt: string;
}
```
- **Tasks:**
  - [ ] Build modal allowing user to choose budget and duration (1h, 12h, 24h, 7d)
  - [ ] User signs one master authorization transaction via wallet
- **Acceptance Criteria:**
  - [ ] Active session key displays a live countdown timer with a "Revoke Now" button

---

### Stellar Path Payment Cross-Currency Converter Widget
- **Estimate:** 2 days
- **Context:** Allow users to pay with XLM while the escrow locks in USDC via Stellar AMM/DEX path payments.
- **Data Types:**
```typescript
export interface PathPaymentEstimate {
  sourceAsset: string;
  destinationAsset: string;
  sourceAmountMax: string;
  destinationAmount: string;
  estimatedRate: string;
  slippageTolerancePercent: number; // e.g. 0.5
  path: string[];
}
```
- **Tasks:**
  - [ ] Build converter input in `packages/ui/src/PathPaymentWidget.tsx`
  - [ ] Live price calculation fetching quotes from Stellar Horizon
- **Acceptance Criteria:**
  - [ ] Warns user if market slippage exceeds 1.5%

---

### Testnet Faucet Banner & 1-Click Friendbot Funding
- **Estimate:** 1 day
- **Context:** When running on Stellar Testnet, offer a 1-click button to fund the connected wallet with test XLM and mock USDC.
- **Data Types:**
```typescript
export interface FaucetFundResponse {
  success: boolean;
  transactionHash?: string;
  fundedAmountXlm: string;
  errorMessage?: string;
}
```
- **Tasks:**
  - [ ] Persistent banner visible when network is set to Testnet and balance is 0
  - [ ] Call Friendbot API and auto-refresh wallet balance hook
- **Acceptance Criteria:**
  - [ ] Disables button and displays loading spinner while Friendbot confirms

---

### Live Soroban RPC Network Health Indicator
- **Estimate:** 1 day
- **Context:** Show a status dot in the footer/header indicating Soroban RPC latency and latest ledger sequence.
- **Data Types:**
```typescript
export interface SorobanHealthStatus {
  status: "healthy" | "degraded" | "down";
  latestLedger: number;
  latencyMs: number;
  networkPassphrase: string;
}
```
- **Tasks:**
  - [ ] Poll health status every 30 seconds
  - [ ] Display tooltip with ledger height and ping time
- **Acceptance Criteria:**
  - [ ] Turns amber/red when latency > 2000ms or endpoint is unresponsive

---

### Blend Protocol Yield-Bearing Escrow Toggle
- **Estimate:** 1 day
- **Context:** Toggle switch in escrow creation: "Earn ~4.5% APY in Blend Protocol while funds are held in escrow".
- **Data Types:**
```typescript
export interface YieldEscrowOption {
  isEnabled: boolean;
  protocol: "blend";
  estimatedApyPercent: number;
  estimatedEarningsStroops: string;
}
```
- **Tasks:**
  - [ ] Add checkbox in checkout and delegation creation
  - [ ] Display projected interest earned based on escrow timeout duration
- **Acceptance Criteria:**
  - [ ] Tooltip clearly details smart contract risk disclaimer

---

### Real-Time Accrued Yield Counter Component
- **Estimate:** 1 day
- **Context:** Live animated number component showing interest accrued by an escrow deposit in real-time.
- **Data Types:**
```typescript
export interface AccruedYieldProps {
  principalStroops: string;
  apyPercent: number;
  lockedTimestamp: string;
  assetCode: string;
}
```
- **Tasks:**
  - [ ] Create `YieldCounter.tsx` with smooth micro-increment animation
- **Acceptance Criteria:**
  - [ ] Updates every second based on elapsed time without refetching

---

### Soroban Transaction Simulation Dry-Run Modal
- **Estimate:** 2 days
- **Context:** Before executing a contract call, display CPU instructions, memory bytes, and simulated outcome.
- **Data Types:**
```typescript
export interface SimulationDryRunResult {
  success: boolean;
  cpuInstructions: number;
  memoryBytes: number;
  estimatedFeeStroops: string;
  simulatedReturnValue: string;
  errorReason?: string;
}
```
- **Tasks:**
  - [ ] Modal rendering gas and resource consumption breakdown
  - [ ] Blocks confirm button if simulation reverts
- **Acceptance Criteria:**
  - [ ] Clear red banner displaying revert error message if simulation fails

---

### Dynamic Horizon Fee Tier Selector Slider
- **Estimate:** 1 day
- **Context:** Let users pick priority fee tier (Standard p50, Fast p95, Urgent p99) using the backend fee estimator.
- **Data Types:**
```typescript
export type FeeTier = "standard" | "fast" | "urgent";

export interface FeeTierOption {
  tier: FeeTier;
  label: string;
  feeStroops: string;
  estimatedSeconds: number;
}

export interface FeeSelectorProps {
  selectedTier: FeeTier;
  onChange: (tier: FeeTier) => void;
}
```
- **Tasks:**
  - [ ] Build segmented slider component in `packages/ui/src/FeeSelector.tsx`
  - [ ] Fetch live percentile rates from backend fee API
- **Acceptance Criteria:**
  - [ ] Defaults to "Fast (p95)" as recommended

---

### Multi-Asset Balance Switcher in Navigation
- **Estimate:** 1 day
- **Context:** Header dropdown displaying user balances across XLM, USDC, and EURC.
- **Data Types:**
```typescript
export interface AssetBalance {
  assetCode: string;
  issuer?: string;
  balance: string;
  usdValue?: string;
}
```
- **Tasks:**
  - [ ] Add compact balance widget in top navbar
  - [ ] Dropdown reveals per-asset balances with quick-copy asset address
- **Acceptance Criteria:**
  - [ ] Updates automatically on account switch or transaction completion

---

## Theme 4: Real-World Delivery & Dispute UI

### Real-Time Carrier Shipment Tracker Widget
- **Estimate:** 2 days
- **Context:** Tracking card displaying live shipping milestones (Picked Up, In Transit, Out for Delivery, Delivered).
- **Data Types:**
```typescript
export interface TrackingMilestone {
  status: "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  location: string;
  timestamp: string;
  description: string;
}

export interface ShipmentTrackerProps {
  carrier: string;
  trackingNumber: string;
  milestones: TrackingMilestone[];
  estimatedDelivery: string;
}
```
- **Tasks:**
  - [ ] Create visual vertical stepper timeline
  - [ ] Add carrier official tracking link button
- **Acceptance Criteria:**
  - [ ] Exception status turns amber with instructions

---

### Buyer 1-Click Delivery Confirmation & Escrow Release
- **Estimate:** 1 day
- **Context:** Action button allowing buyer to acknowledge package receipt and trigger instant Soroban escrow payout.
- **Data Types:**
```typescript
export interface ReleaseConfirmPayload {
  escrowId: string;
  orderId: string;
  feedbackRating?: number; // 1 to 5
  satisfactionNote?: string;
}
```
- **Tasks:**
  - [ ] Confirm modal with optional 5-star merchant rating
  - [ ] Trigger on-chain contract release via wallet
- **Acceptance Criteria:**
  - [ ] Confetti animation on release success + state updates to "Released"

---

### Automated Carrier Delivery Release Badge
- **Estimate:** 1 day
- **Context:** Badge on escrow card indicating it was automatically released via verified carrier tracking webhook.
- **Data Types:**
```typescript
export interface AutoReleaseMeta {
  isAutoReleased: boolean;
  oracleProvider: "easypost" | "fedex" | "ups";
  deliveredTimestamp: string;
  signatureProofHash: string;
}
```
- **Tasks:**
  - [ ] Create `AutoReleaseBadge` with carrier verification icon
  - [ ] Modal showing oracle signature and delivery proof
- **Acceptance Criteria:**
  - [ ] Distinguishes automated delivery release from manual user release

---

### Guided Dispute Initiation Stepper
- **Estimate:** 2 days
- **Context:** Multi-step wizard to file a formal dispute against an escrow before the deadline.
- **Data Types:**
```typescript
export type DisputeReason = "item_not_received" | "damaged" | "wrong_item" | "fraudulent";

export interface DisputeInitiationForm {
  escrowId: string;
  reason: DisputeReason;
  description: string;
  requestedAction: "full_refund" | "partial_refund" | "replacement";
  evidenceFiles: File[];
}
```
- **Tasks:**
  - [ ] Build wizard at `/escrows/[id]/dispute`
  - [ ] Upload evidence images to backend and lock escrow status
- **Acceptance Criteria:**
  - [ ] Prevents dispute filing after escrow has already been released or refunded

---

### Photo Evidence Uploader with EXIF Scrubbing
- **Estimate:** 1 day
- **Context:** Image uploader for dispute evidence that strips GPS coordinates and sensitive metadata client-side before upload.
- **Data Types:**
```typescript
export interface CleanedImageFile {
  file: File;
  previewUrl: string;
  originalName: string;
  sizeBytes: number;
}
```
- **Tasks:**
  - [ ] Strip EXIF metadata via canvas redraw before upload
  - [ ] Display image thumbnails with remove buttons
- **Acceptance Criteria:**
  - [ ] Uploaded image files contain no location or device EXIF tags

---

### Dispute Evidence Comparison Viewer
- **Estimate:** 2 days
- **Context:** Side-by-side view comparing buyer claim evidence and merchant shipping counter-proofs.
- **Data Types:**
```typescript
export interface DisputeEvidenceBundle {
  disputeId: string;
  buyerStatement: string;
  buyerImages: string[];
  merchantStatement?: string;
  merchantImages?: string[];
  arbitratorVerdict?: string;
  status: "open" | "under_review" | "settled";
}
```
- **Tasks:**
  - [ ] Side-by-side layout with lightbox image zoom
  - [ ] Display resolution countdown clock
- **Acceptance Criteria:**
  - [ ] Fullscreen lightbox modal for high-res photo inspection

---

### Return Shipping Label Generation Modal
- **Estimate:** 1 day
- **Context:** When a dispute requires a return, generate a printable PDF return label for the customer.
- **Data Types:**
```typescript
export interface ReturnLabelData {
  orderId: string;
  carrier: string;
  trackingNumber: string;
  labelPdfUrl: string;
  returnAddress: string;
}
```
- **Tasks:**
  - [ ] Modal with PDF preview and "Print Label" button
  - [ ] Copy return tracking number action
- **Acceptance Criteria:**
  - [ ] Prints cleanly via browser print stylesheet

---

### Escrow Timeout Auto-Refund Trigger Button
- **Estimate:** 1 day
- **Context:** Once the Soroban timeout ledger passes without delivery, enable the buyer's "Claim Full Refund" button.
- **Data Types:**
```typescript
export interface TimeoutRefundState {
  canRefund: boolean;
  currentLedger: number;
  timeoutLedger: number;
  remainingLedgers: number;
  refundAmountStroops: string;
}
```
- **Tasks:**
  - [ ] Compute ledger difference and toggle button state
  - [ ] Invoke Soroban `refund()` contract method
- **Acceptance Criteria:**
  - [ ] Button is disabled with countdown when `currentLedger < timeoutLedger`

---

### Digital Receipt & Tax Invoice Download Modal
- **Estimate:** 1 day
- **Context:** Clean modal rendering itemized proof of purchase with printable PDF export.
- **Data Types:**
```typescript
export interface ReceiptDetails {
  orderId: string;
  escrowId: string;
  date: string;
  buyerAddress: string;
  merchantName: string;
  items: { title: string; quantity: number; unitPrice: string; total: string }[];
  subtotal: string;
  networkFee: string;
  totalPaid: string;
  stellarTxHash: string;
}
```
- **Tasks:**
  - [ ] Format receipt component with barcode and transaction hash
  - [ ] Add PDF export button using HTML5 canvas/print
- **Acceptance Criteria:**
  - [ ] Formats all prices cleanly in user's selected fiat preference

---

### Escrow Auto-Release Grace Period Banner & Undo Button
- **Estimate:** 1 day
- **Context:** When an auto-release triggers, give the user an 8-hour grace window to pause if the package hasn't arrived.
- **Data Types:**
```typescript
export interface AutoReleaseGraceBannerProps {
  graceExpiresAt: string;
  onPauseRelease: () => Promise<void>;
  orderId: string;
}
```
- **Tasks:**
  - [ ] Fixed top alert banner with ticking seconds countdown
  - [ ] "Pause & Dispute" button to immediately halt escrow payout
- **Acceptance Criteria:**
  - [ ] Auto-dismisses when grace period expires

---

## Theme 5: Advanced Controls, Team Approvals & Analytics

### Category-Based Budget Allocation Sliders
- **Estimate:** 2 days
- **Context:** Allow users to set separate spending caps per category (e.g. $200/mo Groceries, $50/mo Digital).
- **Data Types:**
```typescript
export interface CategoryBudget {
  category: string;
  allocatedStroops: string;
  spentStroops: string;
  limitPeriod: "monthly" | "weekly";
}
```
- **Tasks:**
  - [ ] Interactive sliders that calculate percentages against total wallet cap
  - [ ] Visual color-coded budget distribution bar
- **Acceptance Criteria:**
  - [ ] Sum of category budgets cannot exceed parent delegation limit

---

### Merchant Allowlist & Blocklist Manager
- **Estimate:** 1 day
- **Context:** User interface to whitelist approved merchant addresses and blacklist suspicious stores.
- **Data Types:**
```typescript
export interface MerchantFilterRule {
  address: string;
  merchantName?: string;
  policy: "allow" | "block";
  addedAt: string;
  reason?: string;
}
```
- **Tasks:**
  - [ ] Table with address lookup, quick-add input, and delete action
  - [ ] Tag search filter
- **Acceptance Criteria:**
  - [ ] Validates Stellar addresses with helpful error messages on invalid input

---

### Multi-User Dual-Control Approval Board
- **Estimate:** 2 days
- **Context:** Team dashboard for business accounts where transactions > $1,000 require approval from 2 team members.
- **Data Types:**
```typescript
export interface DualControlOrder {
  orderId: string;
  requiredApprovals: number;
  currentSigners: { signerAddress: string; signedAt: string; name?: string }[];
  pendingSigners: string[];
  status: "pending_first" | "pending_second" | "fully_approved" | "rejected";
}
```
- **Tasks:**
  - [ ] Board view showing pending team approvals
  - [ ] Sign button disabled if current user already signed as first approver
- **Acceptance Criteria:**
  - [ ] Enforces dual-control rule: Creator cannot be sole approver

---

### Emergency Delegation Kill-Switch Button
- **Estimate:** 1 day
- **Context:** Prominent panic button in settings to instantly revoke all agent spending keys on-chain in one click.
- **Data Types:**
```typescript
export interface KillSwitchPayload {
  walletAddress: string;
  revokeAllDelegations: boolean;
  cancelPendingOrders: boolean;
}
```
- **Tasks:**
  - [ ] Red danger-zone button with double confirmation modal
  - [ ] Executes batch revocation on-chain
- **Acceptance Criteria:**
  - [ ] Requires typing `"REVOKE"` to prevent accidental clicks

---

### Recurring Subscription Manager Card
- **Estimate:** 2 days
- **Context:** Dashboard card managing agent-automated recurring orders (e.g. coffee beans every 14 days).
- **Data Types:**
```typescript
export interface SubscriptionPlan {
  subscriptionId: string;
  merchantName: string;
  itemTitle: string;
  intervalDays: number;
  amountStroops: string;
  nextExecutionDate: string;
  status: "active" | "paused" | "cancelled";
}
```
- **Tasks:**
  - [ ] List active subscriptions with Pause, Resume, and Cancel actions
  - [ ] Edit interval or maximum price ceiling modal
- **Acceptance Criteria:**
  - [ ] Pausing reflects immediately in agent purchase schedule

---

### Predictive Spend Forecasting Chart
- **Estimate:** 2 days
- **Context:** Chart predicting end-of-month spend based on current agent shopping trajectory and scheduled subscriptions.
- **Data Types:**
```typescript
export interface SpendForecastPoint {
  date: string;
  historicalSpentStroops?: string;
  projectedSpentStroops?: string;
  budgetLimitStroops: string;
}
```
- **Tasks:**
  - [ ] Build Recharts area chart showing actual vs forecasted trajectory
  - [ ] Render dashed trajectory line with threshold breach warning
- **Acceptance Criteria:**
  - [ ] Displays warning badge if projected spend exceeds monthly limit

---

### Custom CSV & JSON Expense Report Builder
- **Estimate:** 1 day
- **Context:** Export modal allowing users to select date ranges, columns, and format (CSV/JSON) for tax/accounting.
- **Data Types:**
```typescript
export interface ExportReportConfig {
  startDate: string;
  endDate: string;
  format: "csv" | "json";
  columns: ("orderId" | "escrowId" | "date" | "merchant" | "category" | "amount" | "txHash")[];
  filterCategory?: string;
}
```
- **Tasks:**
  - [ ] Checkbox list for columns and date-range pickers
  - [ ] Client-side export generator with direct download link
- **Acceptance Criteria:**
  - [ ] File downloads with sanitized CSV formatting preventing formula injection

---

### Automated Sales Tax & VAT Breakdown Display
- **Estimate:** 1 day
- **Context:** Order breakdown widget detailing base price, estimated sales tax / VAT, and network fee.
- **Data Types:**
```typescript
export interface TaxBreakdown {
  subtotalStroops: string;
  taxRatePercent: number;
  taxAmountStroops: string;
  jurisdiction: string;
  totalStroops: string;
}
```
- **Tasks:**
  - [ ] Collapsible tax summary component in order checkout and receipt
- **Acceptance Criteria:**
  - [ ] Displays 0% tax for non-taxable digital goods

---

### WebAuthn Fingerprint / FaceID Quick-Approval Prompt
- **Estimate:** 2 days
- **Context:** Trigger biometric verification instead of password/PIN when approving high-value orders.
- **Data Types:**
```typescript
export interface BiometricPromptProps {
  orderId: string;
  amount: string;
  onSuccess: (signature: string) => void;
  onError: (error: string) => void;
}
```
- **Tasks:**
  - [ ] Component wrapping WebAuthn `navigator.credentials.get()`
  - [ ] Visual biometric fingerprint/face animation
- **Acceptance Criteria:**
  - [ ] Falls back to wallet PIN signature if biometric fails 3 times

---

### Webhook Activity & Delivery Log Viewer
- **Estimate:** 1 day
- **Context:** Diagnostics page showing recent outgoing webhook deliveries and status codes (200 OK, 500 Fail).
- **Data Types:**
```typescript
export interface WebhookDeliveryLog {
  id: string;
  eventId: string;
  eventType: string;
  targetUrl: string;
  statusCode: number;
  durationMs: number;
  deliveredAt: string;
  requestBodySnippet: string;
}
```
- **Tasks:**
  - [ ] Build table at `/settings/webhooks/logs`
  - [ ] Click row to view payload JSON and response body
- **Acceptance Criteria:**
  - [ ] Red status badge for non-2xx codes with 1-click retry button
