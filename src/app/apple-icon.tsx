import { ImageResponse } from "next/og";

// Иконка для «Добавить на экран Домой» на iPhone (180×180, PNG).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1C1C1E" }}>
        <svg width="120" height="120" viewBox="0 0 64 64">
          <path d="M24 14 L40 50" stroke="#FF4D2E" strokeWidth="6" strokeLinecap="square" />
        </svg>
      </div>
    ),
    size,
  );
}
