import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { User } from '@/lib/db/schema';
import { PLANS } from '@/lib/subscriptions/plans';
import {
  getUserByStripeCustomerId,
  getUser,
  updateUserSubscription
} from '@/lib/db/queries';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil'
});

type StripeErrorLike = {
  code?: string;
  message?: string;
  param?: string;
};

function toStripeError(error: unknown): StripeErrorLike {
  if (typeof error !== 'object' || error === null) {
    return {};
  }

  const maybeError = error as StripeErrorLike;
  return {
    code: maybeError.code,
    message: maybeError.message,
    param: maybeError.param,
  };
}

function isMissingStripeCustomerError(error: unknown) {
  const stripeError = toStripeError(error);
  const message = stripeError.message?.toLowerCase() || '';
  return (
    (stripeError.code === 'resource_missing' && stripeError.param === 'customer') ||
    message.includes('no such customer')
  );
}

function isMissingStripeProductError(error: unknown) {
  const stripeError = toStripeError(error);
  const message = stripeError.message?.toLowerCase() || '';
  return (
    (stripeError.code === 'resource_missing' && stripeError.param === 'product') ||
    message.includes('no such product')
  );
}

async function clearUserStripeLinks(userId: number) {
  await updateUserSubscription(userId, {
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeProductId: null,
    planName: 'free',
    subscriptionStatus: null,
    subscriptionPeriodStart: null,
    subscriptionPeriodEnd: null,
  });
}

export async function createCheckoutSession({
  user,
  priceId
}: {
  user: User | null;
  priceId: string;
}) {
  const currentUser = user || await getUser();

  if (!currentUser) {
    redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
  }

  const sessionPayload: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/pricing`,
    customer: currentUser.stripeCustomerId || undefined,
    client_reference_id: currentUser.id.toString(),
    allow_promotion_codes: true
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(sessionPayload);
  } catch (error) {
    if (currentUser.stripeCustomerId && isMissingStripeCustomerError(error)) {
      console.warn(
        `Stripe customer ${currentUser.stripeCustomerId} not found. Clearing stale linkage and retrying checkout for user ${currentUser.id}.`
      );
      await clearUserStripeLinks(currentUser.id);
      session = await stripe.checkout.sessions.create({
        ...sessionPayload,
        customer: undefined,
      });
    } else {
      throw error;
    }
  }

  redirect(session.url!);
}

export async function createCustomerPortalSession(user: User) {
  if (!user.stripeCustomerId || !user.stripeProductId) {
    redirect('/pricing');
  }

  try {
    let configuration: Stripe.BillingPortal.Configuration;
    const configurations = await stripe.billingPortal.configurations.list();

    if (configurations.data.length > 0) {
      configuration = configurations.data[0];
    } else {
      const product = await stripe.products.retrieve(user.stripeProductId);
      if (!product.active) {
        throw new Error("User's product is not active in Stripe");
      }

      const prices = await stripe.prices.list({
        product: product.id,
        active: true
      });
      if (prices.data.length === 0) {
        throw new Error("No active prices found for the user's product");
      }

      configuration = await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: 'Manage your subscription'
        },
        features: {
          subscription_update: {
            enabled: true,
            default_allowed_updates: ['price', 'quantity', 'promotion_code'],
            proration_behavior: 'create_prorations',
            products: [
              {
                product: product.id,
                prices: prices.data.map((price) => price.id)
              }
            ]
          },
          subscription_cancel: {
            enabled: true,
            mode: 'at_period_end',
            cancellation_reason: {
              enabled: true,
              options: [
                'too_expensive',
                'missing_features',
                'switched_service',
                'unused',
                'other'
              ]
            }
          },
          payment_method_update: {
            enabled: true
          }
        }
      });
    }

    return stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.BASE_URL}/dashboard`,
      configuration: configuration.id
    });
  } catch (error) {
    if (isMissingStripeCustomerError(error) || isMissingStripeProductError(error)) {
      console.warn(
        `Stripe linkage for user ${user.id} points to missing resources. Clearing stale data and redirecting to pricing.`
      );
      await clearUserStripeLinks(user.id);
      redirect('/pricing');
    }

    throw error;
  }
}

export async function handleSubscriptionChange(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    console.error('User not found for Stripe customer:', customerId);
    return;
  }

  if (status === 'active' || status === 'trialing') {
    const item = subscription.items.data[0];
    const price = item?.price;
    const product = price?.product as Stripe.Product | string | undefined;
    const productId = typeof product === 'string' ? product : product?.id;
    const productName = typeof product === 'string' ? null : product?.name;
    const priceNickname = price?.nickname;
    const unitAmount = price?.unit_amount;
    
    // Determine plan name, but avoid accidentally downgrading when Stripe doesn't expand product info.
    let planName = (user.planName || 'free').toLowerCase();
    const label = (productName || priceNickname || '').trim().toLowerCase();
    if (label === 'plus' || unitAmount === PLANS.plus.price) planName = 'plus';
    if (label === 'pro' || unitAmount === PLANS.pro.price) planName = 'pro';

    // Calculate period dates
    const periodStart =
      item && Number.isFinite(item.current_period_start)
        ? new Date(item.current_period_start * 1000)
        : null;
    const periodEnd =
      item && Number.isFinite(item.current_period_end)
        ? new Date(item.current_period_end * 1000)
        : null;

    await updateUserSubscription(user.id, {
      stripeSubscriptionId: subscriptionId,
      stripeProductId: productId || user.stripeProductId || null,
      planName: planName,
      subscriptionStatus: status,
      subscriptionPeriodStart: periodStart,
      subscriptionPeriodEnd: periodEnd,
    });
  } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
    await updateUserSubscription(user.id, {
      stripeSubscriptionId: null,
      stripeProductId: null,
      planName: 'free',
      subscriptionStatus: status,
      subscriptionPeriodStart: null,
      subscriptionPeriodEnd: null,
    });
  }
}

export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    type: 'recurring'
  });

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id
  }));
}
