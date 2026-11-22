/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ptt: {
          dark: '#0f172a',
          surface: '#1e293b',
          card: '#182234',
          accent: '#10b981', // green for connected / ready
          transmitting: '#ef4444', // vibrant red for transmitting
          busy: '#f59e0b', // amber for someone else speaking
          requesting: '#3b82f6', // blue for connecting turn
        }
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0.95)', opacity: '0.8' },
          '50%': { transform: 'scale(1.15)', opacity: '0.3' },
          '100%': { transform: 'scale(0.95)', opacity: '0.8' },
        },
        pulsefast: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        }
      },
      animation: {
        ripple: 'ripple 1.6s ease-in-out infinite',
        pulsefast: 'pulsefast 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
