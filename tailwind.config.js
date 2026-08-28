/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        bone: '#F4F0EA',
        ink: '#1A1A1A',
        lime: '#D4FF33',
        lilac: '#C8B6FF',
        bubblegum: '#FF90E8',
        azure: '#33A1FF'
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'sans-serif']
      },
      boxShadow: {
        neo: '4px 4px 0px #000000',
        'neo-sm': '2px 2px 0px #000000',
        'neo-lg': '6px 6px 0px #000000'
      }
    }
  },
  plugins: []
};
