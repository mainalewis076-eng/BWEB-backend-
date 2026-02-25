async askAI(message, role = "buyer", seller_id = null, location = null) {
    try {
      const res = await fetch(`${BACKEND}/ai/assistant`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, role, seller_id, location }),
      });
      const data = await res.json();
      return data.reply || "Sorry, try again!";
    } catch (err) {
      return "AI unavailable right now!";
    }
  },
