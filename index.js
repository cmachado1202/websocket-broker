const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor WebSocket v4.0 (Diagnóstico 'Hola') inicializándose...");

wss.on('connection', (ws) => {
    console.log(`[CONEXIÓN] Nuevo cliente.`);
    
    let clientId = null;
    let clientType = null;

    ws.on('message', (message) => {
        // Frames de video (los ignoramos en esta prueba, pero dejamos la lógica)
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => v.send(message, { binary: true }));
            }
            return;
        }

        let msgStr = message.toString();
        let data;

        // --> ¡¡¡CAMBIO IMPORTANTE!!! Primero vemos si es JSON
        try {
            data = JSON.parse(msgStr);
        } catch (e) {
            // Si no es JSON, es nuestro mensaje de prueba "hola"
            console.log(`[PRUEBA 'HOLA'] Mensaje de texto recibido de ${clientType} [${clientId}]: "${msgStr}"`);
            // Se lo reenviamos al visor para confirmar que llega
            if (clientType === 'tablet' && viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => v.send(JSON.stringify({type: 'debug_message', payload: msgStr})));
            }
            return;
        }

        // Si es JSON, es un comando
        if (data.type === 'identify') {
            clientId = data.tabletId;
            clientType = data.client;
            
            // --> LOGS MÁS DETALLADOS
            console.log(`[IDENTIFY] Mensaje de identificación recibido. Tipo: ${clientType}, ID: ${clientId}`);

            if (clientType === 'tablet') {
                tablets.set(clientId, ws);
            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) {
                    viewers.set(clientId, new Set());
                }
                viewers.get(clientId).add(ws);
            }
        } else if (clientType === 'viewer' && tablets.has(clientId)) {
            console.log(`[COMANDO] Reenviando '${data.type}' a la tablet ${clientId}`);
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
            if (viewers.get(clientId).size === 0) {
                viewers.delete(clientId);
            }
        }
    });
});

app.get('/', (req, res) => res.status(200).send('Servidor Broker v4.0 (Diagnóstico) funcionando.'));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Servidor escuchando en ${PORT}`));
