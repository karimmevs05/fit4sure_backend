require('dotenv').config()
const app = require('./app')
const { startAutoReceiptSync } = require('./services/googleDriveSync')

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Fit4Sure server running on port ${PORT}`)

  // Receipt sync disabled due to Gemini API quota limits
  // Will re-enable once quota resets or paid plan is active
  // try {
  //   startAutoReceiptSync(5); // Sync every 5 minutes
  // } catch (error) {
  //   console.warn('Could not start receipt sync:', error.message);
  //   console.warn('Make sure Google credentials are configured');
  // }
})
