export function BrandLogo({ className = '', size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`brand-svg ${className}`}
      aria-hidden="true"
    >
      {/* Hexagonal polygon border */}
      <polygon
        points="18,2 32,9 32,27 18,34 4,27 4,9"
        fill="#12161a"
        stroke="var(--color-lime, #b4f300)"
        strokeWidth="2"
      />
      {/* Geometric chess piece / DNA symbol */}
      <path
        d="M18 8L24 13L21 16L24 20L21 24L18 22L15 24L12 20L15 16L12 13L18 8Z"
        fill="var(--color-lime, #b4f300)"
        opacity="0.9"
      />
      <circle cx="18" cy="18" r="2.5" fill="#0b0e11" />
    </svg>
  )
}
