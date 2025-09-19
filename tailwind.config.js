module.exports = {
  content: ["./**/*.{html,js}"],
  theme: {
    extend: {
      backdropBlur: {
        xs: '2px',
      },
      colors: {
        overlay: {
          bg: 'rgba(0, 0, 0, 0.4)',
          bgSecondary: 'rgba(20, 20, 20, 0.5)',
          border: 'rgba(255, 255, 255, 0.15)',
          text: 'rgba(255, 255, 255, 0.9)',
          textSecondary: 'rgba(255, 255, 255, 0.6)',
        }
      }
    },
  },
  plugins: [],
}