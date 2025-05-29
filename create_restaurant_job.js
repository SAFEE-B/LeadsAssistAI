const axios = require('axios');

async function createJob() {
  try {
    const response = await axios.post('http://localhost:3000/api/scraper/start', {
      businessTypes: ["Restaurant"],
      zipCodes: ["90210"],
      clientName: "Test_Restaurant_90210_Script"
    });
    console.log('Job submission response:', response.data);
  } catch (error) {
    console.error('Error submitting job:', error.response ? error.response.data : error.message);
  }
}

createJob(); 