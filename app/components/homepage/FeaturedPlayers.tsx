import Link from "next/link";
import Image from "next/image";
import type { FeaturedPlayerSlot } from "../../lib/featuredPlayers";

// Fully data-driven: the 4 slots come from app/lib/featuredPlayers.ts
// (currently clearly-marked fallback/demo data - see that file's header
// for the plan to back this with a real "Admin -> Featured Players" table
// and page). Nothing about a specific player is hard-coded here.
//
// slug is null for the fallback demo entries, so "View Profile" points at
// /find-players (a real, working page) instead of a fabricated
// /player-profile/<slug> URL that would 404. Once real players are wired
// through, a non-null slug will route to their actual profile.
export default function FeaturedPlayers({ players }: { players: FeaturedPlayerSlot[] }) {
  const visible = players.filter((slot) => slot.active);

  return (
    <section className="bg-gray-50 py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="flex items-center justify-between border-l-4 border-amber-500 pl-4 mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Featured Player Profiles</h2>
          <Link href="/find-players" className="text-green-700 text-sm font-semibold hover:underline whitespace-nowrap">
            View all players →
          </Link>
        </div>

        {/* Card footprint target: ~285x106 at desktop. Checked, not
            guessed: with this grid (4 cols, gap-6) inside the section's
            max-w-7xl px-4/px-8 container, the math already lands each
            column at ~286px wide at both 1280px and 1440px (max-w-7xl
            caps the container at 1216px content width at both, so cards
            don't keep growing past 1440px either) - 1024px naturally
            gives narrower ~222px cards, which is the expected responsive
            behavior at that checkpoint. Getting the HEIGHT down to ~106px
            required rebuilding the card as a horizontal (photo-left,
            text-right) layout instead of the previous vertical stack
            (square photo on top) - a vertical stack literally cannot fit
            image+name+position+age+button in 106px of height when the
            image alone is ~285px square. Photo, name, flag, position,
            age, country, and the View Profile button are all preserved,
            just rearranged to fit the shorter footprint. */}
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {visible.map((slot) => {
            const { player } = slot;
            const profileHref = player.slug ? `/player-profile/${player.slug}` : "/find-players";

            // BUG FIX: placehold.co returns SVG by default, and Next's
            // image optimizer refuses to process SVG unless explicitly
            // told to (confirmed directly in the dev server log: every
            // one of these requests was failing with "has type
            // image/svg+xml but dangerouslyAllowSVG is disabled",
            // rendering as broken/blank cards). `unoptimized` is Next's
            // own documented escape hatch for exactly this case - applied
            // only to the placeholder fallback path, so a real photoUrl
            // (once real featured players are wired in) still gets full
            // optimization.
            const isPlaceholderPhoto = !player.photoUrl;
            const photoSrc = player.photoUrl ?? `https://placehold.co/400x400/e5e7eb/9ca3af?text=${encodeURIComponent(player.name)}`;

            return (
              // Whole card is clickable (not just the button): requires
              // this to be the single Link, not a div with a nested Link
              // around just the button - two nested <a> tags is invalid
              // HTML. The "View Profile" button is now a plain styled
              // span, visually identical, that rides along with the
              // card's own Link instead of being its own click target.
              <Link
                key={slot.id}
                href={profileHref}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex h-[106px]"
              >
                <div className="relative w-[88px] h-full shrink-0 bg-gray-100">
                  <Image
                    src={photoSrc}
                    alt=""
                    fill
                    sizes="88px"
                    className="object-cover"
                    unoptimized={isPlaceholderPhoto}
                  />
                </div>
                <div className="flex-1 min-w-0 pl-4 pr-2.5 py-2.5 flex flex-col justify-center gap-0.5">
                  <p className="font-semibold text-gray-900 text-xs flex items-center gap-1 truncate">
                    <span aria-hidden="true">{player.countryFlag}</span> {player.name}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">{player.position}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {player.age !== null ? `${player.age}y · ` : ""}
                    {player.country}
                  </p>
                  <span className="mt-0.5 block w-full text-center bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold py-1 rounded-md">
                    View Profile →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Mobile (below sm, i.e. every width this pass targets - 320
            /375/390/414): the approved reference shows a vertical
            photo-on-top card, not the desktop's compact horizontal
            strip - that strip physically can't hold a portrait photo at
            106px tall, so this is genuinely different markup, not a
            resize of the same cards. Horizontally scrollable so all 4
            admin-controlled slots stay reachable even though only ~3
            fit on screen at once, matching the reference's own
            partially-cropped 3rd/4th card at the right edge. */}
        <div className="sm:hidden -mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1">
          {visible.map((slot) => {
            const { player } = slot;
            const profileHref = player.slug ? `/player-profile/${player.slug}` : "/find-players";
            const isPlaceholderPhoto = !player.photoUrl;
            const photoSrc = player.photoUrl ?? `https://placehold.co/400x400/e5e7eb/9ca3af?text=${encodeURIComponent(player.name)}`;

            return (
              <Link
                key={slot.id}
                href={profileHref}
                className="shrink-0 snap-start w-[124px] bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="relative w-full aspect-[4/5] bg-gray-100">
                  <Image
                    src={photoSrc}
                    alt=""
                    fill
                    sizes="124px"
                    className="object-cover"
                    unoptimized={isPlaceholderPhoto}
                  />
                </div>
                <div className="p-2 flex flex-col gap-0.5">
                  <p className="font-semibold text-gray-900 text-xs flex items-center gap-1 truncate">
                    <span aria-hidden="true">{player.countryFlag}</span> {player.name}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">{player.position}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {player.age !== null ? `${player.age}y · ` : ""}
                    {player.country}
                  </p>
                  <span className="mt-1 block w-full text-center bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold py-1.5 rounded-md">
                    View Profile →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
