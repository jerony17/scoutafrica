import Image from "next/image";
import Link from "next/link";

// Two official, transparency-processed assets (verified directly before
// writing this component - both are real RGBA with clean alpha, not
// flattened-to-white):
// - /branding/scoutafrica-badge.png  - shield-only mark, 335x364
// - /branding/scoutafrica-logo-hero.png - full horizontal lockup, 1672x941
//
// Size/variant superset note: this project's other pages (Login,
// Register, Membership, dashboards) call <Logo size="medium" /> and
// <Logo size="small" />, and several omit `variant` entirely, relying on
// the default resolving to the main lockup. Since those files can't be
// inspected from here right now, "medium" and "small" are kept as valid
// sizes (not just "compact" | "large") and the default variant covers
// the same asset the old "full" variant pointed to - both explicit
// requirements below still work exactly as specified.

const BADGE_SIZES = {
  compact: { width: 44, height: 48 },
  small: { width: 87, height: 95 },
  medium: { width: 147, height: 160 },
  large: { width: 267, height: 291 },
} as const;

const HERO_SIZES = {
  compact: { width: 88, height: 50 },
  small: { width: 130, height: 73 },
  medium: { width: 220, height: 124 },
  large: { width: 400, height: 225 },
} as const;

type LogoSize = keyof typeof HERO_SIZES;
type LogoVariant = "badge" | "hero";

type Props = {
  variant?: LogoVariant;
  size?: LogoSize;
  src?: string;
  width?: number;
  height?: number;
  linkToHome?: boolean;
  className?: string;
};

export default function Logo({
  variant = "hero",
  size = "compact",
  src,
  width: widthOverride,
  height: heightOverride,
  linkToHome = false,
  className = "",
}: Props) {
  const isBadge = variant === "badge";
  const defaultDims = (isBadge ? BADGE_SIZES : HERO_SIZES)[size];

  const width = widthOverride ?? defaultDims.width;
  const height = heightOverride ?? defaultDims.height;
  const imageSrc = src ?? (isBadge ? "/branding/scoutafrica-badge.png" : "/branding/scoutafrica-logo-hero.png");

  const image = (
    <Image
      src={imageSrc}
      alt="ScoutAfrica"
      width={width}
      height={height}
      priority={size === "large"}
      className={`block ${className}`}
    />
  );

  if (!linkToHome) return image;

  return (
    <Link href="/" aria-label="ScoutAfrica home" className="inline-block hover:opacity-90 transition-opacity">
      {image}
    </Link>
  );
}