import { redirect } from "next/navigation";

// /membership is the official ScoutAfrica Premium page. This route is
// kept only so any existing links to /subscription (dashboards, emails,
// bookmarks) keep working transparently rather than 404ing - it does
// nothing but redirect.
export default function SubscriptionRedirect() {
  redirect("/membership");
}
