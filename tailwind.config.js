/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        clay: {
          bgPrimary: '#f5f1ed',
          bgSecondary: '#faf8f5',
          bgTertiary: '#f0ebe5',
          accentWarm: '#d4a574',
          accentCoral: '#e8b4a8',
          accentSage: '#a8d5ba',
          accentLavender: '#c8b8e4',
          accentSky: '#b8d8e8',
          textPrimary: '#4a4340',
          textSecondary: '#8b7d78',
          textLight: '#b5a89f',
        }
      },
      shadows: {
        clay: {
          sm: '0 2px 8px rgba(74, 67, 64, 0.06)',
          md: '0 4px 15px rgba(74, 67, 64, 0.12)',
          lg: '0 8px 25px rgba(74, 67, 64, 0.18)',
          xl: '0 20px 60px rgba(74, 67, 64, 0.25)',
        }
      },
      borderRadius: {
        clay: '20px',
      },
      backdropBlur: {
        clay: '10px',
      }
    },
  },
  plugins: [],
}
