/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        jellyfin: {
          bg: '#101010',
          surface: '#1a1a1a',
          card: '#202020',
          border: '#2e2e2e',
          primary: '#00a4dc',
          'primary-hover': '#0088ba',
          accent: '#aa5cc3',
          text: '#e8e8e8',
          muted: '#8c8c8c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
