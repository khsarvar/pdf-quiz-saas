# Next.js SaaS Starter

This is a starter template for building a SaaS application using **Next.js** with support for authentication, Stripe integration for payments, and a dashboard for logged-in users.

**Demo: [https://next-saas-start.vercel.app/](https://next-saas-start.vercel.app/)**

## Features

- Marketing landing page (`/`) with animated Terminal element
- Pricing page (`/pricing`) which connects to Stripe Checkout
- Dashboard pages for account and documents
- Basic RBAC with Owner and Member roles
- Subscription management with Stripe Customer Portal
- Email/password authentication with JWTs stored to cookies
- Global middleware to protect logged-in routes
- Local middleware to protect Server Actions or validate Zod schemas
- Activity logging system for any user events

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/)
- **Database**: [Postgres](https://www.postgresql.org/)
- **ORM**: [Drizzle](https://orm.drizzle.team/)
- **Payments**: [Stripe](https://stripe.com/)
- **UI Library**: [shadcn/ui](https://ui.shadcn.com/)

## Getting Started

```bash
git clone https://github.com/nextjs/saas-starter
cd saas-starter
pnpm install
```

## Running Locally

[Install](https://docs.stripe.com/stripe-cli) and log in to your Stripe account:

```bash
stripe login
```

Use the included setup script to create your `.env` file:

```bash
pnpm db:setup
```

After running the setup script, you'll need to manually add your OpenAI API key and R2 configuration to the `.env` file:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

You can get an API key from [OpenAI's platform](https://platform.openai.com/api-keys). Optionally, you can also set:

```bash
OPENAI_MODEL=gpt-4o-mini  # or gpt-4o, gpt-4-turbo, etc.
```

### Configure Cloudflare R2 Storage

This application uses Cloudflare R2 for direct-to-storage file uploads. You'll need to set up an R2 bucket and add the following environment variables:

```bash
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://your-bucket.r2.dev  # Optional: if using a custom domain
```

To get your R2 credentials:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2 → Manage R2 API Tokens
2. Create an API token with Object Read & Write permissions
3. Your Account ID can be found in the R2 dashboard URL or in your Cloudflare account settings
4. Create an R2 bucket in the dashboard

Run the database migrations and seed the database with a default user:

```bash
pnpm db:migrate
pnpm db:seed
```

This will create the following user:

- User: `test@test.com`
- Password: `admin123`

You can also create new users through the `/sign-up` route.

Finally, run the Next.js development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the app in action.

You can listen for Stripe webhooks locally through their CLI to handle subscription change events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Testing Payments

To test Stripe payments, use the following test card details:

- Card Number: `4242 4242 4242 4242`
- Expiration: Any future date
- CVC: Any 3-digit number

## Going to Production

When you're ready to deploy your SaaS application to production, follow these steps:

### Set up a production Stripe webhook

1. Go to the Stripe Dashboard and create a new webhook for your production environment.
2. Set the endpoint URL to your production API route (e.g., `https://yourdomain.com/api/stripe/webhook`).
3. Select the events you want to listen for (e.g., `checkout.session.completed`, `customer.subscription.updated`).

### Deploy to Vercel

1. Push your code to a GitHub repository.
2. Connect your repository to [Vercel](https://vercel.com/) and deploy it.
3. Follow the Vercel deployment process, which will guide you through setting up your project.

### Add environment variables

In your Vercel project settings (or during deployment), add all the necessary environment variables. Make sure to update the values for the production environment, including:

1. `BASE_URL`: Set this to your production domain.
2. `STRIPE_SECRET_KEY`: Use your Stripe secret key for the production environment.
3. `STRIPE_WEBHOOK_SECRET`: Use the webhook secret from the production webhook you created in step 1.
4. `POSTGRES_URL`: Set this to your production database URL.
5. `AUTH_SECRET`: Set this to a random string. `openssl rand -base64 32` will generate one.
6. `OPENAI_API_KEY`: Your OpenAI API key for quiz question generation. Get one at https://platform.openai.com/api-keys
7. `OPENAI_MODEL` (optional): The OpenAI model to use (defaults to `gpt-4o-mini`). Options include `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, etc.
8. `R2_ACCOUNT_ID`: Your Cloudflare Account ID
9. `R2_ACCESS_KEY_ID`: Your R2 Access Key ID
10. `R2_SECRET_ACCESS_KEY`: Your R2 Secret Access Key
11. `R2_BUCKET_NAME`: Your R2 bucket name
12. `R2_PUBLIC_URL` (optional): Public URL for your R2 bucket if using a custom domain

## Other Templates

While this template is intentionally minimal and to be used as a learning resource, there are other paid versions in the community which are more full-featured:

- https://achromatic.dev
- https://shipfa.st
- https://makerkit.dev
- https://zerotoshipped.com
- https://turbostarter.dev
