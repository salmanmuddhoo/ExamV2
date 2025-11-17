#!/usr/bin/env node

/**
 * PayPal Subscription Plans Setup Script
 *
 * This script creates subscription plans in PayPal for automatic recurring payments.
 * It creates plans for all tier/billing cycle combinations.
 *
 * Prerequisites:
 * - Node.js installed
 * - PayPal Developer account with app credentials
 * - Dependencies installed: npm install
 *
 * Usage:
 * 1. Update the configuration below with your values
 * 2. Run: npm run setup:paypal-plans
 *    Or: node scripts/setup-paypal-plans.js
 * 3. Save the Plan IDs output - you'll need them for the database
 */

import fetch from 'node-fetch';

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================

const CONFIG = {
  // PayPal API credentials (get from PayPal Developer Dashboard)
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || 'your_paypal_client_id',
  PAYPAL_SECRET: process.env.PAYPAL_SECRET || 'your_paypal_secret',

  // Mode: 'sandbox' for testing, 'production' for live
  MODE: process.env.PAYPAL_MODE || 'sandbox',

  // Your product information
  PRODUCT_NAME: 'Exam Study Assistant Subscription',
  PRODUCT_DESCRIPTION: 'AI-powered exam preparation and study assistance',
  PRODUCT_CATEGORY: 'SOFTWARE',
  HOME_URL: 'https://yourdomain.com', // Update with your domain
  IMAGE_URL: 'https://yourdomain.com/logo.png', // Update with your logo

  // Subscription plans configuration
  // Update these prices to match your tier pricing
  PLANS: [
    {
      tier_name: 'student',
      tier_display_name: 'Student',
      billing_cycle: 'monthly',
      price: '10.00', // USD
      description: 'Monthly subscription for Student tier'
    },
    {
      tier_name: 'student',
      tier_display_name: 'Student',
      billing_cycle: 'yearly',
      price: '100.00', // USD (discounted from 12 * 10)
      description: 'Yearly subscription for Student tier (save 17%)'
    },
    {
      tier_name: 'premium',
      tier_display_name: 'Premium',
      billing_cycle: 'monthly',
      price: '20.00', // USD
      description: 'Monthly subscription for Premium tier'
    },
    {
      tier_name: 'premium',
      tier_display_name: 'Premium',
      billing_cycle: 'yearly',
      price: '200.00', // USD (discounted from 12 * 20)
      description: 'Yearly subscription for Premium tier (save 17%)'
    }
  ]
};

// ============================================
// SCRIPT CODE - NO NEED TO MODIFY BELOW
// ============================================

const PAYPAL_API_BASE = CONFIG.MODE === 'production'
  ? 'https://api.paypal.com'
  : 'https://api.sandbox.paypal.com';

// Get PayPal OAuth token
async function getAccessToken() {
  console.log(`\n🔐 Getting access token from PayPal (${CONFIG.MODE} mode)...`);

  const auth = Buffer.from(`${CONFIG.PAYPAL_CLIENT_ID}:${CONFIG.PAYPAL_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  console.log('✅ Access token obtained');
  return data.access_token;
}

// Create product (required before creating plans)
async function createProduct(accessToken) {
  console.log('\n📦 Creating product in PayPal...');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      name: CONFIG.PRODUCT_NAME,
      description: CONFIG.PRODUCT_DESCRIPTION,
      type: 'SERVICE',
      category: CONFIG.PRODUCT_CATEGORY,
      image_url: CONFIG.IMAGE_URL,
      home_url: CONFIG.HOME_URL
    })
  });

  if (!response.ok) {
    const error = await response.json();

    // If product already exists, try to find it
    if (error.name === 'RESOURCE_ALREADY_EXISTS') {
      console.log('⚠️  Product already exists, fetching existing product...');
      return await findExistingProduct(accessToken);
    }

    throw new Error(`Failed to create product: ${JSON.stringify(error)}`);
  }

  const product = await response.json();
  console.log(`✅ Product created: ${product.id}`);
  console.log(`   Name: ${product.name}`);
  return product.id;
}

// Find existing product by name
async function findExistingProduct(accessToken) {
  const response = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products?page_size=20`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to list products');
  }

  const data = await response.json();
  const product = data.products?.find(p => p.name === CONFIG.PRODUCT_NAME);

  if (product) {
    console.log(`✅ Found existing product: ${product.id}`);
    return product.id;
  }

  throw new Error('Product exists but could not be found');
}

// Create a subscription plan
async function createPlan(accessToken, productId, planConfig) {
  const { tier_name, tier_display_name, billing_cycle, price, description } = planConfig;

  console.log(`\n📋 Creating plan: ${tier_display_name} ${billing_cycle}...`);

  // Determine billing frequency
  const frequency = billing_cycle === 'monthly'
    ? { interval_unit: 'MONTH', interval_count: 1 }
    : { interval_unit: 'YEAR', interval_count: 1 };

  const planData = {
    product_id: productId,
    name: `${tier_display_name} ${billing_cycle.charAt(0).toUpperCase() + billing_cycle.slice(1)} Subscription`,
    description: description,
    billing_cycles: [
      {
        frequency: frequency,
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0, // 0 = infinite (recurring until cancelled)
        pricing_scheme: {
          fixed_price: {
            value: price,
            currency_code: 'USD'
          }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: '0',
        currency_code: 'USD'
      },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    },
    taxes: {
      percentage: '0',
      inclusive: false
    }
  };

  const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(planData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create plan: ${JSON.stringify(error)}`);
  }

  const plan = await response.json();

  // Activate the plan (plans are created in CREATED status)
  await activatePlan(accessToken, plan.id);

  console.log(`✅ Plan created and activated: ${plan.id}`);
  console.log(`   Name: ${plan.name}`);
  console.log(`   Price: $${price} USD per ${billing_cycle === 'monthly' ? 'month' : 'year'}`);

  return {
    tier_name,
    billing_cycle,
    plan_id: plan.id,
    plan_name: plan.name,
    price
  };
}

// Activate a plan
async function activatePlan(accessToken, planId) {
  const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans/${planId}/activate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok && response.status !== 204) {
    const error = await response.text();
    console.log(`⚠️  Warning: Could not activate plan: ${error}`);
  }
}

// Generate SQL for inserting plans into database
function generateSQL(plans) {
  console.log('\n\n' + '='.repeat(80));
  console.log('📝 SQL STATEMENTS FOR DATABASE');
  console.log('='.repeat(80));
  console.log('\nCopy and run these SQL statements in your Supabase SQL Editor:\n');

  console.log('-- 1. Create table for PayPal subscription plans');
  console.log(`CREATE TABLE IF NOT EXISTS paypal_subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier_id UUID REFERENCES subscription_tiers(id) NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  paypal_plan_id TEXT NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tier_id, billing_cycle)
);

-- 2. Add columns to payment_transactions for subscription tracking
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS paypal_plan_id TEXT,
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring'));

-- 3. Create index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription
ON payment_transactions(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;

-- 4. Insert PayPal plan mappings
-- IMPORTANT: Replace the tier_id UUIDs with your actual tier IDs from subscription_tiers table
-- Run this query first to get your tier IDs: SELECT id, name, display_name FROM subscription_tiers;
`);

  plans.forEach(plan => {
    console.log(`
-- ${plan.plan_name}
INSERT INTO paypal_subscription_plans (tier_id, billing_cycle, paypal_plan_id, price, currency)
VALUES (
  (SELECT id FROM subscription_tiers WHERE name = '${plan.tier_name}'), -- Auto-fetch tier_id by name
  '${plan.billing_cycle}',
  '${plan.plan_id}',
  ${plan.price},
  'USD'
)
ON CONFLICT (tier_id, billing_cycle)
DO UPDATE SET
  paypal_plan_id = EXCLUDED.paypal_plan_id,
  price = EXCLUDED.price,
  updated_at = NOW();`);
  });

  console.log('\n');
  console.log('='.repeat(80));
}

// Main execution
async function main() {
  console.log('🚀 PayPal Subscription Plans Setup');
  console.log('='.repeat(80));
  console.log(`Mode: ${CONFIG.MODE.toUpperCase()}`);
  console.log(`API Base: ${PAYPAL_API_BASE}`);
  console.log(`Plans to create: ${CONFIG.PLANS.length}`);
  console.log('='.repeat(80));

  // Validate configuration
  if (CONFIG.PAYPAL_CLIENT_ID === 'your_paypal_client_id') {
    console.error('\n❌ ERROR: Please update PAYPAL_CLIENT_ID in the configuration');
    console.error('Get your credentials from: https://developer.paypal.com/dashboard/');
    process.exit(1);
  }

  if (CONFIG.PAYPAL_SECRET === 'your_paypal_secret') {
    console.error('\n❌ ERROR: Please update PAYPAL_SECRET in the configuration');
    console.error('Get your credentials from: https://developer.paypal.com/dashboard/');
    process.exit(1);
  }

  try {
    // Get access token
    const accessToken = await getAccessToken();

    // Create product
    const productId = await createProduct(accessToken);

    // Create all plans
    const createdPlans = [];
    for (const planConfig of CONFIG.PLANS) {
      const plan = await createPlan(accessToken, productId, planConfig);
      createdPlans.push(plan);
    }

    // Generate summary
    console.log('\n\n' + '='.repeat(80));
    console.log('✅ SUCCESS! All plans created');
    console.log('='.repeat(80));
    console.log('\nPlan Summary:');
    createdPlans.forEach(plan => {
      console.log(`  • ${plan.plan_name}`);
      console.log(`    ID: ${plan.plan_id}`);
      console.log(`    Price: $${plan.price} USD`);
      console.log('');
    });

    // Generate SQL statements
    generateSQL(createdPlans);

    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Run the SQL statements above in your Supabase SQL Editor');
    console.log('2. Update your frontend to support recurring subscriptions');
    console.log('3. Update webhook handler to process subscription events');
    console.log('4. Test with PayPal sandbox account');
    console.log('\nFor detailed instructions, see: PAYPAL_RECURRING_SETUP.md\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the script
// In ES modules, check if this file is being run directly
import { fileURLToPath } from 'url';
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main();
}

export { main };
