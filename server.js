// Archivo: server.js (VERSIÓN CORREGIDA Y ROBUSTA)
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// La verificación de origen está bien.
const allowedOrigins = ['https://devwebcm.com', 'http://localhost:8080', null]; // Añadir localhost para pruebas locales y 'null' para archivos locales (file://)
const wss = new WebSocket.Server({
    port: PORT,
    verifyClient: (info, done) => {
        const origin = info.origin;
        // Permitimos orígenes específicos, y también conexiones sin origen (como apps nativas o Postman)
        if (!origin || allowedOrigins.includes(origin)) {
            done(true);
        } else {
            console.log(`[Bloqueo] Origen no permitido: ${origin}`);
            done(false, 403, 'Origin not allowed');
        }
    }
});

const clients = new Map(); // Mapa para todos los clientes

console.log('🚀 SERVIDOR CORREGIDO INICIADO. Escuchando en el puerto', PORT);

wss.on('connection', (ws, req) => {
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId; // Asignamos ID a la conexión WebSocket
    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

    ws.on('message', (message) => {
        // --- MANEJO DE IMÁGENES (DATOS BINARIOS) ---
        if (Buffer.isBuffer(message)) {
            const senderInfo = clients.get(ws.id);
            if (senderInfo && senderInfo.clientType === 'tablet') {
                // El remitente es una tablet, reenviamos la imagen a su visor correspondiente.
                clients.forEach((receiverInfo, receiverWsId) => {
                    if (receiverInfo.clientType === 'visor' && receiverInfo.tabletId === senderInfo.tabletId) {
                        if (receiverInfo.ws.readyState === WebSocket.OPEN) {
                            receiverInfo.ws.send(message);
                        }
                    }
                });
            }
            return;
        }

        // --- MANEJO DE COMANDOS (TEXTO/JSON) ---
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${connectionId}] ❌ ERROR: Mensaje de texto no es un JSON válido: ${message}`);
            return;
        }

        console.log(`[${connectionId}] 📩 Comando JSON recibido:`, data);

        switch (data.type) {
            case 'identify':
                const clientInfo = {
                    ws: ws,
                    clientType: data.client,
                    // ESTANDARIZAMOS: tanto visor como tablet usan 'tabletId'
                    tabletId: data.tabletId || data.targetTabletId 
                };
                clients.set(ws.id, clientInfo);
                console.log(`[${connectionId}] ✅ CLIENTE IDENTIFICADO: Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}`);
                
                // Si el que se identifica es la tablet, le enviamos un OK para que empiece a streamear
                if(clientInfo.clientType === 'tablet') {
                    ws.send(JSON.stringify({ type: 'identified_ok' }));
                }
                break;

            case 'tap_relative':
            case 'swipe_relative':
                const senderInfo = clients.get(ws.id);
                if (senderInfo && senderInfo.clientType === 'visor') {
                    // El remitente es un visor, reenviamos el comando a la tablet correspondiente.
                    clients.forEach((receiverInfo, receiverWsId) => {
                        if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId) {
                             if (receiverInfo.ws.readyState === WebSocket.OPEN) {
                                // Reenviamos el mensaje original, ya contiene toda la info necesaria
                                receiverInfo.ws.send(message); 
                            }
                        }
                    });
                }
                break;
        }
    });

    ws.on('close', () => {
        const clientInfo = clients.get(ws.id);
        const logMsg = clientInfo 
            ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}` 
            : 'No identificado';
        console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO. Info: ${logMsg}`);
        clients.delete(ws.id);
    });

    ws.on('error', (error) => {
        console.error(`[${connectionId}] ❌ ERROR EN WEBSOCKET:`, error);
    });
});
