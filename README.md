# Speech-to-Text (Run Locally)

This repository contains everything you need to run the Speech-to-Text application locally.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:  
   `npm install`

2. Set the `GEMINI_API_KEY` in `.env.local`  
   (Create `.env.local` if it doesn’t exist)

3. Run the app:  
   `npm run dev`

Your app will start on: http://localhost:3000/

## Build for Production

`npm run build`

## Notes
- `.env.local` should not be committed (already gitignored)
- Ensure you have a valid API key in your environment file
