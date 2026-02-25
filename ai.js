
const axios = require("axios");

module.exports = function(app, supabase) {
  app.post("/ai/assistant", async (req, res) => {
    try {
      const { message, role, location } = req.body;
      if (!message) return res.status(400).json({ error: "Message required" });

      const { data: products } = await supabase
        .from("products")
        .select("name,price,category,country,county,seller_name,emoji")
        .limit(50);

      const list = (products || [])
        .map(p => `${p.emoji} ${p.name} $${p.price} | ${p.seller_name} | ${p.county}, ${p.country}`)
        .join("\n");

      const aiRes = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-3-haiku-20240307",
          max_tokens: 500,
          system: `You are BWEB Industries AI co-worker helping ${role || "users"} on a global marketplace. Location: ${location || "Unknown"}.\nProducts:\n${list}`,
          messages: [{ role: "user", content: message }],
        },
        {
          headers: {
            "x-api-key": process.env.ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
        }
      );

      return res.json({
        success: true,
        reply: aiRes.data?.content?.[0]?.text || "Try again!"
      });

    } catch (err) {
      return res.status(500).json({ reply: "AI unavailable right now!" });
    }
  });
};
        
