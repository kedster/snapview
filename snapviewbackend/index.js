// root/snapviewbackend/index.js
import { Router } from 'itty-router';
import { handleSignup, handleLogin, handleLogout, getCurrentUser, JWT_COOKIE_NAME } from './auth.js';
import { requireAuth, checkTier } from './middleware.js';
import { createCheckoutSession, handleStripeWebhook } from './stripe.js';
import { setCookie } from './utils.js';

const router = Router();

// Middleware to handle auth errors centrally
const handleAuthError = (request) => {
    if (request.authError) {
        const headers = { 'Content-Type': 'application/json' };
        if (request.authError.clearCookie) {
            headers['Set-Cookie'] = setCookie(JWT_COOKIE_NAME, '', {
                expires: new Date(0),
                path: '/',
                httpOnly: true,
                secure: !request.url.startsWith('http://localhost'), // Match env.BASE_URL logic
                sameSite: 'Lax'
            });
        }
        return new Response(JSON.stringify({ error: request.authError.message }), { status: request.authError.status, headers });
    }
    if (request.tierError) {
        return new Response(JSON.stringify({ error: request.tierError.message }), { status: request.tierError.status, headers: { 'Content-Type': 'application/json' }});
    }
};

// Public Routes
router.post('/auth/signup', handleSignup);
router.post('/auth/login', handleLogin);
router.post('/auth/logout', handleLogout); // Logout needs to clear cookie, no auth needed to call it
router.post('/stripe/webhook', handleStripeWebhook); // Stripe webhook doesn't use JWT auth

// Protected Routes using .all to apply middleware
router.all('/api/*', requireAuth, handleAuthError); // Apply auth to all /api/ routes

// Get current user (protected)
router.get('/api/user/me', (request, env) => {
    // requireAuth middleware should have run and populated request.user or errored
    if (!request.user) {
        // This case should ideally be caught by handleAuthError if requireAuth failed
        return new Response(JSON.stringify({ error: 'User not available after auth check.' }), { status: 500 });
    }
    // Exclude sensitive info if any accidentally made it to request.user
    const { password_hash, salt, ...safeUser } = request.user;
    return new Response(JSON.stringify({ user: safeUser }), { status: 200 });
});

// Example: Gated content for "paid" tier
router.get('/api/paid-content', checkTier('paid'), handleAuthError, (request, env) => {
    // If we reach here, user is authenticated and is on 'paid' tier (or handleAuthError responded)
    if (request.tierError) return; // Should have been handled by handleAuthError
    return new Response(JSON.stringify({ data: "This is super secret paid content!", userTier: request.user.tier }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});

// Example: Gated content for "free" (or any authenticated) tier
router.get('/api/free-content', (request, env) => {
    // requireAuth already ran due to /api/*
     return new Response(JSON.stringify({ data: "This is regular content for authenticated users!", userTier: request.user.tier }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});


// Stripe Checkout (protected)
router.post('/api/stripe/create-checkout-session', createCheckoutSession);


// Catch-all for 404s
router.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
    async fetch(request, env, ctx) {
        // You can add global pre-processing here if needed
        // e.g. CORS headers for all responses (though Cloudflare can handle this too)
        try {
            const response = await router.handle(request, env, ctx);

            // Example: Basic CORS handling for all responses, adjust as needed
            // This is very permissive, restrict origin in production
            const corsHeaders = {
                'Access-Control-Allow-Origin': request.headers.get('Origin') || "*", // Reflect origin or allow all
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature', // Add any custom headers client sends
                'Access-Control-Allow-Credentials': 'true', // If you use cookies/auth headers from frontend
            };

            let finalResponse;
            if (response) {
                finalResponse = new Response(response.body, response);
            } else {
                 // If router.handle() didn't return anything specific (e.g. middleware set an error and didn't return)
                 // Or if a route genuinely has no response (should be rare) handle it.
                 // For this setup, handleAuthError or other handlers should return a Response.
                 // This is a fallback.
                finalResponse = new Response("An unexpected error occurred or route not fully handled.", { status: 500 });
            }

            // Apply CORS headers
            for (const key in corsHeaders) {
                finalResponse.headers.set(key, corsHeaders[key]);
            }
            
            // Handle OPTIONS pre-flight requests
             if (request.method === 'OPTIONS') {
                return new Response(null, { headers: corsHeaders, status: 204 });
            }

            return finalResponse;

        } catch (err) {
            console.error("Global fetch error:", err);
            const errorResponse = new Response(err.message || 'Server Error', { status: err.status || 500 });
            // Apply CORS headers to error responses too
            const corsHeaders = {
                'Access-Control-Allow-Origin': request.headers.get('Origin') || "*",
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature',
                 'Access-Control-Allow-Credentials': 'true',
            };
            for (const key in corsHeaders) {
                errorResponse.headers.set(key, corsHeaders[key]);
            }
            return errorResponse;
        }
    },
};
