#!/bin/bash

# Script to apply migrations with --include-all flag
# This is needed when local migrations have older timestamps than remote migrations

echo "Applying migrations to remote Supabase database..."
echo "This will include all pending migrations regardless of timestamp order."
echo ""

# Check if environment variables are set
if [ -z "$SUPABASE_PROJECT_ID" ] || [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo "ERROR: Required environment variables not set:"
    echo "  SUPABASE_PROJECT_ID: ${SUPABASE_PROJECT_ID:-NOT SET}"
    echo "  SUPABASE_DB_PASSWORD: ${SUPABASE_DB_PASSWORD:-NOT SET}"
    echo ""
    echo "Please set these variables and try again."
    exit 1
fi

# Apply migrations with --include-all flag
supabase db push \
  --db-url "postgresql://postgres.${SUPABASE_PROJECT_ID}:${SUPABASE_DB_PASSWORD}@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true" \
  --include-all

echo ""
echo "Migration complete!"
