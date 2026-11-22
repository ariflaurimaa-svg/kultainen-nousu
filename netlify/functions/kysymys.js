exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const { topicName, difficultyDesc, currentStep, recentAvoid } = JSON.parse(event.body || "{}");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "OPENAI_API_KEY puuttuu Netlifyn ympäristömuuttujista." }) };
    }
    if (typeof topicName !== "string" || !topicName.trim()) {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Aihe puuttuu." }) };
    }

    const prompt = `Luo yksi uusi, faktapohjainen ja selkeä suomenkielinen tietovisakysymys.\nAihe: ${topicName}\nVaikeustaso: ${difficultyDesc || "helppo"} (taso ${Number(currentStep || 0) + 1}/10).\nVältä aiempia kysymyksiä: ${String(recentAvoid || "").slice(0, 3000)}\n\nVastaa vain JSON-objektina tässä muodossa: {"q":"Kysymys?","a":"Oikea vastaus","w":["Väärä 1","Väärä 2","Väärä 3"],"hint":"Lyhyt vihje."}`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Olet suomalaisen tietovisan juontaja. Palauta vain pyydetty JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI request failed:", response.status, data && data.error && data.error.message);
      return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Kysymyspalvelu ei ole juuri nyt käytettävissä." }) };
    }
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error("OpenAI response did not contain question content");
    const question = JSON.parse(content);
    if (typeof question.q !== "string" || typeof question.a !== "string" || !Array.isArray(question.w) || question.w.length < 3) {
      throw new Error("Generated question has an invalid shape");
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(question) };
  } catch (error) {
    console.error("Question function failed:", error);
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Virhe kysymyksen haussa." }) };
  }
};
