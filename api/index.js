const { Server } = require('ws');

// Almacenamos el servidor WebSocket fuera de la función para que persista entre invocaciones.
let wss;
const clients = new Map();

function setupWss(server) {
    if (wss) return; // Si ya está inicializado, no hacemos nada.

    console.log("🚀 Inicializando WebSocket Server por primera vez.");
    wss = new Server({ server });

    wss.on('connection', (ws) => {
        const connectionId = Math.random().toString(36).substring(2, 9);
        ws.id = connectionId;
        clients.set(connectionId, { ws: ws });
        console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO. Clientes totales: ${clients.size}`);

        ws.on('ping', () => ws.pong());

        ws.on('message', (message) => {
            if (Buffer.isBuffer(message)) {
                // Si es una imagen (de la tablet), la reenviamos a todos los demás clientes (los visores).
                clients.forEach((clientInfo, id) => {
                    if (id !== connectionId && clientInfo.ws.readyState === 1) {
                        clientInfo.ws.send(message);
                    }
                });
                return;
            }

            // Los mensajes de texto son solo para diagnóstico.
            try {
                const data = JSON.parse(message.toString());
                console.log(`[${connectionId}] Mensaje de texto recibido:`, data);
            } catch (e) {
                // No hacemos nada si no es JSON
            }
        });

        ws.on('close', () => {
            clients.delete(connectionId);
            console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO. Clientes restantes: ${clients.size}`);
        });

        ws.on('error', (error) => {
            console.error(`[${connectionId}] 💥 ERROR DE WEBSOCKET:`, error);
        });
    });
}

// Esta es la función que Vercel ejecuta.
module.exports = (req, res) => {
    // Adjuntamos nuestro servidor WebSocket al servidor HTTP de Vercel.
    setupWss(req.socket.server);

    // Vercel necesita que la solicitud HTTP termine.
    res.status(200).send("Servidor WebSocket activo y escuchando.");
};
