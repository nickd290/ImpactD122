#!/bin/bash

# Deploy ImpactD122 to Railway
# This script automates the Railway deployment process

set -e  # Exit on any error

echo "🚂 Starting Railway Deployment for ImpactD122"
echo "=============================================="

# Navigate to project directory
cd /Users/nicholasdeblasio/Desktop/impact-brokerage-os/ImpactD122

# Check Railway authentication
echo ""
echo "📋 Checking Railway authentication..."
railway whoami

# Create new project using Railway API via CLI
echo ""
echo "🆕 Creating new Railway project..."
echo "Note: This will open an interactive prompt. Please select:"
echo "  1. Workspace: nickd290's Projects"
echo "  2. Create new project"
echo "  3. Name: ImpactD122"
echo ""
echo "Press Enter to continue..."
read

railway init

# Check if project was linked successfully
if [ -d ".railway" ]; then
    echo "✅ Railway project created and linked successfully!"
else
    echo "❌ Failed to create Railway project"
    exit 1
fi

# Add PostgreSQL database
echo ""
echo "🗄️  Adding PostgreSQL database..."
railway add

echo ""
echo "Please select 'PostgreSQL' from the list"
echo "Press Enter after adding database..."
read

# Get environment variables
echo ""
echo "📝 Current local environment variables:"
echo "GEMINI_API_KEY: $(grep GEMINI_API_KEY server/.env | cut -d '=' -f2)"

# Set environment variables
echo ""
echo "🔐 Setting production environment variables..."
GEMINI_KEY=$(grep GEMINI_API_KEY server/.env | cut -d '=' -f2)

railway variables set NODE_ENV=production
railway variables set GEMINI_API_KEY="$GEMINI_KEY"

echo "✅ Environment variables set!"

# Show current variables
echo ""
echo "📊 Current Railway variables:"
railway variables

# Deploy the application
echo ""
echo "🚀 Deploying application to Railway..."
echo "This may take a few minutes..."
railway up

# Get deployment status
echo ""
echo "📈 Checking deployment status..."
railway status

# Get deployment URL
echo ""
echo "🌐 Getting deployment URL..."
railway open

echo ""
echo "✅ Deployment Complete!"
echo "======================="
echo ""
echo "Next steps:"
echo "1. Check the Railway dashboard for deployment status"
echo "2. Run 'railway logs' to view application logs"
echo "3. Run 'railway open' to open the project dashboard"
echo ""
echo "To push database schema:"
echo "  railway run npm run db:push --workspace=server"
