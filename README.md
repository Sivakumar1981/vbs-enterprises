# VBS Enterprises Website - Setup Guide

## STEP 1 — Install Node.js
Go to https://nodejs.org → Download LTS → Install

## STEP 2 — Install MongoDB
Go to https://www.mongodb.com/try/download/community → Download → Install

## STEP 3 — Extract this ZIP
Right-click → Extract All → to your Desktop

## STEP 4 — Create .env file
- Go to vbs-enterprises/backend/
- Copy .env.example → rename copy to .env
- Open .env with Notepad and fill in:
  ADMIN_USERNAME=vbsadmin
  ADMIN_PASSWORD=vbs@2024
  EMAIL_USER=your_gmail@gmail.com
  EMAIL_PASS=your_gmail_app_password
  OWNER_EMAIL=your_gmail@gmail.com

## STEP 5 — Start the server
Open Command Prompt:
  cd Desktop\vbs-enterprises\backend
  npm install
  npm start

You should see:
  ✅ MongoDB connected
  🚀 VBS Enterprises is LIVE!

## STEP 6 — Open your website
  Shop:  http://localhost:5000
  Admin: http://localhost:5000/admin

Admin login: vbsadmin / vbs@2024

## STEP 7 — Share with customers

SAME WiFi:
  Run: ipconfig
  Find: IPv4 Address (e.g. 192.168.1.5)
  Share: http://192.168.1.5:5000

ANYWHERE via internet (ngrok):
  1. Download ngrok from https://ngrok.com/download
  2. Sign up free
  3. Extract ngrok.exe to Desktop
  4. Open NEW Command Prompt:
       cd Desktop
       ngrok http 5000
  5. Copy the https://xxxx.ngrok.io link
  6. Send to customers on WhatsApp!

NOTE: Keep Command Prompt with "npm start" open always.
