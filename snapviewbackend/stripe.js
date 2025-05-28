// root/snapviewbackend/stripe.js
import Stripe from 'stripe';
import { updateUserTier, getUserById, updateUserStripeInfo } from './db.js';

export async function createCheckoutSession(request, env) {
    if (!request.user) { // Assumes requireAuth middleware ran
        return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16', // Use a recent API version
        httpClient: Stripe.createFetchHttpClient(), // Important for Cloudflare Workers
    });

    const { priceId } = await request.json(); // Client might send which price they want
    const effectivePriceId = priceId || env.STRIPE_PRICE_ID_PAID_TIER; // Fallback to default paid tier

    if (!effectivePriceId) {
        return new Response(JSON.stringify({ error: 'Stripe Price ID not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        let customerId = request.user.stripeCustomerId;
        // Create Stripe customer if one doesn't exist
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: request.user.email,
                metadata: { userId: request.user.id },
            });
            customerId = customer.id;
            await updateUserStripeInfo(env.DB, request.user.id, customerId);
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription', // or 'payment' for one-time
            customer: customerId,
            line_items: [{
                price: effectivePriceId,
                quantity: 1,
            }],
            success_url: `${env.BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${env.BASE_URL}/payment-cancel`,
            metadata: {
                userId: request.user.id, // Pass user ID to webhook
            },
            // To prefill email if not creating a customer or customer doesn't have email yet.
            // customer_email: request.user.email, (if customer is not set)
        });

        return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return new Response(JSON.stringify({ error: 'Stripe error: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function handleStripeWebhook(request, env) {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
    });
    const signature = request.headers.get('stripe-signature');
    const body = await request.text(); // Get raw body for signature verification

    let event;
    try {
        event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('⚠️  Webhook signature verification failed.', err.message);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // Handle the event
    let userId;
    let customerId;
    let subscriptionId;
    let subscriptionStatus;

    switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': // handles cancellations, etc.
            const subscription = event.data.object;
            customerId = subscription.customer;
            subscriptionId = subscription.id;
            subscriptionStatus = subscription.status; // e.g., 'active', 'past_due', 'canceled', 'unpaid'

            // Find user by stripe_customer_id
            // This is a bit indirect; prefer metadata on checkout session if possible
            const userResult = await env.DB.prepare("SELECT id FROM users WHERE stripe_customer_id = ?").bind(customerId).first();
            if (!userResult) {
                console.error(`Webhook error: User not found for Stripe customer ID ${customerId}`);
                return new Response('User not found for customer ID', { status: 404 });
            }
            userId = userResult.id;

            // Determine tier based on status
            const newTier = (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') ? 'paid' : 'free';
            await updateUserTier(env.DB, userId, newTier, customerId, subscriptionId, subscriptionStatus);
            console.log(`User ${userId} tier updated to ${newTier} due to subscription ${subscriptionId} status ${subscriptionStatus}.`);
            break;

        case 'checkout.session.completed':
            const session = event.data.object;
            userId = session.metadata && session.metadata.userId;
            customerId = session.customer;
            subscriptionId = session.subscription; // For subscriptions

            if (!userId) {
                console.error('Webhook error: checkout.session.completed missing userId in metadata.');
                // Potentially look up by customerId if metadata fails, but less reliable
                return new Response('Missing userId in metadata', { status: 400 });
            }

            // Get subscription details to confirm status
            if (subscriptionId && customerId) {
                 try {
                    const sub = await stripe.subscriptions.retrieve(subscriptionId);
                    subscriptionStatus = sub.status;
                    const tier = (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') ? 'paid' : 'free';
                    await updateUserTier(env.DB, userId, tier, customerId, subscriptionId, subscriptionStatus);
                    console.log(`User ${userId} tier updated to ${tier} via checkout session ${session.id}. Sub: ${subscriptionId}`);
                } catch (subError) {
                    console.error(`Error retrieving subscription ${subscriptionId} for user ${userId}:`, subError);
                    // Proceed to update Stripe customer ID even if subscription retrieval fails,
                    // but log that tier might not be updated yet.
                    await updateUserStripeInfo(env.DB, userId, customerId);
                }
            } else if (customerId) {
                // This might be a one-time payment or customer creation event within checkout
                // For one-time payments, you'd check `session.payment_status === 'paid'`
                // and then grant access. For this example (subscription), we rely on subscription events.
                await updateUserStripeInfo(env.DB, userId, customerId);
                console.log(`User ${userId} Stripe customer ID ${customerId} associated via checkout session ${session.id}. Waiting for subscription event for tier update.`);
            }
            break;

        case 'invoice.payment_succeeded':
             // Often used to confirm recurring payments and ensure service continuity
             const invoice = event.data.object;
             customerId = invoice.customer;
             subscriptionId = invoice.subscription;
             if (customerId && subscriptionId) {
                 // Ensure the subscription is still active and user tier is correct
                 // This is a good place for redundant checks or granting access if a previous event was missed
                 const sub = await stripe.subscriptions.retrieve(subscriptionId);
                 if (sub.status === 'active' || sub.status === 'trialing') {
                     const invUserResult = await env.DB.prepare("SELECT id, tier FROM users WHERE stripe_customer_id = ?").bind(customerId).first();
                     if (invUserResult && invUserResult.tier !== 'paid') {
                         await updateUserTier(env.DB, invUserResult.id, 'paid', customerId, subscriptionId, sub.status);
                         console.log(`User ${invUserResult.id} tier ensured 'paid' on invoice.payment_succeeded for sub ${subscriptionId}.`);
                     }
                 }
             }
             break;

        case 'invoice.payment_failed':
            // Handle failed payments, potentially downgrade user tier or notify them
            const failedInvoice = event.data.object;
            customerId = failedInvoice.customer;
            subscriptionId = failedInvoice.subscription;
             if (customerId && subscriptionId) {
                 // Consider downgrading or notifying user.
                 // D1: update users set tier='free', stripe_subscription_status='past_due' WHERE stripe_customer_id = ?
                 const userToWarn = await env.DB.prepare("SELECT id FROM users WHERE stripe_customer_id = ?").bind(customerId).first();
                 if (userToWarn){
                    // Optional: Update status to 'past_due' or similar, but rely on `customer.subscription.updated` primarily
                    console.warn(`Payment failed for user ${userToWarn.id}, subscription ${subscriptionId}. Tier may be downgraded soon.`);
                    // You might send an email here.
                 }
             }
            break;

        default:
            console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}