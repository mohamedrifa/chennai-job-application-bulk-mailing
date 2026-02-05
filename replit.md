# Backend Mailer API

## Overview
This is a Node.js/Express backend API for email functionality with MongoDB storage. It includes scheduled mailing jobs using node-cron.

## Project Structure
- `src/server.js` - Main Express server entry point
- `src/routes/mailRoutes.js` - API routes for mail endpoints
- `src/controllers/mailController.js` - Mail business logic
- `src/models/mailQueue.js` - Mongoose model for mail queue
- `src/config/mailConfig.js` - Mail configuration
- `src/jobs/dailyMailer.js` - Scheduled mail jobs
- `src/utils/` - Utility files and email data

## Tech Stack
- Node.js 20
- Express.js 5
- MongoDB (Mongoose 9)
- Nodemailer for email sending
- node-cron for scheduled jobs

## Environment Variables
- `MONGO_URI` - MongoDB connection string
- `PORT` - Server port (default: 5000)

## API Endpoints
- `/api/mail` - Mail-related endpoints

## Running the Project
- Development: `npm run dev` (uses nodemon)
- Production: `npm start`
