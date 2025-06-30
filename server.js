// Archivo: server.js
// Un servidor WebSocket intermediario (broker) simple para Node.js

const WebSocket = require('ws');

// Puerto en el que escuchará el servidor. Para pruebas locales, 8080 es común.
// Render.com te asignará un puerto automáticamente, pero lo gestiona por ti.
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });

// Usaremos dos mapas para llevar un registro de los clientes conectados
// y sus emparejamientos.
const tablets = new Map(); // key: tabletId, value: WebSocket del cliente tablet
const visores = new Map(); // key: tabletId, value: WebSocket del cliente visor

console.log('🚀 Iniciando servidor broker...');

wss.on('connection', (ws, req) => {
    // Cuando un nuevo cliente se conecta, aún no sabemos qué es.
    console.log(`🔌 Nuevo cliente conectado desde ${req.socket.remoteAddress}`);

    // Definimos una propiedad en el objeto WebSocket para saber qué tipo de cliente es.
    ws.clientType = 'unknown';
    ws.tabletId = null;

    ws.on('message', (message) => {
        // 'message' puede ser un string (JSON) o un Buffer (datos binarios).

        // --- MANEJO DE MENSAJES BINARIOS (IMÁGENES) ---
        if (Buffer.isBuffer(message)) {
            if (ws.clientType === 'tablet' && ws.tabletId) {
                const targetVisor = visores.get(ws.tabletId);
                if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                    // Reenviamos los datos binarios directamente al visor emparejado.
                    targetVisor.send(message);
                }
            }
            return; // No procesar más
        }
        
        // --- MANEJO DE MENSAJES DE TEXTO (JSON) ---
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Error: Mensaje recibido no es un JSON válido:', message);
            return;
        }

        // 1. Lógica de Identificación
        if (data.type === 'identify') {
            if (data.client === 'tablet' && data.tabletId) {
                ws.clientType = 'tablet';
                ws.tabletId = data.tabletId;
                tablets.set(ws.tabletId, ws);
                console.log(`✅ Tablet identificada: ${ws.tabletId}`);

                // Notificamos al visor correspondiente que la tablet se ha conectado.
                const targetVisor = visores.get(ws.tabletId);
                if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                    targetVisor.send(JSON.stringify({ type: 'status', payload: 'Tablet_conectada' }));
                }

            } else if (data.client === 'visor' && data.targetTabletId) {
                ws.clientType = 'visor';
                ws.tabletId = data.targetTabletId;
                visores.set(ws.tabletId, ws);
                console.log(`✅ Visor identificado para la tablet: ${ws.tabletId}`);

                // Si la tablet ya está conectada, le avisamos al visor.
                if (tablets.has(ws.tabletId)) {
                    ws.send(JSON.stringify({ type: 'status', payload: 'Tablet_ya_conectada' }));
                }

            } else {
                console.warn('Mensaje de identificación inválido:', data);
            }
        }
        // 2. Lógica de reenvío de comandos (tap, swipe)
        else if (data.type === 'tap_relative' || data.type === 'swipe_relative') {
            if (ws.clientType === 'visor' && data.targetTabletId) {
                const targetTablet = tablets.get(data.targetTabletId);
                if (targetTablet && targetTablet.readyState === WebSocket.OPEN) {
                    // Reenviamos el comando de texto a la tablet.
                    targetTablet.send(JSON.stringify(data));
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Cliente desconectado: Tipo=${ws.clientType}, ID=${ws.tabletId}`);
        // Limpiamos los mapas cuando un cliente se desconecta
        if (ws.clientType === 'tablet') {
            tablets.delete(ws.tabletId);
            // Notificamos al visor que la tablet se ha desconectado.
            const targetVisor = visores.get(ws.tabletId);
            if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                targetVisor.send(JSON.stringify({ type: 'status', payload: 'Tablet_desconectada' }));
            }
        } else if (ws.clientType === 'visor') {
            visores.delete(ws.tabletId);
        }
    });

    ws.on('error', (error) => {
        console.error('Se produjo un error en un WebSocket:', error);
    });
});

wss.on('listening', () => {
    console.log(`✅ Servidor WebSocket escuchando en el puerto ${PORT}`);
});
