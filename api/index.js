// Archivo: api/index.js (Versión final y robusta para Vercel)
const { Server } = require('ws');

// Almacenamos el servidor WebSocket fuera para que persista.
let wss;
const clients = new Map();

// Función para inicializar el servidor WebSocket una sola vez
const initWss = (server) => {
    if (wss) return; // Si ya está inicializado, no hacer nada

    console.log("🚀 Inicializando WebSocket Server por primera vez.");
    wss = new Server({ server });

    wss.on('connection', (ws, req) => {
        const connectionId = Math.random().toString(36).substring(2, 9);
        clients.set(connectionId, { ws });
        console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO. Total: ${clients.size}`);

        ws.on('ping', () => ws.pong());

        ws.on('message', (message) => {
            if (Buffer.isBuffer(message)) {
                const senderInfo = clients.get(connectionId);
                // Asumimos que el que envía imágenes es la tablet
                if (!senderInfo.isTablet) senderInfo.isTablet = true; 

                // Reenviar a todos los clientes que NO son la tablet (los visores)
                clients.forEach((client, id) => {
                    if (id !== connectionId && !client.isTablet) {
                        if (client.ws.readyState === 1) client.ws.send(message);
                    }
                });
                return;
            }
            // Los mensajes de texto son para gestos o diagnóstico, no los usamos en esta versión simple.
            console.log(`[${connectionId}] Mensaje de texto recibido (ignorado):`, message.toString());
        });

        ws.on('close', () => {
            clients.delete(connectionId);
            console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO. Restantes: ${clients.size}`);
        });

        ws.on('error', (error) => {
            console.error(`[${connectionId}] 💥 ERROR DE WEBSOCKET:`, error);
        });
    });
};


// Esta es la función principal que Vercel ejecuta
module.exports = (req, res) => {
    // Obtenemos el servidor HTTP subyacente de la solicitud
    const server = req.socket.server;
    
    // Inicializamos nuestro WebSocket Server en este servidor HTTP
    initWss(server);

    // Verificamos si la solicitud es para un upgrade a WebSocket
    const upgradeHeader = (req.headers.upgrade || '').split(',').map(s => s.trim());
    
    if (upgradeHeader.indexOf('websocket') === 0) {
        // Si es una solicitud de upgrade, dejamos que el WSS la maneje
        // y no terminamos la respuesta HTTP.
        console.log("Detectada solicitud de upgrade a WebSocket.");
    } else {
        // Si es una solicitud HTTP normal, respondemos y terminamos.
        res.status(200).send("Servidor WebSocket activo. Conéctese vía wss://");
    }
};
