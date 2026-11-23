const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function reply(statusCode, payload) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return reply(204, "");
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Method Not Allowed" });
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch (_) {
    return reply(400, { error: "Virheellinen JSON-pyyntö." });
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return reply(400, { error: "Pyynnön tietosisältö ei kelpaa." });
  }

  const theme = typeof input.theme === "string"
    ? input.theme.trim().slice(0, 120)
    : "Kaikki aihealueet";

  const languageNames = {
    suomi: "suomeksi",
    ruotsi: "ruotsiksi",
    englanti: "englanniksi"
  };
  const languageKey = typeof input.language === "string"
    ? input.language.trim().toLowerCase()
    : "suomi";
  const language = languageNames[languageKey] || languageNames.suomi;

  const level = Number.isFinite(Number(input.level))
    ? Math.max(1, Math.min(15, Math.floor(Number(input.level))))
    : 1;

  const avoid = Array.isArray(input.avoid)
    ? input.avoid
        .filter((item) => typeof item === "string")
        .slice(-20)
        .map((item) => item.slice(0, 240))
    : [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return reply(500, {
      error: "OPENAI_API_KEY puuttuu Netlifyn ympäristömuuttujista."
    });
  }

  const prompt = [
    `Luo yksi faktapohjainen ja yksiselitteinen tietovisakysymys ${language}.`,
    `Kysymyksen, kaikkien vastausvaihtoehtojen ja selityksen tulee olla ${language}.`,
    `Aihe: ${theme}.`,
    `Vaikeustaso: ${level}/15.`,
    "Vaihtele kysymysten aiheita ja kysymysmuotoja valitun teeman sisällä.",
    "Älä tee samanlaisia kysymyksiä aiempien kysymysten kanssa.",
    `Aiemmat kysymykset ovat: ${JSON.stringify(avoid)}`,
    "Älä palauta aiemmin annettua kysymystä tai sen pientä muunnelmaa.",
    "Vaihtele alateemoja esimerkiksi historian, maantiedon, tieteen, kulttuurin, urheilun, yhteiskunnan ja luonnon välillä, kun ne sopivat valittuun teemaan.",
    "Vaihtele oikean vastauksen paikkaa eri vaihtoehtojen välillä.",
    "Palauta vain JSON-objekti ilman markdownia tässä muodossa:",
    '{"q":"kysymys","options":["vastaus A","vastaus B","vastaus C","vastaus D"],"correct":0,"explanation":"lyhyt selitys"}',
    "correct on oikean vaihtoehdon indeksinumero 0–3.",
    "Vaihtoehtoja pitää olla täsmälleen neljä ja vain yksi saa olla oikea.",
    "Käytä selkeää yleiskieltä ja vältä epävarmoja tai kiistanalaisia väitteitä."
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Olet tarkka tietovisakysymysten laatija. Noudata pyydettyä kieltä ja palauta vain pyydetty JSON."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI request failed", response.status, data);
      return reply(502, {
        error: "Kysymyspalvelu ei ole juuri nyt käytettävissä."
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    const generated = JSON.parse(content || "{}");
    const options = Array.isArray(generated.options)
      ? generated.options.map((item) => String(item).trim()).slice(0, 4)
      : [];
    const correct = Number(generated.correct);

    if (
      typeof generated.q !== "string" ||
      !generated.q.trim() ||
      options.length !== 4 ||
      options.some((item) => !item) ||
      !Number.isInteger(correct) ||
      correct < 0 ||
      correct > 3
    ) {
      throw new Error("OpenAI returned an invalid question");
    }

    return reply(200, {
      q: generated.q.trim(),
      options,
      correct,
      explanation: typeof generated.explanation === "string"
        ? generated.explanation.trim()
        : ""
    });
  } catch (error) {
    console.error("Question function failed", error);
    return reply(502, {
      error: "Kysymyksen muodostaminen epäonnistui. Yritä hetken kuluttua uudelleen."
    });
  }
};
