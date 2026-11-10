export function Arrow({ direction = "right" }: { direction?: "right" | "left" | "up-right" }) {
  const rotate = direction === "left" ? 180 : direction === "up-right" ? -45 : 0;
  return (
    <svg className="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}>
      <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
