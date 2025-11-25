#!/bin/bash

# Complete Railway Setup Script for ImpactD122
# This script automates the entire Railway deployment process

set -e  # Exit on any error

echo "🚂 Complete Railway Setup for ImpactD122"
echo "=========================================="
echo ""

# Navigate to project directory
cd /Users/nicholasdeblasio/Desktop/impact-brokerage-os/ImpactD122

# Step 1: Verify Railway authentication
echo "Step 1: Verifying Railway authentication..."
railway whoami
echo "✅ Authenticated"
echo ""

# Step 2: Check project link
echo "Step 2: Checking project link..."
railway status
echo "✅ Project linked"
echo ""

# Step 3: Add PostgreSQL Database
echo "Step 3: Adding PostgreSQL database..."
echo "This will add a Postgres database to your project"
railway add --database postgres
echo "✅ PostgreSQL database added"
echo ""

# Wait for database to be ready
echo "⏳ Waiting 10 seconds for database to initialize..."
sleep 10

# Step 4: Set environment variables
echo "Step 4: Setting environment variables..."

# Get Gemini API key from local env
GEMINI_KEY=$(grep GEMINI_API_KEY server/.env | cut -d '=' -f2 | tr -d '"' | tr -d "'")

echo "Setting NODE_ENV=production..."
railway variables set NODE_ENV=production

echo "Setting GEMINI_API_KEY..."
railway variables set GEMINI_API_KEY="$GEMINI_KEY"

echo "✅ Environment variables set"
echo ""

# Step 5: Display current variables
echo "Step 5: Current Railway variables:"
railway variables
echo ""

# Step 6: Link to server service and deploy
echo "Step 6: Triggering deployment..."
railway up --detach
echo "✅ Deployment triggered"
echo ""

# Step 7: Wait for deployment
echo "⏳ Waiting for deployment to complete (this may take 3-5 minutes)..."
sleep 30

# Step 8: Push database schema
echo "Step 8: Pushing database schema with Prisma..."
railway run npm run db:push --workspace=server
echo "✅ Database schema pushed"
echo ""

# Step 9: Check deployment status
echo "Step 9: Checking deployment status..."
railway status
echo ""

# Step 10: Get deployment logs
echo "Step 10: Fetching recent logs..."
railway logs --limit 50
echo ""

# Step 11: Open project dashboard
echo "Step 11: Opening Railway dashboard..."
railway open

echo ""
echo "✅ Setup Complete!"
echo "=================="
echo ""
echo "Your ImpactD122 application is now deployed on Railway!"
echo ""
echo "Next steps:"
echo "1. Check the Railway dashboard that just opened"
echo "2. Verify the deployment is running"
echo "3. Get your deployment URL from the dashboard"
echo "4. Test the application endpoints"
echo ""
echo "Useful commands:"
echo "  railway logs          - View application logs"
echo "  railway open          - Open project dashboard"
echo "  railway status        - Check project status"
echo "  railway variables     - View environment variables"
echo ""
