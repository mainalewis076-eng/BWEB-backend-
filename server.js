const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ===== CORS FIX =====
app.use(cors({
  origin: 'https://v12-production.up.railway.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ===== SUPABASE =====
const sb = createClient(
  "https://qqnhqtnkkzxnzcclzzvt.supabase.co",
  "sb_publishable_LmDKIprQByu0Obl7kG6R7Q_-ZsOrElK"
);

const C = 0.10; // 10% commission
const S = 0.90; // 90% seller

// ===== ENVIRONMENT VARIABLES =====
const API = process.env.BACKEND_URL || "https://bweb-backend-production.up.railway.app";
const WEB = process.env.WEBSITE_URL || "https://v12-production.up.railway.app";
const PK = process.env.PESAPAL_KEY || "bERTg3ACJMYAo8TQvGTcDyy+2eXbF0b2";
const PS = process.env.PESAPAL_SECRET || "jRa27BcmlflF61R+x3ngQ1e0dNg=";

// ===== SELLER AUTH ROUTES =====
app.post("/auth/seller/signup", async (req, res) => {
  try {
    const { email, password, store_name, owner_name, category, phone } = req.body;
    
    if (!email || !password || !store_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Check if seller already exists
    const { data: existing } = await sb.from("sellers").select("id").eq("email", email).single();
    if (existing) return res.status(400).json({ error: "Email already registered" });
    
    // Create seller
    const { data: seller, error } = await sb.from("sellers").insert([{
      email,
      password: password, // In production, hash this!
      store_name,
      owner_name: owner_name || "Seller",
      category: category || "General",
      phone: phone || "",
      status: "active",
      created_at: new Date()
    }]).select().single();
    
    if (error) throw error;
    
    return res.json({
      success: true,
      seller_id: seller.id,
      message: "Sign up successful! You can now log in."
    });
  } catch (e) {
    return res.status(500).json({ error: "Sign up failed" });
  }
});

app.post("/auth/seller/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    
    // Find seller
    const { data: seller, error } = await sb.from("sellers").select("*").eq("email", email).single();
    
    if (error || !seller) {
      return res.status(401).json({ error: "Email not found" });
    }
    
    // Check password (simple comparison - hash in production!)
    if (seller.password !== password) {
      return res.status(401).json({ error: "Wrong password" });
    }
    
    return res.json({
      success: true,
      seller_id: seller.id,
      store_name: seller.store_name,
      owner_name: seller.owner_name,
      category: seller.category,
      message: "Login successful!"
    });
  } catch (e) {
    return res.status(500).json({ error: "Login failed" });
  }
});

// ===== PRODUCT ROUTES =====
app.get("/api/products", async (req, res) => {
  try {
    const { data: products, error } = await sb.from("products").select("*");
    if (error) throw error;
    res.json({ success: true, products: products || [] });
  } catch (e) {
    res.status(500).json({ error: "Failed to load products" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const { data: product, error } = await sb.from("products").select("*").eq("id", req.params.id).single();
    if (error) throw error;
    res.json(product);
  } catch (e) {
    res.status(404).json({ error: "Product not found" });
  }
});

app.post("/products", async (req, res) => {
  try {
    const { name, price, category, seller_id, emoji, description } = req.body;
    const { data: product, error } = await sb.from("products").insert([{
      name,
      price: parseFloat(price),
      category,
      seller_id,
      emoji: emoji || "📦",
      description: description || "",
      created_at: new Date()
    }]).select().single();
    if (error) throw error;
    res.json({ success: true, product });
  } catch (e) {
    res.status(500).json({ error: "Failed to add product" });
  }
});

// ===== EXISTING ROUTES =====
app.get("/", (q, r) => r.json({ status: "BWEB LIVE!" }));

app.post("/place-order", async (q, r) => {
  try {
    const b = q.body;
    const t = parseFloat(b.unit_price) * parseInt(b.quantity);
    const cm = +(t * C).toFixed(2);
    const sa = +(t * S).toFixed(2);
    
    const { data: o, error } = await sb.from("orders").insert([{
      buyer_name: b.buyer_name,
      buyer_email: b.buyer_email,
      buyer_phone: b.buyer_phone,
      seller_id: b.seller_id,
      seller_name: b.seller_name,
      product_id: b.product_id,
      product_name: b.product_name,
      product_emoji: b.product_emoji || "📦",
      quantity: parseInt(b.quantity),
      unit_price: parseFloat(b.unit_price),
      total_amount: t,
      commission: cm,
      seller_amount: sa,
      payment_method: b.payment_method,
      status: "pending",
      payment_status: "unpaid",
      delivery_confirmed: false,
      seller_paid: false
    }]).select().single();
    
    if (error) throw error;
    
    await sb.from("commissions").insert([{
      order_id: o.id,
      total_amount: t,
      commission: cm,
      seller_amount: sa,
      status: "pending"
    }]);
    
    return r.json({
      success: true,
      order_id: o.id,
      total_amount: t,
      commission: cm,
      seller_amount: sa
    });
  } catch (e) {
    return r.status(500).json({ error: "Failed" });
  }
});

app.post("/pay/pesapal", async (q, r) => {
  try {
    const { order_id } = q.body;
    const { data: o } = await sb.from("orders").select("*").eq("id", order_id).single();
    
    if (!o) return r.status(404).json({ error: "Not found" });
    
    const auth = await axios.post("https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken", {
      consumer_key: PK,
      consumer_secret: PS
    }, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    });
    
    const tk = auth.data.token;
    if (!tk) return r.status(500).json({ error: "Auth failed" });
    
    const ipn = await axios.post("https://cybqa.pesapal.com/pesapalv3/api/URLSetup/RegisterIPN", {
      url: API + "/webhook/pesapal",
      ipn_notification_type: "POST"
    }, {
      headers: {
        Authorization: "Bearer " + tk,
        "Content-Type": "application/json"
      }
    });
    
    const sub = await axios.post("https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest", {
      id: order_id,
      currency: "USD",
      amount: o.total_amount,
      description: "BWEB:" + o.product_name,
      callback_url: API + "/payment-callback?order_id=" + order_id,
      notification_id: ipn.data.ipn_id,
      billing_address: {
        email_address: o.buyer_email,
        phone_number: o.buyer_phone || "",
        first_name: o.buyer_name || "Buyer",
        last_name: ""
      }
    }, {
      headers: {
        Authorization: "Bearer " + tk,
        "Content-Type": "application/json"
      }
    });
    
    if (!sub.data.redirect_url) return r.status(500).json({ error: "Failed" });
    
    return r.json({ success: true, payment_url: sub.data.redirect_url });
  } catch (e) {
    return r.status(500).json({ error: "PesaPal failed" });
  }
});

app.post("/webhook/pesapal", async (q, r) => {
  try {
    const id = q.body.OrderMerchantReference;
    if (id) {
      const { data: o } = await sb.from("orders").select("*").eq("id", id).single();
      if (o && o.payment_status !== "paid") {
        await sb.from("orders").update({ payment_status: "paid", status: "paid" }).eq("id", id);
        await sb.from("notifications").insert([{
          user_id: o.seller_id,
          type: "new_order",
          title: "New Order!",
          message: o.buyer_name + " ordered " + o.product_name,
          order_id: id,
          read: false
        }]);
      }
    }
    r.send("OK");
  } catch (e) {
    r.send("Error");
  }
});

app.get("/payment-callback", async (q, r) => {
  const id = q.query.order_id;
  const { data: o } = await sb.from("orders").select("payment_status").eq("id", id).single();
  r.redirect(o && o.payment_status === "paid" ? WEB + "?success=1" : WEB + "?failed=1");
});

app.post("/confirm-delivery", async (q, r) => {
  try {
    const { order_id } = q.body;
    const { data: o } = await sb.from("orders").select("*").eq("id", order_id).single();
    
    if (!o) return r.status(404).json({ error: "Not found" });
    if (o.delivery_confirmed) return r.status(400).json({ error: "Already done" });
    
    await sb.from("orders").update({ delivery_confirmed: true, status: "delivered" }).eq("id", order_id);
    
    await sb.from("payouts").insert([{
      order_id,
      seller_id: o.seller_id,
      seller_name: o.seller_name,
      product_name: o.product_name,
      amount: o.seller_amount,
      commission: o.commission,
      total_order: o.total_amount,
      status: "pending"
    }]);
    
    await sb.from("notifications").insert([{
      user_id: o.seller_id,
      type: "payout",
      title: "Payout Coming!",
      message: "$" + o.seller_amount + " coming for " + o.product_name,
      order_id,
      read: false
    }]);
    
    return r.json({
      success: true,
      seller_payout: o.seller_amount,
      bweb_commission: o.commission
    });
  } catch (e) {
    return r.status(500).json({ error: "Failed" });
  }
});

app.get("/orders", async (q, r) => {
  const { data: o } = await sb.from("orders").select("*").eq("buyer_email", q.query.email).order("created_at", { ascending: false });
  r.json({ success: true, orders: o || [] });
});

app.get("/orders/seller", async (q, r) => {
  const { data: o } = await sb.from("orders").select("*").eq("seller_id", q.query.seller_id).order("created_at", { ascending: false });
  const orders = o || [];
  r.json({
    success: true,
    orders,
    stats: {
      total_orders: orders.length,
      total_revenue: orders.filter(x => x.delivery_confirmed).reduce((s, x) => s + x.seller_amount, 0)
    }
  });
});

app.post("/ai/assistant", async (q, r) => {
  try {
    const { message, role, location } = q.body;
    const { data: p } = await sb.from("products").select("name,price,country,county,seller_name,emoji").limit(50);
    const list = (p || []).map(x => x.emoji + x.name + " $" + x.price + "|" + x.seller_name + "|" + x.county + "," + x.country).join("\n");
    
    const ai = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-3-haiku-20240307",
      max_tokens: 500,
      system: "You are BWEB AI helping " + (role || "user") + ". Location:" + (location || "?") + ". Products:\n" + (list || "None"),
      messages: [{ role: "user", content: message }]
    }, {
      headers: {
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      }
    });
    
    r.json({ success: true, reply: ai.data.content[0].text || "Try again!" });
  } catch (e) {
    r.status(500).json({ reply: "AI unavailable!" });
  }
});

app.get("/notifications", async (q, r) => {
  const { data: n } = await sb.from("notifications").select("*").eq("user_id", q.query.user_id).order("created_at", { ascending: false }).limit(30);
  r.json({ success: true, notifications: n || [] });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BWEB running on port ${PORT}`);
});
