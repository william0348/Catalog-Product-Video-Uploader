import React from "react";

interface ReelsOverlayProps {
  username?: string;
  caption?: string;
  ctaText?: string;
  showCta?: boolean;
  style?: React.CSSProperties;
}

/**
 * Instagram Reels organic UI overlay.
 * Renders the standard Reels chrome (icons, buttons, user info, CTA)
 * on top of a video/image preview container.
 * 
 * The parent must have `position: relative` and `overflow: hidden`.
 */
export const ReelsOverlay: React.FC<ReelsOverlayProps> = ({
  username = "username",
  caption = "Check out this product! 🔥",
  ctaText = "Shop Now",
  showCta = true,
}) => {
  const iconSize = 26;
  const iconColor = "#fff";
  const shadowStyle = "0 1px 4px rgba(0,0,0,0.5)";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px 0",
        }}
      >
        <span
          style={{
            color: iconColor,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 0.5,
            textShadow: shadowStyle,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Reels
        </span>
        {/* Camera icon (SVG) */}
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke={iconColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(${shadowStyle})` }}
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </div>

      {/* Right side action buttons */}
      <div
        style={{
          position: "absolute",
          right: 10,
          bottom: showCta ? 110 : 80,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        {/* Like */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(${shadowStyle})` }}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ color: iconColor, fontSize: 11, fontWeight: 600, textShadow: shadowStyle }}>
            1.2K
          </span>
        </div>

        {/* Comment */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(${shadowStyle})`, transform: "scaleX(-1)" }}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ color: iconColor, fontSize: 11, fontWeight: 600, textShadow: shadowStyle }}>
            48
          </span>
        </div>

        {/* Share / Send */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(${shadowStyle})` }}
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </div>

        {/* Save / Bookmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(${shadowStyle})` }}
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        {/* More (three dots) */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill={iconColor}
          style={{ filter: `drop-shadow(${shadowStyle})` }}
        >
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>

        {/* Audio disc */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: `2px solid ${iconColor}`,
            background: "linear-gradient(135deg, #333, #666)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: shadowStyle,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: iconColor,
            }}
          />
        </div>
      </div>

      {/* Bottom section */}
      <div style={{ padding: "0 12px 12px" }}>
        {/* User info & caption */}
        <div style={{ marginBottom: showCta ? 10 : 6 }}>
          {/* Sponsored label */}
          <div
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(4px)",
              borderRadius: 4,
              padding: "2px 8px",
              marginBottom: 6,
            }}
          >
            <span style={{ color: iconColor, fontSize: 11, fontWeight: 500, textShadow: shadowStyle }}>
              Sponsored
            </span>
          </div>

          {/* Username row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {/* Avatar placeholder */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                border: "2px solid #fff",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: iconColor,
                fontSize: 13,
                fontWeight: 700,
                textShadow: shadowStyle,
              }}
            >
              {username}
            </span>
            <span
              style={{
                color: iconColor,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.6)",
                borderRadius: 6,
                padding: "2px 10px",
                textShadow: shadowStyle,
              }}
            >
              Follow
            </span>
          </div>

          {/* Caption */}
          <div
            style={{
              color: iconColor,
              fontSize: 12,
              lineHeight: 1.4,
              textShadow: shadowStyle,
              maxWidth: "75%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {caption}
          </div>

          {/* Music info */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 4,
              maxWidth: "70%",
            }}
          >
            <span style={{ fontSize: 11, color: iconColor, textShadow: shadowStyle }}>♪</span>
            <span
              style={{
                fontSize: 11,
                color: iconColor,
                textShadow: shadowStyle,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Original Audio · {username}
            </span>
          </div>
        </div>

        {/* CTA Button */}
        {showCta && (
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: "8px 0",
              textAlign: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <span
              style={{
                color: "#262626",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              {ctaText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReelsOverlay;
