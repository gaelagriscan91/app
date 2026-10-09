/**
 * AgriScan logo: cherries held in an open hand (user-supplied artwork).
 * Uses /assets/logo.webp from the public folder so it benefits from browser caching.
 */
export default function LogoHandCherry({ size = 32, className = "", light = false }) {
  return (
    <img
      src={light ? "/assets/logo-light.png" : "/assets/logo.png"}
      alt="AgriScan"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", display: "block" }}
      draggable={false}
    />
  );
}
