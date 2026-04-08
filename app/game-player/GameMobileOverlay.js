export default function GameMobileOverlay({
  needsImmersiveRetry,
  onContinue,
  showMobileOverlay,
}) {
  if (!showMobileOverlay) {
    return null;
  }

  const mobileOverlayTitle = needsImmersiveRetry ? "Tap to continue" : "Rotate to landscape";
  const mobileOverlayBody = needsImmersiveRetry
    ? "Your browser needs one tap before scummweb can enter fullscreen on mobile."
    : "scummweb plays in landscape on mobile. Rotate your device to keep the game visible.";

  return (
    <div className="game-route-mobile-overlay" role="status" aria-live="polite">
      <div className="game-route-mobile-card">
        <p className="game-route-mobile-title">{mobileOverlayTitle}</p>
        <p className="game-route-mobile-copy">{mobileOverlayBody}</p>
        {needsImmersiveRetry ? (
          <button
            className="game-route-mobile-button"
            onClick={() => {
              void onContinue();
            }}
            type="button"
          >
            Continue
          </button>
        ) : null}
      </div>
    </div>
  );
}
