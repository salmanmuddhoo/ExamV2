# Scripts Directory

This directory contains utility scripts for setting up and managing your application.

## Available Scripts

### setup-paypal-plans.js

Creates PayPal subscription plans for automatic recurring payments.

**Purpose:**
- Creates subscription plans in PayPal via API
- Generates SQL statements for database insertion
- Supports both sandbox and production modes

**Prerequisites:**
```bash
# Install dependencies
npm install
```

**Usage:**

1. **Set environment variables** (recommended):
   ```bash
   export PAYPAL_CLIENT_ID=your_paypal_client_id
   export PAYPAL_SECRET=your_paypal_secret
   export PAYPAL_MODE=sandbox  # or 'production'
   ```

2. **Or edit the script** directly:
   Open `scripts/setup-paypal-plans.js` and update the `CONFIG` object with your values.

3. **Run the script**:
   ```bash
   # Using npm script (recommended)
   npm run setup:paypal-plans

   # Or directly
   node scripts/setup-paypal-plans.js
   ```

4. **Save the output**:
   - Copy the Plan IDs that are displayed
   - Run the SQL statements in your Supabase SQL Editor

**Configuration:**

Edit the `CONFIG` object in the script to customize:
- PayPal credentials (Client ID and Secret)
- Mode (sandbox or production)
- Product details (name, description, URLs)
- Plan configurations (tiers, prices, billing cycles)

**Example Output:**
```
🚀 PayPal Subscription Plans Setup
================================================================================
✅ Product created: PROD-XXXXXXXXXXXXX
✅ Plan created: P-XXXXXXXXXXXXX (Student Monthly)
✅ Plan created: P-YYYYYYYYYYYYY (Student Yearly)
...
📝 SQL STATEMENTS FOR DATABASE
(Copy and run these in Supabase SQL Editor)
```

**Troubleshooting:**

- **Authentication Error**: Verify your `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` are correct
- **Product Already Exists**: Script will find and use existing product
- **Connection Error**: Check your internet connection and PayPal API status

**For More Information:**

See the complete guide: `PAYPAL_DUAL_SETUP_GUIDE.md`

---

## Adding New Scripts

When adding new utility scripts:

1. Place them in this `scripts/` directory
2. Add a npm script entry in `package.json`:
   ```json
   "scripts": {
     "your-script-name": "node scripts/your-script.js"
   }
   ```
3. Use ES modules syntax (import/export)
4. Document usage in this README

---

## Dependencies

Scripts in this directory use:
- `node-fetch@2` - For making HTTP requests to PayPal API

These are installed as devDependencies and won't be included in production builds.
