# Dispute Evidence Comparison Feature

## Overview

This feature provides a side-by-side comparison view for dispute evidence, allowing arbitrators and users to review buyer claims alongside merchant counter-proofs. The implementation includes fullscreen lightbox image inspection and a real-time resolution countdown clock.

## Components

### 1. DisputeEvidenceComparison

Main component that displays buyer and merchant evidence side-by-side.

**Features:**
- Side-by-side grid layout (responsive: stacks on mobile)
- Buyer claim section with statement and evidence photos
- Merchant response section with counter-statement and shipping proofs
- Arbitrator verdict display (when available)
- Resolution countdown clock
- Image thumbnail grid with hover effects
- Integrated lightbox for photo inspection

**Props:**
```typescript
interface DisputeEvidenceComparisonProps {
  evidence: DisputeEvidenceBundle;
  resolutionDeadline?: string; // ISO timestamp
  onRequestMoreEvidence?: () => void;
}
```

**Usage:**
```tsx
<DisputeEvidenceComparison
  evidence={evidenceBundle}
  resolutionDeadline="2026-09-28T12:00:00Z"
  onRequestMoreEvidence={() => console.log("Request sent")}
/>
```

### 2. EvidenceLightbox

Fullscreen modal for high-resolution photo inspection.

**Features:**
- Fullscreen display with dark overlay
- High-res image viewing
- Keyboard navigation (ESC to close)
- Click-outside to dismiss
- Responsive design
- Accessibility support (ARIA labels, focus management)

**Props:**
```typescript
interface EvidenceLightboxProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}
```

### 3. ResolutionCountdown

Real-time countdown timer showing time until arbitration deadline.

**Features:**
- Live countdown (updates every second)
- Displays days, hours, minutes, seconds
- Shows "Deadline Expired" when time runs out
- Responsive sizing
- Tabular numbers for consistent width
- ARIA live region for accessibility

**Props:**
```typescript
interface ResolutionCountdownProps {
  deadline: string; // ISO timestamp
  label?: string;
}
```

## Data Types

### DisputeEvidenceBundle

Located in `types/dispute-evidence.ts`:

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

## Acceptance Criteria

✅ **Side-by-side layout** - Buyer evidence and merchant counter-proofs displayed in adjacent columns

✅ **Lightbox image zoom** - Fullscreen modal for high-res photo inspection with keyboard navigation

✅ **Resolution countdown clock** - Real-time countdown showing time remaining until deadline

## Implementation Details

### Styling
- Uses scoped CSS-in-JS (styled-jsx) for component-specific styles
- Responsive grid layout (2 columns on desktop, 1 column on mobile)
- Consistent design tokens matching existing Delego UI
- Hover and focus states for accessibility

### Accessibility
- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management in lightbox
- Live regions for countdown updates
- Semantic HTML structure

### Performance
- Lazy loading for images
- Efficient countdown timer with cleanup
- Prevents body scroll when lightbox is open
- Minimal re-renders

## Demo Page

A demo implementation is available at:
```
/escrows/[id]/evidence
```

Example: `/escrows/dispute-123/evidence`

## Future Enhancements (98% remaining)

This implementation represents approximately 2% of the complete feature. Future enhancements could include:

1. **API Integration**
   - Fetch real dispute evidence from backend
   - Submit arbitrator decisions
   - Request additional evidence from parties

2. **Advanced Image Features**
   - Image zoom/pan controls
   - Image comparison slider
   - Annotation tools
   - Download evidence bundle

3. **Evidence Management**
   - Upload new evidence
   - Evidence versioning
   - Metadata display (upload date, file size, etc.)
   - Document/PDF viewer support

4. **Communication Features**
   - Real-time chat between parties
   - Notification system
   - Evidence request workflow
   - Timeline of evidence submissions

5. **Analytics & Reporting**
   - Evidence quality scoring
   - Resolution prediction
   - Historical dispute patterns
   - Export dispute reports

## Testing

To test the component:

1. Navigate to any escrow detail page
2. Access the evidence comparison view
3. Click on image thumbnails to open lightbox
4. Verify countdown updates every second
5. Test keyboard navigation (ESC key)
6. Test responsive behavior on mobile

## Browser Support

- Modern browsers with ES2020+ support
- CSS Grid and Flexbox
- CSS custom properties
- Tested on Chrome, Firefox, Safari, Edge

## Contributing

When extending this feature, please:
- Maintain consistent styling with existing components
- Add proper TypeScript types
- Include accessibility features
- Test on multiple screen sizes
- Update this documentation
