exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { topicName, difficultyDesc, currentStep, recentAvoid } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "API-avain puuttuu palvelimelta" }) };
    }

    const prompt = `Luo yksi täysin uusi, faktapohjainen ja vanhusystävällinen suomenkielinen tietovisakysymys.
Aihe: ${topicName}
Vaikeustaso: ${difficultyDesc} (taso ${currentStep + 1}/10).
Vältä näitä aiemmin kysyttyjä kysymyksiä: ${recentAvoid}

Vastaa AINOASTAAN puhtaassa JSON-muodossa:
{
  "q": "Selkeä kysymyslause?",
  "a": "Oikea vastaus",
  "w": ["Väärä 1", "Väärä 2", "Väärä 3"],
  "hint": "Ystävällinen yhden lauseen vihje."
}`;

    const response = await fetch("https://openai.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Olet suomalaisen laatutietovisan juontaja. Kysymyksesi ovat tarkistettuja faktoja, selkeää suomea ja senioreille mieluisia." },
          { role: "user", content: prompt }
        ],
        temperature: 0.85
      })
    });

    const data = await response.json();
    const rawText = data.choices.at(0).message.content.replace(/```json|```/g, "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: rawText
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: "Virhe kysymyksen haussa" }) };
  }
};
exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { topicName, difficultyDesc, currentStep, recentAvoid } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "API-avain puuttuu palvelimelta" }) };
    }

    const prompt = `Luo yksi täysin uusi, faktapohjainen ja vanhusystävällinen suomenkielinen tietovisakysymys.
Aihe: ${topicName}
Vaikeustaso: ${difficultyDesc} (taso ${currentStep + 1}/10).
Vältä näitä aiemmin kysyttyjä kysymyksiä: ${recentAvoid}

Vastaa AINOASTAAN puhtaassa JSON-muodossa:
{
  "q": "Selkeä kysymyslause?",
  "a": "Oikea vastaus",
  "w": ["Väärä 1", "Väärä 2", "Väärä 3"],
  "hint": "Ystävällinen yhden lauseen vihje."
}`;

    const response = await fetch("https://openai.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Olet suomalaisen laatutietovisan juontaja. Kysymyksesi ovat tarkistettuja faktoja, selkeää suomea ja senioreille mieluisia." },
          { role: "user", content: prompt }
        ],
        temperature: 0.85
      })
    });

    const data = await response.json();
    const rawText = data.choices.at(0).message.content.replace(/```json|```/g, "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: rawText
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: "Virhe kysymyksen haussa" }) };
  }
};
