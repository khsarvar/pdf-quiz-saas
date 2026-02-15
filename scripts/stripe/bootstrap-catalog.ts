import { stripe } from '../../lib/payments/stripe';
import { PLANS } from '../../lib/subscriptions/plans';

async function ensureMonthlyPrice({
  productName,
  description,
  unitAmount,
}: {
  productName: string;
  description: string;
  unitAmount: number;
}) {
  const products = await stripe.products.list({
    active: true,
    limit: 100,
  });

  let product = products.data.find(
    (item) => item.name.toLowerCase() === productName.toLowerCase()
  );

  if (!product) {
    product = await stripe.products.create({
      name: productName,
      description,
    });
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    type: 'recurring',
    limit: 100,
  });

  const existingPrice = prices.data.find(
    (price) =>
      price.currency === 'usd' &&
      price.unit_amount === unitAmount &&
      price.recurring?.interval === 'month'
  );

  if (existingPrice) {
    return existingPrice.id;
  }

  const newPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: unitAmount,
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  return newPrice.id;
}

async function bootstrapCatalog() {
  console.log('Ensuring Stripe products and monthly prices exist...');

  const plusPriceId = await ensureMonthlyPrice({
    productName: 'Plus',
    description: 'Plus subscription plan',
    unitAmount: PLANS.plus.price,
  });

  const proPriceId = await ensureMonthlyPrice({
    productName: 'Pro',
    description: 'Pro subscription plan',
    unitAmount: PLANS.pro.price,
  });

  console.log('Stripe catalog is ready.');
  console.log(`Plus monthly price: ${plusPriceId}`);
  console.log(`Pro monthly price: ${proPriceId}`);
}

bootstrapCatalog()
  .catch((error) => {
    console.error('Failed to bootstrap Stripe catalog:', error);
    process.exitCode = 1;
  });
