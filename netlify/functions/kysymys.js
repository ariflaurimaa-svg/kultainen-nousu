const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const MAX_THEME_LENGTH = 120;
const MAX_AVOID_ITEMS = 50;
const MAX_AVOID_LENGTH = 240;
const MAX_QUESTION_LENGTH = 320;
const MAX_OPTION_LENGTH = 180;
const MAX_EXPLANATION_LENGTH = 800;
const OPENAI_TIMEOUT_MS = 15_000;

function reply(statusCode, payload) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  };
}

function normalized(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateQuestion(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Question is not an object");
  }

  const question = cleanText(candidate.q, MAX_QUESTION_LENGTH);
  const options = Array.isArray(candidate.options)
    ? candidate.options.map((item) => cleanText(item, MAX_OPTION_LENGTH))
    : [];
  const correct = Number(candidate.correct);
  const explanation = cleanText(candidate.explanation, MAX_EXPLANATION_LENGTH);
  const uniqueOptions = new Set(options.map(normalized));

  if (
    question.length < 10 ||
    question.length > MAX_QUESTION_LENGTH ||
    options.length !== 4 ||
    options.some((option) => option.length < 1 || option.length > MAX_OPTION_LENGTH) ||
    uniqueOptions.size !== 4 ||
    !Number.isInteger(correct) ||
    correct < 0 ||
    correct > 3
  ) {
    throw new Error("OpenAI returned an invalid question");
  }

  return { q: question, options, correct, explanation };
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

  const theme = cleanText(input.theme, MAX_THEME_LENGTH) || "Kaikki aihealueet";
  const languageNames = {
    suomi: "suomeksi",
    ruotsi: "ruotsiksi",
    englanti: "englanniksi"
  };
  const languageKey = typeof input.language === "string"
    ? input.language.trim().toLowerCase()
    : "suomi";
  const language = languageNames[languageKey];
  if (!language) {
    return reply(400, { error: "Tuntematon kysymyskieli." });
  }

  const requestedLevel = Number(input.level);
  const level = Number.isFinite(requestedLevel)
    ? Math.max(1, Math.min(15, Math.floor(requestedLevel)))
    : 1;

  const avoid = Array.isArray(input.avoid)
    ? input.avoid
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, MAX_AVOID_LENGTH))
        .filter(Boolean)
        .slice(-MAX_AVOID_ITEMS)
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
    "Vaihtoehtoja pitää olla täsmälleen neljä, niiden pitää olla keskenään erilaisia ja vain yksi saa olla oikea.",
    `Kysymys saa sisältää enintään ${MAX_QUESTION_LENGTH} merkkiä, vastaus enintään ${MAX_OPTION_LENGTH} merkkiä ja selitys enintään ${MAX_EXPLANATION_LENGTH} merkkiä.`,
    "Käytä selkeää yleiskieltä ja vältä epävarmoja tai kiistanalaisia väitteitä."
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Olet tarkka tietovisakysymysten laatija. Noudata pyydettyä kieltä ja palauta vain pyydetty JSON. Älä lisää JSON:iin ylimääräisiä kenttiä."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI request failed", response.status, data?.error?.message || data);
      return reply(502, {
        error: "Kysymyspalvelu ei ole juuri nyt käytettävissä."
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("OpenAI response did not contain question content");
    }

    const generated = JSON.parse(content);
    const question = validateQuestion(generated);
    return reply(200, question);
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "OpenAI request timed out"
      : error?.message || error;
    console.error("Question function failed", message);
    return reply(502, {
      error: "Kysymyksen muodostaminen epäonnistui. Yritä hetken kuluttua uudelleen."
    });
  } finally {
    clearTimeout(timeout);
  }
};
