interface LogoProps {
  size?: number
  className?: string
}

/** Logo do Gravity (hexagono com nucleo central). */
export function LogoGravity({ size = 30, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <polygon
        points="12,2 21.5,7.5 21.5,16.5 12,22 2.5,16.5 2.5,7.5"
        fill="currentColor"
        opacity={0.12}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <polygon points="12,5.5 18.5,9.25 18.5,15.25 12,19 5.5,15.25 5.5,9.25" fill="currentColor" opacity={0.08} />
      <circle cx={12} cy={12} r={3} fill="currentColor" />
    </svg>
  )
}

/** Marca no canto: logo do Gravity + "powered by dati". */
export function Brand() {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 text-indigo-400">
        <LogoGravity size={30} />
        <span className="text-lg font-bold tracking-tight text-slate-100">Gravity</span>
      </div>
      <a
        href="https://datiplataforma.com.br"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-slate-500 transition hover:text-slate-300"
      >
        powered by <span className="font-semibold" style={{ color: '#253f78' }}>dati.</span>
      </a>
    </div>
  )
}
