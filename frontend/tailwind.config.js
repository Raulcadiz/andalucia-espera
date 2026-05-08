/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'verde-sas': '#1D9E75',
        'rojo-alerta': '#E24B4A',
        'fondo-oscuro': '#1e2327',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
