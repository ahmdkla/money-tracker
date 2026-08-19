/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — evergreen family. The hero panel lives here in both themes.
        brand: {
          DEFAULT: '#0E3A2F',
          deep: '#0A2E25',
          mid: '#0F6E56',
        },
        mint: {
          DEFAULT: '#5DCAA5',
          soft: '#9FE1CB',
        },
        amber: {
          DEFAULT: '#EF9F27',
          soft: '#FAEEDA',
          text: '#7A4E06',
        },
        coral: {
          DEFAULT: '#F0997B',
          soft: '#FAECE7',
          text: '#993C1D',
        },
        // Neutral ramp: warm-cool grey with a faint green cast so it sits with
        // the evergreen instead of fighting it. Deliberately not slate/zinc.
        ink: {
          50: '#F7F8F7',
          100: '#EDEFEE',
          200: '#DDE1DF',
          300: '#C2C8C5',
          400: '#9AA29E',
          500: '#737B78',
          600: '#565D5A',
          700: '#3E4442',
          800: '#262B29',
          900: '#141817',
          950: '#0B0B0B',
        },
        // Dark-mode surfaces, per spec.
        night: {
          page: '#0F1512',
          card: '#161D19',
          raised: '#1E2723',
          line: '#2A332E',
        },
      },
      fontFamily: {
        sans: ['"Public Sans Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Fraunces Variable"', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
      },
      fontSize: {
        // Deliberate scale. Body floor is 16px so iOS never auto-zooms inputs.
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        meta: ['0.8125rem', { lineHeight: '1.15rem' }],
        base: ['1rem', { lineHeight: '1.55rem' }],
        hero: ['3.75rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'hero-sm': ['3rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        // Intentional, non-uniform. Chips are tight, cards are calm, hero is soft.
        chip: '8px',
        field: '10px',
        card: '16px',
        hero: '24px',
      },
      spacing: {
        gutter: '1.25rem',
        'tabbar': '5.25rem',
      },
      maxWidth: {
        app: '480px',
        shell: '1320px',
        prose: '68ch',
      },
      screens: {
        // The point at which a sidebar beats a drawer. Below it, thumbs.
        desk: '1024px',
      },
      transitionDuration: {
        press: '120ms',
        ui: '180ms',
      },
      keyframes: {
        'sheet-in': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'drawer-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'scrim-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-once': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
        shimmer: {
          '0%': { opacity: '0.55' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0.55' },
        },
      },
      animation: {
        'sheet-in': 'sheet-in 200ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        'pop-in': 'pop-in 140ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        'scrim-in': 'scrim-in 180ms ease-out',
        'toast-in': 'toast-in 180ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        'pulse-once': 'pulse-once 900ms ease-in-out 2',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
