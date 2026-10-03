/**
 * AgriScan logo: open palm holding cherries.
 * Fully colored SVG — place on light background for best look.
 */
export default function LogoHandCherry({ size = 32, className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AgriScan"
    >
      {/* Leaf */}
      <path
        d="M22 10 C 15 8 11 13 16 17 C 20 17 22 13 22 10 Z"
        fill="#2E7D32"
        stroke="#1B5E20"
        strokeWidth="0.8"
      />
      {/* Stems */}
      <path d="M22 11 Q24 18 27 25" stroke="#1B5E20" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M22 11 Q30 16 38 24" stroke="#1B5E20" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* Back cherry */}
      <circle cx="38" cy="27" r="7" fill="#B71C1C" stroke="#7F0000" strokeWidth="0.8" />
      <ellipse cx="35.5" cy="24.5" rx="1.8" ry="1.2" fill="#EF9A9A" opacity="0.85" transform="rotate(-25 35.5 24.5)" />
      {/* Front cherry */}
      <circle cx="27" cy="28" r="7.2" fill="#D32F2F" stroke="#7F0000" strokeWidth="0.8" />
      <ellipse cx="24.3" cy="25.5" rx="2" ry="1.3" fill="#FFCDD2" opacity="0.9" transform="rotate(-25 24.3 25.5)" />

      {/* Palm / open hand */}
      <path
        d="M8 40
           Q8 34 14 33
           Q18 33 19 36
           Q20 30 24 30
           Q28 30 29 34
           Q30 28 34 28
           Q38 28 39 32
           Q40 29 44 30
           Q50 31 50 38
           L50 46
           Q50 58 32 58
           Q11 58 8 46 Z"
        fill="#F2B48C"
        stroke="#8D4E1F"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Palm crease */}
      <path
        d="M16 45 Q24 50 32 48 Q40 50 46 45"
        stroke="#8D4E1F"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M20 51 Q28 54 36 52"
        stroke="#8D4E1F"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}
