export default function TopBar({ pageTitle, clockLabel, dateParts }) {
  return (
    <header
      style={{
        minHeight: 'clamp(5.5rem, 9vh, 8.5rem)',
        padding: 'clamp(0.75rem, 1.1vw, 1.4rem)',
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 1fr) auto minmax(280px, 1fr)',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: 'var(--md-sys-color-on-surface-variant)',
            fontWeight: 600,
            fontSize: 'clamp(1.8rem, 2.1vw, 3rem)',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {pageTitle}
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          fontWeight: 700,
          lineHeight: 1,
          fontSize: 'clamp(3.4rem, 5vw, 6rem)',
          letterSpacing: '-0.02em',
          color: 'var(--md-sys-color-primary)',
        }}
      >
        {clockLabel}
      </div>

      <div style={{ textAlign: 'right' }}>
        <div
          style={{
            fontSize: 'clamp(1.35rem, 1.9vw, 2.1rem)',
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {dateParts.weekday}
        </div>
        <div
          style={{
            marginTop: '0.3rem',
            color: 'var(--md-sys-color-on-surface-variant)',
            fontSize: 'clamp(1rem, 1.3vw, 1.6rem)',
            fontWeight: 500,
          }}
        >
          {dateParts.fullDate}
        </div>
      </div>
    </header>
  )
}
