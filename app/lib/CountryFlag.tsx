import * as Flags from "country-flag-icons/react/3x2";

const FLAG_CODES: Record<string, keyof typeof Flags> = {
  Japan: "JP",
  Nigeria: "NG",
  Ghana: "GH",
  Cameroon: "CM",
  "South Africa": "ZA",
};

export function CountryFlag({
  country,
  className = "w-5 h-3.5 rounded-[2px] inline-block",
}: {
  country: string | null | undefined;
  className?: string;
}) {
  if (!country) return null;
  const code = FLAG_CODES[country.trim()];
  if (!code) return null;
  const Flag = Flags[code];
  return <Flag title={country} className={className} />;
}
