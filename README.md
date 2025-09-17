# SnapView - Real-time AI Analysis with Stripe Payments

SnapView is a web application that provides real-time dual-analysis of camera feeds using ChatGPT, now with integrated Stripe payment system for premium features.

## Features

### Core Features
- Real-time camera feed analysis
- Dual-prompt AI analysis system
- Multiple preset analysis modes (Repair, Identify, Nice, Poetic, etc.)
- Export analysis history to CSV
- Mobile and desktop camera support

### Payment Features ⭐ NEW
- Email-based user authentication
- Usage tracking (10 free analyses per day)
- Stripe integration for premium upgrades
- Unlimited analyses for premium users
- Persistent user data across sessions

## Setup Instructions

### 1. Frontend Setup
The frontend files are ready to use. You only need to:

1. Update the Stripe configuration in `script.js`:
   ```javascript
   const STRIPE_PUBLISHABLE_KEY = 'pk_test_your_stripe_publishable_key';
   const STRIPE_PRICE_ID = 'price_your_stripe_price_id';
   ```

2. Update your worker URL if different:
   ```javascript
   const WORKER_URL = 'your-worker.your-subdomain.workers.dev';
   ```

### 2. Stripe Dashboard Setup

1. **Create a Stripe Account**: Sign up at [stripe.com](https://stripe.com)

2. **Create a Product**:
   - Go to Products in your Stripe dashboard
   - Create a new product (e.g., "SnapView Unlimited Access")
   - Add a one-time payment price (e.g., $9.99)
   - Copy the price ID (starts with `price_`)

3. **Get API Keys**:
   - Go to Developers > API keys
   - Copy your Publishable key (starts with `pk_`)
   - Copy your Secret key (starts with `sk_`)

4. **Set up Webhooks**:
   - Go to Developers > Webhooks
   - Add endpoint: `https://your-worker.workers.dev/stripe-webhook`
   - Select events: `checkout.session.completed`
   - Copy the webhook signing secret

### 3. Backend Setup (Cloudflare Worker)

1. **Install Stripe Package**:
   ```bash
   npm install stripe
   ```

2. **Set Environment Variables**:
   In your Cloudflare Worker dashboard, add:
   - `STRIPE_SECRET_KEY`: Your Stripe secret key
   - `STRIPE_WEBHOOK_SECRET`: Your webhook signing secret

3. **Add KV Namespace**:
   - Create a KV namespace called "USER_DATA"
   - Bind it to your worker

4. **Update Worker Code**:
   Use the example in `backend-stripe-example.js` as a reference to extend your existing worker with payment functionality.

### 4. Testing

1. **Test Mode**: Use Stripe test keys for development
2. **Test Cards**: Use [Stripe test cards](https://stripe.com/docs/testing#cards)
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`

## User Flow

### For Free Users
1. Enter email to start using the app
2. Get 10 free analyses per day
3. Usage bar shows remaining analyses
4. Upgrade option available

### For Premium Users
1. Click "⭐ Upgrade" button
2. Redirected to Stripe Checkout
3. Complete payment
4. Automatically upgraded to unlimited access
5. No daily limits

## Security Features

- No passwords required (email-based authentication)
- Secure Stripe payment processing
- Usage data stored locally and in worker KV
- Daily usage resets automatically
- Payment status verified via webhooks

## File Structure

```
snapview/
├── index.html              # Main application HTML
├── script.js               # Frontend JavaScript with payment logic
├── style.css               # Styles including payment UI
├── backend-stripe-example.js # Example backend implementation
└── README.md               # This file
```

## Customization

### Pricing Tiers
You can easily modify the free tier limit by changing:
```javascript
const FREE_USAGE_LIMIT = 10; // Change to your desired limit
```

### Subscription Model
To switch from one-time payments to subscriptions:
1. Change Stripe session mode to `'subscription'`
2. Update the frontend messaging
3. Handle subscription webhooks

### Additional Features
The payment system can be extended to support:
- Multiple pricing tiers
- Feature-based limitations
- Team accounts
- Usage-based billing

## Support

For Stripe-related issues, refer to:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)

## License

This project is open source and available under the MIT License.