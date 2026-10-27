# Surplus Store — Backend API

RESTful API backend for Surplus Store built with **Node.js**, **Express**, and **MongoDB (Mongoose)**.

## Features
- **Authentication**: JWT authentication (access & refresh tokens stored in HTTP-only cookies) + CSRF double-submit protection.
- **Phone OTP Verification**: Supports console, Twilio, and MSG91 providers.
- **Product & Inventory Management**: Categorized catalogue, stock tracking, size & color variants.
- **Orders & Payments**: Cart checkout and Razorpay payment integration.
- **Admin Management**: Role-based access control (RBAC), analytics dashboard, and product/coupon CRUD.
- **Media Uploads**: Local storage with image optimization + Cloudinary integration support.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Fill in your configuration (MongoDB URI, JWT secrets, Razorpay keys, etc.).

### 3. Seed Database (Optional)
```bash
npm run seed
```

### 4. Start Server
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```
By default, the server runs on port `5000`.
