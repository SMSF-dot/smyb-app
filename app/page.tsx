"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../utils/supabase";
import type { User } from "@supabase/supabase-js";

interface BasketItem {
  id: string;
  basket_id: string;
  title: string;
  retailer: string;
  product_url: string;
  price: number;
  quantity: number;
  is_funded: boolean;
}

interface Basket {
  id: string;
  owner_id: string;
  owner_handle: string;
  title: string;
  status: "open" | "partially_funded" | "funded" | "FUNDED" | "fulfilled";
  split_mode: "full" | "down_payment" | "multi_party";
  owner_contribution: number;
  total_amount: number;
  payer_handle: string | null;
  funded_by?: string | null;
  boundary_mode: "everyone" | "link_only" | "approved_only";
  created_at: string;
  basket_items?: BasketItem[];
}

interface PrivateVault {
  user_id?: string;
  recipient_name: string;
  delivery_type: "home_address" | "collection_point" | "work_address";
  address_line_1: string;
  city: string;
  postcode: string;
  delivery_notes: string;
}

const isBasketFunded = (basket: Pick<Basket, "status">) =>
  basket.status === "funded" || basket.status === "FUNDED";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth states
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  // Dashboard states
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [activeTab, setActiveTab] = useState<"my_baskets" | "create" | "vault" | "shared_view">("my_baskets");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Delivery Vault states
  const [vault, setVault] = useState<PrivateVault>({
    recipient_name: "",
    delivery_type: "collection_point",
    address_line_1: "",
    city: "",
    postcode: "",
    delivery_notes: "",
  });
  const [vaultSaved, setVaultSaved] = useState(false);
  const [savingVault, setSavingVault] = useState(false);
  const [vaultStatusMsg, setVaultStatusMsg] = useState<string | null>(null);

  // Create basket form states
  const [basketTitle, setBasketTitle] = useState("");
  const [splitMode, setSplitMode] = useState<"full" | "down_payment" | "multi_party">("full");
  const [ownerContribution, setOwnerContribution] = useState("0");
  const [boundaryMode, setBoundaryMode] = useState<"everyone" | "link_only" | "approved_only">("link_only");
  const [itemTitle, setItemTitle] = useState("");
  const [itemRetailer, setItemRetailer] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [draftItems, setDraftItems] = useState<
    { title: string; retailer: string; product_url: string; price: number; quantity: number }[]
  >([]);
  const [creatingBasket, setCreatingBasket] = useState(false);

  // Shared basket preview state
  const [sharedBasket, setSharedBasket] = useState<Basket | null>(null);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [fundingPrompt, setFundingPrompt] = useState<"choices" | "auth" | "guest" | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestFundingError, setGuestFundingError] = useState<string | null>(null);
  const [guestReceiptNotice, setGuestReceiptNotice] = useState<string | null>(null);

  const fetchSingleBasket = useCallback(async (basketId: string) => {
    const { data, error } = await supabase
      .from("baskets")
      .select("*, basket_items(*)")
      .eq("id", basketId)
      .single();

    if (error) throw error;
    if (!data) throw new Error("Basket not found.");
    setSharedBasket(data as Basket);
  }, []);

  const fetchUserBaskets = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("baskets")
      .select("*, basket_items(*)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user baskets:", error);
      return;
    }
    if (data) setBaskets(data as Basket[]);
  }, [user]);

  const fetchUserVault = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("private_vault")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching user vault:", error);
      return;
    }
    if (data) {
      setVault({
        recipient_name: data.recipient_name || "",
        delivery_type: data.delivery_type || "collection_point",
        address_line_1: data.address_line_1 || "",
        city: data.city || "",
        postcode: data.postcode || "",
        delivery_notes: data.delivery_notes || "",
      });
      setVaultSaved(true);
    }
  }, [user]);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setPasswordUpdated(false);
        setPassword("");
        setAuthError(null);
        setAuthNotice(null);
      }
    });

    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("basket");
    if (sharedId) {
      void fetchSingleBasket(sharedId).catch((error) => {
        console.error("Error fetching shared basket:", error);
      });
      setActiveTab("shared_view");
    }

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [fetchSingleBasket]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const funded = params.get("funded");
    const sessionId = params.get("session_id");
    const basketId = params.get("basket");
    if (funded !== "success" || !sessionId || !basketId) return;

    const confirmCheckout = async () => {
      try {
        const response = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ basketId, sessionId }),
        });
        const result: { error?: string } = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not confirm checkout payment.");
        }

        await fetchSingleBasket(basketId);
        await fetchUserBaskets();
      } catch (error) {
        console.error("Checkout confirmation error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Could not confirm checkout payment.";
        alert(`Could not confirm checkout payment: ${errorMessage}`);
      }
    };

    void confirmCheckout();
  }, [fetchSingleBasket, fetchUserBaskets]);

  useEffect(() => {
    if (user) {
      fetchUserBaskets();
      fetchUserVault();
    } else {
      setBaskets([]);
      setVaultSaved(false);
    }
  }, [user, fetchUserBaskets, fetchUserVault]);

  const userHandle =
    user?.user_metadata?.handle ||
    (user?.email ? user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") : "member");

  const handleSaveVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingVault(true);
    setVaultStatusMsg(null);

    try {
      const { error } = await supabase.from("private_vault").upsert({
        user_id: user.id,
        recipient_name: vault.recipient_name.trim(),
        delivery_type: vault.delivery_type,
        address_line_1: vault.address_line_1.trim(),
        city: vault.city.trim(),
        postcode: vault.postcode.trim().toUpperCase(),
        delivery_notes: vault.delivery_notes.trim(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      setVaultSaved(true);
      setVaultStatusMsg("✓ Delivery Vault sealed & encrypted. Zero visibility to payers.");
    } catch (err) {
      console.error("Vault error:", err);
      setVaultStatusMsg("Could not save vault. Ensure private_vault SQL was run in Supabase.");
    } finally {
      setSavingVault(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setAuthLoading(true);

    try {
      if (isSignUp) {
        const cleanHandle = handleInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!cleanHandle) {
          throw new Error("Please choose a valid username handle (letters, numbers, underscores).");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { handle: cleanHandle },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      setFundingPrompt(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setAuthError(null);
    setAuthNotice(null);
    setAuthLoading(true);

    try {
      if (!email.trim()) {
        throw new Error("Enter your email address to receive a password reset link.");
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setAuthNotice({
        type: "success",
        message: `If an account exists for ${email}, we've sent a password reset link.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to send a password reset link.";
      setAuthNotice({ type: "error", message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPasswordUpdated(true);
      setPassword("");
      setAuthNotice({ type: "success", message: "Your password has been updated." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to update your password.";
      setAuthNotice({ type: "error", message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleAddDraftItem = () => {
    if (!itemTitle.trim() || !itemPrice) return;
    const parsedPrice = parseFloat(itemPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return;

    setDraftItems([
      ...draftItems,
      {
        title: itemTitle.trim(),
        retailer: itemRetailer.trim() || "Online Store",
        product_url: itemUrl.trim() || "https://example.com",
        price: parsedPrice,
        quantity: 1,
      },
    ]);

    setItemTitle("");
    setItemRetailer("");
    setItemUrl("");
    setItemPrice("");
  };

  const handleCreateBasket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !basketTitle.trim() || draftItems.length === 0) return;

    setCreatingBasket(true);
    const totalAmount = draftItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const parsedContribution = splitMode === "down_payment" ? parseFloat(ownerContribution) || 0 : 0;

    try {
      const { data: newBasket, error: basketError } = await supabase
        .from("baskets")
        .insert({
          owner_id: user.id,
          owner_handle: userHandle,
          title: basketTitle.trim(),
          status: parsedContribution > 0 ? "partially_funded" : "open",
          split_mode: splitMode,
          owner_contribution: parsedContribution,
          total_amount: totalAmount,
          boundary_mode: boundaryMode,
        })
        .select()
        .single();

      if (basketError || !newBasket) throw basketError;

      const itemsPayload = draftItems.map((item) => ({
        basket_id: newBasket.id,
        title: item.title,
        retailer: item.retailer,
        product_url: item.product_url,
        price: item.price,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase.from("basket_items").insert(itemsPayload);
      if (itemsError) throw itemsError;

      setBasketTitle("");
      setDraftItems([]);
      setOwnerContribution("0");
      setSplitMode("full");
      await fetchUserBaskets();
      setActiveTab("my_baskets");
    } catch (err) {
      console.error("Error creating basket:", err);
      alert("Could not save basket. Check your Supabase connection.");
    } finally {
      setCreatingBasket(false);
    }
  };

  const handleCopyShareLink = (basketId: string) => {
    const shareUrl = `${window.location.origin}/?basket=${basketId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(basketId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleFundBasket = async (basket: Basket) => {
    if (!user) {
      setFundingPrompt("choices");
      return;
    }
    setFundingLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basketId: basket.id,
          title: basket.title,
          totalAmount: basket.total_amount,
          payerName: userHandle,
          payerEmail: user.email || undefined,
        }),
      });
      const data: { url?: string | null; error?: string } = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (error) {
      console.error("Funding error:", error);
      const errorMessage =
        error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "Could not complete funding.";
      alert(`Could not complete funding: ${errorMessage}`);
    } finally {
      setFundingLoading(false);
    }
  };

  const handleGuestFunding = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuestFundingError(null);
    setGuestReceiptNotice(null);
    setFundingLoading(true);

    try {
      if (!sharedBasket) {
        throw new Error("The shared basket is no longer available.");
      }

      const cleanName = guestName.trim();
      const cleanEmail = guestEmail.trim();
      if (!cleanName || !cleanEmail) {
        throw new Error("Enter your name and email address to continue.");
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basketId: sharedBasket.id,
          title: sharedBasket.title,
          totalAmount: sharedBasket.total_amount,
          payerName: cleanName,
          payerEmail: cleanEmail,
        }),
      });
      const data: { url?: string | null; error?: string } = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (error) {
      console.error("Guest funding error:", error);
      const errorMessage =
        error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "Could not complete guest funding.";
      alert(`Could not complete funding: ${errorMessage}`);
      setGuestFundingError(errorMessage);
    } finally {
      setFundingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center text-[#23272A]">
        <p className="font-medium tracking-wide">Loading SMYB...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#23272A] font-sans">
      {/* Top Navigation */}
      <header className="bg-[#23272A] text-[#F7F5F0] px-6 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SMYB" className="h-10 w-auto rounded-lg bg-[#F7F5F0] px-2.5 py-1 object-contain" />
            <span className="hidden sm:inline-block text-xs text-stone-400 border-l border-stone-600 pl-3">
              Send Me Your Basket
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="bg-[#F2994A]/20 text-[#F2994A] border border-[#F2994A]/40 px-3 py-1 rounded-full text-sm font-semibold">
                🛒{userHandle}
              </span>
              <button
                onClick={handleSignOut}
                className="text-xs text-stone-300 hover:text-white underline cursor-pointer"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-xs text-[#F2994A] font-medium">Privacy-First Basket Checkout</span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Shared Basket View */}
        {!isPasswordRecovery && activeTab === "shared_view" && sharedBasket && (
          <div className="mb-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-[#F2994A]">
                  Zero-Exposure Payer View
                </span>
                <h2 className="text-xl font-bold mt-1">{sharedBasket.title}</h2>
                <p className="text-sm text-stone-500">
                  Requested by <strong className="text-[#23272A]">🛒{sharedBasket.owner_handle}</strong>
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                  isBasketFunded(sharedBasket)
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {sharedBasket.status.replace("_", " ")}
              </span>
            </div>

            {/* Privacy Shield Banner */}
            <div className="bg-[#23272A] text-[#F7F5F0] rounded-xl p-4 mb-5 text-sm flex items-start gap-3">
              <span className="text-lg">🛡️</span>
              <div>
                <p className="font-semibold text-[#F2994A]">Two-Way Privacy Shield Active</p>
                <p className="text-stone-300 text-xs mt-0.5">
                  Recipient delivery vault is sealed at the database level. Payer card and store account details remain
                  completely private.
                </p>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3 mb-5">
              {sharedBasket.basket_items?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-[#F7F5F0] rounded-xl border border-stone-200"
                >
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-xs text-stone-500">{item.retailer}</p>
                  </div>
                  <p className="font-bold text-sm">£{Number(item.price).toFixed(2)}</p>
                </div>
              ))}
            </div>

            {/* Breakdown & Action */}
            <div className="border-t border-stone-100 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-sm space-y-1">
                <p className="text-stone-500">
                  Total Basket Value:{" "}
                  <span className="font-semibold text-[#23272A]">
                    £{Number(sharedBasket.total_amount).toFixed(2)}
                  </span>
                </p>
                {Number(sharedBasket.owner_contribution) > 0 && (
                  <p className="text-stone-500">
                    Recipient Down Payment:{" "}
                    <span className="font-semibold text-emerald-700">
                      -£{Number(sharedBasket.owner_contribution).toFixed(2)}
                    </span>
                  </p>
                )}
                <p className="text-base font-bold">
                  Remaining to Fund: £
                  {isBasketFunded(sharedBasket)
                    ? "0.00"
                    : (Number(sharedBasket.total_amount) - Number(sharedBasket.owner_contribution)).toFixed(2)}
                </p>
              </div>

              {!isBasketFunded(sharedBasket) ? (
                <button
                  onClick={() => handleFundBasket(sharedBasket)}
                  disabled={fundingLoading}
                  className="bg-[#F2994A] hover:bg-[#e08636] text-[#23272A] font-bold px-6 py-3 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  {fundingLoading ? "Processing Shielded Payment..." : "Fund Basket Privately"}
                </button>
              ) : (
                <div className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
                  ✓ Funded by {sharedBasket.funded_by || sharedBasket.payer_handle || "supporter"}
                </div>
              )}
            </div>

            {guestReceiptNotice && (
              <div role="status" className="mt-4 rounded-xl border border-[#F2994A]/50 bg-[#F2994A]/10 p-3 text-sm">
                {guestReceiptNotice}
              </div>
            )}

            {!user && fundingPrompt === "choices" && !isBasketFunded(sharedBasket) && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Choose how to fund this basket">
                <button
                  type="button"
                  onClick={() => {
                    setFundingPrompt("auth");
                    setAuthError(null);
                    setAuthNotice(null);
                  }}
                  className="rounded-xl border border-stone-300 bg-[#F7F5F0] p-4 text-left transition hover:border-[#F2994A] hover:bg-[#F2994A]/10 cursor-pointer"
                >
                  <span className="block font-bold text-[#23272A]">Sign In or Claim a Handle</span>
                  <span className="mt-1 block text-sm text-stone-600">
                    Save receipts, track funded baskets, and keep a verified record of every split.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFundingPrompt("guest");
                    setGuestFundingError(null);
                  }}
                  className="rounded-xl border border-stone-300 bg-[#F7F5F0] p-4 text-left transition hover:border-[#F2994A] hover:bg-[#F2994A]/10 cursor-pointer"
                >
                  <span className="block font-bold text-[#23272A]">Continue as Guest</span>
                  <span className="mt-1 block text-sm text-stone-600">
                    Fund this basket straight away with just your name and email for your receipt. No account required.
                  </span>
                </button>
              </div>
            )}

            {!user && fundingPrompt === "guest" && !isBasketFunded(sharedBasket) && (
              <form
                onSubmit={handleGuestFunding}
                className="mt-5 rounded-xl border border-stone-200 bg-[#F7F5F0] p-5"
              >
                <h3 className="font-bold text-lg">Continue as Guest</h3>
                <p className="mt-1 mb-4 text-sm text-stone-600">
                  Enter your details to complete funding. Your email will appear in the on-screen receipt confirmation.
                </p>
                {guestFundingError && (
                  <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {guestFundingError}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="guest-name" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                      Name
                    </label>
                    <input
                      id="guest-name"
                      type="text"
                      autoComplete="name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      required
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:border-[#23272A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="guest-email" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                      Email Address
                    </label>
                    <input
                      id="guest-email"
                      type="email"
                      autoComplete="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      required
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:border-[#23272A] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={fundingLoading}
                    className="rounded-xl bg-[#F2994A] px-5 py-2.5 font-bold text-[#23272A] transition hover:bg-[#e08636] cursor-pointer disabled:opacity-50"
                  >
                    {fundingLoading ? "Processing..." : "Complete Guest Funding"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundingPrompt("choices")}
                    disabled={fundingLoading}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 underline cursor-pointer disabled:opacity-50"
                  >
                    Back to options
                  </button>
                </div>
              </form>
            )}

            {!user && fundingPrompt === "auth" && !isBasketFunded(sharedBasket) && (
              <div className="mt-5 rounded-xl border border-stone-200 bg-[#F7F5F0] p-5">
                <h3 className="mb-1 text-lg font-bold text-[#23272A]">
                  {isSignUp ? "Claim your SMYB handle" : "Sign in to SMYB"}
                </h3>
                <p className="mb-4 text-sm text-stone-600">
                  Your basket link will stay active while you sign in or create an account.
                </p>
                {authError && (
                  <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {authError}
                  </div>
                )}
                {authNotice && (
                  <div
                    role={authNotice.type === "error" ? "alert" : "status"}
                    className="mb-4 rounded-xl border border-[#F2994A] bg-[#23272A] p-3 text-xs text-[#F7F5F0]"
                  >
                    {authNotice.message}
                  </div>
                )}
                <form onSubmit={handleAuth} className="space-y-3">
                  {isSignUp && (
                    <div>
                      <label htmlFor="shared-handle" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                        Your Trolley Handle
                      </label>
                      <input
                        id="shared-handle"
                        type="text"
                        autoComplete="username"
                        value={handleInput}
                        onChange={(e) => setHandleInput(e.target.value)}
                        required
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:border-[#23272A] focus:outline-none"
                      />
                    </div>
                  )}
                  <div>
                    <label htmlFor="shared-auth-email" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                      Email Address
                    </label>
                    <input
                      id="shared-auth-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:border-[#23272A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="shared-auth-password" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                      Password
                    </label>
                    <input
                      id="shared-auth-password"
                      type="password"
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:border-[#23272A] focus:outline-none"
                    />
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={authLoading}
                        className="mt-2 text-xs text-stone-600 underline cursor-pointer disabled:opacity-50"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full rounded-xl bg-[#23272A] py-3 font-bold text-[#F7F5F0] transition hover:bg-stone-800 cursor-pointer disabled:opacity-50"
                  >
                    {authLoading ? "Please wait..." : isSignUp ? "Create Account & Claim Handle" : "Sign In"}
                  </button>
                </form>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setAuthError(null);
                      setAuthNotice(null);
                    }}
                    className="font-medium text-stone-600 underline cursor-pointer"
                  >
                    {isSignUp ? "Already have a handle? Sign in" : "New to SMYB? Claim your handle"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundingPrompt("choices")}
                    className="text-stone-600 underline cursor-pointer"
                  >
                    Back to funding options
                  </button>
                </div>
              </div>
            )}

            {user ? (
              <div className="mt-4 pt-3 border-t border-stone-100">
                <button
                  onClick={() => {
                    window.history.replaceState({}, "", "/");
                    setActiveTab("my_baskets");
                  }}
                  className="text-xs text-stone-500 hover:text-[#23272A] underline cursor-pointer"
                >
                  ← Back to my wallet dashboard
                </button>
              </div>
            ) : (
              <div className="mt-4 pt-3 border-t border-stone-100">
                <button
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("basket");
                    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
                    setActiveTab("my_baskets");
                  }}
                  className="text-xs text-stone-500 hover:text-[#23272A] underline cursor-pointer"
                >
                  Sign in or claim a handle
                </button>
              </div>
            )}
          </div>
        )}

        {/* Unauthenticated Sign Up / Log In Card */}
        {isPasswordRecovery ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
            <h1 className="text-2xl font-bold text-[#23272A] mb-1">Choose a new password</h1>
            <p className="text-sm text-stone-500 mb-6">Enter a new password for your SMYB account.</p>

            {authNotice && (
              <div
                role={authNotice.type === "error" ? "alert" : "status"}
                className="mb-4 p-3 rounded-xl bg-[#23272A] border border-[#F2994A] text-[#F7F5F0] text-xs"
              >
                {authNotice.message}
              </div>
            )}

            {passwordUpdated ? (
              <button
                type="button"
                onClick={() => setIsPasswordRecovery(false)}
                className="w-full bg-[#23272A] hover:bg-stone-800 text-[#F7F5F0] font-bold py-3 rounded-xl transition cursor-pointer"
              >
                Continue to your account
              </button>
            ) : (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-[#23272A]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-[#23272A] hover:bg-stone-800 text-[#F7F5F0] font-bold py-3 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? "Please wait..." : "Update Password"}
                </button>
              </form>
            )}
          </div>
        ) : !user && activeTab !== "shared_view" ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
            <h1 className="text-2xl font-bold text-[#23272A] mb-1">
              {isSignUp ? "Claim your SMYB handle" : "Welcome back to SMYB"}
            </h1>
            <p className="text-sm text-stone-500 mb-6">
              {isSignUp
                ? "Create a persistent basket identity without sharing your address or bank details."
                : "Sign in to manage your baskets, split requests, and privacy boundaries."}
            </p>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                {authError}
              </div>
            )}
            {authNotice && (
              <div
                role={authNotice.type === "error" ? "alert" : "status"}
                className="mb-4 p-3 rounded-xl bg-[#23272A] border border-[#F2994A] text-[#F7F5F0] text-xs"
              >
                {authNotice.message}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1">
                    Your Trolley Handle
                  </label>
                  <div className="flex items-center border border-stone-300 rounded-xl overflow-hidden bg-[#F7F5F0]">
                    <span className="px-3 py-2.5 bg-[#23272A] text-[#F2994A] font-bold text-sm">🛒</span>
                    <input
                      type="text"
                      placeholder="nyangu"
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-[#23272A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-[#23272A]"
                />
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={authLoading}
                    className="mt-2 text-xs text-stone-600 hover:text-[#23272A] underline cursor-pointer disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#23272A] hover:bg-stone-800 text-[#F7F5F0] font-bold py-3 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {authLoading ? "Please wait..." : isSignUp ? "Create Account & Claim Handle" : "Sign In"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className="text-sm text-stone-600 hover:text-[#23272A] font-medium underline cursor-pointer"
              >
                {isSignUp ? "Already have a handle? Sign in" : "New to SMYB? Claim your 🛒username"}
              </button>
            </div>
          </div>
        ) : (
          /* Authenticated Wallet & Basket Dashboard */
          activeTab !== "shared_view" && (
            <div>
              {/* Navigation Tabs */}
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={() => setActiveTab("my_baskets")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
                    activeTab === "my_baskets"
                      ? "bg-[#23272A] text-[#F7F5F0]"
                      : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  My Baskets ({baskets.length})
                </button>
                <button
                  onClick={() => setActiveTab("create")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
                    activeTab === "create"
                      ? "bg-[#F2994A] text-[#23272A]"
                      : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  + New Persistent Basket
                </button>
                <button
                  onClick={() => setActiveTab("vault")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "vault"
                      ? "bg-[#23272A] text-[#F2994A]"
                      : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  <span>🛡️ Delivery Vault</span>
                  {vaultSaved && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Vault Configured" />
                  )}
                </button>
              </div>

              {/* TAB 1: MY BASKETS LEDGER */}
              {activeTab === "my_baskets" && (
                <div className="space-y-4">
                  {!vaultSaved && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs text-amber-900">
                        <strong>Action Recommended:</strong> Set up your <strong>Delivery Vault</strong> so funded
                        baskets know where to ship without exposing your address to payers.
                      </div>
                      <button
                        onClick={() => setActiveTab("vault")}
                        className="bg-[#23272A] text-[#F7F5F0] text-xs font-bold px-3.5 py-2 rounded-lg whitespace-nowrap cursor-pointer"
                      >
                        Configure Vault →
                      </button>
                    </div>
                  )}

                  {baskets.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
                      <p className="text-3xl mb-2">🛒</p>
                      <h2 className="text-lg font-bold">No baskets yet</h2>
                      <p className="text-sm text-stone-500 max-w-md mx-auto mt-1 mb-5">
                        Create your first persistent basket by pasting item links from any online store. Your delivery
                        address stays sealed when you share it.
                      </p>
                      <button
                        onClick={() => setActiveTab("create")}
                        className="bg-[#F2994A] hover:bg-[#e08636] text-[#23272A] font-bold px-5 py-2.5 rounded-xl text-sm cursor-pointer"
                      >
                        Create Your First Basket
                      </button>
                    </div>
                  ) : (
                    baskets.map((basket) => {
                      const remaining = Number(basket.total_amount) - Number(basket.owner_contribution);
                      return (
                        <div
                          key={basket.id}
                          className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-lg">{basket.title}</h3>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                                    isBasketFunded(basket)
                                      ? "bg-emerald-100 text-emerald-800"
                                      : basket.status === "partially_funded"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-stone-100 text-stone-700"
                                  }`}
                                >
                                  {basket.status.replace("_", " ")}
                                </span>
                              </div>
                              <p className="text-xs text-stone-500 mt-0.5">
                                Privacy:{" "}
                                <strong className="text-[#23272A]">{basket.boundary_mode.replace("_", " ")}</strong> •
                                Mode: <strong className="text-[#23272A]">{basket.split_mode.replace("_", " ")}</strong>
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-xs text-stone-500">Total: £{Number(basket.total_amount).toFixed(2)}</p>
                              <p className="font-bold text-base text-[#23272A]">
                                {isBasketFunded(basket)
                                  ? `Funded by 🛒${basket.funded_by || basket.payer_handle}`
                                  : `Requesting: £${remaining.toFixed(2)}`}
                              </p>
                            </div>
                          </div>

                          {/* Item List */}
                          {basket.basket_items && basket.basket_items.length > 0 && (
                            <div className="bg-[#F7F5F0] rounded-xl p-3 space-y-2">
                              {basket.basket_items.map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-xs">
                                  <div>
                                    <span className="font-semibold">{item.title}</span>
                                    <span className="text-stone-500 ml-2">({item.retailer})</span>
                                  </div>
                                  <span className="font-bold">£{Number(item.price).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Share & Preview Controls */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100">
                            <button
                              onClick={() => handleCopyShareLink(basket.id)}
                              className="bg-[#23272A] hover:bg-stone-800 text-[#F7F5F0] text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
                            >
                              {copiedId === basket.id ? "✓ Private Link Copied!" : "Copy Shareable Basket Link"}
                            </button>

                            <button
                              onClick={() => {
                                setSharedBasket(basket);
                                setActiveTab("shared_view");
                              }}
                              className="text-xs font-semibold text-[#23272A] hover:underline cursor-pointer"
                            >
                              Preview Payer Screen →
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 2: CREATE NEW BASKET */}
              {activeTab === "create" && (
                <form
                  onSubmit={handleCreateBasket}
                  className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-5"
                >
                  <div>
                    <h2 className="text-xl font-bold">Build a Persistent Basket</h2>
                    <p className="text-xs text-stone-500">
                      Items stay locked in your basket and never clear out when shared.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                        Basket Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Currys Work Laptop"
                        value={basketTitle}
                        onChange={(e) => setBasketTitle(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                        Boundary Control
                      </label>
                      <select
                        value={boundaryMode}
                        onChange={(e) =>
                          setBoundaryMode(e.target.value as "everyone" | "link_only" | "approved_only")
                        }
                        className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm bg-white"
                      >
                        <option value="link_only">Link Only (Address Sealed)</option>
                        <option value="approved_only">Approved Handles Only</option>
                        <option value="everyone">Public Handle Lookup</option>
                      </select>
                    </div>
                  </div>

                  {/* Split Mode */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                        Funding Structure
                      </label>
                      <select
                        value={splitMode}
                        onChange={(e) =>
                          setSplitMode(e.target.value as "full" | "down_payment" | "multi_party")
                        }
                        className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm bg-white"
                      >
                        <option value="full">Full Basket Request</option>
                        <option value="down_payment">I Am Paying a Down Payment</option>
                        <option value="multi_party">Discreet Multi-Party Split</option>
                      </select>
                    </div>

                    {splitMode === "down_payment" && (
                      <div>
                        <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                          Your Down Payment (£)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="100.00"
                          value={ownerContribution}
                          onChange={(e) => setOwnerContribution(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Add Items Box */}
                  <div className="bg-[#F7F5F0] p-4 rounded-xl border border-stone-200 space-y-3">
                    <p className="text-xs font-bold uppercase text-stone-700">Add Store Items</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Item name (e.g. Lenovo IdeaPad)"
                        value={itemTitle}
                        onChange={(e) => setItemTitle(e.target.value)}
                        className="px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Retailer (e.g. Currys, ASOS)"
                        value={itemRetailer}
                        onChange={(e) => setItemRetailer(e.target.value)}
                        className="px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm"
                      />
                      <input
                        type="url"
                        placeholder="Product URL (https://...)"
                        value={itemUrl}
                        onChange={(e) => setItemUrl(e.target.value)}
                        className="px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Price (£)"
                          value={itemPrice}
                          onChange={(e) => setItemPrice(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleAddDraftItem}
                          className="bg-[#23272A] text-white px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer"
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    {draftItems.length > 0 && (
                      <div className="pt-2 space-y-2">
                        {draftItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-stone-200 text-xs"
                          >
                            <span>
                              <strong>{item.title}</strong> — {item.retailer}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-bold">£{item.price.toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => setDraftItems(draftItems.filter((_, i) => i !== idx))}
                                className="text-red-600 hover:underline cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={creatingBasket || draftItems.length === 0}
                    className="w-full bg-[#F2994A] hover:bg-[#e08636] text-[#23272A] font-bold py-3 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    {creatingBasket ? "Saving to Vault..." : "Save & Generate Private Basket"}
                  </button>
                </form>
              )}

              {/* TAB 3: ENCRYPTED DELIVERY VAULT */}
              {activeTab === "vault" && (
                <form
                  onSubmit={handleSaveVault}
                  className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-5"
                >
                  <div className="bg-[#23272A] text-[#F7F5F0] rounded-xl p-4 flex items-start gap-3">
                    <span className="text-xl">🛡️</span>
                    <div>
                      <h2 className="font-bold text-base text-[#F2994A]">Your Private Delivery Vault</h2>
                      <p className="text-xs text-stone-300 mt-0.5">
                        Protected by Row-Level Security. Only your authenticated session (<code>🛒{userHandle}</code>)
                        can read or modify this destination. Payers never see your name, street, or postcode.
                      </p>
                    </div>
                  </div>

                  {vaultStatusMsg && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                      {vaultStatusMsg}
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                        Recipient Name (For Parcel Label Only)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. N. Mweene"
                        value={vault.recipient_name}
                        onChange={(e) => setVault({ ...vault, recipient_name: e.target.value })}
                        required
                        className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                        Destination Type
                      </label>
                      <select
                        value={vault.delivery_type}
                        onChange={(e) =>
                          setVault({
                            ...vault,
                            delivery_type: e.target.value as "home_address" | "collection_point" | "work_address",
                          })
                        }
                        className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm bg-white"
                      >
                        <option value="collection_point">Parcel Collection Locker / Local Shop</option>
                        <option value="home_address">Private Home Address</option>
                        <option value="work_address">Workplace / Safe Drop</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                      Street Address or Locker Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. InPost Locker, Honor Oak Park Station"
                      value={vault.address_line_1}
                      onChange={(e) => setVault({ ...vault, address_line_1: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-stone-600 mb-1">City</label>
                      <input
                        type="text"
                        placeholder="London"
                        value={vault.city}
                        onChange={(e) => setVault({ ...vault, city: e.target.value })}
                        required
                        className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-stone-600 mb-1">Postcode</label>
                      <input
                        type="text"
                        placeholder="SE23 1DP"
                        value={vault.postcode}
                        onChange={(e) => setVault({ ...vault, postcode: e.target.value })}
                        required
                        className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                      Courier Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Leave at counter or send locker PIN to my email"
                      value={vault.delivery_notes}
                      onChange={(e) => setVault({ ...vault, delivery_notes: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingVault}
                    className="w-full bg-[#23272A] hover:bg-stone-800 text-[#F7F5F0] font-bold py-3 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    {savingVault ? "Sealing Vault..." : "Save & Seal Delivery Vault"}
                  </button>
                </form>
              )}
            </div>
          )
        )}
      </main>
    </div>
  );
}