import { checkoutAction } from '@/lib/payments/actions';
import { Check } from 'lucide-react';
import { getStripePrices, getStripeProducts } from '@/lib/payments/stripe';
import { SubmitButton } from './submit-button';
import { PLANS } from '@/lib/subscriptions/plans';

// Prices are fresh for one hour max
export const revalidate = 3600;

export default async function PricingPage() {
  const [prices, products] = await Promise.all([
    getStripePrices(),
    getStripeProducts(),
  ]);

  const freePlan = { name: 'Free', price: 0, features: PLANS.free };
  const plusPlan = products.find((product) => product.name.toLowerCase().includes('plus'));
  const proPlan = products.find((product) => product.name.toLowerCase().includes('pro'));

  const plusPrice = prices.find((price) => price.productId === plusPlan?.id);
  const proPrice = prices.find((price) => price.productId === proPlan?.id);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        <PricingCard
          name="Free"
          price={0}
          interval="month"
          features={[
            '2 document uploads (lifetime)',
            '2 quiz generations (lifetime)',
            '10 questions per quiz',
            'Basic support',
          ]}
          priceId={undefined}
          highlight={false}
        />
        <PricingCard
          name={plusPlan?.name || 'Plus'}
          price={plusPrice?.unitAmount || PLANS.plus.price}
          interval={plusPrice?.interval || 'month'}
          features={[
            '30 document uploads per period',
            '30 quiz generations per period',
            '20 questions per quiz',
            'Regenerate quizzes',
            'Email support',
          ]}
          priceId={plusPrice?.id}
          highlight={true}
        />
        <PricingCard
          name={proPlan?.name || 'Pro'}
          price={proPrice?.unitAmount || PLANS.pro.price}
          interval={proPrice?.interval || 'month'}
          features={[
            '200 document uploads per period',
            '200 quiz generations per period',
            '20 questions per quiz',
            'Regenerate quizzes',
            'Priority support',
          ]}
          priceId={proPrice?.id}
          highlight={false}
        />
      </div>
    </main>
  );
}

function PricingCard({
  name,
  price,
  interval,
  features,
  priceId,
  highlight,
}: {
  name: string;
  price: number;
  interval: string;
  features: string[];
  priceId?: string;
  highlight?: boolean;
}) {
  const isFree = price === 0;
  
  return (
    <div className={`pt-6 ${highlight ? 'border-2 border-orange-500 rounded-lg p-4' : ''}`}>
      <h2 className="text-2xl font-medium text-gray-900 mb-2">{name}</h2>
      <p className="text-4xl font-medium text-gray-900 mb-6">
        {isFree ? (
          'Free'
        ) : (
          <>
            ${price / 100}{' '}
            <span className="text-xl font-normal text-gray-600">
              / {interval}
            </span>
          </>
        )}
      </p>
      <ul className="space-y-4 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <Check className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>
      {!isFree && priceId && (
        <form action={checkoutAction}>
          <input type="hidden" name="priceId" value={priceId} />
          <SubmitButton />
        </form>
      )}
      {isFree && (
        <div className="text-center text-gray-500 text-sm">
          Current plan
        </div>
      )}
    </div>
  );
}
