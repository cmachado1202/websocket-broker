const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
// Creamos el servidor HTTP a partir de Express. Esto es crucial.
const server = http.createServer(app);
// El WebSocketServer se "adhiere" al servidor HTTP existente.
const wss = new WebSocketServer({ noServer: true });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor Broker v5.0 (con Upgrade Handler) listo.");

// --- SOLUCIÓN CLAVE: Manejar la actualización de protocolo HTTP a WebSocket ---
server.on('upgrade', (request, socket, head) => {
    console.log('Recibida petición de upgrade a WebSocket...');
    
    // Aquí podrías añadir lógica de autenticación si quisieras.
    // Por ahora, aceptamos todas las conexiones.
    
    wss.handleUpgrade(request, socket, head, (ws) => {
        console.log('Upgrade a WebSocket exitoso. Disparando evento de conexión.');
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws, req) => {
    let clientId = null;
    let clientRole = null;
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    console.log(`Cliente [${req.socket.remoteAddress}] conectado. Esperando identificación...`);

    ws.on('message', (message, isBinary) => {
        // La librería 'ws' nos da un flag 'isBinary' que es más fiable.
        if (isBinary) {
            if (clientRole === 'tablet' && clientId) {
                const viewerWs = viewers.get(clientId);
                if (viewerWs && viewerWs.readyState === 1 /* OPEN */) {
                    viewerWs.send(message, { binary: true });
                }
            }
            return;
        }

        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            console.log("Mensaje de texto inválido (no es JSON):", message.toString());
            return;
        }

        console.log(`Mensaje JSON recibido de [${clientId || 'desconocido'}]:`, data);

        if (data.type === 'identify') {
            clientId = data.id;
            clientRole = data.role;
            if (!clientId || !clientRole) {
                ws.close(1011, "Identificación inválida.");
                return;
            }

            console.log(`--> Cliente identificado: rol='${clientRole}', id='${clientId}'`);
            ws.clientId = clientId;
            ws.clientRole = clientRole;

            if (clientRole === 'tablet') {
                if (tablets.has(clientId)) { tablets.get(clientId).terminate(); }
                tablets.set(clientId, ws);
                const viewerWs = viewers.get(clientId);
                if (viewerWs) {
                    viewerWs.send(JSON.stringify({ type: 'status', message: 'Tablet conectada. Esperando frames...' }));
                }
            } else if (clientRole === 'viewer') {
                if (viewers.has(clientId)) { viewers.get(clientId).terminate(); }
                viewers.set(clientId, ws);
                ws.send(JSON.stringify({ type: 'status', message: 'Identificado. Esperando a la tablet...' }));
                if (tablets.has(clientId)) {
                    ws.send(JSON.stringify({ type: 'status', message: 'Tablet conectada. Esperando frames...' }));
                }
            }
        } else if (clientRole === 'viewer') {
            const tabletWs = tablets.get(clientId);
            if (tabletWs && tabletWs.readyState === 1 /* OPEN */) {
                tabletWs.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`Cliente [${clientId || 'desconocido'}] desconectado. Código: ${code}, Razón: ${reason.toString()}`);
        if (clientRole === 'tablet' && tablets.get(clientId) === ws) {
            tablets.delete(clientId);
            const viewerWs = viewers.get(clientId);
            if (viewerWs) {
                viewerWs.send(JSON.stringify({ type: 'status', message: 'La tablet se ha desconectado.' }));
            }
        } else if (clientRole === 'viewer' && viewers.get(clientId) === ws) {
            viewers.delete(clientId);
        }
    });
    
    ws.on('error', (error) => { console.error(`Error en WebSocket de [${clientId || 'desconocido'}]:`, error); });
});

// Sistema de Keep-Alive
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) { ws.terminate(); return; }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => { clearInterval(pingInterval); });

app.get('/', (req, res) => { res.send('Servidor WebSocket para control remoto está funcionando.'); });

const port = process.env.PORT || 10000;
server.listen(port, () => {
    console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${port}`);
});
