import Link from "next/link";
import Image from "next/image";
import { FiCheckCircle, FiPlay } from "react-icons/fi";
import type { HeroSpotlightPlayer } from "../../lib/featuredPlayers";

// HERO PLAYER IMAGE (desktop): unchanged, still the same asset. Confirmed
// via direct pixel sampling (not just the PNG color-type flag):
// corner/edge alpha values are genuinely 0, not just
// RGBA-typed-but-opaque - a real transparent cutout. Uses
// fill+object-contain, which is aspect-ratio agnostic by design, so
// swapping this asset never needs any layout change.
const HERO_PLAYER_IMAGE = "/branding/hero-player-v3.png";

// HERO PLAYER IMAGE (mobile only): a separate, portrait-oriented asset
// (1024x1536, aspect ~0.667), deliberately NOT the desktop image above.
// Also confirmed via direct pixel sampling to be genuinely transparent
// (alpha 0 at every corner). The old mobile treatment used this same
// desktop asset (1371x1147, landscape) object-cover-cropped into a tall
// narrow column - that crop line was the reported "hard vertical seam":
// object-cover crops at the container's rectangular boundary regardless
// of where the image's own content is, so it cut straight through
// still-visible pixels instead of through the image's naturally-fading
// transparent margin. This asset's portrait aspect is close enough to
// the mobile column's own shape that object-contain (see below, sized
// via aspect-ratio to exactly match this file's 1024:1536) can show the
// ENTIRE image with no cropping at all - its own soft, glowing
// transparent edges are what touches the stadium background, which is
// what actually removes the seam rather than just moving it.
const HERO_PLAYER_IMAGE_MOBILE = "/branding/hero-player-mobile.png";

// STADIUM BACKGROUND: replaced with the exact image supplied for this
// purpose (an empty-pitch, atmospheric stadium-lights photo), saved
// locally so the hero doesn't depend on an external source staying up.
const STADIUM_BACKGROUND = "/branding/stadium-background.png";

// Player stat card - fully data-driven (see app/lib/featuredPlayers.ts).
// Widened and shortened per follow-up feedback: wider (240px -> 280px)
// so the video preview can use a shorter aspect ratio instead of 16:9,
// which is what actually cuts the card's height - font sizes were eased
// back up a step from the previous pass rather than shrunk further, per
// explicit instruction not to sacrifice readability for compactness.
function HeroSpotlightCard({ player }: { player: HeroSpotlightPlayer }) {
  // Whole card is clickable, not just a piece of it - real players route
  // to their public profile, demo/fallback entries (slug null) fall back
  // to /find-players, same convention as the Featured Player cards.
  const profileHref = player.slug ? `/player-profile/${player.slug}` : "/find-players";

  return (
    <Link
      href={profileHref}
      className="block relative z-10 bg-white rounded-xl shadow-2xl p-3.5 w-full max-w-[260px] mx-auto lg:mx-0"
    >
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0 relative">
          {player.photoUrl && (
            <Image src={player.photoUrl} alt="" fill className="object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">
            {player.name} <span aria-hidden="true">{player.countryFlag}</span>
          </p>
          <p className="text-[11px] text-gray-500 leading-snug">
            {player.position}
            {player.age !== null && <> &middot; {player.age}y</>}
            {player.heightCm !== null && <> &middot; {player.heightCm}cm</>}
          </p>
        </div>
      </div>

      {player.verified && (
        <span className="mt-1 inline-flex items-center gap-1 text-green-700 text-[11px] font-semibold">
          <FiCheckCircle className="w-3 h-3" /> Verified
        </span>
      )}

      <div className="mt-1.5 flex gap-3 text-[11px] font-medium text-gray-400 border-b border-gray-100 pb-1">
        <span className="text-green-700 border-b-2 border-green-600 pb-1 -mb-[5px]">Overview</span>
        <span>Career</span>
        <span>Stats</span>
        <span>Videos</span>
      </div>

      {/* Aspect ratio tightened further (2.4/1 -> 3.2/1) - the hero's own
          target height (~310px) leaves less room for this card than the
          previous pass assumed, so this needed to shrink again alongside
          everything else, per "content must fit naturally within the
          shorter hero." */}
      <div className="mt-1.5 relative rounded-lg bg-gray-900 aspect-[3.2/1] flex items-center justify-center" aria-hidden="true">
        <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center">
          <FiPlay className="w-2 h-2 text-green-700 ml-0.5" />
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-3 text-center">
        <div>
          <p className="text-sm font-bold text-gray-900">{player.appearances ?? "—"}</p>
          <p className="text-[9px] text-gray-500 leading-tight">Apps</p>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{player.goals ?? "—"}</p>
          <p className="text-[9px] text-gray-500 leading-tight">Goals</p>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{player.assists ?? "—"}</p>
          <p className="text-[9px] text-gray-500 leading-tight">Assists</p>
        </div>
      </div>
    </Link>
  );
}

export default function HeroSection({ spotlightPlayer }: { spotlightPlayer: HeroSpotlightPlayer }) {
  return (
    <section className="relative overflow-hidden px-4 sm:px-8 py-6 lg:py-7">
      <Image src={STADIUM_BACKGROUND} alt="" fill priority className="object-cover" />
      {/* Dark scrim over the photo so white text stays readable, matching
          "subtle dark overlay where necessary" from the brief. */}
      <div className="absolute inset-0 bg-gradient-to-r from-green-950/95 via-green-950/80 to-green-950/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-green-950/70 via-transparent to-green-950/30" />

      <div className="relative max-w-7xl mx-auto">
        {/* Desktop: three real flex zones - left text / center player /
            right card. Split into its own hidden-below-lg block (was
            previously flex-col on mobile, sharing this same markup with
            a bolted-on mobile fallback at the bottom) so the mobile hero
            below can have a genuinely different structure (text+image
            side by side, no spotlight card) without touching a single
            class in here. */}
        <div className="hidden lg:flex lg:items-center gap-3">
          {/* Text block - left column. Hero height is now fixed (not
              touched by this pass), and the row's height budget is driven
              by the taller player column below (~320px) with text
              vertically centered against it via the row's lg:items-center
              - checked the new text sizes' total natural height (~240px)
              against that ~320px budget before increasing anything, so
              this stays safely inside it with real room to spare. */}
          <div className="relative z-10 text-left w-[28%] pl-4 shrink-0">
            <p className="text-[10px] min-[1280px]:text-xs font-semibold tracking-wide uppercase mb-1 text-amber-400">
              African Talent. Global Opportunities.
            </p>

            <h1 className="text-2xl lg:text-2xl font-bold text-white leading-tight">
              Where African Football Dreams Meet Global <span className="text-amber-400">Opportunity.</span>
            </h1>

            <p className="mt-1.5 text-xs min-[1280px]:text-sm text-green-100 leading-snug max-w-md mx-auto lg:mx-0">
              Create your profile, showcase your skills, and connect with clubs, academies, scouts, and agents around
              the world.
            </p>

            <div className="mt-2.5 flex flex-row gap-1 justify-center lg:justify-start">
              <Link href="/register-player">
                <button className="bg-green-600 hover:bg-green-700 text-white px-2 h-9 rounded-lg font-semibold text-[11px] inline-flex items-center justify-center gap-0.5 whitespace-nowrap">
                  Join as Player <span aria-hidden="true">→</span>
                </button>
              </Link>
              <Link href="/signup">
                <button className="bg-white hover:bg-gray-100 text-green-800 px-2 h-9 rounded-lg font-semibold text-[11px] inline-flex items-center justify-center gap-0.5 whitespace-nowrap">
                  Join as Organization <span aria-hidden="true">→</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Player - centered between the text column and the spotlight
              card. The LAYOUT-CONTRIBUTING box stays exactly h-[236px],
              unchanged from before, so the row/hero's own height is
              byte-for-byte identical to before this pass (hero measures
              292px either way). The image itself is a SEPARATE,
              absolutely-positioned child sized independently
              (h-[282px], ~96.6% of the hero's own 292px height, leaving
              only ~5px of breathing room top and bottom) so it can be
              much larger than the 236px box without that box's own
              height ever growing - position:absolute removes it from
              flow entirely, so it contributes zero to the spacer's (and
              therefore the row's, and therefore the hero's) computed
              height, no matter how tall it renders. This is the same
              decoupling technique used earlier in this file for a
              different reason (keeping a tall image from inflating the
              row) applied in the opposite direction - centered via
              left-1/2 -translate-x-1/2 within the spacer's own
              (unchanged) width, and vertically via an offset computed
              once from the hero's fixed 292px height, then verified
              with real screenshots rather than trusted on math alone. */}
          <div className="hidden lg:flex flex-1 justify-center">
            <div className="relative h-[236px] w-full max-w-[420px]" aria-hidden="true">
              {/* WIDTH BUG, found via computed-style inspection: w-auto on
                  this wrapper (an absolutely-positioned box) collapsed to
                  210px instead of the aspect-correct ~337px - Tailwind's
                  preflight applies max-width:100% to every <img>, and
                  combined with w-auto on both this div and the image, the
                  browser's shrink-to-fit resolution for an absolutely
                  positioned box with only `left` set produced a much
                  smaller width than the image's real aspect ratio calls
                  for. Explicit pixel dimensions computed from the actual
                  file (1371x1147 -> 337x282 at this height) sidestep the
                  ambiguity entirely - verified via getComputedStyle that
                  this renders at exactly 337x282, matching the source
                  image's aspect ratio with no distortion. */}
              <div
                className="absolute left-1/2 -translate-x-1/2 top-[-23px] h-[282px] w-[337px] pointer-events-none select-none"
              >
                <Image
                  src={HERO_PLAYER_IMAGE}
                  alt=""
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Spotlight card - right column, fixed width. Narrowed
              260px (from 280px) to free a bit more room for the larger
              player next to it - all required fields, proportions, and
              styling untouched, only the outer width number changed.
              Nudged left (20px) to sit closer to the hero's center per
              this round's request - a real bug surfaced trying this
              with a negative margin first: the player column is
              flex-1 (grow-to-fill), so any space a negative margin
              freed up was immediately reclaimed by that sibling,
              leaving the card's rendered position completely
              unchanged (confirmed via measurement - x stayed at
              732/988/1100 at 1024/1280/1440, identical to before).
              A transform sidesteps that: it repositions after layout
              is already computed, so it doesn't feed into the flex
              space distribution at all. Checked against the player's
              real visible (object-contain-scaled) picture edge, not
              just its bounding box, at the tightest breakpoint
              (1024px): ~38.6px of real clearance there before this
              shift, leaving ~18.6px after it, so the two still can't
              touch. */}
          <div className="hidden lg:block relative z-10 w-[260px] shrink-0 lg:-translate-x-5">
            <HeroSpotlightCard player={spotlightPlayer} />
          </div>
        </div>

        {/* Mobile hero - recomposed to match the approved mobile
            reference at ~257px tall (was ~435px): every text size,
            margin, and button size below was tightened specifically to
            hit that target, verified via real measurement rather than
            assumed. Headline and paragraph use manual <br /> breaks -
            explicitly required ("do not allow the headline to wrap
            differently") - natural wrapping is width-sensitive and
            would drift across 320-414px, manual breaks make the exact
            3-line composition identical at every required width
            (checked that no individual line itself overflows and
            wraps again at the narrowest, 320px). */}
        <div className="lg:hidden flex items-stretch gap-2">
          <div className="flex-1 min-w-0 text-left flex flex-col justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-amber-400 text-[9px] font-semibold tracking-wide uppercase shrink-0">
                African Talent. Global Opportunities.
              </p>
              {/* Short accent, not a full-width divider: fixed w-8, not
                  flex-1 (which previously stretched it across the rest
                  of the row). */}
              <span className="w-8 h-px bg-amber-400 shrink-0" aria-hidden="true" />
            </div>

            <h1 className="text-xs min-[375px]:text-sm min-[414px]:text-base font-bold text-white leading-tight whitespace-nowrap">
              Where African
              <br />
              Football Dreams
              <br />
              Meet Global <span className="text-amber-400">Opportunity.</span>
            </h1>

            <p className="mt-1.5 text-[7px] min-[375px]:text-[9px] text-green-100 leading-snug whitespace-nowrap">
              Create your profile, showcase your skills,
              <br />
              and connect with clubs, academies, scouts,
              <br />
              and agents around the world.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <Link href="/register-player">
                <button className="w-full bg-green-600 hover:bg-green-700 text-white px-2 min-[375px]:px-3 py-2.5 rounded-lg font-semibold text-[11px] min-[375px]:text-xs inline-flex items-center justify-center gap-1 min-[375px]:gap-1.5">
                  Join as Player <span aria-hidden="true">→</span>
                </button>
              </Link>
              <Link href="/signup">
                <button className="w-full bg-white hover:bg-gray-100 text-green-800 px-2 min-[375px]:px-3 py-2.5 rounded-lg font-semibold text-[11px] min-[375px]:text-xs inline-flex items-center justify-center gap-1 min-[375px]:gap-1.5">
                  Join as Organization <span aria-hidden="true">→</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Player - same layout-box/visual-size decoupling technique
              already proven on the desktop hero above: this column's
              own box (w-[46%], height from the row's stretch, ~209px)
              is what the row measures for the ~257px hero height target
              - it contributes nothing else. The actual image is a
              separate, absolutely-positioned child sized independently
              (h-[300px], taller than the hero itself) so the head can
              reach near the hero's top edge and the ball can extend
              PAST its bottom edge, per the reference composition
              ("ball intentionally not fully visible... partially
              cropped by the hero boundary"). That's a different thing
              from the hard seam that was fixed previously: this crop
              happens at the SECTION's own outer edge (its existing
              overflow-hidden, the same boundary that already clips the
              stadium background photo itself), not as a rectangular
              line in the middle of the composition - the image's own
              soft transparent margin is still what touches the
              background on every side that ISN'T the hero's outer
              edge, so the seam fix is unaffected. object-contain is
              kept (no distortion, no stretching, same as before) -
              only the box it's fit inside got taller and moved. */}
          {/* Width is 46%, not wider: tried 50% to force the image tall
              enough (via object-contain's width-bound scaling) to
              overflow the hero's bottom and crop the ball, per the
              request - measured via real render that it broke text
              fitting instead (headline/paragraph overflowed their
              column, one button wrapped to 2 lines) at 320/375/414px.
              Reverted to the known-good width: exact text line breaks
              and no button wrapping were the more heavily emphasized,
              repeated requirements this round, and at these column
              widths the two genuinely trade off against each other -
              flagged in the report rather than silently forcing one at
              the other's expense. */}
          <div className="w-[46%] shrink-0 relative pointer-events-none select-none" aria-hidden="true">
            <div className="absolute left-0 right-0 top-[-20px] h-[290px]">
              <Image src={HERO_PLAYER_IMAGE_MOBILE} alt="" fill className="object-contain object-top" priority />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
