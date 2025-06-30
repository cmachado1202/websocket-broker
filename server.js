// Archivo: server.js (VERSIÓN FINAL CON PINGS)
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const tablets = new Map();
const visores = new Map();

console.log('🚀 Iniciando servidor broker...');

wss.on('connection', (ws, req) => {
    console.log(`🔌 Nuevo cliente conectado.`);
    ws.isAlive = true; // Propiedad para el ping/pong

    // Al recibir un pong, marcamos el cliente como vivo
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    ws.on('message', (message) => {
        // ... (el código para manejar mensajes binarios y de texto no cambia) ...
        if (Buffer.isBuffer(message)) {
            if (ws.clientType === 'tablet' && ws.tabletId) {
                const targetVisor = visores.get(ws.tabletId);
                if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                    targetVisor.send(message);
                }
            }
            return;
        }
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        if (data.type === 'identify') {
            if (data.client === 'tablet' && data.tabletId) {
                ws.clientType = 'tablet';
                ws.tabletId = data.tabletId;
                tablets.set(ws.tabletId, ws);
                console.log(`✅ Tablet identificada: ${ws.tabletId}`);
                const targetVisor = visores.get(ws.tabletId);
                if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                    targetVisor.send(JSON.stringify({ type: 'status', payload: 'Tablet_conectada' }));
                }
            } else if (data.client === 'visor' && data.targetTabletId) {
                ws.clientType = 'visor';
                ws.tabletId = data.targetTabletId;
                visores.set(ws.tabletId, ws);
                console.log(`✅ Visor identificado para la tablet: ${ws.tabletId}`);
                if (tablets.has(ws.tabletId)) {
                    ws.send(JSON.stringify({ type: 'status', payload: 'Tablet_ya_conectada' }));
                }
            }
        } else if (data.type === 'tap_relative' || data.type === 'swipe_relative') {
            if (ws.clientType === 'visor' && data.targetTabletId) {
                const targetTablet = tablets.get(data.targetTabletId);
                if (targetTablet && targetTablet.readyState === WebSocket.OPEN) {
                    targetTablet.send(JSON.stringify(data));
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Cliente desconectado: Tipo=${ws.clientType}, ID=${ws.tabletId}`);
        if (ws.clientType === 'tablet') {
            tablets.delete(ws.tabletId);
            const targetVisor = visores.get(ws.tabletId);
            if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                targetVisor.send(JSON.stringify({ type: 'status', payload: 'Tablet_desconectada' }));
            }
        } else if (ws.clientType === 'visor') {
            visores.delete(ws.tabletId);
        }
    });

    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
    });
});

// --- INICIO DE LA LÓGICA DE PING/PONG ---
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log("Cliente no respondió al ping, terminando conexión.");
            return ws.terminate();
        }
        ws.isAlive = false; // Lo marcamos como "muerto" antes del ping
        ws.ping(() => {}); // El cliente responderá con un "pong" que lo marcará como vivo
    });
}, 30000); // Cada 30 segundos

wss.on('close', () => {
    clearInterval(interval); // Limpiar el intervalo cuando el servidor se cierre
});
// --- FIN DE LA LÓGICA DE PING/PONG ---

wss.on('listening', () => {
    console.log(`✅ Servidor WebSocket escuchando en el puerto ${PORT}`);
});
