// Archivo: server.js
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// Servidor HTTP simple para que Render tenga algo a lo que adjuntarse
// y para que el monitor de uptime tenga un endpoint al que llamar.
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is up and running');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

const clients = new Map();

console.log('🚀 SERVIDOR SIMPLIFICADO INICIADO. Escuchando en el puerto', PORT);

wss.on('connection', (ws) => {
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

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

        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${connectionId}] ❌ ERROR: Mensaje no es JSON: ${message}`);
            return;
        }

        switch (data.type) {
            case 'identify':
                const clientInfo = { ws: ws, clientType: data.client, tabletId: data.tabletId || data.targetTabletId };
                clients.set(ws.id, clientInfo);
                console.log(`[${connectionId}] ✅ IDENTIFICADO: Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}`);
                if (clientInfo.clientType === 'tablet') {
                    ws.send(JSON.stringify({ type: 'identified_ok' }));
                }
                break;
            case 'tap_relative':
            case 'swipe_relative':
                const senderInfo = clients.get(ws.id);
                if (senderInfo && senderInfo.clientType === 'visor') {
                    clients.forEach((receiverInfo) => {
                        if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === WebSocket.OPEN) {
                            receiverInfo.ws.send(message);
                        }
                    });
                }
                break;
        }
    });

    ws.on('close', () => {
        const clientInfo = clients.get(ws.id);
        const logMsg = clientInfo ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}` : 'No identificado';
        console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO. Info: ${logMsg}`);
        clients.delete(ws.id);
    });

    ws.on('error', (error) => {
        console.error(`[${connectionId}] ❌ ERROR EN WEBSOCKET:`, error);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${PORT}`);
});
