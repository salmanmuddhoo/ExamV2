import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo.png'],
      manifest: {
        name: 'Aixampapers - Smart Exam Preparation',
        short_name: 'Aixampapers',
        description: 'AI-powered exam preparation platform with smart study assistance',
        theme_color: '#000000',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Force cache invalidation by incrementing this version
        // Increment when you need to force all PWA users to refresh
        cleanupOutdatedCaches: true,
        // CRITICAL: Exclude PayPal authentication URLs from service worker
        // PayPal login must go directly to network without any caching or interception
        navigateFallbackDenylist: [
          /^https:\/\/www\.paypal\.com\/checkoutnow/,
          /^https:\/\/www\.paypal\.com\/signin/,
          /^https:\/\/www\.paypal\.com\/auth/,
          /^https:\/\/.*\.paypal\.com\//,
          /^https:\/\/.*\.paypalobjects\.com\//,
        ],
        // Cache strategies for different types of requests
        runtimeCaching: [
          {
            // Cache API calls to Supabase BUT exclude auth endpoints
            // CRITICAL: Never cache authentication endpoints as it breaks OAuth flows and session management
            urlPattern: ({ url }) => {
              const isSupabase = url.origin.includes('supabase');
              const isAuthEndpoint = url.pathname.includes('/auth/') ||
                                     url.pathname.includes('/token') ||
                                     url.pathname.includes('/verify') ||
                                     url.pathname.includes('/user') ||
                                     url.pathname.includes('/session');
              return isSupabase && !isAuthEndpoint;
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache-v2',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 10 // If network takes longer than 10s, use cache
            }
          },
          {
            // Cache images
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache-v2',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            // Cache fonts
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache-v2',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            // Cache external scripts (PDF.js, etc)
            urlPattern: ({ url }) => url.origin === 'https://cdnjs.cloudflare.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache-v2',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            // CRITICAL: PayPal - NetworkOnly (no caching) for authentication flows
            // PayPal login/checkout must always go to network without any caching
            // to prevent authentication issues in PWA
            urlPattern: ({ url }) => {
              return url.hostname.includes('paypal.com') || url.hostname.includes('paypalobjects.com');
            },
            handler: 'NetworkOnly'
            // No options - NetworkOnly doesn't support timeout or caching
          }
        ],
        // Skip waiting to activate new service worker immediately
        skipWaiting: true,
        clientsClaim: true
      },
      devOptions: {
        enabled: false // Disable in development to avoid caching issues
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
