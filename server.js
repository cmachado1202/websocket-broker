// Archivo: server.js
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// Servidor HTTP simple para el monitor de uptime (UptimeRobot)
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is up and running');
    } else {
        res.writeHead(404).end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });
const clients = new Map();

console.log('🚀 SERVIDOR DEFINITIVO INICIADO. Escuchando en el puerto', PORT);

wss.on('connection', (ws) => {
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO. Esperando identificación.`);

    ws.on('message', (message) => {
        if (Buffer.isBuffer(message)) {
            const senderInfo = clients.get(ws.id);
            if (senderInfo && senderInfo.clientType === 'tablet') {
                clients.forEach((receiverInfo) => {
                    if (receiverInfo.clientType === 'visor' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === WebSocket.OPEN) {
                        receiverInfo.ws.send(message);
                    }
                });
            }
            return;
        }

        try {
            const data = JSON.parse(message);
            if (data.type === 'identify') {
                clients.set(ws.id, {
                    ws: ws,
                    clientType: data.client,
                    tabletId: data.tabletId || data.targetTabletId
                });
                console.log(`[${connectionId}] ✅ IDENTIFICADO: Tipo=${data.client}, TabletID=${data.tabletId || data.targetTabletId}`);
                if (data.client === 'tablet') {
                    ws.send(JSON.stringify({ type: 'identified_ok' }));
                }
            } else if (data.type === 'tap_relative' || data.type === 'swipe_relative') {
                const senderInfo = clients.get(ws.id);
                if (senderInfo && senderInfo.clientType === 'visor') {
                    clients.forEach((receiverInfo) => {
                        if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === WebSocket.OPEN) {
                            receiverInfo.ws.send(message);
                        }
                    });
                }
            }
        } catch (e) {
            console.error(`[${connectionId}] ❌ Mensaje no es JSON:`, message.toString());
        }
    });

    ws.on('close', () => {
        const clientInfo = clients.get(ws.id);
        const logMsg = clientInfo ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}` : 'No identificado';
        console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO. Info: ${logMsg}`);
        clients.delete(ws.id);
    });
});

server.listen(PORT, () => console.log(`Servidor HTTP y WebSocket escuchando en ${PORT}`));
