/**
 * Example Cloudflare Worker code for Stripe integration with SnapView
 * 
 * This file shows how to extend your existing Cloudflare Worker to support
 * Stripe payments for the SnapView application.
 * 
 * You'll need to:
 * 1. Install the Stripe package: npm install stripe
 * 2. Set these environment variables in your Cloudflare Worker:
 *    - STRIPE_SECRET_KEY: Your Stripe secret key
 *    - STRIPE_WEBHOOK_SECRET: Your Stripe webhook endpoint secret
 * 3. Create a product and price in your Stripe dashboard
 * 4. Update the STRIPE_PRICE_ID in the frontend script.js
 */

import Stripe from 'stripe';

// Initialize Stripe with your secret key
const stripe = new Stripe(STRIPE_SECRET_KEY);

// Add these routes to your existing worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle Stripe checkout session creation
    if (url.pathname === '/create-checkout-session' && request.method === 'POST') {
      return handleCreateCheckoutSession(request, env);
    }
    
    // Handle Stripe webhooks
    if (url.pathname === '/stripe-webhook' && request.method === 'POST') {
      return handleStripeWebhook(request, env);
    }
    
    // Your existing image analysis logic here...
    
    return new Response('Not Found', { status: 404 });
  }
};

async function handleCreateCheckoutSession(request, env) {
  try {
    const { email, priceId, successUrl, cancelUrl } = await request.json();
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // Your Stripe price ID
          quantity: 1,
        },
      ],
      mode: 'payment', // Use 'subscription' for recurring payments
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_email: email,
        product_type: 'snapview_unlimited'
      }
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Checkout session error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleStripeWebhook(request, env) {
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');
    
    const event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
    
    // Handle successful payments
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userEmail = session.metadata.user_email;
      
      // Update user's premium status in your database
      // For this example, we'll use KV storage
      await env.USER_DATA.put(`user_${userEmail}`, JSON.stringify({
        email: userEmail,
        isPremium: true,
        purchaseDate: new Date().toISOString(),
        stripeSessionId: session.id
      }));
      
      console.log(`User ${userEmail} upgraded to premium`);
    }
    
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Helper function to check if user is premium (use in your analysis endpoint)
async function isUserPremium(email, env) {
  try {
    const userData = await env.USER_DATA.get(`user_${email}`);
    if (!userData) return false;
    
    const user = JSON.parse(userData);
    return user.isPremium || false;
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}

// Usage tracking helper
async function getUserUsage(email, env) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `usage_${email}_${today}`;
  
  try {
    const usage = await env.USER_DATA.get(key);
    return usage ? parseInt(usage) : 0;
  } catch (error) {
    console.error('Error getting usage:', error);
    return 0;
  }
}

async function incrementUserUsage(email, env) {
  const today = new Date().toISOString().split('T')[0];
  const key = `usage_${email}_${today}`;
  
  try {
    const currentUsage = await getUserUsage(email, env);
    await env.USER_DATA.put(key, (currentUsage + 1).toString(), {
      expirationTtl: 86400 // Expire after 24 hours
    });
  } catch (error) {
    console.error('Error incrementing usage:', error);
  }
}