interface KairosLogoProps {
  className?: string
  title?: string
}

/**
 * Logo Kairos — sablier stylisé représentant le timing et le monitoring.
 * Source : `stitch_kairos_veille_strat_gique_ia/kairos_logo/code.html` (Wave 7.2).
 * Le dégradé emerald/dark accompagne la palette Material You Kairos.
 */
export function KairosLogo({ className, title = 'Kairos' }: KairosLogoProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="kairos-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="1" />
          <stop offset="100%" stopColor="#006948" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path
        d="M30 20 L70 20 L50 50 L70 80 L30 80 L50 50 Z"
        fill="url(#kairos-logo-gradient)"
        stroke="#0d1c2e"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle cx={50} cy={50} r={5} fill="#ffffff" />
    </svg>
  )
}
