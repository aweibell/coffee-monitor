require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function listModels() {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    try {
        const response = await client.models.list();
        console.log('Available models:');
        console.log(JSON.stringify(response, null, 2));
    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
