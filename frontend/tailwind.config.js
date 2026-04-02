/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Microsoft JhengHei"', 'Calibri', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#9DE2DB', // Tiffany Light
          500: '#81D8D0', // Tiffany Green
          600: '#65BFB7', // Tiffany Dark
          700: '#0f766e',
        }
      }
    },
  },
  plugins: [],
}