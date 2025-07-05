const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');

const app = express();

// Usar CORS para todas las peticiones HTTP. Ayuda con el handshake inicial.
app.use(cors());

const server = http.createServer(app);

// Creamos el servidor WebSocket explícitamente sobre el servidor HTTP
const wss = new WebSocketServer({ server });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor WebSocket v6.0 (Robusto) inicializándose...");

wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[CONEXIÓN] Cliente conectado desde ${clientIp}`);
    
    let clientId = null;
    let clientType = null;

    ws.on('message', (message) => {
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => {
                    if (v.readyState === ws.OPEN) v.send(message, { binary: true })
                });
            }
            return;
        }

        let data;
        try { data = JSON.parse(message.toString()); } catch (e) { return; }

        if (data.type === 'identify') {
            clientId = data.tabletId;
            clientType = data.client;
            console.log(`[IDENTIFY] Cliente identificado. Tipo: ${clientType}, ID: ${clientId}`);

            if (clientType === 'tablet') {
                if(tablets.has(clientId)) tablets.get(clientId).close();
                tablets.set(clientId, ws);
            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) viewers.set(clientId, new Set());
                viewers.get(clientId).add(ws);
            }
        } else if (clientType === 'viewer' && tablets.has(clientId)) {
            if(tablets.get(clientId).readyState === ws.OPEN)
                tablets.get(clientId).send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        console.log(`[DESCONEXIÓN] Cliente ${clientType} [${clientId}] se ha desconectado.`);
        if (clientType === 'tablet') {
            tablets.delete(clientId);
            if (viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => v.send(JSON.stringify({type: 'tablet_disconnected'})));
                viewers.delete(clientId);
            }
        } else if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            if (viewers.get(clientId).size === 0) viewers.delete(clientId);
        }
    });
});

app.get('/', (req, res) => res.status(200).send('Servidor Broker v6.0 funcionando.'));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Servidor escuchando en ${PORT}`));
