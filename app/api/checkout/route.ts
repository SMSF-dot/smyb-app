import Stripe from "stripe";

type CheckoutRequestBody = {
  basketId: string;
  title: string;
  totalAmount: number | string;
  payerName?: string | null;
  payerEmail?: string | null;
};

function isCheckoutRequestBody(value: unknown): value is CheckoutRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.basketId === "string" &&
    typeof body.title === "string" &&
    (typeof body.totalAmount === "number" || typeof body.totalAmount === "string") &&
    (body.payerName === undefined || body.payerName === null || typeof body.payerName === "string") &&
    (body.payerEmail === undefined || body.payerEmail === null || typeof body.payerEmail === "string")
  );
}

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return Response.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const body: unknown = await req.json();
  if (!isCheckoutRequestBody(body)) {
    return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const { basketId, title, totalAmount, payerName, payerEmail } = body;
  const unitAmount = Math.round(Number(totalAmount) * 100);
  if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
    return Response.json({ error: "Invalid checkout amount" }, { status: 400 });
  }
  const normalizedPayerName = payerName?.trim() || "Guest";

  const origin = req.headers.get("origin");
  if (!origin) {
    return Response.json({ error: "Missing origin header" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: { name: title },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    customer_email: payerEmail || undefined,
    metadata: { basketId, payerName: normalizedPayerName },
    success_url: `${origin}/?basket=${basketId}&funded=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?basket=${basketId}`,
  });

  return Response.json({ url: session.url });
}
