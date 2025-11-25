#!/bin/bash

# Script to add PostgreSQL database and import data to Railway
set -e

echo "🗄️  Step 1: Adding PostgreSQL database to Railway..."
echo ""
echo "Please go to the Railway dashboard and manually add PostgreSQL:"
echo "👉 https://railway.app/project/d0c5113f-db97-42c1-b2e1-a8d4312e6182"
echo ""
echo "Click: + New → Database → Add PostgreSQL"
echo ""
read -p "Press Enter once you've added the PostgreSQL database..."

echo ""
echo "⏳ Waiting for DATABASE_URL to be available..."
sleep 5

# Check if DATABASE_URL is available
if railway run printenv | grep -q "DATABASE_URL"; then
    echo "✅ DATABASE_URL found!"

    echo ""
    echo "📊 Step 2: Importing data from local database..."
    echo "Local database contains:"
    echo "  - 53 jobs"
    echo "  - 12 entities (customers/vendors)"
    echo "  - 53 line items"
    echo ""

    # Import the dump
    railway run /opt/homebrew/opt/postgresql@16/bin/psql \$DATABASE_URL < /tmp/impactd122_dump.sql

    echo ""
    echo "✅ Data import complete!"
    echo ""
    echo "🎉 Your Railway database is now set up with all your local data!"

else
    echo "❌ DATABASE_URL not found. Please check that PostgreSQL was added correctly."
    exit 1
fi
