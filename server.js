// Archivo: server.js (CORREGIDO Y MÁS ROBUSTO)
const WebSocket = require('ws');
const http =require('http');

const PORT = process.env.PORT || 10000;

// Servidor HTTP para los health checks de Render
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is healthy and running.');
    } else {
        res.writeHead(404).end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });
const clients = new Map();

console.log(`🚀 SERVIDOR WEBSOCKET INICIADO. Escuchando en el puerto ${PORT}`);

wss.on('connection', (ws) => {
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    clients.set(connectionId, { ws: ws });

    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO. Esperando identificación...`);

    ws.on('message', (message) => {
        // --- CASO 1: El mensaje es binario (una imagen de la tablet) ---
        if (Buffer.isBuffer(message)) {
            const senderInfo = clients.get(ws.id);
            if (!senderInfo || senderInfo.clientType !== 'tablet') return;

            clients.forEach((receiverInfo) => {
                if (receiverInfo.clientType === 'visor' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === WebSocket.OPEN) {
                    receiverInfo.ws.send(message);
                }
            });
            return;
        }

        // --- CASO 2: El mensaje es texto (JSON con comandos) ---
        let data;
        try {
            // ----- ¡¡¡LA CORRECCIÓN CLAVE ESTÁ AQUÍ!!! -----
            // Forzamos la conversión a String para evitar errores con Buffers.
            const messageString = message.toString();
            data = JSON.parse(messageString);
        } catch (e) {
            console.error(`[${ws.id}] ❌ Mensaje no es JSON válido:`, message.toString(), 'Error:', e.message);
            return;
        }

        const senderInfo = clients.get(ws.id);
        if (!senderInfo) return;

        switch (data.type) {
            case 'ping':
                // Ahora este log SÍ debería aparecer en tu servidor
                console.log(`[${ws.id}] 🏓 Ping recibido. Enviando pong.`);
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

            case 'identify':
                senderInfo.clientType = data.client;
                senderInfo.tabletId = data.tabletId || data.targetTabletId;
                console.log(`[${ws.id}] ✅ IDENTIFICADO: Tipo=${senderInfo.clientType}, TabletID=${senderInfo.tabletId}`);
                if (senderInfo.clientType === 'tablet') {
                    ws.send(JSON.stringify({ type: 'identified_ok' }));
                }
                break;

            case 'tap_relative':
            case 'swipe_relative':
                if (senderInfo.clientType !== 'visor') return;
                clients.forEach((receiverInfo) => {
                    if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === WebSocket.OPEN) {
                        receiverInfo.ws.send(JSON.stringify(data));
                        console.log(`[${ws.id}] 👉 Visor -> Comando '${data.type}' a Tablet ${receiverInfo.tabletId}`);
                    }
                });
                break;
            
            default:
                console.log(`[${ws.id}] Comando desconocido recibido: ${data.type}`);
                break;
        }
    });

    ws.on('close', () => {
        const clientInfo = clients.get(ws.id);
        const logMsg = clientInfo && clientInfo.clientType ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}` : 'No identificado';
        console.log(`[${ws.id}] 🔌 CLIENTE DESCONECTADO. ${logMsg}`);
        clients.delete(ws.id);
    });

    ws.on('error', (error) => {
        console.error(`[${ws.id}] 💥 ERROR DE WEBSOCKET:`, error);
        ws.close();
    });
});

server.listen(PORT, () => console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${PORT}`));
