/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: '#0a0a0f',
          surface: '#14141b',
          surfaceHighlight: '#1c1c26',
          border: '#2a2a35',
          primary: '#00d4aa',
          primaryHover: '#00b894',
          primaryMuted: 'rgba(0, 212, 170, 0.15)',
          danger: '#ff4d4d',
          dangerMuted: 'rgba(255, 77, 77, 0.15)',
          warning: '#f0a030',
          text: '#e8e8ef',
          textSecondary: '#6b6b78',
          textMuted: '#4a4a55',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
