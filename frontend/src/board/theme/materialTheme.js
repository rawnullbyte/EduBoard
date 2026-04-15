const TOKENS = {
  '--md-sys-color-primary': '#9fc5ff',
  '--md-sys-color-on-primary': '#002f67',
  '--md-sys-color-primary-container': '#11457d',
  '--md-sys-color-on-primary-container': '#d7e3ff',
  '--md-sys-color-secondary': '#c1c7d3',
  '--md-sys-color-on-secondary': '#2b313c',
  '--md-sys-color-tertiary': '#c9c6dc',
  '--md-sys-color-on-tertiary': '#302d42',
  '--md-sys-color-surface': '#131416',
  '--md-sys-color-surface-container': '#1a1c1f',
  '--md-sys-color-surface-container-high': '#212328',
  '--md-sys-color-surface-container-highest': '#2a2d33',
  '--md-sys-color-on-surface': '#e4e6eb',
  '--md-sys-color-on-surface-variant': '#c3c6cf',
  '--md-sys-color-outline': '#8d919a',
  '--md-sys-color-error': '#ffb4ab',
  '--md-sys-color-on-error': '#690005',
  '--board-font-family': '"Roboto", "Segoe UI", sans-serif',
  '--board-kiosk-gutter': 'clamp(1rem, 1.3vw, 2rem)',
  '--board-kiosk-gap': 'clamp(0.75rem, 1vw, 1.4rem)',
  '--board-title-size': 'clamp(2.1rem, 2.8vw, 4rem)',
  '--board-clock-size': 'clamp(4rem, 6vw, 7.25rem)',
  '--board-text-size': 'clamp(1rem, 1.15vw, 1.5rem)',
}

export function applyMaterialKioskTheme() {
  const root = document.documentElement
  Object.entries(TOKENS).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })
}
