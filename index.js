const express = require("express");
const app = express();
app.use(express.json());

// Guarda el historial de cada usuario por su ID de ManyChat
const conversaciones = {};

// Cuántos mensajes de historial recordar por usuario
const MAX_HISTORIAL = 10;

app.post("/webhook", async (req, res) => {
  try {
    const mensaje = req.body.last_input_text;
    const userId  = req.body.subscriber_id || "default";

    // Validar que llegó un mensaje
    if (!mensaje) {
      return res.json({
        version: "v2",
        content: { messages: [{ type: "text", text: "No recibí ningún mensaje. Por favor escribí algo." }] }
      });
    }

    // Inicializar historial si es la primera vez
    if (!conversaciones[userId]) conversaciones[userId] = [];

    // Agregar el mensaje del usuario al historial
    conversaciones[userId].push({ role: "user", content: mensaje });

    // Limitar el historial para no exceder los tokens de Claude
    if (conversaciones[userId].length > MAX_HISTORIAL * 2) {
      conversaciones[userId] = conversaciones[userId].slice(-MAX_HISTORIAL * 2);
    }

    // Llamar a la API de Claude
    const respuestaAPI = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "Sos un asistente amigable y útil. Respondé siempre en el mismo idioma en que te escriben. Sé claro y conciso.",
        messages: conversaciones[userId]
      })
    });

    const datos = await respuestaAPI.json();

    // Verificar que Claude respondió correctamente
    if (!datos.content || !datos.content[0]) {
      throw new Error("Respuesta inesperada de Claude: " + JSON.stringify(datos));
    }

    const textoRespuesta = datos.content[0].text;

    // Guardar la respuesta de Claude en el historial
    conversaciones[userId].push({ role: "assistant", content: textoRespuesta });

    // Devolver la respuesta en el formato que espera ManyChat
    return res.json({
      version: "v2",
      content: {
        messages: [{ type: "text", text: textoRespuesta }]
      }
    });

  } catch (error) {
    console.error("Error:", error.message);
    return res.json({
      version: "v2",
      content: {
        messages: [{ type: "text", text: "Ocurrió un error al procesar tu mensaje. Por favor intentá de nuevo." }]
      }
    });
  }
});

// Ruta de verificación — para confirmar que el servidor está vivo
app.get("/", (req, res) => {
  res.send("Servidor Claude + ManyChat funcionando correctamente.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
