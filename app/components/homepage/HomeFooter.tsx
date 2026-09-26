import Link from "next/link";
import { FaFacebookF, FaInstagram, FaXTwitter, FaYoutube, FaLinkedinIn } from "react-icons/fa6";
import Logo from "../Logo";

// Social icons are rendered as plain (non-link) glyphs, not <a> tags -
// this project has no real, confirmed social media URLs to point them at
// yet, and a placeholder href="#" would be a dead link presented as a
// working one. Swap these for real <Link>s the moment real account URLs
// exist.
const SOCIAL_ICONS = [FaFacebookF, FaInstagram, FaXTwitter, FaYoutube, FaLinkedinIn];

export default function HomeFooter() {
  return (
    <footer className="bg-green-950 text-green-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <Logo variant="badge" size="compact" />
            <span className="text-lg font-bold text-white">ScoutAfrica</span>
          </Link>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/" className="hover:text-white">Home</Link>
            <Link href="/find-players" className="hover:text-white">Find Players</Link>
            <Link href="/signup" className="hover:text-white">For Organizations</Link>
            <Link href="/about" className="hover:text-white">About Us</Link>
            <Link href="/membership" className="hover:text-white">Pricing</Link>
          </nav>

          <div className="flex gap-3">
            {SOCIAL_ICONS.map((Icon, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-green-100"
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-green-200">
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            <Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-white">Terms of Service</Link>
            <Link href="/contact" className="hover:text-white">Contact</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} ScoutAfrica</p>
        </div>
      </div>
    </footer>
  );
}
