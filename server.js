// Archivo: server.js (FINAL CON HANDSHAKE PING-PONG)
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

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

console.log(`🚀 SERVIDOR PING-PONG INICIADO. Escuchando en el puerto ${PORT}`);

wss.on('connection', (ws) => {
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    clients.set(connectionId, { ws: ws });

    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO. Esperando ping...`);

    ws.on('message', (message) => {
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

        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${ws.id}] ❌ Mensaje no es JSON:`, message.toString());
            return;
        }

        const senderInfo = clients.get(ws.id);
        if (!senderInfo) return;

        switch (data.type) {
            // --- NUEVA LÓGICA DE HANDSHAKE ---
            case 'ping':
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
        }
    });

    ws.on('close', (code, reason) => {
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

server.listen(PORT, () => console.log(`Servidor HTTP y WebSocket escuchando en ${PORT}`));
