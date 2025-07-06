const http = require('http');
const { WebSocketServer } = require('ws');

// Creamos un servidor HTTP básico sin Express
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Servidor Broker WebSocket funcionando.\n');
});

const wss = new WebSocketServer({ server });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor Koyeb v3.0 (ultra-simple) listo.");

wss.on('connection', ws => {
    let clientId, clientType;
    console.log("Cliente conectado.");
    ws.on('message', message => {
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => {
                    if (v.readyState === ws.OPEN) v.send(message, { binary: true });
                });
            }
            return;
        }
        let data;
        try { data = JSON.parse(message.toString()); } catch (e) { return; }
        if (data.type === 'identify') {
            clientId = data.tabletId; clientType = data.client;
            console.log(`[IDENTIFY] ${clientType} con ID ${clientId}`);
            if (clientType === 'tablet') {
                if (tablets.has(clientId)) tablets.get(clientId).close();
                tablets.set(clientId, ws);
            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) viewers.set(clientId, new Set());
                viewers.get(clientId).add(ws);
            }
        } else if (clientType === 'viewer' && tablets.has(clientId)) {
            if (tablets.has(clientId) && tablets.get(clientId).readyState === ws.OPEN) {
                tablets.get(clientId).send(JSON.stringify(data));
            }
        }
    });
    ws.on('close', () => {
         console.log(`[DESCONEXIÓN] ${clientType} [${clientId}]`);
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

const port = process.env.PORT || 8080;
server.listen(port, () => console.log(`✅ Servidor escuchando en ${port}`));
