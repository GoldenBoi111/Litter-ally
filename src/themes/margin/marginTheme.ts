import { defineTheme } from '@astryxdesign/core/theme'

export const marginTheme = defineTheme({
  name: 'margin',
  tokens: {
    '--color-accent': 'var(--olive)',
    '--color-accent-muted': 'color-mix(in srgb, var(--olive) 18%, transparent)',
    '--color-background-body': 'var(--paper)',
    '--color-background-surface': 'var(--paper)',
    '--color-background-muted': 'color-mix(in srgb, var(--olive) 6%, var(--paper))',
    '--color-text-primary': 'var(--ink)',
    '--color-text-secondary': 'var(--ll-ink-muted)',
    '--color-text-disabled': 'var(--ll-pencil-text)',
    '--color-text-accent': 'var(--olive)',
    '--color-border': 'var(--line)',
    '--color-border-emphasized': 'color-mix(in srgb, var(--ink) 18%, var(--paper))',
    '--focus-outline-color': 'var(--olive)',
  },
})
