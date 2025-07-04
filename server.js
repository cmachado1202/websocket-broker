// Archivo: server.js (Revisado y Mejorado)
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// Servidor HTTP para health checks de Render y UptimeRobot
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is healthy and running.');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });
const clients = new Map(); // Usaremos el ws.id como clave

console.log(`🚀 SERVIDOR DEFINITIVO 2.0 INICIADO. Escuchando en el puerto ${PORT}`);

wss.on('connection', (ws) => {
    // Asignamos un ID único a cada conexión para facilitar el seguimiento en los logs
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    clients.set(connectionId, { ws: ws }); // Almacenamos la conexión inmediatamente

    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO. IP: ${ws._socket.remoteAddress}. Total clientes: ${clients.size}`);

    ws.on('message', (message) => {
        // --- MANEJO DE IMÁGENES (DATOS BINARIOS) ---
        if (Buffer.isBuffer(message)) {
            const senderInfo = clients.get(ws.id);
            if (!senderInfo || senderInfo.clientType !== 'tablet') {
                return; // Ignoramos frames de imagen si no vienen de una tablet identificada
            }

            // Buscamos al visor correspondiente y le enviamos el frame
            clients.forEach((receiverInfo, receiverId) => {
                if (receiverInfo.clientType === 'visor' && receiverInfo.tabletId === senderInfo.tabletId) {
                    if (receiverInfo.ws.readyState === WebSocket.OPEN) {
                        receiverInfo.ws.send(message);
                        // Logueamos solo una vez por segundo para no saturar la consola
                        if (!senderInfo.lastLog || Date.now() - senderInfo.lastLog > 1000) {
                             console.log(`[${ws.id}] 🖼️  Tablet [${senderInfo.tabletId}] -> Reenviando frame a Visor [${receiverId}]`);
                             senderInfo.lastLog = Date.now();
                        }
                    }
                }
            });
            return; // Importante: terminamos aquí si es un buffer
        }

        // --- MANEJO DE COMANDOS (JSON) ---
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${ws.id}] ❌ Mensaje no es JSON válido:`, message.toString());
            return;
        }

        const senderInfo = clients.get(ws.id);

        switch (data.type) {
            case 'identify':
                senderInfo.clientType = data.client;
                // El visor envía 'targetTabletId', la tablet envía 'tabletId'
                senderInfo.tabletId = data.tabletId || data.targetTabletId;
                
                console.log(`[${ws.id}] ✅ IDENTIFICADO: Tipo=${senderInfo.clientType}, TabletID=${senderInfo.tabletId}`);

                // Si es una tablet, le enviamos una confirmación para que empiece a streamear
                if (senderInfo.clientType === 'tablet') {
                    ws.send(JSON.stringify({ type: 'identified_ok' }));
                }
                break;

            case 'tap_relative':
            case 'swipe_relative':
                if (!senderInfo || senderInfo.clientType !== 'visor') return;

                // Buscamos la tablet a la que va dirigido el comando
                clients.forEach((receiverInfo, receiverId) => {
                    if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId) {
                        if (receiverInfo.ws.readyState === WebSocket.OPEN) {
                            receiverInfo.ws.send(JSON.stringify(data)); // Reenviamos el objeto JSON limpio
                            console.log(`[${ws.id}] 👉 Visor -> Enviando comando '${data.type}' a Tablet [${receiverId}] (${receiverInfo.tabletId})`);
                        }
                    }
                });
                break;

            default:
                console.warn(`[${ws.id}] ⚠️ Tipo de mensaje desconocido: ${data.type}`);
        }
    });

    ws.on('close', (code, reason) => {
        const clientInfo = clients.get(ws.id);
        const logMsg = clientInfo && clientInfo.clientType
            ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}`
            : 'No identificado';
        
        console.log(`[${ws.id}] 🔌 CLIENTE DESCONECTADO. Razón: ${reason || 'Normal'}. Info: ${logMsg}. Total clientes: ${clients.size - 1}`);
        clients.delete(ws.id);
    });

    ws.on('error', (error) => {
        console.error(`[${ws.id}] 💥 ERROR DE WEBSOCKET:`, error);
        ws.close(); // Cerramos la conexión si hay un error
    });
});

server.listen(PORT, () => console.log(`Servidor HTTP y WebSocket escuchando en ${PORT}`));
