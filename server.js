// Archivo: server.js
const WebSocket = require('ws');
// Importamos http y https (¡con una sola 's'!)
const http = require('http');
const https = require('https'); // <--- ¡AQUÍ ESTABA EL ERROR, YA CORREGIDO!

const PORT = process.env.PORT || 10000;

// 1. Creamos el servidor HTTP básico para el heartbeat.
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// 2. Adjuntamos el servidor WebSocket al servidor HTTP.
const wss = new WebSocket.Server({ server });

const clients = new Map();

console.log('🚀 SERVIDOR DEFINITIVO INICIADO. Escuchando en el puerto', PORT);

wss.on('connection', (ws, req) => {
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

    ws.on('message', (message) => {
        // MANEJO DE IMÁGENES
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

        // MANEJO DE COMANDOS JSON
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${connectionId}] ❌ ERROR: Mensaje no es JSON: ${message}`);
            return;
        }

        console.log(`[${connectionId}] 📩 Comando JSON:`, data);

        switch (data.type) {
            case 'identify':
                const clientInfo = {
                    ws: ws,
                    clientType: data.client,
                    tabletId: data.tabletId || data.targetTabletId
                };
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

// 3. Ponemos el servidor a escuchar.
server.listen(PORT, () => {
    console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${PORT}`);
});

// 4. HEARTBEAT para mantener el servicio activo.
const PRIMARY_URL = process.env.RENDER_EXTERNAL_URL;
if (PRIMARY_URL) {
    setInterval(() => {
        console.log('💓 Enviando heartbeat...');
        
        // Usamos https.get para la URL segura.
        https.get(`${PRIMARY_URL}/health`, (res) => {
            if (res.statusCode === 200) {
                console.log('💓 Heartbeat OK.');
            } else {
                console.error(`❌ Heartbeat falló: ${res.statusCode}`);
            }
        }).on('error', (e) => {
            console.error(`❌ Error en heartbeat: ${e.message}`);
        });
    }, 14 * 60 * 1000); // Cada 14 minutos
}
