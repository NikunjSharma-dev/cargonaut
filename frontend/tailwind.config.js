/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      colors: {
        // Surfaces/text are CSS variables so the dark theme flips them wholesale
        app: {
          bg: 'var(--bg-app)',
          panel: 'var(--bg-panel)',
          surface: 'var(--bg-surface)',
          hover: 'var(--bg-hover)',
          border: 'var(--border)',
        },
        primary: {
          DEFAULT: '#e8606d',
          hover: '#d44a58',
          soft: 'var(--primary-soft)',
          light: '#f28d97',
        },
        accent: {
          DEFAULT: '#e8606d',
          hover: '#d44a58',
          soft: '#fdeef0',
        },
        status: {
          success: '#22c55e',
          'success-soft': '#f0fdf4',
          warning: '#f5a524',
          'warning-soft': '#fffbebe6',
          danger: '#ef4444',
          'danger-soft': '#fef2f2',
          info: '#3b82f6',
          'info-soft': '#eff6ff',
        },
        heading: 'var(--text-primary)',
        body: 'var(--text-body)',
        muted: 'var(--text-secondary)',
        subtle: 'var(--text-subtle)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(24, 26, 33, 0.04), 0 1px 2px rgba(24, 26, 33, 0.02)',
        'card-hover': '0 8px 20px -4px rgba(24, 26, 33, 0.08), 0 2px 6px -2px rgba(24, 26, 33, 0.04)',
        floating: '0 12px 32px -8px rgba(24, 26, 33, 0.10), 0 6px 12px -6px rgba(24, 26, 33, 0.05)',
        shell: '0 24px 60px -20px rgba(24, 26, 33, 0.25)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '22px',
      },
    },
  },
  plugins: [],
}
