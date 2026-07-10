/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sidebar azul marino + acentos operativos (§33)
        navy: {
          DEFAULT: '#0f2350',
          50: '#eef2fb',
          600: '#1e3a8a',
          700: '#182f6e',
          800: '#122451',
          900: '#0f2350',
        },
        accent: {
          blue: '#2563eb',
          green: '#16a34a',
          violet: '#7c3aed',
          orange: '#ea580c',
          teal: '#0d9488',
        },
        canvas: '#f6f7f9',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
      },
    },
  },
  plugins: [],
};
