/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#F7F5F2',
        surface: '#FFFFFF',
        primary: '#1A1A1A',
        secondary: '#6B6B6B',
        accent: '#2D6A4F',
        'accent-light': '#E8F5EF',
        error: '#E63946',
      },
      borderRadius: {
        card: '12px',
        pill: '20px',
      },
      spacing: {
        1: '4px',
        2: '8px',
        4: '16px',
        6: '24px',
        8: '32px',
      },
    },
  },
  plugins: [],
};
