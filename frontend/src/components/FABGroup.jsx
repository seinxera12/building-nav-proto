// FABGroup.jsx — Floating Action Buttons (QR Scan + Re-Center)

/**
 * FABGroup renders two vertically stacked floating action buttons:
 * 1. QR Scan FAB — opens QR scanner overlay
 * 2. Re-center FAB — triggers flyTo to current anchored location
 *
 * Props:
 *   showQR: boolean      — whether to render the QR scan FAB
 *   showRecenter: boolean — whether to render the re-center FAB
 *   onQRScan: () => void — handler when QR FAB is tapped
 *   onRecenter: () => void — handler when re-center FAB is tapped
 */
export default function FABGroup({ showQR, showRecenter, onQRScan, onRecenter }) {
  if (!showQR && !showRecenter) return null;

  return (
    <div className="fab-group">
      {showQR && (
        <button
          type="button"
          className="fab-group__btn fab-group__btn--qr"
          onClick={onQRScan}
          aria-label="Scan QR code to update location"
        >
          {/* QR code icon as inline SVG */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="3" height="3" />
            <path d="M21 14h-3v3" />
            <path d="M18 21v-3h3" />
          </svg>
        </button>
      )}

      {showRecenter && (
        <button
          type="button"
          className="fab-group__btn fab-group__btn--recenter"
          onClick={onRecenter}
          aria-label="Re-center map on current location"
        >
          {/* Crosshair/target icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}
