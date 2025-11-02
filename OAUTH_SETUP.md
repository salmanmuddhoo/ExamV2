# OAuth Setup Guide

This application now supports social login with popular OAuth providers. Follow the instructions below to configure each provider in your Supabase project.

## Prerequisites

1. Access to your Supabase Dashboard
2. Developer accounts for the OAuth providers you want to enable

## General Setup Steps

1. Navigate to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **Authentication** → **Providers**
4. Enable and configure each OAuth provider as described below

---

## Google OAuth Setup

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application** as the application type
6. Add authorized redirect URIs:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
7. Copy the **Client ID** and **Client Secret**

### 2. Configure in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Google** and click to expand
3. Toggle **Enable Sign in with Google**
4. Enter your **Client ID** and **Client Secret**
5. Click **Save**

---

## Apple OAuth Setup

### 1. Create Apple OAuth Credentials

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Create a new **Services ID**
4. Configure **Sign in with Apple**
5. Add redirect URL:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
6. Generate a **private key** for Sign in with Apple
7. Note down:
   - Services ID (Client ID)
   - Team ID
   - Key ID
   - Private Key (.p8 file)

### 2. Configure in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Apple** and click to expand
3. Toggle **Enable Sign in with Apple**
4. Enter:
   - Services ID (Client ID)
   - Team ID
   - Key ID
   - Private Key
5. Click **Save**

---

## GitHub OAuth Setup

### 1. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in the application details:
   - **Application name**: Your app name
   - **Homepage URL**: Your app URL
   - **Authorization callback URL**:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
4. Click **Register application**
5. Copy the **Client ID**
6. Generate a new **Client Secret** and copy it

### 2. Configure in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **GitHub** and click to expand
3. Toggle **Enable Sign in with GitHub**
4. Enter your **Client ID** and **Client Secret**
5. Click **Save**

---

## Microsoft Azure OAuth Setup

### 1. Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Fill in the details:
   - **Name**: Your app name
   - **Supported account types**: Choose **Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts**
   - **Redirect URI**: Select **Web** and enter:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
5. Click **Register**
6. Copy the **Application (client) ID**

### 2. Configure API Permissions (CRITICAL)

1. In your app registration, go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add the following permissions:
   - `openid` (Sign users in)
   - `profile` (View users' basic profile)
   - `email` (View users' email address) **← REQUIRED**
   - `User.Read` (Sign in and read user profile)
4. Click **Add permissions**
5. **IMPORTANT**: Click **Grant admin consent** if you have admin rights
   - If you don't have admin rights, users will need to consent on first login

### 3. Create Client Secret

1. Go to **Certificates & secrets** → **New client secret**
2. Add a description and expiration period
3. Click **Add** and copy the client secret value **immediately** (you won't see it again)

### 4. Configure in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Azure** and click to expand
3. Toggle **Enable Sign in with Azure**
4. Enter your **Client ID** (Application/client ID from Azure)
5. Enter your **Client Secret** (from step 3)
6. **Azure Tenant ID**:
   - For personal Microsoft accounts + organizational accounts: use `common`
   - For single tenant: use your specific tenant ID
   - For organizational accounts only: use `organizations`
7. **Scopes**: Leave default or ensure it includes `openid profile email`
8. Click **Save**

### Troubleshooting Azure OAuth

**Error: "Error getting user email from external provider"**
- Ensure you've added the `email` permission in Azure API permissions (step 2.3)
- Make sure you've granted admin consent for the permissions
- Verify the redirect URI matches exactly: `https://your-project.supabase.co/auth/v1/callback`
- Check that "Supported account types" includes the type of accounts you're testing with

---

## Facebook OAuth Setup (Optional)

### 1. Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select an existing one
3. Add **Facebook Login** product
4. Configure OAuth redirect URIs:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
5. Copy your **App ID** and **App Secret**

### 2. Configure in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Facebook** and click to expand
3. Toggle **Enable Sign in with Facebook**
4. Enter your **Client ID** (App ID) and **Client Secret** (App Secret)
5. Click **Save**

---

## Testing OAuth Integration

After configuring the providers:

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to the login page

3. Click on any of the social login buttons (Google, Apple, GitHub, or Microsoft)

4. Complete the OAuth flow

5. You should be redirected back to your app and logged in

6. Check the Supabase Dashboard → **Authentication** → **Users** to see the new user

---

## Important Notes

### Redirect URLs

Make sure to configure redirect URLs for both development and production:

**Development:**
```
http://localhost:5173
```

**Production:**
```
https://your-production-domain.com
```

### Profile Creation

- OAuth users will automatically have a profile created in the `profiles` table
- The profile will use metadata from the OAuth provider:
  - Name from `user_metadata.full_name` or `user_metadata.name`
  - Avatar from `user_metadata.avatar_url` or `user_metadata.picture`
  - Email from the OAuth provider
- All OAuth users are assigned the `student` role by default

### Security Considerations

1. **Never commit OAuth secrets** to version control
2. Store secrets in Supabase Dashboard only
3. Use environment variables for development if needed
4. Regularly rotate OAuth client secrets
5. Monitor OAuth usage in provider dashboards
6. Configure appropriate scopes (email and profile are default)

### Troubleshooting

**Issue: OAuth redirect not working**
- Verify redirect URLs match exactly (including protocol)
- Check that the provider is enabled in Supabase
- Ensure credentials are correctly entered

**Issue: User profile not created**
- Check Supabase logs for errors
- Verify the `profiles` table has correct RLS policies
- Ensure the OAuth provider returns email and name metadata

**Issue: "Invalid provider" error**
- Verify the provider name matches exactly (lowercase)
- Check that the provider is enabled in Supabase

---

## Support

For more information, refer to:
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase OAuth Providers](https://supabase.com/docs/guides/auth/social-login)

## Additional Providers

The code supports Facebook as well. To enable it, follow the Facebook OAuth setup instructions above and the button will work automatically.

Currently enabled providers in the UI:
- Google
- Apple
- GitHub
- Microsoft Azure

To add more providers (like Facebook, Twitter, Discord, etc.), simply:
1. Configure them in Supabase Dashboard
2. Add corresponding buttons in `LoginForm.tsx`
3. The backend is already set up to handle any Supabase-supported OAuth provider
