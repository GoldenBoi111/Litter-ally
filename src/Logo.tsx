/** Litter-ally's mark: an ink-drawn trashcan wearing a gold star. Lines wobble slightly so it reads as drawn, not vector. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Litter-ally logo">
      <g fill="none" stroke="var(--ll-ink, #2a2420)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {/* lid and handle */}
        <path d="M5.2 8.6 C10 7.9, 21.5 7.7, 26.9 8.5" />
        <path d="M12.6 8.1 C12.4 5.9, 13.2 5.1, 16 5.1 C18.9 5.0, 19.6 5.9, 19.4 8.0" />
        {/* body, slightly tapered */}
        <path d="M7.1 9.3 L8.8 27.2 C9 28.2, 9.6 28.6, 10.6 28.6 L21.6 28.5 C22.5 28.5, 23.1 28.0, 23.2 27.1 L24.9 9.4" fill="var(--ll-card, #fbf6e9)" />
        {/* ribs */}
        <path d="M11.4 12.6 L12.1 25.2" opacity={0.55} />
        <path d="M20.6 12.6 L19.9 25.2" opacity={0.55} />
      </g>
      {/* the star sticker on the front */}
      <path
        d="M16 12.4 L17.35 15.7 L20.9 15.95 L18.2 18.25 L19.05 21.7 L16 19.85 L12.95 21.7 L13.8 18.25 L11.1 15.95 L14.65 15.7 Z"
        fill="#f2c230" stroke="var(--ll-ink, #2a2420)" strokeWidth={1.1} strokeLinejoin="round"
        transform="rotate(-8 16 17)"
      />
    </svg>
  )
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span className="wordmark-text">Litter-ally</span>
    </span>
  )
}
