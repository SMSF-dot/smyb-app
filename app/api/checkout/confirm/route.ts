import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type CheckoutConfirmationBody = {
  basketId: string;
  sessionId: string;
};

function isCheckoutConfirmationBody(value: unknown): value is CheckoutConfirmationBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;
  return typeof body.basketId === "string" && typeof body.sessionId === "string";
}

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return Response.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return Response.json({ error: "Supabase server credentials are not configured" }, { status: 500 });
  }

  const body: unknown = await req.json();
  if (!isCheckoutConfirmationBody(body)) {
    return Response.json({ error: "Invalid checkout confirmation request" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const session = await stripe.checkout.sessions.retrieve(body.sessionId);
  if (session.payment_status !== "paid") {
    return Response.json({ error: "Checkout session has not been paid" }, { status: 402 });
  }

  if (session.metadata?.basketId !== body.basketId) {
    return Response.json({ error: "Checkout session does not match this basket" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("baskets")
    .update({
      status: "FUNDED",
      funded_by: session.metadata?.payerName || "Guest",
    })
    .eq("id", body.basketId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to update funded basket:", error);
    return Response.json({ error: "Could not update basket after payment" }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Basket not found" }, { status: 404 });
  }

  return Response.json({ basketId: data.id, status: "FUNDED" });
}
